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

// The isolated runner supplies the relay explicitly. Production hosts cannot enable it.
export function createLessonBoard(apiBase, accessToken, role = 'teacher') {
  const relay = window.__TAS_ISOLATED_BOARD_RELAY;
  const enabled = location.hostname === '127.0.0.1' && [relay, apiBase].every(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' && url.hostname === '127.0.0.1';
    } catch { return false; }
  });
  let dialog;

  function close() {
    if (!dialog) return;
    dialog.close();
    dialog.remove();
    dialog = undefined;
  }

  function open(lessonId, backLabel = 'Назад к занятию', independent = false) {
    if (!enabled || dialog || !accessToken() || !lessonId) return false;
    const opener = document.activeElement;
    const openerSelector = `[data-open-${independent ? 'independent' : 'lesson'}-board="${CSS.escape(lessonId)}"]`;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Доска занятия');
    dialog.style.cssText = 'box-sizing:border-box;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:white;';
    const toolbar = document.createElement('header');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:16px;height:52px;padding:0 16px;border-bottom:1px solid #dedde8;';
    const back = document.createElement('button');
    back.className = 'secondary';
    back.type = 'button';
    back.textContent = backLabel;
    back.setAttribute('aria-keyshortcuts', 'Shift+Escape');
    const shortcut = document.createElement('kbd');
    shortcut.textContent = 'Shift + Esc';
    shortcut.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('iframe');
    frame.title = 'Рабочая область доски';
    frame.style.cssText = 'display:block;width:100%;height:calc(100% - 53px);border:0;';
    frame.src = '/';
    frame.addEventListener('load', () => {
      const editor = frame.contentDocument;
      if (editor?.URL !== new URL('/', location.origin).href) return;
      editor.addEventListener('keydown', exitByShortcut, true);
      frame.contentWindow.postMessage({
        type:'tas:open-lesson-board', relay,
        session:{ apiBase, accessToken:accessToken(), role, ...(independent ? {boardId:lessonId} : {lessonId}) }
      }, location.origin);
    });

    const requestClose = () => {
      const status = frame.contentDocument?.getElementById('status')?.textContent;
      if (status && !['Сохранено', 'Загрузка доски', 'Нет доступа к занятию'].includes(status) &&
          !window.confirm('На доске могут быть несохранённые правки. Закрыть доску?')) return;
      close();
      const focusTargets = [opener?.matches(openerSelector) ? opener : null,
        ...document.querySelectorAll(openerSelector), opener,
        document.getElementById(role === 'student' ? 'dashboard' : 'teacherMain')];
      focusTargets.find(node => node instanceof HTMLElement && node !== document.body &&
        !node.matches(':disabled') && node.getClientRects().length)?.focus();
    };
    function exitByShortcut(event) {
      if (event.key !== 'Escape' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
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

  return { enabled, open, close };
}
