import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, reconcileElements, CaptureUpdateAction } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { connectScene, lessonPermit } from './scene-client.mjs';
// Local fonts only; no vendor/CDN subscription or remote asset dependency.
window.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
let client, starting = false;
const config = window.__BOARD_TEST_CONFIG;
function App() {
  const [status, setStatus] = React.useState('Нет тестовой сессии');
  if (!config) return <p>Откройте доску через изолированный тестовый runner.</p>;
  return <><Excalidraw excalidrawAPI={api => {
    if (client || starting) return;
    starting = true;
    // Test harness can inspect the real editor state; no substitute scene model.
    window.__BOARD_EDITOR = api;
    const start = async () => {
      const permit = config.session ? await lessonPermit(config.session) : config.permit;
      client = connectScene({ ...config, permit, api, reconcileElements, CaptureUpdateAction, status: setStatus });
    };
    start().catch(() => setStatus('Нет доступа к занятию'));
  }} onChange={elements => client?.changed(elements)} initialData={{appState:{currentItemFontFamily:1}}}
    UIOptions={{canvasActions:{loadScene:false,saveAsImage:false,export:false}}}/><output id="status">{status}</output></>;
}
createRoot(document.getElementById('root')).render(<App/>);
