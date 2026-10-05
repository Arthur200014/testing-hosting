export const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
export const uuid = () => crypto?.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const normalizeStudentCode = value => String(value ?? '').trim().toUpperCase();
export const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const nowIso = milliseconds => new Date(milliseconds ?? Date.now()).toISOString();

export function getBrowserClientId(key) {
  let id = sessionStorage.getItem(key);
  if (!id) { id = uuid(); sessionStorage.setItem(key, id); }
  return id;
}

export function createStudentStore(key) {
  return {
    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved?.studentId && saved?.code) return { ...saved, studentId: String(saved.studentId), code: normalizeStudentCode(saved.code) };
      } catch {}
      const studentId = localStorage.getItem('egeStudentId') || '';
      const name = localStorage.getItem('egeStudentName') || '';
      const code = normalizeStudentCode(localStorage.getItem('egeStudentCode') || '');
      return studentId && code ? { studentId: String(studentId), name: name || 'Ученик', code } : null;
    },
    save(student) {
      const clean = { ...student, studentId: String(student.studentId), code: normalizeStudentCode(student.code) };
      localStorage.setItem('egeStudentId', clean.studentId);
      localStorage.setItem('egeStudentName', clean.name);
      localStorage.setItem('egeStudentCode', clean.code);
      localStorage.setItem(key, JSON.stringify(clean));
      return clean;
    }
  };
}

// Page-specific codecs preserve historical identity field names while sharing
// localStorage access and the repository-wide legacy keys.
export function createRealtimeIdentityAdapter({ key = null, decode = value => value,
  encode = value => value, legacyProjection = value => value, extraLegacyKeys = [] } = {}) {
  const read = () => {
    let saved = null;
    if (key) {
      try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    }
    const legacy = {
      studentId: localStorage.getItem('egeStudentId') || '',
      name: localStorage.getItem('egeStudentName') || '',
      code: localStorage.getItem('egeStudentCode') || ''
    };
    return decode(saved, legacy);
  };
  const save = student => {
    const raw = encode(student);
    if (key) localStorage.setItem(key, JSON.stringify(raw));
    for (const [storageKey, value] of Object.entries(legacyProjection(student) || {})) {
      if (value == null || value === '') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(value));
    }
    return student;
  };
  const clear = () => {
    if (key) localStorage.removeItem(key);
    for (const storageKey of ['egeStudentId', 'egeStudentName', 'egeStudentCode', ...extraLegacyKeys]) localStorage.removeItem(storageKey);
  };
  return { load: read, save, clear };
}

export function sameStudent(player, student) {
  if (!player || !student) return false;
  const playerId = String(player.studentId ?? ''), studentId = String(student.studentId ?? '');
  if (playerId && studentId && playerId === studentId) return true;
  const playerCode = normalizeStudentCode(player.code), studentCode = normalizeStudentCode(student.code);
  return !!playerCode && !!studentCode && playerCode === studentCode;
}
