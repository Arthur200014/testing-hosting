// Firebase drawing I/O with page-configured namespace and payload codecs.
// The adapter never invents stroke fields: encode/decode default to identity.
export function createDrawingTransport({ transport, path = 'strokes', encodeStroke = value => value,
  encodePatch = value => value, decodeCollection = value => value || {}, mode = 'legacy', ...options }) {
  if (mode === 'solo') return createLocalInkStream(options);
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
      if(full)Object.assign(patch,{id:r.id,scope,surface:r.surface,author:r.author,color:r.color,width:r.width,at:r.at??0});
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
      enqueue({id,scope,surface,author,color:String(color),width:Math.max(1,Math.min(30,Number(width)||4)),points:[point.slice()],count:1,rev:1,done:false,at:now()},true);return id;
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
    isAnimating(at,id){if(id!==undefined){const t=tracks.get(id);return !!t&&position(t,at)<t.to;}return [...tracks.values()].some(t=>position(t,at)<t.to);},
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


// Reusable SVG rendering and pointer handling for the opt-in live stream.
export function createSvgInkLayer({svg,surface=null,clock=()=>performance.now(),requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id)}={}) {
  if(!svg)throw new TypeError('SVG required');
  const records=new Map(),nodes=new Map(),playback=createInkPlayback(),animated=new Set();
  let current=surface,frame=null,disposed=false;
  svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');
  function remove(id){nodes.get(id)?.remove();nodes.delete(id);}
  function draw(r,at){
    if(r.deleted||r.surface!==current){remove(r.id);return;}
    const points=playback.sample(r,at);if(!points.length)return;
    let node=nodes.get(r.id);
    if(!node){node=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','path');node.setAttribute('data-ink-id',r.id);node.setAttribute('fill','none');node.setAttribute('stroke-linecap','round');node.setAttribute('stroke-linejoin','round');node.setAttribute('vector-effect','non-scaling-stroke');nodes.set(r.id,node);svg.append(node);}
    const path=smoothInkPath(points);
    if(node.getAttribute('d')!==path)node.setAttribute('d',path);
    node.setAttribute('stroke',/^#[0-9a-f]{6}$/i.test(r.color||'')?r.color:'#963f4f');node.setAttribute('stroke-width',String(Math.max(1,Math.min(30,Number(r.width)||4))));
  }
  function tick(at){frame=null;if(disposed)return;for(const id of [...animated]){const r=records.get(id);if(r&&r.surface===current&&!r.deleted)draw(r,at);if(!playback.isAnimating(at,id))animated.delete(id);}if(animated.size)frame=requestFrame(tick);}
  function reset(){if(frame!==null)cancelFrame(frame);frame=null;playback.clear();animated.clear();for(const id of [...nodes.keys()])remove(id);}
  return {
    apply(r,{local=false,history=false}={}){
      if(disposed||!r?.id)return;
      const old=records.get(r.id);
      if(old?.deleted||old&&!r.deleted&&old.rev>=r.rev)return;
      records.set(r.id,r);
      if(r.surface!==current)return;
      const at=clock();
      playback.push(r,at,{local,history});
      draw(r,at);if(playback.isAnimating(at,r.id))animated.add(r.id);else animated.delete(r.id);if(frame===null&&animated.size)frame=requestFrame(tick);
    },
    setSurface(next){if(next===current||disposed)return;reset();current=next;for(const r of records.values())if(r.surface===current&&!r.deleted)draw(r,clock());},
    clear(){reset();records.clear();},
    dispose(){if(disposed)return;disposed=true;reset();records.clear();}
  };
}

export function createInkPointerController({svg,stream,getSurface,getAuthor,canDraw=()=>true,canErase=()=>true,keyboardTarget=svg?.ownerDocument,initialTool='cursor',color='#963f4f',width=4}={}) {
  if(!svg||!stream||typeof getSurface!=='function'||typeof getAuthor!=='function')throw new TypeError('Ink pointer controller needs SVG, stream, surface, author');
  let tool=initialTool,active=null,erasing=null,disposed=false;
  const valid=()=>!disposed&&canDraw()&&!!getAuthor()&&!!getSurface();
  const pixel=(p,r)=>[p[0]*r.width/1000,p[1]*r.height/1000];
  function point(e,r){return [Math.max(0,Math.min(1000,(e.clientX-r.left)/Math.max(1,r.width)*1000)),Math.max(0,Math.min(1000,(e.clientY-r.top)/Math.max(1,r.height)*1000))].map(x=>Math.round(x*10)/10);}
  function distance(a,b,r){const p=pixel(a,r),q=pixel(b,r);return Math.hypot(p[0]-q[0],p[1]-q[1]);}
  function segmentDistance(p,a,b,r){
    const q=pixel(p,r),u=pixel(a,r),v=pixel(b,r),dx=v[0]-u[0],dy=v[1]-u[1];
    const t=Math.max(0,Math.min(1,((q[0]-u[0])*dx+(q[1]-u[1])*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(q[0]-u[0]-t*dx,q[1]-u[1]-t*dy);
  }
  function erase(e){
    const r=erasing.rect,p=point(e,r),from=erasing.last||p;erasing.last=p;
    const count=Math.max(1,Math.ceil(distance(p,from,r)/6));
    for(const stroke of stream.getRecords(erasing.surface)){
      if(!canErase(stroke))continue;
      const pts=stroke.points,tolerance=Math.max(10,Number(stroke.width)||4);let hit=false;
      for(let i=0;i<=count&&!hit;i++){
        const q=[from[0]+(p[0]-from[0])*i/count,from[1]+(p[1]-from[1])*i/count];
        for(let j=0;j<pts.length&&!hit;j++)hit=segmentDistance(q,pts[j],pts[j+1]||pts[j],r)<=tolerance;
      }
      if(hit)stream.erase(stroke.id);
    }
  }
  function collect(e){
    if(!active)return;
    const samples=e.getCoalescedEvents?.()||[],add=[];
    for(const sample of [...samples,e]){const p=point(sample,active.rect);if(distance(p,active.last,active.rect)>=.65){add.push(p);active.last=p;}}
    if(add.length)stream.append(active.id,add);
  }
  function end(){
    const current=active,eraseSession=erasing;active=null;erasing=null;
    if(current)stream.finish(current.id);
    const pointerId=current?.pointerId??eraseSession?.pointerId;
    if(pointerId!==undefined&&svg.hasPointerCapture?.(pointerId))try{svg.releasePointerCapture(pointerId);}catch{}
    stream.flush();
  }
  function down(e){
    if(!valid()||tool==='cursor'||active||erasing||e.button!==0)return;
    e.preventDefault();const rect=svg.getBoundingClientRect(),surface=getSurface();if(!rect.width||!rect.height)return;
    if(tool==='eraser'){erasing={pointerId:e.pointerId,rect,surface,last:null};erase(e);}
    else{const p=point(e,rect),id=stream.startStroke(surface,{author:getAuthor(),color,width},p);active={id,pointerId:e.pointerId,rect,surface,last:p};}
    try{svg.setPointerCapture(e.pointerId);}catch{}
  }
  function move(e){
    if(erasing?.pointerId===e.pointerId){if(erasing.surface!==getSurface()||!valid()){end();return;}e.preventDefault();erase(e);}
    else if(active?.pointerId===e.pointerId){if(active.surface!==getSurface()||!valid()){end();return;}e.preventDefault();collect(e);}
  }
  function up(e){if(active?.pointerId!==e.pointerId&&erasing?.pointerId!==e.pointerId)return;if(active&&e.type==='pointerup'&&active.surface===getSurface())collect(e);end();}
  function mode(){svg.style.pointerEvents=tool==='cursor'?'none':'auto';svg.style.touchAction=tool==='cursor'?'auto':'none';svg.style.cursor=tool==='eraser'?'cell':tool==='pen'?'crosshair':'default';}
  function undo(){
    if(!valid())return false;
    end();const mine=stream.getRecords(getSurface()).filter(r=>r.author===getAuthor()&&canErase(r));
    if(!mine.length)return false;
    mine.sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0)||a.id.localeCompare(b.id));stream.erase(mine.at(-1).id);return true;
  }
  function key(e){
    if(!(e.ctrlKey||e.metaKey)||e.shiftKey||e.altKey||e.key?.toLowerCase()!=='z'||e.repeat)return;
    const target=e.target;if(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable=true]'))return;
    if(undo())e.preventDefault();
  }
  const handlers={pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,lostpointercapture:up};
  for(const [type,handler] of Object.entries(handlers))svg.addEventListener(type,handler);
  keyboardTarget?.addEventListener('keydown',key);mode();
  return {
    setTool(next){if(!['cursor','pen','eraser'].includes(next))throw new TypeError('Unknown drawing tool');end();tool=next;mode();},
    setColor(next){color=next;},setWidth(next){width=Math.max(1,Math.min(30,Number(next)||4));},
    flush:end,undo,
    dispose(){if(disposed)return;end();disposed=true;for(const [type,handler] of Object.entries(handlers))svg.removeEventListener(type,handler);keyboardTarget?.removeEventListener('keydown',key);svg.style.pointerEvents='none';}
  };
}


// Offline mode uses the same board/controller contract, without Firebase.
export function createLocalInkStream({scope,storage,storageKey,onChange=()=>{},onError=()=>{},now=()=>Date.now(),newId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}) {
  if(typeof scope!=='string'||!scope)throw new TypeError('Local ink requires an app-specific scope');
  const records=new Map(),copy=v=>JSON.parse(JSON.stringify(v)),valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
  let disposed=false,timer=null;
  const report=e=>{try{onError(e);}catch{}};
  const emit=(r,history=false)=>{try{onChange(copy(r),{local:true,history});}catch(e){report(e);}};
  function persist(){
    if(timer!==null){cancel(timer);timer=null;}
    if(!storage||!storageKey)return;
    try{storage.setItem(storageKey,JSON.stringify({scope,records:[...records.values()]}));}catch(e){report(e);}
  }
  function defer(){if(timer===null)timer=schedule(()=>{timer=null;persist();},150);}
  if(storage&&storageKey)try{
    const saved=JSON.parse(storage.getItem(storageKey)||'null');
    if(saved?.scope===scope)for(const r of saved.records||[]){
      if(r?.scope!==scope||typeof r.id!=='string'||typeof r.surface!=='string'||!Array.isArray(r.points)||!r.points.length||!r.points.every(valid)||r.deleted)continue;
      const recovered={...r,done:true};records.set(r.id,recovered);emit(recovered,true);
    }
  }catch(e){report(e);}
  return {
    startStroke(surface,{author,color='#963f4f',width=4}={},point){
      if(disposed||typeof surface!=='string'||!surface||typeof author!=='string'||!valid(point))throw new TypeError('Invalid local stroke');
      const id=newId();if(records.has(id))throw Error('Duplicate stroke id');
      const r={id,scope,surface,author,color,width:Math.max(1,Math.min(30,Number(width)||4)),at:now(),points:[point.slice()],count:1,rev:1,done:false};records.set(id,r);emit(r);defer();return id;
    },
    append(id,points){
      if(disposed)return;
      const r=records.get(id);if(!r||r.done||!Array.isArray(points))return;
      const add=points.filter(valid).map(p=>p.slice());if(!add.length)return;
      r.points.push(...add);r.count=r.points.length;r.rev++;emit(r);defer();
    },
    finish(id){if(disposed)return;const r=records.get(id);if(r&&!r.done){r.done=true;r.rev++;emit(r);persist();}},
    erase(id){if(disposed)return;const r=records.get(id);if(r){records.delete(id);emit({...r,rev:r.rev+1,deleted:true,points:[]});persist();}},
    getRecords(surface){return [...records.values()].filter(r=>surface===undefined||r.surface===surface).map(copy);},
    flush(){if(!disposed)persist();},
    dispose(){if(disposed)return;persist();disposed=true;}
  };
}
