import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
export const MAX_FILE_BYTES=2*1024*1024, MAX_ROOM_FILE_BYTES=16*1024*1024, MAX_ROOM_PIXELS=16*1024*1024;
export const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
export function references(ids){
  if(ids===undefined)return [];
  if(!Array.isArray(ids)||ids.length>64||ids.some(x=>!validId(x)))throw new Error('Invalid file references');
  return [...new Set(ids)].sort();
}
export function crc32(buf){let c=0xffffffff;for(const v of buf){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function dimensions(w,h){if(!w||!h||w>2048||h>2048||w*h>4*1024*1024)throw new Error('Image dimensions exceed limit');return{width:w,height:h,pixels:w*h};}
function png(data){
  if(data.length<57||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG');
  let offset=8,meta,ended=false,palette=false;const chunks=[];
  while(offset<data.length){
    if(offset+12>data.length)throw new Error('Truncated PNG');
    const n=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8),end=offset+12+n;
    if(end>data.length||crc32(data.subarray(offset+4,offset+8+n))!==data.readUInt32BE(offset+8+n))throw new Error('Corrupt PNG chunk');
    const body=data.subarray(offset+8,offset+8+n);
    if(offset===8&&type!=='IHDR')throw new Error('PNG header missing');
    if(type==='IHDR'){
      if(meta||n!==13||body[8]!==8||![0,2,3,4,6].includes(body[9])||body[10]||body[11]||body[12])throw new Error('Unsupported PNG encoding');
      meta={...dimensions(body.readUInt32BE(0),body.readUInt32BE(4)),channels:({0:1,2:3,3:1,4:2,6:4})[body[9]],indexed:body[9]===3};
    }else if(type==='IDAT')chunks.push(body);
    else if(type==='PLTE'){if(!n||n>768||n%3)throw new Error('Invalid PNG palette');palette=true;}
    else if(type==='IEND'){if(n||end!==data.length)throw new Error('Invalid PNG end');ended=true;}
    else if(type[0]===type[0].toUpperCase())throw new Error('Unsupported critical PNG chunk');
    offset=end;
  }
  if(!meta||!ended||!chunks.length||(meta.indexed&&!palette))throw new Error('Incomplete PNG');
  const stride=meta.width*meta.channels+1,expected=stride*meta.height;
  const raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:expected});
  if(raw.length!==expected)throw new Error('Invalid PNG pixel data');
  for(let y=0;y<meta.height;y++)if(raw[y*stride]>4)throw new Error('Invalid PNG filter');
  return {width:meta.width,height:meta.height,pixels:meta.pixels};
}
function jpeg(data){
  if(data.length<12||data.readUInt16BE(0)!==0xffd8||data.readUInt16BE(data.length-2)!==0xffd9)throw new Error('Invalid JPEG');
  let p=2,meta;
  while(p<data.length-2){
    if(data[p++]!==255)throw new Error('Invalid JPEG marker');while(data[p]===255)p++;
    const marker=data[p++];if(marker===0xda){if(!meta)throw new Error('JPEG dimensions missing');return meta;}
    if(p+2>data.length)throw new Error('Truncated JPEG');const n=data.readUInt16BE(p);
    if(n<2||p+n>data.length)throw new Error('Invalid JPEG segment');
    if([0xc0,0xc1,0xc2].includes(marker)){if(n<8||data[p+2]!==8)throw new Error('Unsupported JPEG');meta=dimensions(data.readUInt16BE(p+5),data.readUInt16BE(p+3));}
    p+=n;
  }throw new Error('Incomplete JPEG');
}
export function validateFile({id,name,mimeType,data}){
  if(!validId(id)||typeof name!=='string'||!name.trim()||name.length>128||/[\x00-\x1f\x7f/\\]/.test(name)
    ||!Buffer.isBuffer(data)||!data.length||data.length>MAX_FILE_BYTES)throw new Error('Invalid file');
  let meta;
  if(mimeType==='image/png')meta=png(data);
  else if(mimeType==='image/jpeg')meta=jpeg(data);
  else if(mimeType==='application/pdf'&&data.subarray(0,5).toString()==='%PDF-'&&data.subarray(-1024).toString('latin1').trimEnd().endsWith('%%EOF'))meta={width:0,height:0,pixels:0};
  else throw new Error('Unsupported or mismatched file type');
  return {id,name:name.trim(),mimeType,data:Buffer.from(data),size:data.length,sha256:createHash('sha256').update(data).digest('hex'),...meta};
}
