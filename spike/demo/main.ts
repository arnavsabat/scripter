// Two editors on one page, joined by the fake network. Enter/Tab follow SPEC 4.2; Mod-Z is
// per-writer undo. "Go offline", edit both sides, then "Reconnect" to watch the merge.
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { createClient, type Client } from '../src/editor';
import { generateScript } from '../src/generate';
import { Network } from '../src/net';
import { makeKit, type Variant } from '../src/schema';
import '../src/spike.css';

const stage = document.getElementById('stage')!;
const button = document.getElementById('offline') as HTMLButtonElement;
const status = document.getElementById('status')!;
const select = document.getElementById('variant') as HTMLSelectElement;
let clients: Client[] = [];
let net: Network;

function start(variant: Variant) {
  clients.forEach((c) => c.destroy());
  const kit = makeKit(variant);
  const docA = new Y.Doc();
  prosemirrorToYXmlFragment(generateScript(kit, 6), docA.getXmlFragment('script'));
  const docB = new Y.Doc();
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  clients = [
    createClient({ name: 'A', kit, ydoc: docA, mount: stage }),
    createClient({ name: 'B', kit, ydoc: docB, mount: stage }),
  ];
  net = new Network([docA, docB]);
  button.textContent = 'Go offline';
  status.textContent = 'Online: edits sync immediately.';
}

button.addEventListener('click', () => {
  if (net.online) {
    net.goOffline();
    button.textContent = 'Reconnect';
    status.textContent = 'Offline: edit both sides, then reconnect.';
  } else {
    const { bytes, ms } = net.reconnect();
    button.textContent = 'Go offline';
    status.textContent = `Merged ${bytes} bytes in ${ms.toFixed(1)} ms.`;
  }
});
select.addEventListener('change', () => start(select.value as Variant));
start('typeAttr');
