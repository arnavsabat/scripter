// The wire protocol between browsers and apps/sync (documented in ../PROTOCOL.md).
// Messages 0 and 1 are y-protocols' own sync and awareness messages; 3 is ours (D-019).
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;
/** "I've durably stored N of your update messages on this connection" (D-019). */
export const MSG_ACK = 3;

/** y-protocols sync sub-types: step 1 carries a state vector, step 2 and update carry Yjs updates. */
export const SYNC_STEP1 = 0;
export const SYNC_STEP2 = 1;
export const SYNC_UPDATE = 2;

export function encodeAck(stored: number): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_ACK);
  encoding.writeVarUint(e, stored);
  return encoding.toUint8Array(e);
}

/** Reads an ack's count; `decoder` is positioned just after the message type. */
export const readAck = (decoder: decoding.Decoder) => decoding.readVarUint(decoder);

/** WebSocket close codes the server uses (4000-4999 are free for applications). */
export const CLOSE = {
  /** Missing, malformed or expired token. Don't retry with the same token. */
  UNAUTHORIZED: 4401,
  /** The episode ID isn't valid. Don't retry. */
  BAD_DOCUMENT: 4404,
  /** The server couldn't make an update durable. Reconnect: the handshake resends it. */
  STORAGE_FAILED: 4500,
  /** The server is shutting down (or handing the episode to another server). Reconnect. */
  GOING_AWAY: 1001,
} as const;

/** Episode IDs are also DynamoDB keys and S3 object names, so keep them plain. */
export const DOC_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
