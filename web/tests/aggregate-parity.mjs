/** Whole-output parity and a local CPU benchmark for the location-index optimization.
 * Run from web/: node tests/aggregate-parity.mjs
 * Git is used read-only to retrieve the exact pre-optimization implementation.
 * This measures aggregation CPU time, not browser frame rate.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { transform } from 'esbuild';

const web = fileURLToPath(new URL('..', import.meta.url));
const repo = path.dirname(web);
const baselineCommit = '31a25a3c8030dd69855437a7a8178d7aff3528e6';
const baselineSource = execFileSync('git', ['show', `${baselineCommit}:web/src/data.ts`], { cwd: repo, encoding: 'utf8' });
const optimizedSource = await readFile(path.join(web, 'src/data.ts'), 'utf8');
async function load(source) {
  const result = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  return (await import('data:text/javascript;base64,' + Buffer.from(result.code).toString('base64'))).aggregate;
}
const [baseline, optimized] = await Promise.all([load(baselineSource), load(optimizedSource)]);
const data = JSON.parse(await readFile(path.join(web, 'public/data/dashboard.json'), 'utf8'));
const full = ['2025-01-01', '2025-06-30', 'all', 'all'];
const months = [31, 28, 31, 30, 31, 30].map((days, i) => {
  const month = String(i + 1).padStart(2, '0');
  return [`2025-${month}-01`, `2025-${month}-${days}`, 'all', 'all'];
});
const scopes = [full, ...months,
  ['2025-02-07', '2025-05-16', 'all', 'all'],
  ['2025-06-30', '2025-06-30', 'all', 'all'],
  ['2025-01-01', '2025-01-01', 'all', 'all'],
  ['2024-01-01', '2024-12-31', 'all', 'all'],
  ['2025-06-30', '2025-01-01', 'all', 'all'],
  ['2025-01-01', '2025-06-30', 'unknown-zone', 'all'],
  ['2025-01-01', '2025-06-30', 'all', 'unknown-bank'],
  ...data.zones.map(zone => ['2025-01-01', '2025-06-30', zone.id || zone.zone_id, 'all']),
  ...data.banks.map(bank => ['2025-01-01', '2025-06-30', 'all', bank.id || bank.bank_id]),
];
for (const scope of scopes) assert.deepStrictEqual(optimized(data, ...scope), baseline(data, ...scope), scope.join('/'));

// Isolated histories verify duplicate IDs, missing IDs and strict equality semantics.
const locationIndex = data.dailyColumns.indexOf('location');
assert.ok(locationIndex >= 0, 'Real dataset supplies dated locations');
const row = [...data.daily[0]], id = row[locationIndex];
const firstLocation = data.locations.find(location => location.location_id === id);
assert.ok(firstLocation, 'Fixture uses an actual machine-day location');
const fixture = locations => ({ ...data, daily: [row], locations });
const duplicate = { ...firstLocation, x_m: -111, y_m: -222 };
const variants = [
  fixture([duplicate, firstLocation]),
  fixture([firstLocation, duplicate]),
  fixture([]),
  { ...fixture([{ ...firstLocation, location_id: NaN }]), daily: [row.map((value, i) => i === locationIndex ? NaN : value)] },
  { ...fixture([]), dailyColumns: data.dailyColumns.filter((_, i) => i !== locationIndex), daily: [row.filter((_, i) => i !== locationIndex)] },
];
for (const [index, variant] of variants.entries()) assert.deepStrictEqual(optimized(variant, ...full), baseline(variant, ...full), `location fixture ${index}`);
assert.equal(optimized(variants[0], ...full).machines[0].x, -111, 'Duplicate location IDs retain the first matching coordinate');

const benchmarkScopes = [full, ...months];
const run = implementation => {
  const started = performance.now();
  for (const scope of benchmarkScopes) implementation(data, ...scope);
  return performance.now() - started;
};
// Warm both implementations; alternate order to reduce first-run/order bias.
run(baseline); run(optimized);
const before = [], after = [];
for (let i = 0; i < 3; i++) {
  if (i % 2) { after.push(run(optimized)); before.push(run(baseline)); }
  else { before.push(run(baseline)); after.push(run(optimized)); }
}
const median = values => [...values].sort((a, b) => a - b)[1];
console.log(`PASS: exact whole-output parity for ${scopes.length} real-data scopes and ${variants.length} location edge cases.`);
console.log(JSON.stringify({
  runtime: process.version, baselineCommit, machineDays: data.daily.length,
  workload: 'full period plus all six monthly aggregates; warmed, three alternating rounds',
  baselineMs: before.map(value => +value.toFixed(2)), optimizedMs: after.map(value => +value.toFixed(2)),
  medianBaselineMs: +median(before).toFixed(2), medianOptimizedMs: +median(after).toFixed(2),
  medianSpeedup: +(median(before) / median(after)).toFixed(2),
}));
