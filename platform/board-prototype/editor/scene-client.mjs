import { io } from 'socket.io-client';
const bytes=b=>Uint8Array.from(atob(b),x=>x.charCodeAt(0));
const b64=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
const signature=e=>`${e.version}:${e.versionNonce}:${e.isDeleted}`;
const ids=list=>{if(!Array.isArray(list)||list.length>64||list.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x)))throw new Error('Invalid file references');return [...new Set(list)].sort();};
const refs=(elements,attachments=[])=>ids([...new Set([...elements.filter(e=>e.type==='image'&&!e.isDeleted).map(e=>e.fileId),...attachments])]);
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export async function lessonPermit({apiBase,lessonId,accessToken,role}){
  if(!['teacher','student'].includes(role)||!/^[0-9a-f-]{36}$/i.test(lessonId))throw new Error('Invalid lesson');
  const u=new URL(apiBase);if(!['127.0.0.1','localhost'].includes(u.hostname))throw new Error('Isolated API required');
  const r=await fetch(`${u.origin}/api/v1/${role}/board-prototype/lessons/${lessonId}/permit`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store'});
  if(!r.ok)throw new Error('Lesson access denied');return r.json();
}
export function connectScene({url,permit,sceneKey,api,reconcileElements,CaptureUpdateAction,convertToExcalidrawElements,status,onReady=()=>{},onAttachments=()=>{}}){
  if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Isolated room required');
  const raw=bytes(sceneKey);if(raw.byteLength!==32)throw new Error('A valid scene key is required');
  const key=crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  const socket=io(url,{auth:{token:permit.token,workspace:permit.workspace,board:permit.board},transports:['websocket'],reconnection:true});
  let after=0,ready=false,stopped=false,unsupported=false,inflight,dirty=new Map(),seen=new Map(),rpc=Promise.resolve();
  const uploads=new Map(),confirmed=new Set(),files=new Map(),attached=new Map(),pendingAttachments=new Set(),newImages=new Set(),decodedImages=new Set();
  const request=(event,payload)=>{const result=rpc.catch(()=>{}).then(()=>socket.timeout(3000).emitWithAck(event,payload));rpc=result.catch(()=>{});return result;};
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
    if(!ready)return;unsupported=false;
    for(const e of elements){
      if(e.type==='image')newImages.delete(e.fileId);
      try{if(e.type==='image'&&!e.isDeleted)captureImage(e.fileId,binary[e.fileId]);}
      catch{unsupported=true;continue;}
      if(seen.get(e.id)!==signature(e)){dirty.set(e.id,structuredClone(e));seen.set(e.id,signature(e));}
    }
    const active=new Set(elements.filter(e=>e.type==='image'&&!e.isDeleted).map(e=>e.fileId));
    for(const id of uploads.keys())if(!newImages.has(id)&&!active.has(id)&&!pendingAttachments.has(id)&&!inflight?.fileIds.includes(id))uploads.delete(id);
    if(unsupported)status('Файл недоступен или не поддерживается — не сохранено');
    else if(dirty.size)status('Не сохранено');
  };
  async function getFile(id,fresh=false){
    if(!fresh&&files.has(id))return files.get(id);
    const r=await request('file:get',{id});if(!r.ok)throw new Error('File unavailable');
    const f=r.file,data=new Uint8Array(f.data);
    if(f.id!==id||data.length!==f.size||data.length>2*1024*1024||!['image/png','image/jpeg','application/pdf'].includes(f.mimeType)||await hash(data)!==f.sha256)throw new Error('Corrupt file');
    const file={...f,data};files.set(id,file);confirmed.add(id);return file;
  }
  async function addFile(file){
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
    status('Не сохранено');
  }
  async function downloadFile(id){
    const f=await getFile(id,true),u=URL.createObjectURL(new Blob([f.data],{type:f.mimeType}));
    const a=document.createElement('a');a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
  socket.on('disconnect',()=>status('Нет связи — правки не подтверждены'));
  socket.on('connect_error',()=>status('Нет доступа или соединения'));
  async function loop(){
    try{
      if(!socket.connected)return;
      if(!inflight&&(dirty.size||pendingAttachments.size)){
        const elements=[...dirty.values()],attachments=[...pendingAttachments],fileIds=refs(elements,attachments);
        for(const id of fileIds)if(!confirmed.has(id)){
          const f=uploads.get(id);if(!f)throw new Error('File data unavailable');
          const r=await request('file:put',f);if(!r.ok)throw new Error('Файл не удалось сохранить');
          if(r.file.sha256!==await hash(f.data))throw new Error('File acknowledgement mismatch');
          confirmed.add(id);files.set(id,{...r.file,data:f.data});uploads.delete(id);
        }
        const iv=crypto.getRandomValues(new Uint8Array(12));
        const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key,new TextEncoder().encode(JSON.stringify({elements,attachments})));
        if(ciphertext.byteLength>262144)throw new Error('Scene frame exceeds limit');
        inflight={messageId:crypto.randomUUID(),iv,ciphertext:new Uint8Array(ciphertext),fileIds};
        for(const e of elements)if(signature(dirty.get(e.id)??{})===signature(e))dirty.delete(e.id);
        for(const id of attachments)pendingAttachments.delete(id);
      }
      if(inflight){const r=await request('submit',inflight);if(!r.ok)throw new Error(r.error);inflight=undefined;}
      for(;;){
        const r=await request('replay',{after});if(!r.ok)throw new Error(r.error);
        for(const frame of r.frames){
          if(frame.seq!==after+1)throw new Error('Non-contiguous replay');
          const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(frame.iv)},await key,bytes(frame.ciphertext));
          const remote=JSON.parse(new TextDecoder().decode(plain));
          if(!Array.isArray(remote.elements))throw new Error('Unsupported frame');
          const attachments=remote.attachments??[],fileIds=refs(remote.elements,attachments);
          if(JSON.stringify(fileIds)!==JSON.stringify(ids(frame.fileIds??[])))throw new Error('File reference mismatch');
          for(const id of fileIds)await getFile(id);
          for(const id of new Set(remote.elements.filter(e=>e.type==='image'&&!e.isDeleted).map(e=>e.fileId))){
            const f=files.get(id);if(!f.mimeType.startsWith('image/'))throw new Error('Invalid image reference');
            if(!decodedImages.has(id)){
              const image=await createImageBitmap(new Blob([f.data],{type:f.mimeType}));
              const valid=image.width===f.width&&image.height===f.height;image.close();if(!valid)throw new Error('Image dimensions mismatch');
              decodedImages.add(id);
            }
            if(!api.getFiles()[id])api.addFiles([{id:f.id,mimeType:f.mimeType,dataURL:`data:${f.mimeType};base64,${b64(f.data)}`,created:new Date(f.createdAt).getTime()}]);
          }
          const merged=reconcileElements(api.getSceneElementsIncludingDeleted(),remote.elements,api.getAppState());remember(merged);
          const current=api.getSceneElementsIncludingDeleted();
          if(current.length!==merged.length||current.some((e,i)=>e.id!==merged[i].id||signature(e)!==signature(merged[i])))api.updateScene({elements:merged,captureUpdate:CaptureUpdateAction.NEVER});
          for(const id of attachments)attached.set(id,files.get(id));
          if(attachments.length)onAttachments([...attached.values()].map(({id,name,mimeType,size,sha256})=>({id,name,mimeType,size,sha256})));
          after=frame.seq;
        }if(!r.more)break;
      }
      if(!ready){ready=true;onReady();}
      if(!dirty.size&&!pendingAttachments.size&&!uploads.size&&!inflight&&!unsupported)status('Сохранено');
    }catch(e){status('Не сохранено: '+e.message);}
    finally{if(!stopped)setTimeout(loop,150);}
  }
  loop();return {changed,addFile,downloadFile,close(){stopped=true;socket.close();},get ready(){return ready;}};
}
