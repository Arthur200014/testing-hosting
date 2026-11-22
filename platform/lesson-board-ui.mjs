const boardIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function studentBoardLink(pageUrl, boardId) {
  if (!boardIdPattern.test(boardId)) return null;
  const url = new URL('./student.html', pageUrl);
  url.hash = 'board=' + boardId.toLowerCase();
  return url.href;
}

export function boardIdFromLink(hash) {
  const id = /^#board=(.+)$/.exec(hash)?.[1];
  return id && boardIdPattern.test(id) ? id.toLowerCase() : null;
}

export function hostedBoardPrefix() {
  return location.protocol === 'https:' && location.pathname.startsWith('/board-pilot/') &&
    document.querySelector('meta[name="tas-board-hosted"]')?.content === location.origin ? '/board-pilot' : '';
}

export function boardApiPath(path) {
  const prefix = /^(teacher|student)\/board-prototype\//.test(path) ? hostedBoardPrefix() : '';
  return prefix + '/api/v1/' + path;
}

// Hosted pages are marked by the private pilot relay. Ordinary cabinets stay disabled.
export function createLessonBoard(apiBase, accessToken, role = 'teacher') {
  const pilot = hostedBoardPrefix();
  const staging = location.protocol === 'https:' && location.hostname === '127.0.0.1' &&
    ['/cabinet/teacher.html', '/cabinet/student.html'].includes(location.pathname);
  const relay = staging || pilot ? location.origin : window.__TAS_ISOLATED_BOARD_RELAY;
  const editorPath = staging || pilot ? pilot + '/board/' : '/';
  const enabled = pilot ? apiBase === location.origin && location.pathname === pilot + '/cabinet/' + role + '.html' :
    location.hostname === '127.0.0.1' && [relay, apiBase].every(value => {
    try {
      const url = new URL(value);
      return url.protocol === (staging ? 'https:' : 'http:') && url.hostname === '127.0.0.1' && url.origin === value;
    } catch { return false; }
  });
  let dialog;

  function close() {
    if (!dialog) return;
    dialog.close();
    dialog.remove();
    dialog = undefined;
  }

  function open(lessonId, backLabel = 'Назад к занятию', independent = false, classTarget = null) {
    if (!enabled || dialog || !accessToken() || !lessonId) return false;
    const opener = document.activeElement;
    const openerSelector = classTarget ? `[data-open-class-board="${role === 'student' ? classTarget + '/' : ''}${CSS.escape(lessonId)}"]` : `[data-open-${independent ? 'independent' : 'lesson'}-board="${CSS.escape(lessonId)}"]`;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Доска занятия');
    dialog.style.cssText = 'box-sizing:border-box;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:white;';
    const toolbar = document.createElement('header');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:16px;height:52px;padding:0 16px;border-bottom:1px solid #dedde8;';
    const back = document.createElement('button');
    back.className = 'secondary';
    back.type = 'button';
    back.textContent = backLabel;
    back.setAttribute('aria-keyshortcuts', 'Alt+Shift+ArrowUp');
    const shortcut = document.createElement('kbd');
    shortcut.textContent = 'Alt+Shift+↑';
    shortcut.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('iframe');
    frame.title = 'Рабочая область доски';
    frame.style.cssText = 'display:block;width:100%;height:calc(100% - 53px);border:0;';
    frame.src = editorPath;
    frame.addEventListener('load', () => {
      const editor = frame.contentDocument;
      if (editor?.URL !== new URL(editorPath, location.origin).href) return;
      editor.addEventListener('keydown', exitByShortcut, true);
      frame.contentWindow.postMessage({
        type:'tas:open-lesson-board', relay,
        session:{ apiBase, accessToken:accessToken(), role, ...(classTarget ? {classId:lessonId,classKind:classTarget} : independent ? {boardId:lessonId} : {lessonId}) }
      }, location.origin);
    });

    const requestClose = () => {
      const status = frame.contentDocument?.getElementById('status')?.textContent;
      if (status && !['Сохранено', 'Загрузка доски', 'Нет доступа к занятию'].includes(status) &&
          !window.confirm('На доске могут быть несохранённые правки. Закрыть доску?')) return;
      close();
      if (classTarget) history.replaceState(null, '', location.pathname + location.search);
      const focusTargets = [opener?.matches(openerSelector) ? opener : null,
        ...document.querySelectorAll(openerSelector), opener,
        document.getElementById(role === 'student' ? 'dashboard' : 'teacherMain')];
      focusTargets.find(node => node instanceof HTMLElement && node !== document.body &&
        !node.matches(':disabled') && node.getClientRects().length)?.focus();
    };
    function exitByShortcut(event) {
      if (event.key !== 'ArrowUp' || !event.shiftKey || !event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) requestClose();
    }
    dialog.addEventListener('keydown', exitByShortcut, true);
    back.addEventListener('click', requestClose);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      requestClose();
    });
    toolbar.append(back, shortcut);
    dialog.append(toolbar, frame);
    document.body.append(dialog);
    dialog.showModal();
    back.focus();
    return true;
  }

  function updateToken() {
    dialog?.querySelector('iframe')?.contentWindow?.postMessage({type:'tas:refresh-board-session', accessToken:accessToken()}, location.origin);
  }
  function openClass(id, kind, backLabel = 'Назад к классу') {
    if (!boardIdPattern.test(id) || !['individual','group'].includes(kind)) return false;
    const opened = open(id, backLabel, false, kind);
    if (opened) history.replaceState(null, '', '#class-board=' + kind + '/' + id);
    return opened;
  }
  function restoreClass() {
    const match = /^#class-board=(individual|group)\/([0-9a-f-]{36})$/i.exec(location.hash);
    if (match) openClass(match[2], match[1]);
  }
  return { enabled, open, openClass, restoreClass, close, updateToken };
}
