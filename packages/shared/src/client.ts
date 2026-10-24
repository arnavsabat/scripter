// The sync client: keeps a Y.Doc and its presence in step with apps/sync over one WebSocket
// (PROTOCOL.md). Used by the browser, the server's tests and the load-test harness.
//
// No separate resend queue: the Y.Doc itself (persisted on the device by y-indexeddb in the
// browser) holds every edit, and the handshake on each (re)connect sends exactly what the server
// lacks, computed from state vectors. Duplicates are harmless because Yjs ignores what it has.
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import {
  CLOSE,
  MSG_ACK,
  MSG_AWARENESS,
  MSG_SYNC,
  SYNC_STEP1,
  SYNC_STEP2,
  SYNC_UPDATE,
  encodePing,
} from './protocol';

// This package runs in browsers and Node alike; both provide these globals.
declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;
declare function setInterval(callback: () => void, ms: number): unknown;
declare function clearInterval(id: unknown): void;
declare const navigator: { onLine?: boolean } | undefined;

/** The parts of the WebSocket API we use (the browser's and Node 24's global WebSocket both fit). */
export interface SocketLike {
  binaryType: string;
  readyState: number;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
export type SocketFactory = (url: string) => SocketLike;

export type Connection = 'connecting' | 'online' | 'offline' | 'stopped';

/**
 * What the quiet toolbar cue shows (D-018 item 6, D-022): nothing, "Offline" (the browser has no
 * network), "Reconnecting…" (the network is fine but no server can serve the episode right now,
 * e.g. during a failover), or "Syncing…" (catching up, or an edit is slow to be acknowledged).
 */
export type Cue = null | 'offline' | 'reconnecting' | 'syncing';

export interface SyncClientOptions {
  /** Base URL of the sync server, e.g. ws://localhost:4000 */
  /** Base URL of the sync server, or a list to pick from at random on each (re)connect (D-022). */
  serverUrl: string | readonly string[];
  docId: string;
  token: string;
  doc: Y.Doc;
  awareness?: awarenessProtocol.Awareness;
  socket: SocketFactory;
  /** Unsaved work older than this shows "Syncing…" (so normal typing never flickers it). */
  syncingCueAfterMs?: number;
  /** Heartbeat (D-022): ping every `everyMs`; if nothing arrives for `deadAfterMs`, reconnect. */
  heartbeat?: { everyMs: number; deadAfterMs: number };
  /**
   * Give up on a connection that hasn't opened within this long and try again (a frozen server's
   * operating system still accepts the TCP connection, but the WebSocket handshake never finishes).
   */
  connectTimeoutMs?: number;
  /** Reconnect backoff: random(0, min(capMs, baseMs × 2^attempt)), "full jitter" (SPEC 5.4). */
  backoff?: { baseMs: number; capMs: number };
  random?: () => number;
}

export class SyncClient {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness | undefined;
  connection: Connection = 'connecting';
  /** Update-bearing messages sent on the current connection, and how many the server has stored (D-019). */
  sent = 0;
  stored = 0;
  /** True once the server's reply to our state vector has arrived on this connection. */
  caughtUp = false;
  /** Set when the server rejects us for good (4401, 4404). */
  fatal: string | null = null;
  /** Counts connections; with `sent`/`stored`, lets a caller tell exactly which edits are durable. */
  generation = 0;
  /**
   * On this connection, the `sent` count at which the handshake's step 2 went out. Step 2 carries
   * everything the server lacked, so once `stored` reaches it, every edit made before this
   * connection is durable too.
   */
  handshakeIndex: number | null = null;
  private socket: SocketLike | null = null;
  private attempt = 0;
  private retryTimer: unknown = null;
  private heartbeatTimer: unknown = null;
  private connectTimer: unknown = null;
  private lastHeard = 0;
  private cueTimer: unknown = null;
  private unsavedSince: number | null = null;
  private listeners = new Set<() => void>();
  private readonly opts: Required<
    Pick<
      SyncClientOptions,
      'syncingCueAfterMs' | 'backoff' | 'random' | 'heartbeat' | 'connectTimeoutMs'
    >
  > &
    SyncClientOptions;

  constructor(options: SyncClientOptions) {
    this.opts = {
      syncingCueAfterMs: 1500,
      heartbeat: { everyMs: 5_000, deadAfterMs: 10_000 },
      connectTimeoutMs: 5_000,
      backoff: { baseMs: 250, capMs: 10_000 },
      random: Math.random,
      ...options,
    };
    this.doc = options.doc;
    this.awareness = options.awareness;
    this.doc.on('update', this.onDocUpdate);
    this.awareness?.on('update', this.onAwarenessUpdate);
    this.connect();
  }

