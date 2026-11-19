import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { connectScene, lessonPermit } from './scene-client.mjs';
// Local fonts only; no vendor/CDN subscription or remote asset dependency.
window.EXCALIDRAW_ASSET_PATH = new URL('./excalidraw-assets/', document.baseURI).href;
let client, starting = false;
let config = window.__BOARD_TEST_CONFIG;

function App() {
  const [readOnly,setReadOnly]=React.useState(false);
  const [status, setStatus] = React.useState('Загрузка доски');
  const [checkpointBusy,setCheckpointBusy]=React.useState(false),[checkpointStatus,setCheckpointStatus]=React.useState('');
  const [loaded,setLoaded]=React.useState(false),[attachments,setAttachments]=React.useState([]),[fileError,setFileError]=React.useState('');
  if (!config) return <p>Откройте доску через изолированный тестовый runner.</p>;
  return <><Excalidraw viewModeEnabled={!loaded||readOnly} excalidrawAPI={api => {
    if (client || starting) return;
    starting = true;
    // Test harness can inspect the real editor state; no substitute scene model.
    window.__BOARD_EDITOR = api;
    const start = async () => {
      // Isolated load harness can supply a token from ordinary API re-login.
      // This never bypasses permit issuance or adds an API/relay credential.
      const getPermit=async()=>lessonPermit({...config.session,accessToken:config.sessionProvider?await window.__BOARD_SESSION_TOKEN():config.session.accessToken});
      const permit = config.session ? await getPermit() : config.permit;
      if (config.session && permit.keyVersion !== 1) throw new Error('Unsupported scene key version');
      setReadOnly(permit.role === 'viewer');
      const sceneKey = config.session ? permit.sceneKey : config.sceneKey;
      client = connectScene({ ...config, permit, sceneKey, renewPermit:config.session?getPermit:undefined, api, CaptureUpdateAction, convertToExcalidrawElements, status: setStatus, onRoleInvalidated:()=>setReadOnly(true), onReady:()=>setLoaded(true), onAttachments:setAttachments, onApplied:config.metrics?entry=>{const m=window.__BOARD_METRICS;if(m.applied.length<2000)m.applied.push(entry);else m.dropped++;}:undefined });
    };
    start().catch(() => setStatus('Нет доступа к занятию'));
  }} onChange={(elements,appState,files) => client?.changed(elements,files)} initialData={{appState:{currentItemFontFamily:1}}}
    UIOptions={{canvasActions:{loadScene:false,saveAsImage:false,export:false}}}/><output id="status">{status}</output><aside id="files">{readOnly&&<p data-testid="board-read-only">Только просмотр</p>}{config.session?.role==='teacher'&&<><button data-testid="board-checkpoint" disabled={!loaded||readOnly||checkpointBusy} onClick={async()=>{setCheckpointBusy(true);try{const base=await client.checkpoint();setCheckpointStatus(`Контрольная точка: ${base}`);}catch(e){setCheckpointStatus(e.message);}finally{setCheckpointBusy(false);}}}>Создать контрольную точку</button><output data-testid="checkpoint-status">{checkpointStatus}</output></>}<label>Добавить PNG, JPEG или PDF<input data-testid="board-file" type="file" accept="image/png,image/jpeg,application/pdf" disabled={!loaded||readOnly} onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file){setFileError('');try{await client.addFile(file);}catch(error){setFileError(error.message);}}}}/></label>{fileError&&<p role="alert">{fileError}</p>}{attachments.map(f=><div key={f.id}><button data-testid="board-download" onClick={async()=>{setFileError('');try{await client.downloadFile(f.id);}catch{setFileError('Нет доступа к файлу');}}}>{f.name}</button></div>)}</aside></>;
}
const root = createRoot(document.getElementById('root'));
function renderEditor() {
  if (config?.metrics) window.__BOARD_METRICS = {startedAt:Date.now(),applied:[],dropped:0};
  root.render(<App/>);
}
renderEditor();

if (!config && window.parent !== window && location.hostname === '127.0.0.1') {
  window.addEventListener('message', event => {
    if (config || event.source !== window.parent || event.origin !== location.origin) return;
    const { type, relay, session } = event.data ?? {};
    if (type !== 'tas:open-lesson-board' || !['teacher','student'].includes(session?.role) || !session.accessToken) return;
    try {
      if (![relay, session.apiBase].every(value => {
        const url = new URL(value);
        return url.protocol === 'http:' && url.hostname === '127.0.0.1';
      })) return;
    } catch { return; }
    config = { url:relay, session };
    renderEditor();
  });
}
