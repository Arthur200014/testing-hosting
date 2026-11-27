// Shared PDF assembly/capture. Pages supply a snapshot adapter; this code never navigates a live room.
export function buildJpegPdf(images) {
  if(!Array.isArray(images)||!images.length)throw new TypeError('PDF needs at least one page');
  const enc=new TextEncoder(),parts=[],offsets=[0];let pos=0;
  const add=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);pos+=b.length;};
  const obj=(id,body)=>{offsets[id]=pos;add(`${id} 0 obj\n`);add(body);add('\nendobj\n');};
  add('%PDF-1.4\n');add(new Uint8Array([37,226,227,207,211,10]));
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+3*i} 0 R`).join(' ')}] >>`);
  images.forEach((im,i)=>{
    if(!Number.isInteger(im.w)||!Number.isInteger(im.h)||im.w<1||im.h<1||!(im.bytes instanceof Uint8Array)||im.bytes[0]!==255||im.bytes[1]!==216)throw new TypeError('Invalid JPEG page');
    const page=3+3*i,image=page+1,content=page+2;
    const w=Number(im.pageWidth??960),h=w*im.h/im.w;
    if(!Number.isFinite(w)||w<=0||!Number.isFinite(h)||h<=0)throw new TypeError('Invalid page size');
    obj(page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    offsets[image]=pos;add(`${image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);add(im.bytes);add('\nendstream\nendobj\n');
    const stream=`q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(content,`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream`);
  });
  const xref=pos;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(let i=1;i<offsets.length;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts,{type:'application/pdf'});
}

export async function captureWorksheetJpeg({node,width,height,css='',scale=2,background='#fff',quality=.94}={}) {
  if(!node||!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||!Number.isFinite(scale)||scale<=0||width*height*scale*scale>32000000)throw new TypeError('Invalid capture size');
  const root=document.createElement('div');root.setAttribute('xmlns','http://www.w3.org/1999/xhtml');root.className='capture';root.style.cssText=`position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${background};`;
  const style=document.createElement('style');style.textContent=css;const clone=node.cloneNode(true);root.append(style,clone);
  const markup=new XMLSerializer().serializeToString(root),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="${width}" height="${height}">${markup}</foreignObject></svg>`;
  const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();
  const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  ctx.scale(canvas.width/width,canvas.height/height);ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('JPEG capture failed')),'image/jpeg',quality));
  const result={bytes:new Uint8Array(await blob.arrayBuffer()),w:canvas.width,h:canvas.height};canvas.width=canvas.height=0;return result;
}

export function createWorksheetPdfExporter({getRole=()=>null,getPages,capture,onProgress=()=>{},buildPdf=buildJpegPdf}={}) {
  if(typeof getPages!=='function'||typeof capture!=='function')throw new TypeError('PDF needs page and capture adapters');
  let busy=false;
  return {
    get busy(){return busy;},
    async export(mode='notes'){
      if(mode!=='notes'&&mode!=='all')throw new TypeError('Unknown PDF mode');
      if(mode==='all'&&getRole()!=='teacher')throw Error('Teacher required');
      if(busy)throw Error('PDF export already running');
      busy=true;
      try{
        // getPages must snapshot page IDs/content and authoritative ink, not change live navigation.
        const pages=await getPages(mode);
        const selected=mode==='notes'?pages.filter(p=>p.hasInk===true):pages;
        if(!selected.length)return null;
        const images=[];
        for(let i=0;i<selected.length;i++){
          if(mode==='all'&&getRole()!=='teacher')throw Error('Teacher required');
          images.push(await capture(selected[i],{mode,includeInk:mode==='notes'}));
          onProgress(i+1,selected.length);
        }
        return await buildPdf(images);
      }finally{busy=false;}
    }
  };
}
