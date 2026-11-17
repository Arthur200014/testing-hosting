import { defineConfig } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
// Copy only pinned package assets, never download fonts at browser runtime.
export default defineConfig({root:'editor',server:{host:'127.0.0.1',fs:{allow:[process.cwd()]}},
  plugins:[{name:'local-excalidraw-assets',async buildStart(){
    await mkdir('editor/public/excalidraw-assets',{recursive:true});
    await cp('node_modules/@excalidraw/excalidraw/dist/prod/fonts','editor/public/excalidraw-assets/fonts',{recursive:true});
  }}]});
