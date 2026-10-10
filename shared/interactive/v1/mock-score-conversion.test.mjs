import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EGE_TEST_SCORE_SCALE,
  convertedMockPayload,
  convertedMockResult,
  egeTestScore,
  mockScoreSummary,
  ogeGradeMark
} from './mock-score-conversion.js';

test('EGE scale covers every primary score from 0 through 33', () => {
  assert.equal(EGE_TEST_SCORE_SCALE.length, 34);
  EGE_TEST_SCORE_SCALE.forEach((expected, primary) => assert.equal(egeTestScore(primary), expected));
  assert.throws(() => egeTestScore(-1), RangeError);
  assert.throws(() => egeTestScore(34), RangeError);
  assert.throws(() => egeTestScore(1.5), RangeError);
});

test('OGE grade thresholds cover the full 0 through 31 range', () => {
  for (let primary = 0; primary <= 31; primary += 1) {
    const expected = primary >= 22 ? 5 : primary >= 15 ? 4 : primary >= 8 ? 3 : 2;
    assert.equal(ogeGradeMark(primary), expected, `primary=${primary}`);
  }
  assert.throws(() => ogeGradeMark(32), RangeError);
});

test('conversion enriches spreadsheet payloads without changing primary fields', () => {
  assert.deepEqual(convertedMockPayload('EGE_MATH', {
    primaryScore: 13,
    maxPrimaryScore: 13
  }), {
    primaryScore: 13,
    maxPrimaryScore: 13,
    testScore: 72
  });
  assert.deepEqual(convertedMockPayload('OGE_MATH', {
    primaryScore: 19,
    maxPrimaryScore: 19
  }), {
    primaryScore: 19,
    maxPrimaryScore: 19,
    gradeMark: 4
  });
});

test('student summaries distinguish provisional and finalized values through maxPrimary', () => {
  const provisional = convertedMockResult('EGE_MATH', { primary: 10, maxPrimary: 13 });
  assert.equal(provisional.testScore, 58);
  assert.equal(provisional.finalized, false);
  const final = convertedMockResult('OGE_MATH', { primaryScore: 22, maxPrimaryScore: 31 });
  assert.equal(final.gradeMark, 5);
  assert.equal(final.finalized, true);
  assert.equal(mockScoreSummary('EGE_MATH', { primaryScore: 20, maxPrimaryScore: 33, testScore: 86 }),
    '20 из 33 первичных · 86 тестовых');
  assert.equal(mockScoreSummary('OGE_MATH', { primaryScore: 22, maxPrimaryScore: 31, gradeMark: 5 }),
    '22 из 31 первичных · оценка 5');
  assert.equal(mockScoreSummary('EGE_MATH', { primaryScore: null }), '');
  assert.equal(mockScoreSummary('OGE_MATH', { primaryScore: '' }), '');
});
