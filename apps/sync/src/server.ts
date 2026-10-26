// A sync server, one member of the cluster (SPEC 5.1, 5.4, D-022).
//
// Any server accepts a writer's WebSocket. It verifies the token, then routes the connection:
//   - if it already holds the episode's room, or the ring says it's the episode's home: serve it
//     (taking the lease first, waiting for a dead owner's lease to expire if need be);
//   - otherwise: open its own WebSocket to the home server and pipe messages both ways
//     (the "forwarding hop"), passing the verified identity in a signed header.
// When the ring changes (a server joins or leaves), rooms whose home has moved are handed off
// gracefully, idle ones first: finish queued edits, snapshot, release the lease, and close the
// writers' sockets with 4409 so they reconnect and get routed to the new home.
import {
  CLOSE,
  DOC_ID,
  MSG_AWARENESS,
  MSG_PING,
  MSG_SYNC,
  SYNC_STEP1,
  SYNC_STEP2,
  SYNC_UPDATE,
  encodePong,
  type Identity,
} from '@wr/shared';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { TokenVerifier } from '@wr/auth';
import type { AccessResult, AccessSource, Mode } from './access';
import { authenticate } from './auth';
import { Cluster } from './cluster';
import { FORWARD_HEADER, signForward, verifyForward } from './forwardAuth';
import { isEmptyUpdate, Room, type Logger, type Peer } from './room';
import type { Storage } from './storage/types';

export interface SyncServerOptions {
  port: number;
  host?: string;
  storage: Storage;
  /** Checks sign-in tokens (D-046): Cognito in production, the test key in tests. */
  verify: TokenVerifier;
  /** Who a token belongs to and what they may do (Postgres in production, D-031). */
  access: AccessSource;
  /** This server's ID in the cluster (default: random) and the URL other servers reach it at. */
  serverId?: string;
  internalUrl?: string;
  /** Shared by every server in the cluster; signs forwarded identities. Required. */
  clusterSecret: string;
  /** How often the home server refreshes Home's green dot (D-033). */
  presenceEveryMs?: number;
  snapshotEvery?: number;
  snapshotAfterMs?: number;
  /** Hand an idle room back (snapshot + release) this long after its last writer leaves. */
  idleUnloadMs?: number;
  /** D-022 timings: lease 6 s / renew 2 s, heartbeat 2 s / dead after 6 s. */
  leaseTtlMs?: number;
  renewEveryMs?: number;
  heartbeatMs?: number;
  deadAfterMs?: number;
  vnodes?: number;
  logger?: Logger;
}

export interface SyncServer {
  port: number;
  serverId: string;
  rooms: Map<string, Room>;
  cluster: Cluster;
  /** Graceful: leave the ring, hand every room off (idle first), then stop. */
  close(): Promise<void>;
  /** Abrupt: drop every socket and forget every room, no snapshot, no lease release (a crash). */
  kill(): Promise<void>;
  /** Freeze (like SIGSTOP): stop heartbeats, renewals and message processing. thaw() resumes. */
  freeze(): void;
  thaw(): void;
  /** Drop every connection but keep running (a network blip, for tests). */
  dropConnections(): void;
}

const quietLogger: Logger = { info: () => {}, error: () => {} };

/** Codes a forwarding hop can pass through; anything else becomes "try again". */
/** What a refused access check becomes on the wire. */
const REFUSAL: Record<Extract<AccessResult, { ok: false }>['reason'], number> = {
  none: CLOSE.FORBIDDEN,
  deleted: CLOSE.DELETED,
  unknown: CLOSE.BAD_DOCUMENT,
};

/** What the home server knows about each of its connections. */
interface PeerInfo {
  userId: string;
  mode: Mode;
  seriesId: string;
  episodeId: string;
}

const EDITED_EVERY_MS = 60_000;

const passThrough = (code: number) =>
  code === CLOSE.GOING_AWAY || (code >= 4000 && code < 5000) ? code : CLOSE.TRY_AGAIN;

