import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import './base.css';
import { App } from './App';
import { sessionFromUrl } from './session';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Development: ?as=Maya picks the writer, ?ep=pilot picks the episode (D-018 item 8).
// VITE_SYNC_URLS: comma-separated sync servers (the local 3-node cluster); default: one on :4000.
const urls = (import.meta.env.VITE_SYNC_URLS as string | undefined)
  ?.split(',')
  .map((u) => u.trim())
  .filter(Boolean);
const session = sessionFromUrl(
  new URL(location.href),
  urls?.length ? urls : `ws://${location.hostname}:4000`,
);

createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
