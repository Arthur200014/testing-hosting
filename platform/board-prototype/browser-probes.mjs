// Shared real-editor probe. No substitute scene model or network fixtures.
export async function editorSnapshot(){
    const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
    const a=window.__BOARD_EDITOR,e=a.getSceneElementsIncludingDeleted(),f=a.getFiles(),out=[];
    for(const id of [...new Set(e.filter(x=>x.type==='image').map(x=>x.fileId))].sort()){
      if(!f[id])return {status:'missing image',hash:null};
      const raw=Uint8Array.from(atob(f[id].dataURL.split(',')[1]),x=>x.charCodeAt(0));
      out.push({id,mimeType:f[id].mimeType,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('')});
    }
    const data=JSON.stringify({order:e.map(x=>x.id),elements:e.map(stable),files:out,attachments:[...document.querySelectorAll('[data-testid=board-download]')].map(x=>x.textContent).sort()});
    return {status:document.querySelector('#status')?.textContent,active:e.filter(x=>!x.isDeleted).length,deleted:e.filter(x=>x.isDeleted).length,images:out.length,
      hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data))),x=>x.toString(16).padStart(2,'0')).join('')};
  }
