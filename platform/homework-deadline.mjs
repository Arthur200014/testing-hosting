// Compare full timestamps, never calendar-day strings: a deadline is an exact
// instant. This is presentation-only; late submissions remain permitted.
export function nativeHomeworkDeadlineStatus(item, asOf = new Date()) {
  const submitted = item.submittedAt ? Date.parse(item.submittedAt) : null;
  const deadline = item.deadlineAt ? Date.parse(item.deadlineAt) : NaN;
  const now = asOf instanceof Date ? asOf.getTime() : new Date(asOf).getTime();
  if (submitted != null && Number.isFinite(submitted)) {
    if (!Number.isFinite(deadline)) return { key: 'submitted-unknown', label: 'Сдано · срок неизвестен' };
    return submitted > deadline
      ? { key: 'submitted-late', label: 'Сдано с опозданием' }
      : { key: 'submitted-on-time', label: 'Сдано вовремя' };
  }
  if (!Number.isFinite(deadline) || !Number.isFinite(now))
    return { key: 'unknown', label: 'Срок неизвестен' };
  return now > deadline
    ? { key: 'overdue', label: 'Просрочено · можно сдать' }
    : { key: 'awaiting', label: 'Ожидает сдачи' };
}
