import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import './base.css';
import { Root } from './Root';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// VITE_SYNC_URLS: comma-separated sync servers (the local 3-node cluster); default: one on :4000.
const urls = (import.meta.env.VITE_SYNC_URLS as string | undefined)
  ?.split(',')
  .map((u) => u.trim())
  .filter(Boolean);

createRoot(root).render(
  <StrictMode>
    <Root syncUrls={urls?.length ? urls : `ws://${location.hostname}:4000`} />
  </StrictMode>,
);
