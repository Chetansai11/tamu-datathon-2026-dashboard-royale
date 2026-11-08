/** Verify real split build artifacts and execute the packaged offline edition. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(web, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
const entry = Object.keys(manifest).find(k => manifest[k].isEntry);
assert.ok(entry, 'Vite records an entry');
const initial = new Set();
function collect(key) {
  if (initial.has(key)) return;
  assert.ok(manifest[key], `Manifest import exists: ${key}`);
  initial.add(key); (manifest[key].imports || []).forEach(collect);
}
collect(entry);
for (const [key, chunk] of Object.entries(manifest)) {
  assert.ok(fs.existsSync(path.join(dist, chunk.file)), `Built asset exists: ${key}`);
  for (const dependency of [...(chunk.imports || []), ...(chunk.dynamicImports || [])]) assert.ok(manifest[dependency], `Referenced chunk exists: ${dependency}`);
  for (const asset of [...(chunk.css || []), ...(chunk.assets || [])]) assert.ok(fs.existsSync(path.join(dist, asset)), `Referenced asset exists: ${asset}`);
}
const deferred = ['GuestView', 'PlacementLab', 'ActionStudio', 'Evidence', 'ForecastValidation'];
for (const name of deferred) {
  const key = Object.keys(manifest).find(k => k.endsWith(`/${name}.tsx`));
  assert.ok(key && manifest[key].isDynamicEntry, `${name} is loaded on demand`);
  assert.ok(!initial.has(key), `${name} is absent from the initial import graph`);
}
const jsFiles = fs.readdirSync(path.join(dist, 'assets')).filter(n => n.endsWith('.js'));
const largest = Math.max(...jsFiles.map(n => fs.statSync(path.join(dist, 'assets', n)).size));
assert.ok(largest < 500_000, `No JS chunk exceeds 500 kB; largest=${largest}`);
const initialFiles = [...initial].map(k => manifest[k].file);
const initialBytes = initialFiles.reduce((sum, f) => sum + fs.statSync(path.join(dist, f)).size, 0);
const initialGzipBytes = initialFiles.reduce((sum, f) => sum + gzipSync(fs.readFileSync(path.join(dist, f))).length, 0);
assert.ok(initialBytes < 784_710, 'Initial dependency graph is smaller than the previous local monolith');

const html = fs.readFileSync(path.join(dist, 'offline.html'), 'utf8');
assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="modulepreload"/i, 'Offline script has no external chunk dependency');
const errors = [], requests = [], downloads = [], blobs = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
class NoNetwork extends ResourceLoader { fetch(url) { requests.push(url); return null; } }
const dom = new JSDOM(html, {
  url: pathToFileURL(path.join(dist, 'offline.html')).href + '#model/july-monitoring',
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, resources: new NoNetwork(),
  beforeParse(w) {
    w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
    w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.fetch = url => { requests.push(url); throw new Error('Offline edition must not fetch'); };
    w.URL.createObjectURL = blob => { blobs.push(blob); return 'blob:offline-test'; };
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function() { downloads.push(this.download); };
    w.addEventListener('error', e => errors.push(e.error?.stack || e.message));
  },
});
const w = dom.window;
const wait = () => new Promise(r => setTimeout(r, 35));
async function until(predicate, label) { const deadline = Date.now() + 10000; while (!predicate() && Date.now() < deadline) await wait(); assert.ok(predicate(), label); }
const button = label => [...w.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
async function click(label) { assert.ok(button(label), `Button exists: ${label}`); button(label).click(); await wait(); }
async function input(date, value) {
  const el = w.document.querySelector(`[aria-label="Scenario wagers ${date}"]`);
  assert.ok(el);
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new w.Event('input', { bubbles: true })); await wait();
}
const states = () => [...w.document.querySelectorAll('[data-alert-status]')].map(el => el.dataset.alertStatus);
await until(() => w.document.querySelector('#july-monitoring'), 'Built offline deep link loads July monitoring');
assert.equal(w.document.querySelectorAll('[data-alert-status]').length, 7);
assert.ok(states().every(s => s === 'awaiting_data'), 'No July observations invented');
const data = JSON.parse(w.document.getElementById('dashboard-payload').textContent);
const plan = data.reports.forecast.july_monitoring;
await input('2025-07-01', String(plan.daily[0].watch_below - 1));
await input('2025-07-02', String(plan.daily[1].watch_below - 1));
assert.deepEqual(states().slice(0, 2), ['watch', 'review']);
await input('2025-07-01', ''); assert.equal(states()[1], 'watch', 'Missing previous day resets review');
await input('2025-07-02', String(plan.daily[1].watch_below)); assert.equal(states()[1], 'within_band', 'Displayed cents boundary matches comparison');
await click('Show all 30 July days'); assert.equal(states().length, 30);
await click('Clear scenario'); assert.ok(states().every(s => s === 'awaiting_data'));
await click('Download July plan'); assert.equal(downloads.at(-1), 'gilded-ace-july-monitoring.csv');
const csv = await new Promise(resolve => { const reader = new w.FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blobs.at(-1)); });
assert.ok(csv.includes('2025-07-30') && csv.includes('1039944.06'), 'Export includes complete July and exact thresholds');

for (const [label, selector] of [['Guests & comps', '[aria-label="Guest group"]'], ['Placement Lab', '#placement-machine'], ['Action studio', '.decision-space'], ['Evidence', '#claim-forecast-july-monitoring']]) {
  await click(label); await until(() => w.document.querySelector(selector), `Offline lazy route works: ${label}`);
}
await click('Action studio'); await until(() => button('View July forecast'), 'Action plan loads');
await click('View July forecast'); await until(() => w.document.querySelector('#july-monitoring'), 'Action plan reaches its actual July forecast');
assert.equal(w.location.hash, '#model/july-monitoring');
assert.ok(JSON.parse(w.document.getElementById('dashboard-payload').textContent).reports.forecast.july_monitoring.daily.every(r => r.actual === null), 'Scenario inputs leave source payload unchanged');
assert.deepEqual(requests, [], 'Offline route navigation makes no network requests');
assert.deepEqual(errors, [], 'Actual release has no runtime errors');
dom.window.close();
const result = { chunks: jsFiles.length, largest_chunk_bytes: largest, initial_js_bytes: initialBytes, initial_js_gzip_bytes: initialGzipBytes, deferred_routes: deferred, offline_runtime: 'passed', july_alert_ui_and_export: 'passed', network_requests: requests.length };
fs.mkdirSync(path.join(web, 'test-output'), { recursive: true });
fs.writeFileSync(path.join(web, 'test-output/release.json'), JSON.stringify(result, null, 2));
console.log('PASS split artifacts, actual offline routes, July inputs/thresholds/export:', JSON.stringify(result));
