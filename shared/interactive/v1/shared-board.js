// Доска поверх всей страницы. Содержимое игры и выбор участников остаются у страницы.
export function createSharedBoard({ transport, getRole, getState, setState, getAuthor, normalizeState, clone, toolbarPositionKey,
  strokePath = 'strokes', anchorId = 'content-v2', anchorSelector = 'main.app', manageToolbar = true }) {
  const $ = selector => document.querySelector(selector);
  let tool = 'cursor', color = '#e53935', width = 6, collapsed = false;
  let activeStroke = null, pointerId = null, erasing = false, lastErasePoint = null;
  let lastStrokePush = 0, strokes = {}, unsubscribe = null, toolbarDrag = null;

  function syncSurfaceSize() {
    const host = $('#boardHost');
    if (!host) return;
    const doc = document.documentElement, body = document.body;
    const w = Math.max(innerWidth, doc.scrollWidth, body?.scrollWidth || 0);
    const h = Math.max(innerHeight, doc.scrollHeight, body?.scrollHeight || 0);
    host.style.width = w + 'px'; host.style.height = h + 'px';
    const svg = $('#sharedBoard');
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width', w); svg.setAttribute('height', h);
    }
  }

  function anchor() {
    const list = [...document.querySelectorAll(anchorSelector)];
    return list.find(el => {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 40 && rect.height > 40;
    }) || list[0] || document.body;
  }
  function metrics() {
    const el = anchor(), rect = el.getBoundingClientRect();
    return { left: rect.left + window.scrollX, top: rect.top + window.scrollY,
      width: Math.max(1, rect.width || el.clientWidth || innerWidth),
      height: Math.max(1, el.scrollHeight || rect.height || innerHeight) };
  }
  function eventPoint(event) {
    const m = metrics(), x = event.clientX + window.scrollX, y = event.clientY + window.scrollY;
    return [Math.max(0, Math.min(1, (x - m.left) / m.width)), Math.max(0, Math.min(1, (y - m.top) / m.height))];
  }
  function pagePoint(point) {
    const m = metrics();
    return [m.left + Number(point?.[0] || 0) * m.width, m.top + Number(point?.[1] || 0) * m.height];
  }
  function distancePx(a, b) {
    const m = metrics();
    return Math.hypot((Number(a?.[0] || 0) - Number(b?.[0] || 0)) * m.width,
      (Number(a?.[1] || 0) - Number(b?.[1] || 0)) * m.height);
  }
  function strokePagePoints(stroke, w, h) {
    if (stroke?.anchorId === anchorId) return (stroke.points || []).map(pagePoint);
    return (stroke?.points || []).map(point => [Number(point?.[0] || 0) * w, Number(point?.[1] || 0) * h]);
  }
  function pointSegmentDistance(point, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], wx = point[0] - a[0], wy = point[1] - a[1];
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(point[0] - b[0], point[1] - b[1]);
    const t = c1 / c2, x = a[0] + t * vx, y = a[1] + t * vy;
    return Math.hypot(point[0] - x, point[1] - y);
  }

  function render() {
    const svg = $('#sharedBoard'), host = $('#boardHost');
    if (!svg || !host) return;
    syncSurfaceSize();
    const w = Math.max(1, host.offsetWidth), h = Math.max(1, host.offsetHeight);
    const epoch = Number(getState()?.boardEpoch) || 0;
    svg.innerHTML = '';
    for (const [id, stroke] of Object.entries(strokes)) {
      if (!stroke || Number(stroke.epoch || 0) !== epoch || !Array.isArray(stroke.points) || stroke.points.length < 2) continue;
      const points = strokePagePoints(stroke, w, h);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('points', points.map(point => `${point[0]},${point[1]}`).join(' '));
      line.setAttribute('fill', 'none'); line.setAttribute('stroke', stroke.color || '#b0392b');
      line.setAttribute('stroke-width', Math.max(1, Number(stroke.width) || 5));
      line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('vector-effect', 'non-scaling-stroke'); svg.appendChild(line);
    }
  }

  function setPointerMode(nextTool) {
    if (nextTool) tool = nextTool;
    const host = $('#boardHost'), svg = $('#sharedBoard'), drawing = !!getRole() && tool !== 'cursor';
    document.body.classList.toggle('ink-active', drawing);
    document.body.classList.toggle('ink-eraser', drawing && tool === 'eraser');
    if (host) host.style.pointerEvents = drawing ? 'auto' : 'none';
    if (svg) svg.style.pointerEvents = drawing ? 'auto' : 'none';
  }

  function attach() {
    const host = $('#boardHost');
    if (!host) return;
    syncSurfaceSize();
    let svg = $('#sharedBoard');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'sharedBoard'; svg.setAttribute('preserveAspectRatio', 'none');
      svg.classList.add('shared-board'); host.appendChild(svg);
      svg.addEventListener('pointerdown', pointerDown);
      svg.addEventListener('pointermove', pointerMove);
      svg.addEventListener('pointerup', pointerUp);
      svg.addEventListener('pointercancel', pointerUp);
    }
    setPointerMode(); render();
  }

  function installToolbarDrag() {
    if (!manageToolbar) return;
    const toolbar = $('#boardToolbar'), head = toolbar.querySelector('.board-head');
    if (!head) return;
    try {
      const saved = JSON.parse(localStorage.getItem(toolbarPositionKey) || 'null');
      if (saved) { toolbar.style.left = saved.x + 'px'; toolbar.style.top = saved.y + 'px'; toolbar.style.right = 'auto'; }
    } catch {}
    head.onpointerdown = event => {
      if (event.target.closest('button')) return;
      const rect = toolbar.getBoundingClientRect();
      toolbarDrag = { pid: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      head.setPointerCapture?.(event.pointerId);
    };
    head.onpointermove = event => {
      if (!toolbarDrag || toolbarDrag.pid !== event.pointerId) return;
      const x = Math.max(4, Math.min(innerWidth - toolbar.offsetWidth - 4, event.clientX - toolbarDrag.dx));
      const y = Math.max(4, Math.min(innerHeight - toolbar.offsetHeight - 4, event.clientY - toolbarDrag.dy));
      toolbar.style.left = x + 'px'; toolbar.style.top = y + 'px'; toolbar.style.right = 'auto';
    };
    head.onpointerup = () => {
      const rect = toolbar.getBoundingClientRect();
      localStorage.setItem(toolbarPositionKey, JSON.stringify({ x: rect.left, y: rect.top }));
      toolbarDrag = null;
    };
  }

  function renderToolbar() {
    if (!manageToolbar) return;
    const toolbar = $('#boardToolbar');
    toolbar.classList.toggle('collapsed', collapsed);
    toolbar.innerHTML = `<div class="board-head"><span>✎ ИНСТРУМЕНТЫ ОБЩЕЙ ДОСКИ</span><button class="sys-mini" id="collapseBoard">${collapsed ? '＋' : '—'}</button></div><div class="board-tools"><button data-tool="cursor">↖ Курсор</button><button data-tool="pen">✎ Карандаш</button><button data-tool="eraser">⌫ Ластик</button><label class="board-setting"><span>Цвет</span><input type="color" id="boardColor" value="${color}"></label><label class="board-setting"><span>Толщина</span><input type="range" id="boardWidth" min="2" max="16" value="${width}"><b class="board-width-value" id="boardWidthValue">${width}</b></label><div class="board-hint">Рисование работает поверх всей страницы. «Курсор» возвращает обычные кнопки и прокрутку.</div>${getRole() === 'teacher' ? '<button class="board-clear" id="clearBoard">🗑 Очистить всю доску</button>' : ''}</div>`;
    toolbar.querySelectorAll('[data-tool]').forEach(button => {
      button.classList.toggle('active', button.dataset.tool === tool);
      button.onclick = () => { tool = button.dataset.tool; renderToolbar(); setPointerMode(); };
    });
    $('#collapseBoard').onclick = () => { collapsed = !collapsed; renderToolbar(); };
    $('#boardColor').oninput = event => color = event.target.value;
    $('#boardWidth').oninput = event => { width = Number(event.target.value); $('#boardWidthValue').textContent = width; };
    if ($('#clearBoard')) $('#clearBoard').onclick = clear;
    installToolbarDrag();
  }

  function start() {
    if (unsubscribe) return;
    strokes = {};
    unsubscribe = transport.subscribe(strokePath, snapshot => {
      const incoming = snapshot.exists() ? clone(snapshot.val()) : {};
      if (activeStroke && incoming[activeStroke.id]) {
        const local = strokes[activeStroke.id];
        if (local && Number(local.rev || 0) > Number(incoming[activeStroke.id].rev || 0)) incoming[activeStroke.id] = local;
      }
      strokes = incoming || {}; render();
    });
    attach();
  }
  function stop() { unsubscribe?.(); unsubscribe = null; }

  async function pointerDown(event) {
    if (tool === 'cursor' || !getRole()) return;
    event.preventDefault(); pointerId = event.pointerId;
    $('#sharedBoard')?.setPointerCapture?.(event.pointerId);
    const point = eventPoint(event), epoch = Number(getState()?.boardEpoch) || 0;
    if (tool === 'eraser') { erasing = true; lastErasePoint = point; await eraseAt(point); return; }
    const id = transport.newKey(strokePath), author = getAuthor();
    activeStroke = { id, anchorId, authorId: author.id, authorName: author.name,
      points: [point], color, width, done: false, epoch, rev: 1 };
    strokes[id] = clone(activeStroke); render();
    await transport.set(`${strokePath}/${id}`, clone(activeStroke)).catch(() => {});
    lastStrokePush = performance.now();
  }

  async function pointerMove(event) {
    if (event.pointerId !== pointerId) return;
    const point = eventPoint(event);
    if (erasing) { await eraseSegment(lastErasePoint, point); lastErasePoint = point; return; }
    if (!activeStroke) return;
    const points = activeStroke.points, events = event.getCoalescedEvents?.() || [event];
    let added = false;
    for (const item of events) {
      const next = eventPoint(item), last = points[points.length - 1];
      if (!last || distancePx(next, last) >= 1.4) { points.push(next); added = true; }
    }
    if (!added) return;
    activeStroke.rev++; strokes[activeStroke.id] = clone(activeStroke); render();
    if (performance.now() - lastStrokePush >= 36) {
      lastStrokePush = performance.now();
      transport.update(`${strokePath}/${activeStroke.id}`, {
        points: points.slice(), rev: activeStroke.rev, done: false,
        epoch: activeStroke.epoch, anchorId: activeStroke.anchorId
      }).catch(() => {});
    }
  }

  async function pointerUp(event) {
    if (event.pointerId !== pointerId) return;
    if (activeStroke) {
      const finalStroke = clone({ ...activeStroke, rev: activeStroke.rev + 1, done: true });
      strokes[finalStroke.id] = finalStroke; render();
      await transport.set(`${strokePath}/${finalStroke.id}`, finalStroke).catch(() => {});
      activeStroke = null;
    }
    erasing = false; lastErasePoint = null; pointerId = null;
  }

  async function eraseAt(point) {
    const victims = [], host = $('#boardHost');
    const w = Math.max(1, host?.offsetWidth || innerWidth), h = Math.max(1, host?.offsetHeight || innerHeight);
    const epoch = Number(getState()?.boardEpoch) || 0, cursor = pagePoint(point);
    for (const [id, stroke] of Object.entries(strokes)) {
      if (!stroke || Number(stroke.epoch || 0) !== epoch) continue;
      const points = strokePagePoints(stroke, w, h), tolerance = Math.max(8, (Number(stroke.width) || 5) * 1.55);
      let hit = false;
      if (points.length === 1) hit = Math.hypot(cursor[0] - points[0][0], cursor[1] - points[0][1]) <= tolerance;
      for (let i = 1; !hit && i < points.length; i++) if (pointSegmentDistance(cursor, points[i - 1], points[i]) <= tolerance) hit = true;
      if (hit) victims.push(id);
    }
    if (!victims.length) return;
    const backup = {}, patch = {};
    for (const id of victims) { backup[id] = strokes[id]; delete strokes[id]; patch[id] = null; }
    render();
    try { await transport.update(strokePath, patch); }
    catch { Object.assign(strokes, backup); render(); }
  }
  async function eraseSegment(a, b) {
    if (!a) return eraseAt(b);
    const steps = Math.max(1, Math.ceil(distancePx(a, b) / 7));
    for (let i = 1; i <= steps; i++) await eraseAt([a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps]);
  }

  async function clear() {
    if (getRole() !== 'teacher') return;
    const snapshot = await transport.get('state');
    const base = snapshot.exists() ? normalizeState(snapshot.val()) : normalizeState(getState() || {});
    const result = await transport.transaction('state', current => {
      const state = normalizeState(current || clone(base));
      state.boardEpoch = (Number(state.boardEpoch) || 0) + 1;
      state.version++;
      return state;
    }, { applyLocally: false });
    if (result.committed) {
      setState(normalizeState(result.snapshot.val()));
      strokes = {}; render();
      await transport.remove(strokePath).catch(() => {});
    }
  }

  const onResize = () => { syncSurfaceSize(); render(); };
  const onLoad = () => setTimeout(onResize, 60);
  window.addEventListener('resize', onResize);
  window.addEventListener('load', onLoad);
  const observer = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
  observer?.observe(document.body);
  function dispose() { stop(); observer?.disconnect(); window.removeEventListener('resize', onResize); window.removeEventListener('load', onLoad); }

  return { attach, start, stop, render, renderToolbar, syncSurfaceSize, setPointerMode, clear, dispose };
}
