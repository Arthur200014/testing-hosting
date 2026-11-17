import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, reconcileElements, CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { connectScene, lessonPermit } from './scene-client.mjs';
// Local fonts only; no vendor/CDN subscription or remote asset dependency.
window.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
let client, starting = false;
const config = window.__BOARD_TEST_CONFIG;
function App() {
  const [status, setStatus] = React.useState('Загрузка доски');
  const [loaded,setLoaded]=React.useState(false),[attachments,setAttachments]=React.useState([]),[fileError,setFileError]=React.useState('');
  if (!config) return <p>Откройте доску через изолированный тестовый runner.</p>;
  return <><Excalidraw viewModeEnabled={!loaded} excalidrawAPI={api => {
    if (client || starting) return;
    starting = true;
    // Test harness can inspect the real editor state; no substitute scene model.
    window.__BOARD_EDITOR = api;
    const start = async () => {
      const permit = config.session ? await lessonPermit(config.session) : config.permit;
      if (config.session && permit.keyVersion !== 1) throw new Error('Unsupported scene key version');
      const sceneKey = config.session ? permit.sceneKey : config.sceneKey;
      client = connectScene({ ...config, permit, sceneKey, api, reconcileElements, CaptureUpdateAction, convertToExcalidrawElements, status: setStatus, onReady:()=>setLoaded(true), onAttachments:setAttachments });
    };
    start().catch(() => setStatus('Нет доступа к занятию'));
  }} onChange={(elements,appState,files) => client?.changed(elements,files)} initialData={{appState:{currentItemFontFamily:1}}}
    UIOptions={{canvasActions:{loadScene:false,saveAsImage:false,export:false}}}/><output id="status">{status}</output><aside id="files"><label>Добавить PNG, JPEG или PDF<input data-testid="board-file" type="file" accept="image/png,image/jpeg,application/pdf" disabled={!loaded} onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file){setFileError('');try{await client.addFile(file);}catch(error){setFileError(error.message);}}}}/></label>{fileError&&<p role="alert">{fileError}</p>}{attachments.map(f=><div key={f.id}><button data-testid="board-download" onClick={async()=>{setFileError('');try{await client.downloadFile(f.id);}catch{setFileError('Нет доступа к файлу');}}}>{f.name}</button></div>)}</aside></>;
}
createRoot(document.getElementById('root')).render(<App/>);
