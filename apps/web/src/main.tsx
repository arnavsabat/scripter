import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import './base.css';
import { App } from './App';
import { devIndexedDbStore, resetDevStore } from './editor/devStore';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Development only: open the app with ?reset to start from a blank script.
const url = new URL(location.href);
if (url.searchParams.has('reset')) {
  await resetDevStore();
  url.searchParams.delete('reset');
  history.replaceState(null, '', url);
}

createRoot(root).render(
  <StrictMode>
    <App store={devIndexedDbStore} />
  </StrictMode>,
);
