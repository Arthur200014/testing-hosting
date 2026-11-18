// The isolated runner supplies the relay explicitly. Production hosts cannot enable it.
export function createLessonBoard(apiBase, accessToken) {
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

  function open(lessonId) {
    if (!enabled || dialog || !accessToken() || !lessonId) return;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Доска занятия');
    dialog.style.cssText = 'box-sizing:border-box;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:white;';
    const toolbar = document.createElement('header');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:16px;height:52px;padding:0 16px;border-bottom:1px solid #dedde8;';
    const back = document.createElement('button');
    back.className = 'secondary';
    back.type = 'button';
    back.textContent = 'Назад к занятию';
    const frame = document.createElement('iframe');
    frame.title = 'Рабочая область доски';
    frame.style.cssText = 'display:block;width:100%;height:calc(100% - 53px);border:0;';
    frame.src = '/';
    frame.addEventListener('load', () => {
      if (frame.contentDocument?.URL !== new URL('/', location.origin).href) return;
      frame.contentWindow.postMessage({
        type:'tas:open-lesson-board', relay,
        session:{ apiBase, accessToken:accessToken(), role:'teacher', lessonId }
      }, location.origin);
    });

    const requestClose = () => {
      const status = frame.contentDocument?.getElementById('status')?.textContent;
      if (status && !['Сохранено', 'Загрузка доски', 'Нет доступа к занятию'].includes(status) &&
          !window.confirm('На доске могут быть несохранённые правки. Вернуться к занятию?')) return;
      close();
      document.querySelector(`[data-open-lesson-board="${CSS.escape(lessonId)}"]`)?.focus();
    };
    back.addEventListener('click', requestClose);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      requestClose();
    });
    toolbar.append(back);
    dialog.append(toolbar, frame);
    document.body.append(dialog);
    dialog.showModal();
  }

  return { enabled, open, close };
}
