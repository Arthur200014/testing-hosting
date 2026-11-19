import { io } from 'socket.io-client';
import {reconcileScene,sceneFingerprint} from './reconcile.mjs';
const bytes=b=>Uint8Array.from(atob(b),x=>x.charCodeAt(0));
const b64=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
const signature=e=>`${e.version}:${e.versionNonce}:${e.isDeleted}`;
const ids=list=>{if(!Array.isArray(list)||list.length>64||list.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x)))throw new Error('Invalid file references');return [...new Set(list)].sort();};
const refs=(elements,attachments=[],includeDeleted=false)=>ids([...new Set([...elements.filter(e=>e.type==='image'&&(includeDeleted||!e.isDeleted)).map(e=>e.fileId),...attachments])]);
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export async function lessonPermit({apiBase,lessonId,boardId,accessToken,role}){
  const target = boardId ?? lessonId;
  if (!['teacher','student'].includes(role) ||
      !/^[0-9a-f-]{36}$/i.test(target)) throw new Error('Invalid board target');
  const u=new URL(apiBase);if(!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname!=='/'||u.search||u.hash||u.username||u.password||u.protocol!==location.protocol)throw new Error('Isolated API required');
  const r=await fetch(`${u.origin}/api/v1/${role}/board-prototype/${boardId ? 'boards' : 'lessons'}/${target}/permit`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store',signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!r.ok){const e=new Error([401,403,404].includes(r.status)?'Доступ к занятию отозван':'API временно недоступен');e.denied=[401,403,404].includes(r.status);throw e;}return r.json();
}
export function connectScene({url,permit,sceneKey,api,reconcileElements=reconcileScene,CaptureUpdateAction,convertToExcalidrawElements,renewPermit,status,onReady=()=>{},onRoleInvalidated=()=>{},onAttachments=()=>{},onApplied=()=>{}}){
  const relay=new URL(url);
  if(!['127.0.0.1','localhost'].includes(relay.hostname) || relay.protocol!==location.protocol
    || (relay.protocol==='https:' && relay.origin!==location.origin))throw new Error('Isolated room required');
  const raw=bytes(sceneKey);if(raw.byteLength!==32)throw new Error('A valid scene key is required');
  const key=crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  const socket=io(url,{auth:{token:permit.token,workspace:permit.workspace,board:permit.board},transports:['websocket'],reconnection:false,autoConnect:false,timeout:5000});
  let after=0,ready=false,stopped=false,unsupported=false,inflight,dirty=new Map(),seen=new Map(),rpc=Promise.resolve();
  const uploads=new Map(),confirmed=new Set(),files=new Map(),attached=new Map(),pendingAttachments=new Set(),newImages=new Set(),decodedImages=new Set();
  let durableElements=[],checkpointTask,checkpointPayload;const durableAttachments=new Set();
  const checkpointAAD=base=>new TextEncoder().encode(`tas-board-checkpoint:v1:${permit.workspace}:${permit.board}:${base}`);
  const role = permit.role ?? 'editor';
  let currentPermit=permit,retryAt=0,backoff=500,terminal;
  const renewAt=p=>p.expiresAt ? p.expiresAt*1000-Math.min(15000,Math.max(1000,(p.expiresAt*1000-Date.now())/3)) : Infinity;
  let renewalAt=renewAt(permit),hasConnected=false;
  async function ensureConnection(){
    if(stopped)throw new Error('Доска закрыта');
    if(terminal)throw terminal;
    if(Date.now()<retryAt)throw new Error('Ожидание восстановления соединения');
    if(socket.connected&&Date.now()<renewalAt)return;
    try{
      if(renewPermit&&(hasConnected||Date.now()>=renewalAt)){
        const next=await renewPermit();
        if(stopped)throw new Error('Доска закрыта');
        if(next.workspace!==permit.workspace||next.board!==permit.board||next.keyVersion!==1||next.sceneKey!==sceneKey
          ||!Number.isSafeInteger(next.expiresAt)||next.expiresAt*1000<=Date.now()){
          terminal=new Error('Изменились область или ключ доски — требуется повторный вход');throw terminal;
        }
        if ((next.role ?? 'editor') !== role) {
          onRoleInvalidated();
          terminal=new Error('Права на доску изменились. Откройте её заново.');
          throw terminal;
        }
        currentPermit=next;renewalAt=renewAt(next);
      }
      socket.disconnect();
      socket.auth={token:currentPermit.token,workspace:currentPermit.workspace,board:currentPermit.board};
      await new Promise((resolve,reject)=>{
        const done=error=>{socket.off('connect',ok);socket.off('connect_error',bad);socket.off('disconnect',gone);error?reject(error):resolve();};
        const ok=()=>done(),bad=e=>done(e),gone=()=>done(new Error('Соединение прервано'));
        socket.once('connect',ok);socket.once('connect_error',bad);socket.once('disconnect',gone);socket.connect();
      });
      if(stopped){socket.disconnect();throw new Error('Доска закрыта');}
      hasConnected=true;backoff=500;retryAt=0;
    }catch(e){
      if(e.denied){terminal=e;onRoleInvalidated();}
      socket.disconnect();retryAt=Date.now()+backoff;backoff=Math.min(10000,backoff*2);throw e;
    }
  }
  // Serialise reconnect/renewal with every RPC; pending frames keep their exact bytes/ID.
  let waitingReplay=false,cancelSent=false;
  function cancelReplay(){if(waitingReplay&&!cancelSent&&socket.connected){cancelSent=true;socket.emit('replay:cancel');}}
  const request=(event,payload)=>{if(event!=='replay')cancelReplay();const result=rpc.catch(()=>{}).then(async()=>{
    await ensureConnection();
    if(event==='replay'){
      waitingReplay=true;cancelSent=false;
      try{return await socket.timeout(3000).emitWithAck(event,{...payload,wait:ready&&!dirty.size&&!pendingAttachments.size&&!uploads.size&&!inflight&&!checkpointTask});}
      finally{waitingReplay=false;}
    }
    return socket.timeout(3000).emitWithAck(event,payload);
  });rpc=result.catch(()=>{});return result;};
  const remember=elements=>{for(const e of elements)seen.set(e.id,signature(e));};
  function captureImage(id,binary){
    if(confirmed.has(id)||uploads.has(id))return;
    if(!binary?.dataURL||binary.dataURL.length>3*1024*1024)throw new Error('Image data unavailable or too large');
    const m=/^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(binary.dataURL);
    if(!m||binary.mimeType!==m[1])throw new Error('Unsupported image');
    const data=bytes(m[2]);if(data.length>2*1024*1024)throw new Error('File exceeds 2 MiB');
    uploads.set(id,{id,name:`image-${id}.${m[1]==='image/png'?'png':'jpg'}`,mimeType:m[1],data});
  }
  const changed=(elements,binary=api.getFiles())=>{
    if(!ready||terminal||role==='viewer')return;unsupported=false;let modified=false;
    for(const e of elements){
      if(e.type==='image')newImages.delete(e.fileId);
      try{if(e.type==='image'&&!e.isDeleted)captureImage(e.fileId,binary[e.fileId]);}
      catch{unsupported=true;continue;}
      if(seen.get(e.id)!==signature(e)){dirty.set(e.id,structuredClone(e));seen.set(e.id,signature(e));modified=true;}
    }
    const active=new Set(elements.filter(e=>e.type==='image'&&!e.isDeleted).map(e=>e.fileId));
    for(const id of uploads.keys())if(!newImages.has(id)&&!active.has(id)&&!pendingAttachments.has(id)&&!inflight?.fileIds.includes(id))uploads.delete(id);
    if(unsupported)status('Файл недоступен или не поддерживается — не сохранено');
    else if(modified){status('Не сохранено');cancelReplay();}
  };
  async function getFile(id,fresh=false){
    if(!fresh&&files.has(id))return files.get(id);
    const r=await request('file:get',{id});if(!r.ok)throw new Error('File unavailable');
    const f=r.file,data=new Uint8Array(f.data);
    if(f.id!==id||data.length!==f.size||data.length>2*1024*1024||!['image/png','image/jpeg','application/pdf'].includes(f.mimeType)||await hash(data)!==f.sha256)throw new Error('Corrupt file');
    const file={...f,data};files.set(id,file);confirmed.add(id);return file;
  }
  async function addFile(file){
    if(terminal||role==='viewer')throw new Error('Доска доступна только для просмотра');
    cancelReplay();
    if(!ready)throw new Error('Доска ещё загружается');
    if(!file.size||file.size>2*1024*1024||!['image/png','image/jpeg','application/pdf'].includes(file.type))throw new Error('Разрешены PNG, JPEG и PDF до 2 МиБ');
    const data=new Uint8Array(await file.arrayBuffer()),id=crypto.randomUUID();
    const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').trim().slice(0,128)||'file';
    if(file.type==='application/pdf'){
      if(new TextDecoder().decode(data.subarray(0,5))!=='%PDF-'||!new TextDecoder().decode(data.subarray(-1024)).trimEnd().endsWith('%%EOF'))throw new Error('Некорректный PDF');
      uploads.set(id,{id,name,mimeType:file.type,data});pendingAttachments.add(id);
    }else{
      const bitmap=await createImageBitmap(file),w=bitmap.width,h=bitmap.height;bitmap.close();
      if(!w||!h||w>2048||h>2048)throw new Error('Изображение должно быть не больше 2048×2048');
      uploads.set(id,{id,name,mimeType:file.type,data});newImages.add(id);
      api.addFiles([{id,mimeType:file.type,dataURL:`data:${file.type};base64,${b64(data)}`,created:Date.now()}]);
      let width=Math.min(240,Math.max(96,w)),height=h*width/w;if(height>240){width*=240/height;height=240;}
      const elements=convertToExcalidrawElements([{type:'image',fileId:id,status:'saved',x:280+120*api.getSceneElements().filter(e=>e.type==='image').length,y:440,width,height}]);
      api.updateScene({elements:[...api.getSceneElementsIncludingDeleted(),...elements],captureUpdate:CaptureUpdateAction.IMMEDIATELY});
    }
    status('Не сохранено');cancelReplay();
  }
  async function downloadFile(id){
    const f=await getFile(id,true),u=URL.createObjectURL(new Blob([f.data],{type:f.mimeType}));
    const a=document.createElement('a');a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
  socket.on('disconnect',()=>status('Нет связи — правки не подтверждены'));
  socket.on('connect_error',()=>status('Нет доступа или соединения'));
  async function loop(){
    let failed=false;try{
      if(!inflight&&(dirty.size||pendingAttachments.size)){
        const elements=[...dirty.values()],attachments=[...pendingAttachments],fileIds=refs(elements,attachments);
        for(const id of fileIds)if(!confirmed.has(id)){
          const f=uploads.get(id);if(!f)throw new Error('File data unavailable');
          const r=await request('file:put',f);if(!r.ok)throw new Error('Файл не удалось сохранить');
          if(r.file.id!==id||r.file.sha256!==await hash(f.data))throw new Error('File acknowledgement mismatch');
          confirmed.add(id);files.set(id,{...r.file,data:f.data});uploads.delete(id);
        }
        const iv=crypto.getRandomValues(new Uint8Array(12));
        const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key,new TextEncoder().encode(JSON.stringify({elements,attachments})));
        if(ciphertext.byteLength>262144)throw new Error('Scene frame exceeds limit');
        inflight={messageId:crypto.randomUUID(),iv,ciphertext:new Uint8Array(ciphertext),fileIds};
        for(const e of elements)if(signature(dirty.get(e.id)??{})===signature(e))dirty.delete(e.id);
        for(const id of attachments)pendingAttachments.delete(id);
      }
      if(inflight){const r=await request('submit',inflight);if(!r.ok)throw new Error(r.error);if(r.messageId!==inflight.messageId||!Number.isSafeInteger(r.seq)||r.seq<1)throw new Error('Invalid scene acknowledgement');inflight=undefined;}
      for(;;){
        const r=await request('replay',{after});if(!r.ok)throw new Error(r.error);
        for(const frame of [...(r.checkpoint?[r.checkpoint]:[]),...r.frames]){
          const isCheckpoint=frame.kind==='checkpoint';
          if(isCheckpoint ? !Number.isSafeInteger(frame.seq)||frame.seq<=after : frame.seq!==after+1)throw new Error('Non-contiguous replay');
          const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(frame.iv),...(isCheckpoint?{additionalData:checkpointAAD(frame.seq)}:{})},await key,bytes(frame.ciphertext));
          const remote=JSON.parse(new TextDecoder().decode(plain));
          if(!Array.isArray(remote.elements))throw new Error('Unsupported frame');
          const attachments=remote.attachments??[],fileIds=refs(remote.elements,attachments,isCheckpoint);
          if(isCheckpoint&&(remote.kind!=='checkpoint-v1'||remote.base!==frame.seq||new Set(remote.elements.map(e=>e.id)).size!==remote.elements.length))throw new Error('Invalid checkpoint');
          if(JSON.stringify(fileIds)!==JSON.stringify(ids(frame.fileIds??[])))throw new Error('File reference mismatch');
          for(const id of fileIds)await getFile(id);
          for(const id of new Set(remote.elements.filter(e=>e.type==='image'&&(isCheckpoint||!e.isDeleted)).map(e=>e.fileId))){
            const f=files.get(id);if(!f.mimeType.startsWith('image/'))throw new Error('Invalid image reference');
            if(!decodedImages.has(id)){
              const image=await createImageBitmap(new Blob([f.data],{type:f.mimeType}));
              const valid=image.width===f.width&&image.height===f.height;image.close();if(!valid)throw new Error('Image dimensions mismatch');
              decodedImages.add(id);
            }
            if(!api.getFiles()[id])api.addFiles([{id:f.id,mimeType:f.mimeType,dataURL:`data:${f.mimeType};base64,${b64(f.data)}`,created:new Date(f.createdAt).getTime()}]);
          }
          // Excalidraw may mutate its scene before delivering onChange. Capture
          // those local versions BEFORE remembering a reconciled replay, otherwise
          // the delayed callback would consider an unsent edit already seen.
          // This materialized state contains only ordered durable records, never
          // transient selections, edits or delayed editor callbacks. Keep tombstones.
          durableElements=reconcileElements(durableElements,structuredClone(remote.elements),{});
          for(const id of attachments)durableAttachments.add(id);
          const current=api.getSceneElementsIncludingDeleted();changed(current,api.getFiles());
          const merged=reconcileElements(current,remote.elements,api.getAppState());remember(merged);
          if(current.length!==merged.length||current.some((e,i)=>e.id!==merged[i].id||signature(e)!==signature(merged[i])))api.updateScene({elements:merged,captureUpdate:CaptureUpdateAction.NEVER});
          for(const id of attachments)attached.set(id,files.get(id));
          if(attachments.length)onAttachments([...attached.values()].map(({id,name,mimeType,size,sha256})=>({id,name,mimeType,size,sha256})));
          after=frame.seq;onApplied({seq:after,at:Date.now()});
        }if(!r.more)break;
      }
      // Publish the same durable projection on every quiescent replica. Native
      // editor index repairs must not turn into per-browser random logical edits.
      if(ready)changed(api.getSceneElementsIncludingDeleted(),api.getFiles());
      const editing=api.getAppState();
      if(!dirty.size&&!inflight&&!pendingAttachments.size&&!unsupported&&!editing.editingTextElement&&!editing.resizingElement&&!editing.newElement){
        const canonical=structuredClone(durableElements),current=api.getSceneElementsIncludingDeleted();
        if(sceneFingerprint(current)!==sceneFingerprint(canonical)){
          remember(canonical);api.updateScene({elements:canonical,captureUpdate:CaptureUpdateAction.NEVER});
        }
      }
      if(!ready){ready=true;onReady();}
      if(checkpointTask){
        if(!checkpointPayload&&!dirty.size&&!pendingAttachments.size&&!inflight&&!unsupported){
          if(!after){checkpointTask.reject(new Error('Доска пуста'));checkpointTask=undefined;}
          else{
            const base=after,elements=structuredClone(durableElements),attachments=[...durableAttachments],iv=crypto.getRandomValues(new Uint8Array(12));
            const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:checkpointAAD(base)},await key,new TextEncoder().encode(JSON.stringify({kind:'checkpoint-v1',base,elements,attachments})));
            if(ciphertext.byteLength>2097152){checkpointTask.reject(new Error('Контрольная точка больше 2 МиБ'));checkpointTask=undefined;}
            else checkpointPayload={base,messageId:crypto.randomUUID(),iv,ciphertext:new Uint8Array(ciphertext),fileIds:refs(elements,attachments,true)};
          }
        }
        if(checkpointPayload){
          const r=await request('checkpoint',checkpointPayload);if(!r.ok)throw new Error(r.error);
          if(r.accepted){
            if(r.base!==checkpointPayload.base||r.messageId!==checkpointPayload.messageId)throw new Error('Invalid checkpoint acknowledgement');
            checkpointTask.resolve(r.base);checkpointTask=undefined;
          }
          checkpointPayload=undefined; // stale base: catch up before generating a new checkpoint ID
        }
      }
      if(socket.connected&&!dirty.size&&!pendingAttachments.size&&!uploads.size&&!inflight&&!unsupported&&!checkpointTask)status('Сохранено');
    }catch(e){failed=true;status('Не сохранено: '+e.message);}
    finally{if(!stopped)setTimeout(loop,!failed&&(dirty.size||pendingAttachments.size||inflight||checkpointTask)?0:150);}
  }
  loop();return {changed,addFile,downloadFile,checkpoint(){
    if(terminal||role==='viewer')return Promise.reject(new Error('Доска доступна только для просмотра'));
    if(!ready)return Promise.reject(new Error('Доска ещё загружается'));
    if(!checkpointTask){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});checkpointTask={promise,resolve,reject};status('Создание контрольной точки');cancelReplay();}
    return checkpointTask.promise;
  },close(){stopped=true;checkpointTask?.reject(new Error('Доска закрыта'));socket.close();},get ready(){return ready;}};
}