  /** Subscribe to any change in connection, cue or counts. */
  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Unsaved edits on this connection (sent but not yet durable on the server). */
  get unsaved() {
    return this.sent - this.stored;
  }

  get cue(): Cue {
    if (this.connection === 'offline' || this.connection === 'stopped') {
      const browserOffline = typeof navigator !== 'undefined' && navigator?.onLine === false;
      return browserOffline || this.connection === 'stopped' ? 'offline' : 'reconnecting';
    }
    if (this.connection === 'connecting') return null;
    const slow =
      this.unsavedSince !== null && Date.now() - this.unsavedSince >= this.opts.syncingCueAfterMs;
    return !this.caughtUp || slow ? 'syncing' : null;
  }

  /** Every edit is on the server and the server's edits are here. */
  get synced() {
    return this.connection === 'online' && this.caughtUp && this.unsaved === 0;
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** The server this connection goes to: a random one from the list (D-022: any server accepts). */
  private pickServer() {
    const urls =
      typeof this.opts.serverUrl === 'string' ? [this.opts.serverUrl] : this.opts.serverUrl;
    return urls[Math.floor(this.opts.random() * urls.length)] ?? urls[0]!;
  }

  private connect() {
    if (this.connection === 'stopped') return;
    const { docId, token } = this.opts;
    const socket = this.opts.socket(
      `${this.pickServer()}/doc/${docId}?token=${encodeURIComponent(token)}`,
    );
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.lastHeard = Date.now();
    this.generation += 1;
    this.handshakeIndex = null;
    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (this.socket === socket && socket.readyState !== 1) {
        socket.close();
        this.disconnected(socket, 4000);
      }
    }, this.opts.connectTimeoutMs);
    this.sent = 0;
    this.stored = 0;
    this.caughtUp = false;
    this.unsavedSince = null;
    socket.onopen = () => {
      clearTimeout(this.connectTimer);
      this.connection = 'online';
      // Handshake: our state vector (the server replies with what we lack), then our presence.
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      encoding.writeVarUint(e, SYNC_STEP1);
      encoding.writeVarUint8Array(e, Y.encodeStateVector(this.doc));
      socket.send(encoding.toUint8Array(e));
      if (this.awareness?.getLocalState()) this.sendAwareness([this.doc.clientID]);
      this.startHeartbeat(socket);
      this.emit();
    };
    socket.onmessage = (ev) => {
      this.lastHeard = Date.now();
      this.onMessage(new Uint8Array(ev.data as ArrayBuffer));
    };
    socket.onerror = () => {};
    socket.onclose = (ev) => this.disconnected(socket, ev.code);
  }

  /**
   * Heartbeat (D-022): a frozen server keeps its sockets open without answering, so the browser
   * would never notice. Ping every 5 s; if nothing at all has arrived for 10 s, give up on this
   * socket at once (without waiting for a close handshake the frozen server can't complete).
   */
  private startHeartbeat(socket: SocketLike) {
    clearInterval(this.heartbeatTimer);
    const { everyMs, deadAfterMs } = this.opts.heartbeat;
    // Ping every `everyMs`, but check the deadline every second, so a silent server is noticed
    // 10 s after its last message rather than at the next ping (up to 15 s).
    let lastPing = Date.now();
    this.heartbeatTimer = setInterval(
      () => {
        if (this.socket !== socket) return clearInterval(this.heartbeatTimer);
        const now = Date.now();
        if (now - this.lastHeard > deadAfterMs) {
          socket.close();
          this.disconnected(socket, 4000);
          return;
        }
        if (now - lastPing >= everyMs && socket.readyState === 1) {
          socket.send(encodePing());
          lastPing = now;
        }
      },
      Math.min(1000, everyMs),
    );
  }

