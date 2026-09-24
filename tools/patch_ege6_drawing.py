from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def func_start(text, name):
    a = text.find(f"async function {name}(")
    b = text.find(f"function {name}(")
    if a >= 0 and (b < 0 or a <= b):
        return a
    return b

def func_end(text, start):
    brace = text.find("{", start)
    if brace < 0:
        raise RuntimeError("no opening brace")
    depth = 0
    quote = ""
    esc = False
    i = brace
    while i < len(text):
        ch = text[i]
        if quote:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == quote:
                quote = ""
            i += 1
            continue
        if ch in ("'", '"', "`"):
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise RuntimeError("unclosed function")

def replace_function(text, name, new_code):
    start = func_start(text, name)
    if start < 0:
        raise RuntimeError(f"missing function {name}")
    end = func_end(text, start)
    return text[:start] + new_code + text[end:]

def insert_before(text, needle, block):
    i = text.find(needle)
    if i < 0:
        raise RuntimeError(f"missing insertion point: {needle}")
    return text[:i] + block + text[i:]

COMMON_HELPER = r"""
const SHARED_INK_ANCHOR_ID='content-v2';
function sharedInkAnchor(){const list=[...document.querySelectorAll('main.app')];return list.find(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>40&&r.height>40})||list[0]||document.body}
function sharedInkMetrics(){const el=sharedInkAnchor(),r=el.getBoundingClientRect();return{left:r.left+window.scrollX,top:r.top+window.scrollY,width:Math.max(1,r.width||el.clientWidth||innerWidth),height:Math.max(1,el.scrollHeight||r.height||innerHeight)}}
function sharedInkEventPoint(e){const m=sharedInkMetrics(),px=e.clientX+window.scrollX,py=e.clientY+window.scrollY;return[Math.max(0,Math.min(1,(px-m.left)/m.width)),Math.max(0,Math.min(1,(py-m.top)/m.height))]}
function sharedInkPagePoint(p){const m=sharedInkMetrics();return[m.left+Number(p?.[0]||0)*m.width,m.top+Number(p?.[1]||0)*m.height]}
function sharedInkDistancePx(a,b){const m=sharedInkMetrics();return Math.hypot((Number(a?.[0]||0)-Number(b?.[0]||0))*m.width,(Number(a?.[1]||0)-Number(b?.[1]||0))*m.height)}
function sharedInkStrokePagePoints(st,w,h){if(st?.anchorId===SHARED_INK_ANCHOR_ID)return(st.points||[]).map(sharedInkPagePoint);return(st?.points||[]).map(p=>[Number(p?.[0]||0)*w,Number(p?.[1]||0)*h])}
function sharedInkPointSegDist(p,a,b){const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1],c1=vx*wx+vy*wy;if(c1<=0)return Math.hypot(p[0]-a[0],p[1]-a[1]);const c2=vx*vx+vy*vy;if(c2<=c1)return Math.hypot(p[0]-b[0],p[1]-b[1]);const t=c1/c2,x=a[0]+t*vx,y=a[1]+t*vy;return Math.hypot(p[0]-x,p[1]-y)}
"""