export async function startSyncServer(options: SyncServerOptions): Promise<SyncServer> {
  const {
    storage,
    verify,
    access,
    snapshotEvery = 1_000,
    snapshotAfterMs = 120_000,
    idleUnloadMs = 30_000,
    leaseTtlMs = 6_000,
    renewEveryMs = 2_000,
    heartbeatMs = 2_000,
    deadAfterMs = 6_000,
    presenceEveryMs = 10_000,
    logger = quietLogger,
  } = options;
  const serverId = options.serverId ?? `sync-${randomBytes(3).toString('hex')}`;
  const clusterSecret = options.clusterSecret;
  if (!clusterSecret) throw new Error('clusterSecret is required');

  const rooms = new Map<string, Room>();
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const sockets = new Set<WebSocket>();
  const peerInfo = new Map<Peer, PeerInfo>();
  const lastEdited = new Map<string, number>();
  let frozen = false;
  let closing = false;
  const whileFrozen: (() => void)[] = []; // work deferred until thaw()
  const later = (fn: () => void) => (frozen ? whileFrozen.push(fn) : fn());

  // ---- rooms ------------------------------------------------------------------------------

  function openRoom(docId: string) {
    clearTimeout(idleTimers.get(docId));
    idleTimers.delete(docId);
    let room = rooms.get(docId);
    if (!room || room.state === 'closing' || room.state === 'closed') {
      const created: Room = new Room({
        docId,
        serverId,
        storage,
        snapshotEvery,
        snapshotAfterMs,
        leaseTtlMs,
        renewEveryMs,
        logger,
        frozen: () => frozen,
        onClosed: (r) => {
          if (rooms.get(r.docId) === r) rooms.delete(r.docId);
        },
      });
      room = created;
      rooms.set(docId, room);
      room.ready.catch((err: unknown) => {
        logger.error('room load failed', { docId, err: String(err) });
        if (rooms.get(docId) === created) rooms.delete(docId);
        for (const peer of created.peers) peer.close(CLOSE.TRY_AGAIN, 'try again');
      });
    }
    return room;
  }

  function scheduleIdleHandoff(room: Room) {
    if (room.peers.size > 0 || closing) return;
    clearTimeout(idleTimers.get(room.docId));
    idleTimers.set(
      room.docId,
      setTimeout(() => {
        idleTimers.delete(room.docId);
        if (room.peers.size === 0) void room.handoff('idle');
      }, idleUnloadMs),
    );
  }

  // ---- rebalancing: rooms whose home moved are handed off one at a time, idle first ---------

  let handingOff: Promise<void> = Promise.resolve();
  function rebalance() {
    const moving = [...rooms.values()]
      .filter((r) => r.state === 'open' && cluster.homeOf(r.docId) !== serverId)
      .sort((a, b) => a.lastActivity - b.lastActivity); // idle scripts first
    for (const room of moving) {
      handingOff = handingOff.then(async () => {
        if (room.state === 'open' && cluster.homeOf(room.docId) !== serverId) {
          await room.handoff(`home is now ${cluster.homeOf(room.docId)}`);
        }
      });
    }
    return handingOff;
  }

  let port = 0; // known once listening
  const cluster: Cluster = new Cluster({
    self: {
      id: serverId,
      get url() {
        return options.internalUrl ?? `ws://127.0.0.1:${port}`;
      },
    },
    store: storage.members,
    heartbeatMs,
    deadAfterMs,
    ...(options.vnodes ? { vnodes: options.vnodes } : {}),
    logger,
    frozen: () => frozen,
    onChange: () => void rebalance(),
  });

  // ---- connections ------------------------------------------------------------------------

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  http.on('upgrade', (req: IncomingMessage, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, req));
  });

  type Held = { data: RawData; binary: boolean }[];

  function onConnection(ws: WebSocket, req: IncomingMessage) {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    const url = new URL(req.url ?? '/', 'http://local');
    const docId = /^\/doc\/([^/]+)$/.exec(url.pathname)?.[1] ?? '';
    const forwardedHeader = req.headers[FORWARD_HEADER];
    const forwarded = verifyForward(
      typeof forwardedHeader === 'string' ? forwardedHeader : undefined,
      clusterSecret,
    );
    // The client speaks as soon as the socket opens, and checking its token takes a moment, so
    // hold whatever arrives meanwhile and hand it on, in order.
    const held: Held = [];
    const hold = (data: RawData, binary: boolean) => held.push({ data, binary });
    ws.on('message', hold);
    const identity = forwarded
      ? Promise.resolve(forwarded)
      : authenticate(url.searchParams.get('token') ?? '', verify, access);
    identity.then(
      (who) => {
        ws.off('message', hold);
        if (ws.readyState === WebSocket.OPEN) route(ws, url, docId, who, forwarded !== null, held);
      },
      (err: unknown) => {
        ws.off('message', hold);
        logger.error('token check failed', { err: String(err) });
        ws.close(CLOSE.TRY_AGAIN, 'try again');
      },
    );
  }

  function route(
    ws: WebSocket,
    url: URL,
    docId: string,
    identity: Identity | null,
    forwarded: boolean,
    held: Held,
  ) {
    if (!identity) return ws.close(CLOSE.UNAUTHORIZED, 'unauthorized');
    if (!DOC_ID.test(docId)) return ws.close(CLOSE.BAD_DOCUMENT, 'bad episode id');
    const local = rooms.get(docId);
    // Shutting down: keep serving the episodes we still hold until they're handed off; refuse the rest.
    if (closing && !(local && local.state === 'open'))
      return ws.close(CLOSE.GOING_AWAY, 'server shutting down');
    const home = cluster.homeOf(docId);
    // Serve here if we hold the episode (open, or still loading) or the ring says we're its home.
    // A room that's closing (being handed off) doesn't count: route by the ring instead, or the
    // writer would re-open it here and take the lease straight back.
    const holding = local && (local.state === 'open' || local.state === 'loading');
    if (holding || home === serverId) return serve(ws, docId, identity, held);
    // A forwarded writer reached a server that doesn't think it's the home (the ring is still
    // settling): send it round again rather than forwarding twice.
    if (forwarded) return ws.close(CLOSE.MOVED, 'not home');
    const homeUrl = home ? cluster.urlOf(home) : null;
    if (!homeUrl) return ws.close(CLOSE.TRY_AGAIN, 'no home server');
    forward(ws, `${url.pathname}${url.search}`, homeUrl, identity, docId, held);
  }

  /**
   * The forwarding hop: a WebSocket to the home server, with messages piped both ways.
   *
   * If the home can't be reached when the writer first connects (it just died, and the ring
   * hasn't caught up yet), the writer is held rather than turned away: this server answers its
   * heartbeat pings and retries every 500 ms, re-resolving the home each time, for up to 15 s.
   * The same goes for a home that turns the hop away before the session begins (it's shutting
   * down, or its view of the ring is a moment behind ours).
   * That way a failover costs the writer one reconnect, not a growing client backoff. Once a
   * session with a home has started, losing it closes the writer's socket instead: a fresh
   * handshake with the next home is what keeps the acknowledgment counts honest.
   */
  function forward(
    client: WebSocket,
    path: string,
    firstHomeUrl: string,
    identity: Identity,
    docId: string,
    held: Held,
  ) {
    const deadline = Date.now() + 15_000;
    const pending: { data: RawData; binary: boolean }[] = [];
    let upstream: WebSocket | null = null;
    let opened = false;
    let started = false; // the home has sent something: a session with it has begun
    let retry: ReturnType<typeof setTimeout> | undefined;

    const fromClient = (data: RawData, binary: boolean) =>
      later(() => {
        const isPing = toBytes(data)[0] === MSG_PING;
        if (upstream && opened && upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary });
          // Until the home has started the session, keep a copy: if it turns us away, the next
          // home must get the writer's opening messages too (its state vector above all).
          if (!started && !isPing) pending.push({ data, binary });
          return;
        }
        // No home yet: keep the writer's heartbeat alive ourselves, and hold everything else.
        if (isPing && client.readyState === WebSocket.OPEN) return client.send(encodePong());
        pending.push({ data, binary });
      });
    for (const m of held) fromClient(m.data, m.binary);
    client.on('message', fromClient);
    client.on('close', () => {
      clearTimeout(retry);
      upstream?.close();
    });

    const tryAgainLater = () => {
      upstream = null;
      if (client.readyState !== WebSocket.OPEN) return;
      if (Date.now() > deadline || closing)
        return client.close(CLOSE.TRY_AGAIN, 'home unreachable');
      retry = setTimeout(() => {
        const home = cluster.homeOf(docId);
        if (home === serverId) return client.close(CLOSE.MOVED, 'home is here now'); // reconnect: served here
        const url = home ? cluster.urlOf(home) : null;
        if (url) connect(url);
        else tryAgainLater();
      }, 500);
    };

    const connect = (homeUrl: string) => {
      const up = new WebSocket(`${homeUrl}${path}`, {
        headers: { [FORWARD_HEADER]: signForward(identity, clusterSecret) },
      });
      upstream = up;
      sockets.add(up);
      up.on('open', () =>
        later(() => {
          opened = true;
          // Replay everything held so far (kept until the session starts, see above).
          for (const m of pending) up.send(m.data, { binary: m.binary });
        }),
      );
      up.on('message', (data, binary) =>
        later(() => {
          if (!started) pending.length = 0; // the session has begun: nothing left to replay
          started = true;
          if (client.readyState === WebSocket.OPEN) client.send(data, { binary });
        }),
      );
      up.on('error', () => {}); // 'close' follows and decides
      up.on('close', (code) => {
        sockets.delete(up);
        if (upstream !== up) return;
        // Never reached the home, or it turned us away before the session began: hold the writer
        // and retry (re-resolving the home), instead of bouncing the writer.
        if (!started) {
          opened = false;
          return tryAgainLater();
        }
        if (client.readyState === WebSocket.OPEN)
          client.close(passThrough(code), 'upstream closed');
      });
    };
    connect(firstHomeUrl);
  }

  /**
   * The home server's side of a connection. Access is checked first (D-031): a refused check
   * closes with 4403 (no access), 4410 (deleted) or 4404 (no such document). A view-only
   * connection joins like any other, so it sees edits and presence, but its edits are refused.
   */
  function serve(ws: WebSocket, docId: string, identity: Identity, held: Held) {
    let room: Room | null = null;
    let info: PeerInfo | null = null;
    const peer: Peer = {
      name: identity.name,
      stored: 0,
      awarenessIds: new Set(),
      closed: false,
      send: (message) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
      },
      close: (code, reason) => {
        peer.closed = true;
        if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
      },
    };
    // Heartbeat pings are answered at once, even while access is checked or the room is still
    // loading (waiting for a dead owner's lease to expire), so the client knows this server is alive.
    const early: Uint8Array[] = [];
    let joined = false;
    const onMessage = (data: RawData) =>
      later(() => {
        const bytes = toBytes(data);
        if (bytes[0] === MSG_PING) return peer.send(encodePong());
        if (joined && room && info) handle(room, peer, info, bytes);
        else early.push(bytes);
      });
    for (const m of held) onMessage(m.data);
    ws.on('message', onMessage);
    ws.on('close', () => {
      peer.closed = true;
      peerInfo.delete(peer);
      if (!room) return;
      room.leave(peer);
      if (joined && info) noteLeft(room, info);
      scheduleIdleHandoff(room);
    });

    access.check(identity.userId, docId).then(
      (result) => {
        if (peer.closed) return;
        if (!result.ok) return peer.close(REFUSAL[result.reason], `access: ${result.reason}`);
        const me: PeerInfo = {
          userId: identity.userId,
          mode: result.mode,
          seriesId: result.seriesId,
          episodeId: result.episodeId,
        };
        info = me;
        peerInfo.set(peer, me);
        const r = openRoom(docId);
        room = r;
        void r.ready.then(
          () => {
            if (peer.closed) return scheduleIdleHandoff(r);
            if (r.state !== 'open') return peer.close(CLOSE.MOVED, 'episode moved');
            r.join(peer);
            joined = true;
            notePresent(r);
            // Handshake: our state vector (so the client sends what we lack), then everyone's presence.
            const e = encoding.createEncoder();
            encoding.writeVarUint(e, MSG_SYNC);
            encoding.writeVarUint(e, SYNC_STEP1);
            encoding.writeVarUint8Array(e, Y.encodeStateVector(r.doc));
            peer.send(encoding.toUint8Array(e));
            const states = [...r.awareness.getStates().keys()];
            if (states.length) {
              const a = encoding.createEncoder();
              encoding.writeVarUint(a, MSG_AWARENESS);
              encoding.writeVarUint8Array(
                a,
                awarenessProtocol.encodeAwarenessUpdate(r.awareness, states),
              );
              peer.send(encoding.toUint8Array(a));
            }
            for (const bytes of early.splice(0)) handle(r, peer, me, bytes);
          },
          () => peer.close(CLOSE.TRY_AGAIN, 'try again'),
        );
      },
      (err: unknown) => {
        logger.error('access check failed', { docId, err: String(err) });
        peer.close(CLOSE.TRY_AGAIN, 'try again');
      },
    );
  }

  // ---- access changes, presence and "edited" (D-031, D-033) -------------------------------

  /** Re-checks the matching connections; anyone whose access changed is told to ask again (4403). */
  function recheck(matches: (i: PeerInfo) => boolean) {
    for (const room of rooms.values())
      for (const peer of room.peers) {
        const info = peerInfo.get(peer);
        if (!info || !matches(info)) continue;
        access.check(info.userId, room.docId).then(
          (r) => {
            if (peer.closed) return;
            if (!r.ok) peer.close(REFUSAL[r.reason], `access: ${r.reason}`);
            else if (r.mode !== info.mode) peer.close(CLOSE.FORBIDDEN, 'access changed');
          },
          (err: unknown) => logger.error('access re-check failed', { err: String(err) }),
        );
      }
  }
  access.subscribe(
    (change) =>
      recheck(
        (i) => i.seriesId === change.series && (!change.episode || i.episodeId === change.episode),
      ),
    () => recheck(() => true),
  );

  const usersIn = (room: Room) => {
    const by = new Map<string, Set<string>>(); // episode -> people
    for (const peer of room.peers) {
      const info = peerInfo.get(peer);
      if (info) by.set(info.episodeId, (by.get(info.episodeId) ?? new Set()).add(info.userId));
    }
    return by;
  };
  function notePresent(room: Room) {
    for (const [episodeId, users] of usersIn(room))
      access
        .present(episodeId, [...users], serverId)
        .catch((err: unknown) => logger.error('presence write failed', { err: String(err) }));
  }
  function noteLeft(room: Room, info: PeerInfo) {
    if (usersIn(room).get(info.episodeId)?.has(info.userId)) return; // still here in another tab
    access
      .left(info.episodeId, info.userId)
      .catch((err: unknown) => logger.error('presence write failed', { err: String(err) }));
  }
  function noteEdited(episodeId: string) {
    const now = Date.now();
    if (now - (lastEdited.get(episodeId) ?? 0) < EDITED_EVERY_MS) return;
    lastEdited.set(episodeId, now);
    access
      .edited(episodeId)
      .catch((err: unknown) => logger.error('edited write failed', { err: String(err) }));
  }
  const presenceTimer = setInterval(() => {
    if (frozen) return;
    for (const room of rooms.values()) if (room.state === 'open') notePresent(room);
  }, presenceEveryMs);

  function toBytes(data: RawData) {
    return data instanceof Buffer
      ? new Uint8Array(data)
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(Buffer.concat(data as readonly Uint8Array[]));
  }

  function handle(room: Room, peer: Peer, info: PeerInfo, bytes: Uint8Array) {
    try {
      const decoder = decoding.createDecoder(bytes);
      const type = decoding.readVarUint(decoder);
      if (type === MSG_SYNC) {
        const sub = decoding.readVarUint(decoder);
        if (sub === SYNC_STEP1) {
          // The client's state vector: reply with everything it lacks.
          const sv = decoding.readVarUint8Array(decoder);
          const e = encoding.createEncoder();
          encoding.writeVarUint(e, MSG_SYNC);
          encoding.writeVarUint(e, SYNC_STEP2);
          encoding.writeVarUint8Array(e, Y.encodeStateAsUpdate(room.doc, sv));
          peer.send(encoding.toUint8Array(e));
        } else if (sub === SYNC_STEP2 || sub === SYNC_UPDATE) {
          const update = decoding.readVarUint8Array(decoder);
          const empty = isEmptyUpdate(update);
          // View only: an empty handshake reply is acknowledged as usual; an edit is refused.
          if (info.mode === 'view' && !empty) return peer.close(CLOSE.FORBIDDEN, 'view only');
          void room.ingest(peer, update);
          if (!empty) noteEdited(info.episodeId);
        }
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          peer,
        );
      }
    } catch (err) {
      logger.error('bad message; closing connection', { peer: peer.name, err: String(err) });
      peer.close(1003, 'bad message');
    }
  }

  // ---- start ------------------------------------------------------------------------------

  await new Promise<void>((resolve) =>
    http.listen(options.port, options.host ?? '0.0.0.0', resolve),
  );
  port = (http.address() as AddressInfo).port;
  await cluster.start();
  logger.info('sync server listening', { serverId, port });

  const stopListening = () =>
    new Promise<void>((resolve) => {
      wss.close();
      http.close(() => resolve());
      http.closeAllConnections();
    });
  const stopTimers = () => {
    clearInterval(presenceTimer);
    for (const t of idleTimers.values()) clearTimeout(t);
    idleTimers.clear();
  };

  return {
    port,
    serverId,
    rooms,
    cluster,
    async close() {
      closing = true;
      stopTimers();
      await cluster.leave();
      // Give every other server one heartbeat interval to notice we've left, so the writers we
      // hand off are routed straight to their new homes rather than back here. We keep serving
      // our episodes meanwhile.
      await new Promise((r) => setTimeout(r, heartbeatMs + 250));
      await rebalance(); // every room now "belongs elsewhere": hand each off, idle first
      for (const ws of sockets) ws.close(CLOSE.GOING_AWAY, 'server shutting down');
      await stopListening();
    },
    async kill() {
      closing = true;
      stopTimers();
      cluster.halt();
      for (const ws of sockets) ws.terminate();
      for (const room of rooms.values()) room.destroy();
      rooms.clear();
      await stopListening();
    },
    freeze() {
      frozen = true;
    },
    thaw() {
      frozen = false;
      for (const fn of whileFrozen.splice(0)) fn();
    },
    dropConnections() {
      for (const ws of sockets) ws.terminate();
    },
  };
}