  private disconnected(socket: SocketLike, code: number) {
    if (this.socket !== socket) return;
    this.socket = null;
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.connectTimer);
    // Co-writers' carets and avatars go away while we can't see them.
    if (this.awareness) {
      const others = [...this.awareness.getStates().keys()].filter(
        (id) => id !== this.doc.clientID,
      );
      awarenessProtocol.removeAwarenessStates(this.awareness, others, this);
    }
    if (code === CLOSE.UNAUTHORIZED || code === CLOSE.BAD_DOCUMENT) {
      this.fatal = code === CLOSE.UNAUTHORIZED ? 'unauthorized' : 'bad episode';
      this.connection = 'stopped';
    } else if (this.connection !== 'stopped') {
      this.connection = 'offline';
      // The episode moved (handoff) or the server is shutting down gracefully: the new home is
      // ready, so come straight back instead of continuing an old backoff.
      if (code === CLOSE.MOVED || code === CLOSE.GOING_AWAY) this.attempt = 0;
      this.scheduleReconnect();
    }
    this.emit();
  }

  private scheduleReconnect() {
    const { baseMs, capMs } = this.opts.backoff;
    const delay = this.opts.random() * Math.min(capMs, baseMs * 2 ** this.attempt);
    this.attempt = Math.min(this.attempt + 1, 20);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  /** Reconnect right away (e.g. the browser just came back online). */
  reconnectNow() {
    if (this.connection !== 'offline') return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connect();
  }

  /** Drop the connection now and retry with backoff (e.g. the browser says it went offline). */
  dropConnection() {
    this.socket?.close();
  }

  private send(message: Uint8Array) {
    if (this.socket && this.socket.readyState === 1) this.socket.send(message);
  }

  /** Counts an update-bearing message, so the ack can tell us when it's durable (D-019). */
  private sendUpdate(sub: number, update: Uint8Array) {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_SYNC);
    encoding.writeVarUint(e, sub);
    encoding.writeVarUint8Array(e, update);
    this.send(encoding.toUint8Array(e));
    this.sent += 1;
    if (this.unsavedSince === null) {
      this.unsavedSince = Date.now();
      clearTimeout(this.cueTimer);
      this.cueTimer = setTimeout(() => this.emit(), this.opts.syncingCueAfterMs);
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Remote edits came from the server; local ones go to it. While offline nothing is sent:
    // the next handshake will carry everything the server lacks.
    if (origin === this || this.connection !== 'online') return;
    this.sendUpdate(SYNC_UPDATE, update);
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === 'local') this.sendAwareness([...added, ...updated, ...removed]);
  };

  private sendAwareness(clients: number[]) {
    if (!this.awareness) return;
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      e,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients),
    );
    this.send(encoding.toUint8Array(e));
  }

  private onMessage(bytes: Uint8Array) {
    const decoder = decoding.createDecoder(bytes);
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) {
      const sub = decoding.readVarUint(decoder);
      if (sub === SYNC_STEP1) {
        // The server's state vector: send everything it lacks (this is the resend).
        const sv = decoding.readVarUint8Array(decoder);
        this.sendUpdate(SYNC_STEP2, Y.encodeStateAsUpdate(this.doc, sv));
        this.handshakeIndex = this.sent;
      } else if (sub === SYNC_STEP2 || sub === SYNC_UPDATE) {
        Y.applyUpdate(this.doc, decoding.readVarUint8Array(decoder), this);
        if (sub === SYNC_STEP2) {
          this.caughtUp = true;
          this.attempt = 0;
        }
      }
    } else if (type === MSG_AWARENESS && this.awareness) {
      awarenessProtocol.applyAwarenessUpdate(
        this.awareness,
        decoding.readVarUint8Array(decoder),
        this,
      );
    } else if (type === MSG_ACK) {
      this.stored = decoding.readVarUint(decoder);
      if (this.stored >= this.sent) {
        this.unsavedSince = null;
        clearTimeout(this.cueTimer);
      }
    }
    this.emit();
  }

  /** Waits until everything is durable on the server and the server's edits are here. */
  whenSynced(timeoutMs = 10_000): Promise<void> {
    if (this.synced) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`not synced after ${timeoutMs} ms (unsaved ${this.unsaved})`));
      }, timeoutMs);
      const off = this.onChange(() => {
        if (!this.synced) return;
        clearTimeout(timer);
        off();
        resolve();
      });
    });
  }

  /** Stop for good: leave presence, close the socket, stop retrying. */
  destroy() {
    this.connection = 'stopped';
    clearTimeout(this.retryTimer);
    clearTimeout(this.cueTimer);
    clearInterval(this.heartbeatTimer);
    if (this.awareness)
      awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.doc.off('update', this.onDocUpdate);
    this.awareness?.off('update', this.onAwarenessUpdate);
    this.socket?.close();
    this.socket = null;
    this.emit();
  }
}