COMMON_FUNCS = {
"boardPoint": r"""function boardPoint(e){return sharedInkEventPoint(e)}""",
"renderStrokes": r"""function renderStrokes(){const svg=$('#sharedBoard'),host=$('#boardHost');if(!svg||!host)return;syncBoardSurfaceSize();const w=Math.max(1,host.offsetWidth),h=Math.max(1,host.offsetHeight),epoch=Number(serverState?.boardEpoch)||0;svg.innerHTML='';for(const [id,s] of Object.entries(strokesCache)){if(!s||Number(s.epoch||0)!==epoch||!Array.isArray(s.points)||s.points.length<2)continue;const pts=sharedInkStrokePagePoints(s,w,h);const pl=document.createElementNS('http://www.w3.org/2000/svg','polyline');pl.setAttribute('points',pts.map(p=>`${p[0]},${p[1]}`).join(' '));pl.setAttribute('fill','none');pl.setAttribute('stroke',s.color||'#b0392b');pl.setAttribute('stroke-width',Math.max(1,Number(s.width)||5));pl.setAttribute('stroke-linecap','round');pl.setAttribute('stroke-linejoin','round');pl.setAttribute('vector-effect','non-scaling-stroke');svg.appendChild(pl)}}""",
"boardPointerDown": r"""async function boardPointerDown(e){if(boardTool==='cursor'||!role)return;e.preventDefault();boardPointerId=e.pointerId;$('#sharedBoard')?.setPointerCapture?.(e.pointerId);const p=boardPoint(e),epoch=Number(serverState?.boardEpoch)||0;if(boardTool==='eraser'){boardErasing=true;lastErasePoint=p;await eraseAt(p);return}const id=push(strokesRef()).key;activeStroke={id,anchorId:SHARED_INK_ANCHOR_ID,authorId:role==='teacher'?`teacher_${browserClientId}`:(participantPlayerKey||playerKey(student?.studentId||browserClientId)),authorName:role==='teacher'?'Учитель':student?.name||'Ученик',points:[p],color:boardColor,width:boardWidth,done:false,epoch,rev:1};strokesCache[id]=clone(activeStroke);renderStrokes();await set(ref(database,`${lessonRoot()}/strokes/${id}`),clone(activeStroke)).catch(()=>{});lastStrokePush=performance.now()}""",
"boardPointerMove": r"""async function boardPointerMove(e){if(e.pointerId!==boardPointerId)return;const p=boardPoint(e);if(boardErasing){await eraseSegment(lastErasePoint,p);lastErasePoint=p;return}if(!activeStroke)return;const pts=activeStroke.points,events=e.getCoalescedEvents?.()||[e];let added=false;for(const ev of events){const q=boardPoint(ev),last=pts[pts.length-1];if(!last||sharedInkDistancePx(q,last)>=1.4){pts.push(q);added=true}}if(!added)return;activeStroke.rev++;strokesCache[activeStroke.id]=clone(activeStroke);renderStrokes();if(performance.now()-lastStrokePush>=36){lastStrokePush=performance.now();update(ref(database,`${lessonRoot()}/strokes/${activeStroke.id}`),{points:pts.slice(),rev:activeStroke.rev,done:false,epoch:activeStroke.epoch,anchorId:activeStroke.anchorId}).catch(()=>{})}}""",
"eraseAt": r"""async function eraseAt(p){const victims=[],host=$('#boardHost'),w=Math.max(1,host?.offsetWidth||innerWidth),h=Math.max(1,host?.offsetHeight||innerHeight),epoch=Number(serverState?.boardEpoch)||0,cursor=sharedInkPagePoint(p);for(const [id,s] of Object.entries(strokesCache)){if(!s||Number(s.epoch||0)!==epoch)continue;const pts=sharedInkStrokePagePoints(s,w,h),tol=Math.max(8,(Number(s.width)||5)*1.55);let hit=false;if(pts.length===1)hit=Math.hypot(cursor[0]-pts[0][0],cursor[1]-pts[0][1])<=tol;for(let i=1;!hit&&i<pts.length;i++)if(sharedInkPointSegDist(cursor,pts[i-1],pts[i])<=tol)hit=true;if(hit)victims.push(id)}if(!victims.length)return;const backup={},patch={};for(const id of victims){backup[id]=strokesCache[id];delete strokesCache[id];patch[id]=null}renderStrokes();try{await update(strokesRef(),patch)}catch{Object.assign(strokesCache,backup);renderStrokes()}}""",
"eraseSegment": r"""async function eraseSegment(a,b){if(!a)return eraseAt(b);const steps=Math.max(1,Math.ceil(sharedInkDistancePx(a,b)/7));for(let i=1;i<=steps;i++)await eraseAt([a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps])}"""
}

