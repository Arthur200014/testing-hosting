import {generateNKeysBetween} from 'fractional-indexing';
const compare=(a,b)=>a===b?0:a<b?-1:1;
// Excalidraw 0.18.1 conflict rules, without its random version/nonce/time
// mutations when repairing colliding fractional indices. Remote replay is ordered.
export function reconcileScene(local,remote,state={}){
  const map=new Map(local.map(e=>[e.id,e]));
  for(const incoming of remote){
    const old=map.get(incoming.id);
    const editing=old&&[state.editingTextElement?.id,state.resizingElement?.id,state.newElement?.id].includes(old.id);
    if(!old||!editing&&(old.version<incoming.version||old.version===incoming.version&&old.versionNonce>=incoming.versionNonce))map.set(incoming.id,incoming);
  }
  const elements=[...map.values()].map(e=>structuredClone(e));
  elements.sort((a,b)=>compare(a.index??'\uffff',b.index??'\uffff')||compare(a.id,b.id));
  for(let i=0;i<elements.length;){
    if(!elements[i].index){
      const keys=generateNKeysBetween(elements[i-1]?.index??null,null,elements.length-i);
      for(let j=i;j<elements.length;j++)elements[j].index=keys[j-i];break;
    }
    let end=i+1;while(end<elements.length&&elements[end].index===elements[i].index)end++;
    if(end>i+1){
      const keys=generateNKeysBetween(elements[i].index,elements[end]?.index??null,end-i-1);
      for(let j=i+1;j<end;j++)elements[j].index=keys[j-i-1];
    }
    i=end;
  }
  return elements;
}
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
export const sceneFingerprint=elements=>JSON.stringify(stable(elements));
