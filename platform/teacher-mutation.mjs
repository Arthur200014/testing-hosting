export async function performTeacherMutation(state, kind, build, send, makeId = () => crypto.randomUUID()) {
  const candidate = build();
  const fingerprint = JSON.stringify(candidate);
  const previous = state.pending[kind];
  if (previous && previous.fingerprint !== fingerprint)
    throw new Error('Предыдущий запрос не подтверждён. Повторите его с прежними данными или обновите список и проверьте запись.');
  const requestId = previous?.requestId || makeId();
  state.pending[kind] = { requestId, fingerprint };
  const payload = kind === 'lesson' ? { ...candidate, lesson: { ...candidate.lesson, requestId } }
    : { ...candidate, requestId };
  try {
    const result = await send(payload);
    delete state.pending[kind];
    return result;
  } catch (error) {
    if (error.status && error.status < 500) delete state.pending[kind];
    else error.retrySameRequest = true;
    throw error;
  }
}
