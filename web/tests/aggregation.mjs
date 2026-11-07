/** Independent numerical regression for the filtered dashboard, without a browser.
 * Run: node tests/aggregation.mjs [path/to/dashboard.json]
 * Uses independent direct-row reductions, published property totals and hourly
 * report totals. Does not import implementation helper functions besides aggregate.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { transform } from 'esbuild';

const app = fileURLToPath(new URL('..', import.meta.url));
const input = process.argv[2] ? path.resolve(process.argv[2]) : path.join(app, 'public/data/dashboard.json');
const source = await readFile(path.join(app, 'src/data.ts'), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
const { aggregate, percent } = await import('data:text/javascript;base64,' + Buffer.from(compiled.code).toString('base64'));
const data = JSON.parse(await readFile(input, 'utf8'));
const names = data.dailyColumns;
const rows = data.daily.map(row => Object.fromEntries(names.map((name, index) => [name, name === 'date' ? data.dates[row[index]] : row[index]])));
let passed = 0;
function near(actual, expected, tolerance = 1e-6, label = '') {
  assert.ok(Number.isFinite(actual), `${label}: non-finite actual ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} (tolerance ${tolerance})`);
  passed++;
}
const total = (selected, name) => selected.reduce((acc, row) => acc + Number(row[name] || 0), 0);
const rawScope = (start, end, zone, bank) => rows.filter(row => row.date >= start && row.date <= end && (zone === 'all' || row.zone === zone) && (bank === 'all' || row.bank === bank));
function verify(start, end, zone = 'all', bank = 'all') {
  const selected = rawScope(start, end, zone, bank);
  const actual = aggregate(data, start, end, zone, bank);
  const count = new Set(selected.map(row => row.machine)).size;
  assert.equal(actual.totals.count, selected.length); passed++;
  assert.equal(actual.totals.machines, count); passed++;
  for (const field of ['coin', 'payout', 'win', 'theo', 'available', 'scheduled', 'occupied', 'variance', 'cardedCoin']) {
    const expected = total(selected, field);
    near(actual.totals[field], expected, .0001 + Math.abs(expected) * 1e-13, `${start}/${end}/${zone}/${bank}/${field}`);
  }
  const wagers = total(selected, 'coin');
  if (wagers) near(actual.totals.hold, total(selected, 'win') / wagers, 1e-10, 'weighted hold');
  else { assert.ok(Number.isNaN(actual.totals.hold)); assert.equal(percent(actual.totals.hold), '—'); passed += 2; }
  const scheduled = total(selected, 'scheduled');
  if (scheduled) near(actual.totals.availability, total(selected, 'available') / scheduled, 1e-10, 'weighted availability');
  else { assert.ok(Number.isNaN(actual.totals.availability)); assert.equal(percent(actual.totals.availability), '—'); passed += 2; }
  const hourly = data.reports.q3.daily_bank.filter(row => row.gaming_date.slice(0, 10) >= start && row.gaming_date.slice(0, 10) <= end && (zone === 'all' || row.zone_id === zone) && (bank === 'all' || row.bank_id === bank));
  if (hourly.length) near(actual.totals.lostTheo, total(hourly, 'lost_theo'), .0001, 'hourly lost theo');
  for (const machine of actual.machines) {
    const history = selected.filter(row => row.machine === machine.index).sort((a, b) => a.date.localeCompare(b.date));
    const latest = history.at(-1);
    assert.equal(machine.days, history.length); passed++;
    assert.equal(machine.zone, latest.zone); passed++;
    assert.equal(machine.bank, latest.bank); passed++;
    if (latest.location != null) {
      assert.equal(machine.location, latest.location, `${machine.id} selected-period location`); passed++;
      const location = data.locations.find(loc => loc.location_id === latest.location);
      near(machine.x, location.x_m, 1e-10, 'dated x');
      near(machine.y, location.y_m, 1e-10, 'dated y');
    }
  }
  return actual;
}

const full = verify('2025-01-01', '2025-06-30');
near(full.totals.coin, data.facts.totalCoin, .01, 'published floor coin');
near(full.totals.win, data.facts.totalWin, .01, 'published floor win');
near(full.totals.lostTheo, data.reports.q3.summary.lost_theo, .001, 'canonical hourly loss');

// All 181 property days reconcile. Rounding of compact theo/hour fields is at
// most 0.0005 per machine-day, so the per-day tolerance is bounded explicitly.
for (const day of data.propertyDaily) {
  const view = aggregate(data, day.date, day.date, 'all', 'all');
  for (const key of ['coin', 'payout', 'win']) near(view.totals[key], day[key], .001, `${day.date} property ${key}`);
  const tolerance = view.totals.count * .0005 + .00001;
  for (const key of ['theo', 'available', 'occupied']) near(view.totals[key], day[key], tolerance, `${day.date} property ${key}`);
}
for (const [start, end] of [['2025-01-01', '2025-01-31'], ['2025-03-01', '2025-03-31'], ['2025-05-01', '2025-06-30']]) {
  for (const zone of data.zones) verify(start, end, zone.id);
}
for (const bank of data.banks) verify('2025-03-03', '2025-04-06', bank.zone, bank.id);

// Every actual move receives a regression before and after the move. Coordinates
// must follow placement at that date rather than the final June position.
assert.ok(names.includes('location'), 'daily placement column is required for historical maps'); passed++;
const movement = new Map();
for (const row of rows) {
  const history = movement.get(row.machine) || [];
  if (!history.length || history.at(-1).location !== row.location) history.push(row);
  movement.set(row.machine, history);
}
let moved = 0;
for (const [index, history] of movement) {
  if (history.length < 2) continue;
  moved++;
  for (const row of history) {
    const view = verify(row.date, row.date, row.zone, row.bank);
    assert.equal(view.machines.find(machine => machine.index === index).location, row.location); passed++;
  }
}
assert.ok(moved > 0, 'Official fixture contains moved machines'); passed++;

const empty = verify('2025-08-01', '2025-08-02');
assert.equal(empty.machines.length, 0); passed++;
assert.equal(empty.series.length, 0); passed++;
verify('2025-01-01', '2025-06-30', 'Z-NOT-A-ZONE');
const dst = verify('2025-03-08', '2025-03-08');
near(dst.totals.scheduled, dst.totals.machines * 23, 1e-8, 'DST scheduled hours');

// Deliberately unbalanced two-day fixture catches averaging daily ratios.
const fixture = {
  dates: ['2025-01-01', '2025-01-02'], dailyColumns: names,
  machines: [{ id: 'weighted', zone: 'Z', bank: 'B', location: 'L', x: 1, y: 2 }],
  locations: [{ location_id: 'L', x_m: 1, y_m: 2 }],
  daily: [
    { date: 0, machine: 0, zone: 'Z', bank: 'B', coin: 1, payout: 0, win: 1, theo: .1, available: 1, scheduled: 2, occupied: .5, variance: 1, location: 'L' },
    { date: 1, machine: 0, zone: 'Z', bank: 'B', coin: 100, payout: 100, win: 0, theo: 10, available: 24, scheduled: 24, occupied: 12, variance: 1, location: 'L' },
  ].map(row => names.map(name => row[name] ?? 0)),
};
const weighted = aggregate(fixture, '2025-01-01', '2025-01-02', 'all', 'all');
near(weighted.totals.hold, 1 / 101, 1e-12, 'ratio-of-sums hold fixture');
near(weighted.totals.availability, 25 / 26, 1e-12, 'ratio-of-sums availability fixture');
console.log(`PASS ${passed.toLocaleString()} numerical/placement assertions; 181 property days, 21 zone windows, ${data.banks.length} banks, ${moved} moved machines, DST and empty scope.`);
