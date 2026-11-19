import { defineConfig } from 'vite';
import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const replacement = resolve('node_modules/@fontsource/arimo/files/arimo-latin-400-normal.woff2');
export default defineConfig({root:'editor',base:'./',server:{host:'127.0.0.1',fs:{allow:[process.cwd(),resolve('../lesson-board-ui.mjs')]}},
  plugins:[{name:'reviewed-local-font-assets',enforce:'pre',
    resolveId(source){
      // Replace only the legacy export fallback. Preserve the replacement font bytes/name metadata.
      if (/LiberationSans-Regular\.woff2(?:\?url)?$/.test(source)) return replacement;
    },
    async buildStart(){
      const target='editor/public/excalidraw-assets/fonts';
      await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
      await cp('node_modules/@excalidraw/excalidraw/dist/prod/fonts',target,{recursive:true});
      await copyFile(replacement,target+'/Liberation/LiberationSans-Regular.woff2');
      await copyFile('THIRD_PARTY_NOTICES.txt','editor/public/THIRD_PARTY_NOTICES.txt');
      await copyFile('FONT_NOTICES.txt','editor/public/FONT_NOTICES.txt');
    }
  }]});