def patch_common(path):
    text = path.read_text(encoding="utf-8")
    if "SHARED_INK_ANCHOR_ID='content-v2'" in text:
        return False
    text = insert_before(text, "function boardPoint(e)", COMMON_HELPER)
    for name, code in COMMON_FUNCS.items():
        text = replace_function(text, name, code)
    path.write_text(text, encoding="utf-8")
    return True

GUIDE_HELPER = r"""
const SHARED_INK_ANCHOR_ID='content-v2';
function sharedInkAnchor(){return document.querySelector('main.guide-wrap')||document.querySelector('.guide-wrap')||document.body}
function sharedInkMetrics(){const el=sharedInkAnchor(),r=el.getBoundingClientRect();return{left:r.left+window.scrollX,top:r.top+window.scrollY,width:Math.max(1,r.width||el.clientWidth||innerWidth),height:Math.max(1,el.scrollHeight||r.height||innerHeight)}}
function sharedInkEventPoint(e){const m=sharedInkMetrics(),px=e.clientX+window.scrollX,py=e.clientY+window.scrollY;return[Math.max(0,Math.min(1,(px-m.left)/m.width)),Math.max(0,Math.min(1,(py-m.top)/m.height))]}
function sharedInkPagePoint(p){const m=sharedInkMetrics();return[m.left+Number(p?.[0]||0)*m.width,m.top+Number(p?.[1]||0)*m.height]}
function sharedInkDistancePx(a,b){const m=sharedInkMetrics();return Math.hypot((Number(a?.[0]||0)-Number(b?.[0]||0))*m.width,(Number(a?.[1]||0)-Number(b?.[1]||0))*m.height)}
function strokePixelPoints(s){return s?.anchorId===SHARED_INK_ANCHOR_ID?(s.points||[]).map(sharedInkPagePoint):(s?.points||[]).map(p=>[Number(p?.[0]||0),Number(p?.[1]||0)])}
function strokePathD(s){return smoothPath(strokePixelPoints(s))}
"""

