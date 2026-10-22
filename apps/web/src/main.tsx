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
const session = sessionFromUrl(
  new URL(location.href),
  (import.meta.env.VITE_SYNC_URL as string | undefined) ?? `ws://${location.hostname}:4000`,
);

createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
