import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, reconcileElements, CaptureUpdateAction } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { connectScene } from './scene-client.mjs';
// Local fonts only; no vendor/CDN subscription or remote asset dependency.
window.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
let client;
const config = window.__BOARD_TEST_CONFIG;
function App() {
  const [status, setStatus] = React.useState('Нет тестовой сессии');
  if (!config) return <p>Откройте доску через изолированный тестовый runner.</p>;
  return <><Excalidraw excalidrawAPI={api => {
    if (client) return;
    // Test harness can inspect the real editor state; no substitute scene model.
    window.__BOARD_EDITOR = api;
    client = connectScene({ ...config, api, reconcileElements, CaptureUpdateAction, status: setStatus });
  }} onChange={elements => client?.changed(elements)} initialData={{appState:{currentItemFontFamily:1}}}
    UIOptions={{canvasActions:{loadScene:false,saveAsImage:false,export:false}}}/><output id="status">{status}</output></>;
}
createRoot(document.getElementById('root')).render(<App/>);
