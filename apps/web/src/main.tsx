import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import './base.css';
import { Root } from './Root';
import { initTheme } from './theme';
import { reportCrashes } from './usage';

initTheme(); // before the first paint, so a chosen theme never flashes the other one
reportCrashes();
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// VITE_SYNC_URLS: comma-separated sync servers (the local 3-node cluster). By default: in a
// production build, this same address (CloudFront sends /doc/* to the sync service, D-091);
// in development, one server on :4000.
const urls = (import.meta.env.VITE_SYNC_URLS as string | undefined)
  ?.split(',')
  .map((u) => u.trim())
  .filter(Boolean);

createRoot(root).render(
  <StrictMode>
    <Root
      syncUrls={
        urls?.length
          ? urls
          : import.meta.env.PROD
            ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
            : `ws://${location.hostname}:4000`
      }
    />
  </StrictMode>,
);
