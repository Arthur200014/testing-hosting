// Firebase drawing I/O with page-configured namespace and payload codecs.
// The adapter never invents stroke fields: encode/decode default to identity.
export function createDrawingTransport({ transport, path = 'strokes', encodeStroke = value => value,
  encodePatch = value => value, decodeCollection = value => value || {}, mode = 'legacy', ...options }) {
  if (mode === 'live-v2') return createLiveInkStream({ transport, path: path === 'strokes' ? 'ink-v2' : path, ...options });
  if (mode !== 'legacy') throw new TypeError('Unknown drawing mode');
  const child = (id = '') => id ? `${path}/${id}` : path;
  return {
    subscribeSnapshot(callback, onError) { return transport.subscribe(path, callback, onError); },
    subscribe(callback, onError) {
      return transport.subscribe(path, snapshot => callback(decodeCollection(snapshot.val(), snapshot)), onError);
    },
    newKey() { return transport.newKey(path); },
    set(id, stroke) { return transport.set(child(id), encodeStroke(stroke)); },
    update(id, patch) { return transport.update(child(id), encodePatch(patch)); },
    remove(id) { return transport.remove(child(id)); },
    updateMany(patch) { return transport.update(path, encodePatch(patch)); },
    clear() { return transport.remove(path); }
  };
}

// Opt-in, isolated live ink protocol. Legacy codecs and paths are unchanged.
export function createLiveInkStream({transport, scope, path='ink-v2', storage, storageKey, onChange=()=>{}, onError=()=>{}, interval=32, maxPending=24, now=()=>Date.now(), schedule=(fn,ms)=>setTimeout(fn,ms), cancel=id=>clearTimeout(id)}={}) {
  if(!transport || !/^[A-Za-z0-9_-]+$/.test(scope||'')) throw new TypeError('Live ink requires a session-specific scope');
  if(path==='strokes'||path==='state/strokes') throw new TypeError('Live ink requires an isolated protocol path');
  const root=`${path}/${scope}`, records=new Map(), pending=new Map(), subscriptions=[];
  const copy=v=>JSON.parse(JSON.stringify(v));
  const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
  const pointsOf=v=>{const out=[]; for(let i=0;v&&Object.hasOwn(v,i)&&validPoint(v[i]);i++)out.push(v[i]);return out;};
  const report=e=>{try{onError(e);}catch{}};
  const emit=(r,local)=>{try{onChange(copy(r),{local});}catch(e){report(e);}};
  let disposed=false,timer=null;
  const persist=()=>{if(!storage||!storageKey)return;try{storage.setItem(storageKey,JSON.stringify({scope,records:[...pending.values()].map(e=>e.record)}));}catch(e){report(e);}};
  function accept(raw, local=false) {
    if(!raw||raw.scope!==scope||typeof raw.id!=='string'||!raw.id||typeof raw.surface!=='string'||!Number.isInteger(raw.rev)||raw.rev<1)return false;
    const old=records.get(raw.id);
    if(old?.deleted)return false;
    if(raw.deleted){const r={...raw,deleted:true,points:[]};records.set(r.id,r);if(!local&&pending.get(r.id)&&!pending.get(r.id).record.deleted){pending.delete(r.id);persist();}emit(r,local);return true;}
    const pts=pointsOf(raw.points);
    if(!pts.length||pts.length!==raw.count||old&&(old.rev>=raw.rev||old.points.length>pts.length||old.done&&!raw.done))return false;
    const r={...raw,points:pts};records.set(r.id,r);emit(r,local);return true;
  }
  function arm(delay=interval) {
    if(disposed||timer!==null)return;
    timer=schedule(()=>{timer=null;pumpAll();},Math.max(0,delay));
  }
  function pump(e,force=false) {
    if(disposed||pending.get(e.record.id)!==e||e.inflight>=maxPending||e.repair&&e.inflight||now()<e.retryAt)return;
    const r=e.record;
    if(!e.repair&&e.sentRev===r.rev)return;
    if(!force&&e.sentRev&&now()-e.lastSent<interval){arm(interval-(now()-e.lastSent));return;}
    const full=e.repair||!e.sentRev, patch={rev:r.rev};
    if(r.deleted){Object.assign(patch,{id:r.id,scope,surface:r.surface,deleted:true});}
    else{
      Object.assign(patch,{done:r.done,count:r.points.length});
      if(full)Object.assign(patch,{id:r.id,scope,surface:r.surface,author:r.author,color:r.color,width:r.width});
      for(let i=full?0:e.sentCount;i<r.points.length;i++)patch['points/'+i]=r.points[i].slice();
      e.sentCount=r.points.length;
    }
    e.sentRev=r.rev;e.lastSent=now();e.repair=false;e.inflight++;persist();
    let result;try{result=transport.update(`${root}/${r.id}`,patch);}catch(error){result=Promise.reject(error);}
    Promise.resolve(result).then(()=>{e.ackedRev=Math.max(e.ackedRev,r.rev);},error=>{e.repair=true;e.retryAt=now()+250;report(error);}).finally(()=>{
      e.inflight--;
      if(disposed||pending.get(r.id)!==e)return;
      if(!e.inflight&&!e.repair&&e.ackedRev>=e.record.rev){
        // Keep append cursor until pen-up, even when every packet is acknowledged quickly.
        if(e.record.done||e.record.deleted)pending.delete(r.id);
        persist();return;
      }
      if(e.repair){arm(Math.max(1,e.retryAt-now()));return;}
      if(e.sentRev!==e.record.rev) pump(e,e.record.done||e.record.deleted);
    });
  }
  function pumpAll(force=false){if(disposed)return;for(const e of pending.values()){pump(e,force);if(e.repair&&e.retryAt>now())arm(e.retryAt-now());}}
  function enqueue(record,force=false){
    if(disposed)return;
    const existing=pending.get(record.id);
    if(!accept(record,true))return;
    const e=existing||{record,sentRev:0,sentCount:0,ackedRev:0,inflight:0,lastSent:-Infinity,retryAt:0,repair:false};
    e.record=record;pending.set(record.id,e);
    if(force||!e.sentRev)pump(e,true);else arm(Math.max(0,interval-(now()-e.lastSent)));
    if(record.done||record.deleted)persist();
  }
  if(storage&&storageKey)try{
    const saved=JSON.parse(storage.getItem(storageKey)||'null');
    if(saved?.scope===scope)for(const r of saved.records||[]){if(accept(r,true))pending.set(r.id,{record:r,sentRev:0,sentCount:0,ackedRev:0,inflight:0,lastSent:-Infinity,retryAt:0,repair:true});}
  }catch(e){report(e);}
  const receive=snapshot=>{if(disposed)return;const r=snapshot.val();if(r?.id===snapshot.key)accept(r);};
  subscriptions.push(transport.subscribeChildAdded(root,receive,report),transport.subscribeChildChanged(root,receive,report),transport.subscribeChildRemoved(root,snapshot=>{if(disposed)return;const old=records.get(snapshot.key);if(old&&!old.deleted)accept({...old,rev:old.rev+1,deleted:true});},report));
  if(typeof transport.subscribeConnection==='function')subscriptions.push(transport.subscribeConnection(s=>{if(!disposed&&s.val()===true)pumpAll(true);}));
  pumpAll(true);
  return {
    startStroke(surface,{author,color='#963f4f',width=4}={},point){
      if(disposed||typeof surface!=='string'||!surface||typeof author!=='string'||!validPoint(point))throw new TypeError('Invalid stroke');
      const id=transport.newKey(root);
      enqueue({id,scope,surface,author,color:String(color),width:Math.max(1,Math.min(30,Number(width)||4)),points:[point.slice()],count:1,rev:1,done:false},true);return id;
    },
    append(id,points){const r=records.get(id);if(!r||r.deleted||r.done||!Array.isArray(points))return;const add=points.filter(validPoint).map(p=>p.slice());if(!add.length)return;const all=[...r.points,...add];enqueue({...r,points:all,count:all.length,rev:r.rev+1});},
    finish(id){const r=records.get(id);if(r&&!r.deleted&&!r.done)enqueue({...r,done:true,rev:r.rev+1},true);},
    erase(id){const r=records.get(id);if(r&&!r.deleted)enqueue({id,scope,surface:r.surface,rev:r.rev+1,deleted:true},true);},
    getRecords(surface){return [...records.values()].filter(r=>!r.deleted&&(surface===undefined||r.surface===surface)).map(copy);},
    flush(){persist();pumpAll(true);},
    dispose(){if(disposed)return;persist();disposed=true;if(timer!==null)cancel(timer);for(const un of subscriptions)un?.();}
  };
}

