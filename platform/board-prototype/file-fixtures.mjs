import { deflateSync } from 'node:zlib';
import { crc32 } from './files.mjs';
const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,crc]);};
const h=Buffer.alloc(13);h.writeUInt32BE(2,0);h.writeUInt32BE(2,4);h[8]=8;h[9]=6;
export const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255,0,255,0,255,0,0,0,255,255,255,255,255,255]))),chunk('IEND',Buffer.alloc(0))]);
const parts=['%PDF-1.4\n'];const offsets=[0];
for(const [i,text] of ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>'].entries()){offsets.push(Buffer.byteLength(parts.join('')));parts.push(`${i+1} 0 obj\n${text}\nendobj\n`);}
const xref=Buffer.byteLength(parts.join(''));parts.push('xref\n0 4\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Root 1 0 R /Size 4 >>\nstartxref\n${xref}\n%%EOF\n`);
export const pdf=Buffer.from(parts.join(''));
export function solidPng(width,height){
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const stride=width*4+1,raw=Buffer.alloc(stride*height,255);for(let y=0;y<height;y++)raw[y*stride]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
