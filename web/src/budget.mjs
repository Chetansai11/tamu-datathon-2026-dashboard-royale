export const HORIZON_DAYS = 30;
export const BUDGET = 100000;
export function actionCost(action, quantity = 1, additionalCompCost = 0) {
  const benefitDays = Math.max(0, HORIZON_DAYS - Number(action.lead_days));
  return quantity * (Number(action.unit_cost_cents) + Number(action.recurring_cost_cents_per_day) * benefitDays) / 100 + additionalCompCost;
}
export function validatePortfolio(items) {
  const errors = [];
  const funded = items.filter(x => x.action.action_type_id !== 'A-HOLD');
  if (funded.length > 3) errors.push('Choose no more than three action types.');
  const cost = items.reduce((sum, x) => sum + actionCost(x.action, x.quantity, x.extraComp || 0), 0);
  if (cost > BUDGET) errors.push('The portfolio exceeds the $100,000 budget.');
  const machineTargets = new Set();
  let compPolicies = 0;
  for (const item of funded) {
    const a = item.action;
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > Number(a.quantity_limit)) errors.push(`${a.name}: quantity is outside the catalog limit.`);
    if (!Number.isFinite(item.extraComp ?? 0) || (item.extraComp ?? 0) < 0) errors.push('Additional comp allowance must be finite and nonnegative.');
    if (['machine', 'manufacturer', 'zone', 'bank', 'technician_shift'].includes(a.unit) && item.targets.length !== item.quantity) errors.push(`${a.name}: assign ${item.quantity} distinct target${item.quantity === 1 ? '' : 's'}.`);
    if (new Set(item.targets).size !== item.targets.length) errors.push(`${a.name}: targets must be distinct.`);
    if (a.incompatibility_group === 'comp_policy') compPolicies++;
    if (a.incompatibility_group === 'same_machine') {
      for (const target of item.affectedMachines || item.targets) {
        if (machineTargets.has(target)) errors.push(`${target} has conflicting move or replacement actions.`);
        machineTargets.add(target);
      }
    }
  }
  if (compPolicies > 1) errors.push('The comp pilot and floor-wide comp change cannot be combined.');
  return { cost, remaining: BUDGET - cost, errors: [...new Set(errors)], valid: errors.length === 0, actionCount: funded.length };
}
