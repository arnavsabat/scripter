// The sync server (SPEC 5.1, 5.4): a WebSocket server speaking y-protocols sync and awareness,
// plus our ack (packages/shared/PROTOCOL.md). One Room per open episode, loaded on demand and
// unloaded (with a snapshot) once the last writer has been gone for a while.
import {
  CLOSE,
  DOC_ID,
  MSG_AWARENESS,
  MSG_SYNC,
  SYNC_STEP1,
  SYNC_STEP2,
  SYNC_UPDATE,
} from '@wr/shared';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { authenticate } from './auth';
import { Room, type Logger, type Peer } from './room';
import type { Storage } from './storage/types';

export interface SyncServerOptions {
  port: number;
  host?: string;
  storage: Storage;
  /** Accept unsigned development tokens (WR_DEV_AUTH=1). Never in production. */
  devAuth: boolean;
  snapshotEvery?: number;
  snapshotAfterMs?: number;
  /** Unload a room this long after its last writer leaves. */
  idleUnloadMs?: number;
  logger?: Logger;
}

export interface SyncServer {
  port: number;
  rooms: Map<string, Room>;
  /** Graceful: finish queued updates, snapshot every room, close sockets with 1001. */
  close(): Promise<void>;
  /** Abrupt: drop every socket and forget every room, with no snapshot (a crash, for tests). */
  kill(): Promise<void>;
  /** Drop every connection but keep running (simulates a network blip, for tests). */
  dropConnections(): void;
}

const quietLogger: Logger = { info: () => {}, error: () => {} };

export async function startSyncServer(options: SyncServerOptions): Promise<SyncServer> {
  const {
    storage,
    devAuth,
    snapshotEvery = 1_000,
    snapshotAfterMs = 120_000,
    idleUnloadMs = 30_000,
    logger = quietLogger,
  } = options;
  const rooms = new Map<string, Room>();
  const unloading = new Map<string, Promise<void>>();
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const sockets = new Set<WebSocket>();

  async function getRoom(docId: string) {
    clearTimeout(idleTimers.get(docId));
    idleTimers.delete(docId);
    await unloading.get(docId);
    let room = rooms.get(docId);
    if (!room) {
      room = new Room({ docId, storage, snapshotEvery, snapshotAfterMs, logger });
      rooms.set(docId, room);
    }
    await room.ready;
    return room;
  }

  function scheduleUnload(room: Room) {
    if (room.peers.size > 0) return;
    idleTimers.set(
      room.docId,
      setTimeout(() => {
        idleTimers.delete(room.docId);
        if (room.peers.size > 0 || rooms.get(room.docId) !== room) return;
        rooms.delete(room.docId);
        const done = room.close().finally(() => unloading.delete(room.docId));
        unloading.set(room.docId, done);
      }, idleUnloadMs),
    );
  }

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });

  http.on('upgrade', (req: IncomingMessage, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => void onConnection(ws, req));
  });

  async function onConnection(ws: WebSocket, req: IncomingMessage) {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    const url = new URL(req.url ?? '/', 'http://local');
    const docId = /^\/doc\/([^/]+)$/.exec(url.pathname)?.[1] ?? '';
    const identity = authenticate(url.searchParams.get('token') ?? '', { devAuth });
    if (!identity) return ws.close(CLOSE.UNAUTHORIZED, 'unauthorized');
    if (!DOC_ID.test(docId)) return ws.close(CLOSE.BAD_DOCUMENT, 'bad episode id');

    const peer: Peer = {
      name: identity.name,
      stored: 0,
      awarenessIds: new Set(),
      closed: false,
      send: (message) => {
        if (ws.readyState === ws.OPEN) ws.send(message);
      },
      close: (code, reason) => {
        peer.closed = true;
        ws.close(code, reason);
      },
    };

    // Messages can arrive before the room has loaded; buffer them and replay in order.
    const early: RawData[] = [];
    let room: Room | null = null;
    ws.on('message', (data) => (room ? handle(room, peer, data) : early.push(data)));
    ws.on('close', () => {
      peer.closed = true;
      if (room) {
        room.leave(peer);
        scheduleUnload(room);
      }
    });
    // Server-side half-open detection: a socket that stops answering pings is dropped.
    let alive = true;
    ws.on('pong', () => (alive = true));
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30_000);
    ws.on('close', () => clearInterval(ping));

    try {
      room = await getRoom(docId);
    } catch (err) {
      logger.error('room load failed', { docId, err: String(err) });
      return ws.close(CLOSE.STORAGE_FAILED, 'load failed');
    }
    if (peer.closed) return scheduleUnload(room);
    room.join(peer);
    // Handshake: our state vector (so the client sends what we lack), then everyone's presence.
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_SYNC);
    encoding.writeVarUint(e, SYNC_STEP1);
    encoding.writeVarUint8Array(e, Y.encodeStateVector(room.doc));
    peer.send(encoding.toUint8Array(e));
    const states = [...room.awareness.getStates().keys()];
    if (states.length) {
      const a = encoding.createEncoder();
      encoding.writeVarUint(a, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        a,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, states),
      );
      peer.send(encoding.toUint8Array(a));
    }
    for (const data of early.splice(0)) handle(room, peer, data);
  }

  function handle(room: Room, peer: Peer, data: RawData) {
    try {
      const bytes =
        data instanceof Buffer
          ? new Uint8Array(data)
          : new Uint8Array(Buffer.concat(data as Buffer[]));
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
          void room.ingest(peer, decoding.readVarUint8Array(decoder));
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

  await new Promise<void>((resolve) =>
    http.listen(options.port, options.host ?? '0.0.0.0', resolve),
  );
  const port = (http.address() as AddressInfo).port;
  logger.info('sync server listening', { port, devAuth });

  const stopListening = () =>
    new Promise<void>((resolve) => {
      wss.close();
      http.close(() => resolve());
      http.closeAllConnections();
    });

  return {
    port,
    rooms,
    async close() {
      for (const t of idleTimers.values()) clearTimeout(t);
      for (const ws of sockets) ws.close(CLOSE.GOING_AWAY, 'server shutting down');
      await Promise.all([...rooms.values()].map((r) => r.close()));
      await Promise.all(unloading.values());
      rooms.clear();
      await stopListening();
    },
    async kill() {
      for (const t of idleTimers.values()) clearTimeout(t);
      for (const ws of sockets) ws.terminate();
      for (const room of rooms.values()) room.destroy();
      rooms.clear();
      await stopListening();
    },
    dropConnections() {
      for (const ws of sockets) ws.terminate();
    },
  };
}
