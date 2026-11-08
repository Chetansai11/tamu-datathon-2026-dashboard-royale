/** Evaluate illustrative inputs only. Never fill missing July observations. */
export function evaluateJulyScenario(plan, inputs = {}) {
  let previousDirection = null, streak = 0;
  return plan.daily.map(day => {
    const raw = String(inputs[day.date] ?? '').trim();
    const actual = raw === '' ? null : Number(raw);
    const invalid = raw !== '' && (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(actual) || !Number.isSafeInteger(Math.round(actual * 100)));
    const direction = actual == null || invalid ? null : actual < day.watch_below ? 'below' : actual > day.watch_above ? 'above' : null;
    streak = direction ? direction === previousDirection ? streak + 1 : 1 : 0;
    previousDirection = direction;
    return { ...day, actual: invalid ? null : actual, direction, consecutive_breaches: streak,
      status: invalid ? 'invalid' : actual == null ? 'awaiting_data' : !direction ? 'within_band' : streak >= plan.policy.consecutive_review_days ? 'review' : 'watch' };
  });
}