GUIDE_FUNCS = {
"boardPoint": r"""function boardPoint(e){return sharedInkEventPoint(e)}""",
"makeStrokePath": r"""function makeStrokePath(s,active=false){const el=document.createElementNS('http://www.w3.org/2000/svg','path');el.setAttribute('class','board-stroke'+(active?' active-local':''));el.dataset.strokeId=s.id||'active';el.setAttribute('d',strokePathD(s));el.setAttribute('stroke',s.color||'#9e3b26');el.setAttribute('stroke-width',Math.max(1,+s.width||5));boardSvg.appendChild(el);return el}""",
"upsertRemoteStroke": r"""function upsertRemoteStroke(id,stroke){if(!stroke)return;const epoch=Number(localState?.boardEpoch??boardEpoch);if(Number(stroke.epoch)!==epoch){strokeElement(id)?.remove();return}if(activeStroke&&id===activeStroke.id&&stroke.authorId===me?.id)return;let el=strokeElement(id);if(!el)el=makeStrokePath({...stroke,id},false);else{el.setAttribute('d',strokePathD(stroke));el.setAttribute('stroke',stroke.color||'#9e3b26');el.setAttribute('stroke-width',Math.max(1,+stroke.width||5))}}""",
"renderBoard": r"""function renderBoard(){const epoch=Number(localState?.boardEpoch??boardEpoch);if(activeStroke&&Number(activeStroke.epoch)!==epoch){activeStroke=null;activePathEl?.remove();activePathEl=null;document.body.classList.remove('drawing-now','erasing-now')}boardSvg.querySelectorAll('.board-stroke:not(.active-local)').forEach(el=>el.remove());const items=Object.values(strokeCache).filter(s=>s&&Number(s.epoch)===epoch&&(!activeStroke||s.id!==activeStroke.id));for(const s of items)makeStrokePath(s,false);if(activeStroke){if(!activePathEl||!activePathEl.isConnected)activePathEl=makeStrokePath(activeStroke,true);else activePathEl.setAttribute('d',strokePathD(activeStroke))}}""",
"queueActiveRender": r"""function queueActiveRender(){if(activeRenderRaf)return;activeRenderRaf=requestAnimationFrame(()=>{activeRenderRaf=0;if(!activeStroke)return;if(!activePathEl||!activePathEl.isConnected)activePathEl=makeStrokePath(activeStroke,true);else activePathEl.setAttribute('d',strokePathD(activeStroke))})}""",
"appendCoalescedPoints": r"""function appendCoalescedPoints(e){if(!activeStroke)return false;const events=e.getCoalescedEvents?.()||[e];let added=false;for(const ev of events){const p=boardPoint(ev),last=activeStroke.points.at(-1);if(!last||sharedInkDistancePx(p,last)>=1.2){activeStroke.points.push(p);added=true}}return added}""",
"eraseAt": r"""async function eraseAt(nx,ny){const epoch=Number(localState?.boardEpoch??boardEpoch),cursor=sharedInkPagePoint([nx,ny]),rad=Math.max(14,boardWidth*2.3),removeIds=[];for(const [id,s] of Object.entries(strokeCache)){if(!s||Number(s.epoch)!==epoch||eraseBusy.has(id))continue;const pts=strokePixelPoints(s);let hit=false;for(let i=0;i<pts.length;i++){const a=pts[i];if(i===0?Math.hypot(cursor[0]-a[0],cursor[1]-a[1])<=rad+(+s.width||4)/2:segDist(cursor[0],cursor[1],pts[i-1][0],pts[i-1][1],a[0],a[1])<=rad+(+s.width||4)/2){hit=true;break}}if(hit)removeIds.push(id)}for(const id of removeIds){eraseBusy.add(id);const backup=strokeCache[id];delete strokeCache[id];removeRemoteStroke(id);remove(ref(database,`${root()}/strokes/${id}`)).catch(()=>{strokeCache[id]=backup;upsertRemoteStroke(id,backup)}).finally(()=>eraseBusy.delete(id))}}""",
"eraseAlong": r"""function eraseAlong(e){const cur=boardPoint(e);if(!eraseLast){eraseLast=cur;eraseAt(...cur);return}const n=Math.max(1,Math.ceil(sharedInkDistancePx(cur,eraseLast)/7));for(let i=1;i<=n;i++){const t=i/n;eraseAt(eraseLast[0]+(cur[0]-eraseLast[0])*t,eraseLast[1]+(cur[1]-eraseLast[1])*t)}eraseLast=cur}"""
}

def patch_guide(path):
    text = path.read_text(encoding="utf-8")
    if "SHARED_INK_ANCHOR_ID='content-v2'" in text:
        return False
    text = insert_before(text, "function boardPoint(e)", GUIDE_HELPER)
    for name, code in GUIDE_FUNCS.items():
        text = replace_function(text, name, code)
    old = "activeStroke={id:'stroke-'+uuid(),authorId:me.id,authorName:me.name,color:boardColor,width:boardWidth,points:[p],done:false,epoch:Number(localState?.boardEpoch??boardEpoch),rev:Date.now()}"
    new = "activeStroke={id:'stroke-'+uuid(),anchorId:SHARED_INK_ANCHOR_ID,authorId:me.id,authorName:me.name,color:boardColor,width:boardWidth,points:[p],done:false,epoch:Number(localState?.boardEpoch??boardEpoch),rev:Date.now()}"
    if old not in text:
        raise RuntimeError("guide stroke creation not found")
    text = text.replace(old, new, 1)
    text = text.replace("Math.max(0,60-(now-lastPush))", "Math.max(0,36-(now-lastPush))", 1)
    path.write_text(text, encoding="utf-8")
    return True

changed = []
for rel in ("EGA/6/что не так-1.html", "EGA/6/что не так-2.html"):
    p = ROOT / rel
    if patch_common(p):
        changed.append(rel)

g = ROOT / "EGA/6/gaid.html"
if patch_guide(g):
    changed.append("EGA/6/gaid.html")

print("patched:", ", ".join(changed) if changed else "nothing")
