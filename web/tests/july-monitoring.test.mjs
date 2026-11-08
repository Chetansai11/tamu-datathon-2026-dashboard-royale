import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateJulyScenario } from '../src/july-monitoring.mjs';

const plan = { policy: { consecutive_review_days: 2 }, daily: Array.from({ length: 5 }, (_, i) => ({ date: `2025-07-0${i + 1}`, watch_below: 100.25, watch_above: 200.75, prediction: 150.50, actual: null })) };
test('missing July observations remain missing; zero is a real scenario value', () => {
  const rows = evaluateJulyScenario(plan, { '2025-07-01': '0' });
  assert.equal(rows[0].actual, 0); assert.equal(rows[0].status, 'watch');
  assert.equal(rows[1].actual, null); assert.equal(rows[1].status, 'awaiting_data');
  assert.ok(plan.daily.every(r => r.actual === null), 'Source observations are never mutated');
});
test('exact cents thresholds are inside; one cent beyond is a watch', () => {
  const rows = evaluateJulyScenario(plan, { '2025-07-01': '100.25', '2025-07-02': '200.75', '2025-07-03': '100.24', '2025-07-04': '200.76' });
  assert.deepEqual(rows.map(r => r.status), ['within_band', 'within_band', 'watch', 'watch', 'awaiting_data']);
});
test('review needs consecutive same-direction dates; missing resets and reversal restarts', () => {
  const input = { '2025-07-01': '99', '2025-07-02': '99', '2025-07-04': '99', '2025-07-05': '201' };
  const rows = evaluateJulyScenario(plan, input);
  assert.deepEqual(rows.map(r => r.status), ['watch', 'review', 'awaiting_data', 'watch', 'watch']);
  assert.deepEqual(rows.map(r => r.consecutive_breaches), [1, 2, 0, 1, 1]);
  input['2025-07-04'] = '201';
  assert.equal(evaluateJulyScenario(plan, input)[4].status, 'review');
});
test('negative, fractional-cent, nonfinite and unsafe amounts cannot create alerts', () => {
  for (const value of ['-1', 'NaN', 'Infinity', '1e309', '100.251', '90071992547409999']) {
    const rows = evaluateJulyScenario(plan, { '2025-07-01': '99', '2025-07-02': value, '2025-07-03': '99' });
    assert.equal(rows[1].status, 'invalid', value);
    assert.equal(rows[1].actual, null);
    assert.equal(rows[2].status, 'watch');
  }
});
