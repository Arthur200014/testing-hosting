export const EGE_FULL_MAX_PRIMARY_SCORE = 33;
export const OGE_FULL_MAX_PRIMARY_SCORE = 31;

// The form uses 33 primary points because tasks 14–20 contribute 20 points in
// total. The first 0–32 entries follow the current profile-mathematics scale;
// the extra 33rd point remains capped at 100.
export const EGE_TEST_SCORE_SCALE = Object.freeze([
  0, 6, 11, 17, 22, 27, 34, 40, 46, 52, 58, 64, 70, 72, 74, 76, 78,
  80, 82, 84, 86, 88, 90, 92, 94, 95, 96, 97, 98, 99, 100, 100, 100, 100
]);

function primaryInteger(value, maximum) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > maximum) {
    throw new RangeError(`primary score must be an integer from 0 to ${maximum}`);
  }
  return score;
}

export function egeTestScore(primaryScore) {
  return EGE_TEST_SCORE_SCALE[primaryInteger(primaryScore, EGE_FULL_MAX_PRIMARY_SCORE)];
}

export function ogeGradeMark(primaryScore) {
  const score = primaryInteger(primaryScore, OGE_FULL_MAX_PRIMARY_SCORE);
  if (score >= 22) return 5;
  if (score >= 15) return 4;
  if (score >= 8) return 3;
  return 2;
}

export function convertedMockResult(programId, value = {}) {
  const primary = Number(value.primary ?? value.primaryScore);
  const defaultMax = programId === 'EGE_MATH' ? 13 : 19;
  const maxPrimary = Number(value.maxPrimary ?? value.maxPrimaryScore) || defaultMax;
  const scorePercent = value.scorePercent !== '' && value.scorePercent !== null
    && value.scorePercent !== undefined && Number.isFinite(Number(value.scorePercent))
    ? Number(value.scorePercent)
    : Math.round(primary * 100 / maxPrimary);
  const result = { ...value, primary, maxPrimary, scorePercent };
  if (programId === 'EGE_MATH') {
    result.testScore = Number.isFinite(Number(value.testScore)) && value.testScore !== ''
      ? Number(value.testScore)
      : egeTestScore(primary);
    result.finalized = maxPrimary === EGE_FULL_MAX_PRIMARY_SCORE;
  } else if (programId === 'OGE_MATH') {
    result.gradeMark = Number.isFinite(Number(value.gradeMark)) && value.gradeMark !== ''
      ? Number(value.gradeMark)
      : ogeGradeMark(primary);
    result.finalized = maxPrimary === OGE_FULL_MAX_PRIMARY_SCORE;
  }
  return result;
}

export function convertedMockPayload(programId, payload = {}) {
  if (payload.primaryScore === '' || payload.primaryScore === null
      || payload.primaryScore === undefined || !Number.isFinite(Number(payload.primaryScore))) {
    return { ...payload };
  }
  const result = convertedMockResult(programId, payload);
  return {
    ...payload,
    ...(programId === 'EGE_MATH' ? { testScore: result.testScore } : {}),
    ...(programId === 'OGE_MATH' ? { gradeMark: result.gradeMark } : {})
  };
}

export function mockScoreSummary(programId, value = {}) {
  const rawPrimary = value.primary ?? value.primaryScore;
  if (rawPrimary === '' || rawPrimary === null || rawPrimary === undefined
      || !Number.isFinite(Number(rawPrimary))) return '';
  const result = convertedMockResult(programId, value);
  const primary = `${result.primary} из ${result.maxPrimary} первичных`;
  if (programId === 'EGE_MATH') return `${primary} · ${result.testScore} тестовых`;
  if (programId === 'OGE_MATH') return `${primary} · оценка ${result.gradeMark}`;
  return primary;
}