export function createInkPlayback({minMs=32,maxMs=140}={}) {
  const tracks=new Map();
  function position(t,at){return t.from+(t.to-t.from)*Math.max(0,Math.min(1,(at-t.start)/t.duration));}
  return {
    push(record,at,{local=false,history=false}={}){
      const id=record.id;if(record.deleted||local||history){tracks.delete(id);return;}
      const pts=record.points||[], old=tracks.get(id);
      if(!pts.length||!old&&record.done)return;
      const from=old?position(old,at):0,to=pts.length-1;
      const elapsed=old?at-old.arrival:48, period=old&&elapsed>8&&elapsed<450?.55*old.period+.45*elapsed:old?.period||48;
      tracks.set(id,{points:pts,from:Math.min(from,to),to,start:at,arrival:at,period,duration:Math.max(minMs,Math.min(maxMs,period*1.12)),done:record.done});
    },
    sample(record,at){
      const t=tracks.get(record.id);if(!t)return record.points||[];
      const pos=position(t,at),i=Math.floor(pos),f=pos-i,pts=t.points.slice(0,i+1);
      if(f>0&&t.points[i+1]){const a=t.points[i],b=t.points[i+1];pts.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);}
      if(pos>=t.to&&t.done)tracks.delete(record.id);
      return pts;
    },
    isAnimating(at){return [...tracks.values()].some(t=>position(t,at)<t.to);},
    clear(){tracks.clear();}
  };
}

export function smoothInkPath(points) {
  if(!points?.length)return '';
  const xy=p=>`${p[0]} ${p[1]}`;
  let d=`M${xy(points[0])}`;
  if(points.length===1)return d+' l0.01 0.01';
  for(let i=1;i<points.length-1;i++){const a=points[i],b=points[i+1];d+=` Q${xy(a)} ${(a[0]+b[0])/2} ${(a[1]+b[1])/2}`;}
  return d+` L${xy(points[points.length-1])}`;
}
