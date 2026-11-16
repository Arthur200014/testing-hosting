export const MAX_FILE_BYTES=5*1024*1024;
export const newFileUploadState=()=>({file:null,title:'',requestId:null,busy:false,error:''});
export const fileSize=bytes=>bytes>=1024*1024?(bytes/1024/1024).toFixed(1)+' МБ':Math.ceil(bytes/1024)+' КБ';
export function materialAction(item,safe) {
  if(item.fileId) return `<button type="button" class="secondary small-button" data-file-download="${safe(item.fileId)}" data-file-name="${safe(item.fileName || 'файл')}">Скачать файл</button>`;
  try { const u=new URL(item.url);if(!['http:','https:'].includes(u.protocol)) return ''; }
  catch { return ''; }
  return `<a class="link" href="${safe(item.url)}" target="_blank" rel="noopener noreferrer">Открыть</a>`;
}
export function renderFileUpload(state,safe) {
  return `<details class="card stack" data-file-upload-panel ${state.file || state.error || state.busy?'open':''}><summary>Загрузить файл</summary><form id="fileUploadForm" class="stack" style="margin-top:16px">
    <p class="muted small">PDF, PNG, JPEG или TXT (UTF-8). До 5 МБ на файл, до 100 МБ файлов в пространстве.</p>
    <label>Файл<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.txt" ${state.busy?'disabled':''}></label>
    ${state.file?`<p data-selected-upload>${safe(state.file.name)} · ${safe(fileSize(state.file.size))}</p>`:''}
    <label>Название<input name="title" maxlength="250" required value="${safe(state.title)}" ${state.busy?'disabled':''}></label>
    ${state.error?`<p role="alert">${safe(state.error)}</p>`:''}
    <div class="row"><button type="submit" class="primary" ${state.busy || !state.file?'disabled':''}>${state.busy?'Загружаем…':'Загрузить в библиотеку'}</button><button type="button" class="secondary" data-file-upload-cancel ${state.busy?'disabled':''}>Отмена</button></div>
    <p class="muted small">После загрузки прикрепите файл к классу, теме или занятию. Доступ ученика появится после привязки.</p>
  </form></details>`;
}
async function check(response) {
  if(response.ok) return response;
  const data=await response.json().catch(()=>null);
  throw new Error(response.status===401?'Войдите заново.':response.status===404?'Файл недоступен.':response.status===429?'Повторите загрузку через несколько секунд.':data?.title || 'Не удалось выполнить операцию с файлом.');
}
export async function uploadProtectedFile(api,token,state,request=fetch) {
  if(!state.file || !state.file.size || state.file.size>MAX_FILE_BYTES) throw new Error('Выберите непустой файл размером до 5 МБ.');
  state.requestId ||= crypto.randomUUID();
  const url=api+'/api/v1/teacher/files/'+encodeURIComponent(state.requestId)+'?'+new URLSearchParams({fileName:state.file.name,title:state.title});
  const response=await check(await request(url,{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream'},body:state.file}));
  return response.json();
}
export async function fetchProtectedFile(api,token,id,student=false,request=fetch) {
  const path=student?'files/':'teacher/files/';
  const response=await check(await request(api+'/api/v1/'+path+encodeURIComponent(id)+'/content',{cache:'no-store',headers:{Authorization:'Bearer '+token}}));
  return response.blob();
}
export async function saveProtectedFile(api,token,id,name,student=false) {
  const blob=await fetchProtectedFile(api,token,id,student);
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name || 'файл';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
