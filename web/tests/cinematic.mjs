/** Native deck lifecycle checks. Particle shaders and pixel transitions use browser QA. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(web, 'public/data/dashboard.json'), 'utf8'));
async function compile(contents) {
  const result = await build({ stdin: { contents, resolveDir: web, loader: 'tsx', sourcefile: 'cinematic-test-entry.tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
  return result.outputFiles[0].text;
}
const componentCode = await compile(`import React from 'react'; import {createRoot} from 'react-dom/client'; import CinematicOpening from './src/CinematicOpening';
  const root=createRoot(document.getElementById('root'));
  window.mountCinema=props=>root.render(<CinematicOpening {...props} onSkip={()=>window.calls.skip++} onComplete={()=>window.calls.complete.push(performance.now())} onRevealStart={()=>window.calls.reveal.push(performance.now())} onReplayStart={()=>window.calls.replay++}/>);
  window.unmountTest=()=>root.unmount();`);
const appCode = await compile(`import React from 'react'; import {createRoot} from 'react-dom/client'; import App from './src/App';
  const root=createRoot(document.getElementById('root')); window.unmountTest=()=>root.unmount(); root.render(<App/>);`);
const flush = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await flush(); await flush(); }
async function until(predicate, message) {
  for (let i = 0; i < 100 && !predicate(); i++) await flush();
  assert.ok(predicate(), message);
}
function environment({ hash = '', reduced = false, motionOff = false, pendingData = false, rejectPlay = false } = {}) {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' + hash, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  // React's scheduler and the fake-frame driver share host turns without real
  // Windows timer delays. Timers used by application behavior remain intact.
  w.setImmediate = (...args) => setImmediate(...args);
  w.clearImmediate = handle => clearImmediate(handle);
  let clock = 0, nextFrame = 1, hidden = false, plays = 0, pauses = 0, scrolls = 0, fetches = 0, resolveData;
  const frames = new Map();
  const counts = { skip: 0, complete: [], reveal: [], replay: 0 };
  w.calls = counts;
  Object.defineProperty(w.performance, 'now', { configurable: true, value: () => clock });
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => hidden });
  w.requestAnimationFrame = callback => { const id = nextFrame++; frames.set(id, callback); return id; };
  w.cancelAnimationFrame = id => frames.delete(id);
  w.scrollTo = () => { scrolls++; };
  w.HTMLElement.prototype.scrollIntoView = () => { scrolls++; };
  w.HTMLElement.prototype.scrollTo = () => {};
  w.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe(element) { this.callback([{ target: element, contentRect: { width: 1000, height: 400 } }]); } disconnect() {} };
  w.HTMLMediaElement.prototype.play = function () {
    plays++;
    if (rejectPlay) return Promise.reject(new w.DOMException('Autoplay denied in test', 'NotAllowedError'));
    this.testPaused = false;
    return Promise.resolve();
  };
  w.HTMLMediaElement.prototype.pause = function () { pauses++; this.testPaused = true; };
  w.fetch = () => { fetches++; return pendingData ? new Promise(resolve => { resolveData = resolve; }) : Promise.resolve({ ok: true, json: async () => data }); };
  if (motionOff) w.localStorage.setItem('gilded-ace-motion', 'off');
  w.addEventListener('error', event => errors.push(event.error?.stack || event.message));
  const section = () => w.document.querySelector('.cinema-opening');
  const label = name => w.document.querySelector(`[aria-label="${name}"]`);
  const film = () => w.document.querySelector('video');
  async function advance(milliseconds) {
    let remaining = milliseconds;
    while (remaining > 0) {
      if (!frames.size) { clock += remaining; remaining = 0; break; }
      const delta = Math.min(50, remaining); remaining -= delta; clock += delta;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(clock));
      await flush();
    }
    await settle();
  }
  async function click(name) { const button = label(name); assert.ok(button, `Control exists: ${name}`); button.focus(); button.click(); await settle(); }
  async function setHidden(value) { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); await settle(); }
  async function close() { w.unmountTest?.(); await settle(); assert.equal(errors.length, 0, errors.join('\n')); dom.window.close(); }
  return { w, dom, counts, frames, errors, section, label, film, advance, click, setHidden, close,
    stats: () => ({ clock, plays, pauses, scrolls, fetches }),
    releaseData: async () => { assert.ok(resolveData, 'Dashboard fetch started before release'); resolveData({ ok: true, json: async () => data }); await settle(); },
  };
}
async function component(props = {}, settings = {}) {
  const env = environment(settings);
  env.w.eval(componentCode);
  env.w.mountCinema({ motionEnabled: true, ...props });
  await until(() => env.section(), 'Cinematic component mounts');
  await settle();
  return env;
}

// The opening reaches the dashboard using time alone. No scroll event is sent.
process.stdout.write('Checking automatic cinematic lifecycle...\n');
{
  const e = await component();
  assert.ok(e.film() === null, 'Native deck never mounts or requests video');
  assert.ok(!e.section().textContent.includes('Skip to dashboard'), 'Prominent skip text is removed');
  await e.advance(900); assert.equal(e.section().dataset.phase, 'deal');
  await e.advance(1000); assert.equal(e.section().dataset.phase, 'ace');
  await e.advance(1300); assert.equal(e.section().dataset.phase, 'zoom');
  await e.advance(450); assert.equal(e.section().dataset.phase, 'reveal');
  assert.equal(e.counts.reveal.length, 1, 'Hero reveal begins exactly once');
  assert.equal(e.counts.complete.length, 0, 'Reveal starts before completion');
  await e.advance(1250);
  assert.equal(e.counts.complete.length, 1, 'Automatic opening completes without scrolling');
  assert.ok(e.counts.complete[0] >= 4800 && e.counts.complete[0] <= 4900, 'Completion follows the 4.8-second active timeline without startup waiting');
  await e.advance(3000);
  assert.equal(e.counts.complete.length, 1, 'Finished frames cannot complete a second time');
  assert.equal(e.counts.reveal.length, 1, 'Finished frames cannot reveal a second time');
  assert.equal(e.stats().scrolls, 0, 'Component completion does not require or request scrolling');
  await e.close();
}

// Pause and hidden tabs freeze the active-time clock; replay resets it.
{
  const e = await component(); await e.advance(1800);
  await e.click('Pause cinematic introduction');
  const pausedProgress = Number(e.section().dataset.progress);
  await e.advance(7000);
  assert.equal(Number(e.section().dataset.progress), pausedProgress, 'Paused wall time does not advance the story');
  await e.setHidden(true); await e.setHidden(false);
  assert.equal(e.section().dataset.paused, 'true', 'Visibility cannot override an explicit pause');
  await e.click('Play cinematic introduction'); await e.advance(120);
  assert.ok(Number(e.section().dataset.progress) > pausedProgress, 'Play resumes the active clock');
  await e.setHidden(true);
  const hiddenProgress = Number(e.section().dataset.progress);
  await e.advance(12000);
  assert.equal(Number(e.section().dataset.progress), hiddenProgress, 'Hidden wall time is excluded');
  await e.setHidden(false); await e.advance(100);
  assert.ok(Number(e.section().dataset.progress) - hiddenProgress < .03, 'Returning to the tab does not jump ahead');
  await e.click('Replay cinematic introduction');
  assert.equal(e.counts.replay, 1, 'Replay tells the shell to cover the hero again');
  assert.equal(Number(e.section().dataset.progress), 0, 'Replay resets the timeline');
  assert.equal(e.section().dataset.phase, 'deal', 'Replay restores the first phase');
  await e.advance(5000);
  assert.equal(e.counts.complete.length, 1, 'Replayed run completes once');
  await e.close();
}

// Native rendering works without media APIs and still offers a bounded exit.
{
  const e = await component({}, { rejectPlay: true });
  assert.ok(e.label('Skip cinematic introduction'), 'Subtle close control permits immediate entry');
  await e.advance(5000);
  assert.equal(e.counts.complete.length, 1, 'Opening completes with no video capability');
  assert.equal(e.stats().plays, 0, 'No autoplay or external media dependency');
  await e.close();
}

// Controls retain keyboard access, Escape, and complete cleanup.
{
  const e = await component(); await e.advance(300);
  const buttons = [...e.section().querySelectorAll('button:not(:disabled)')];
  const first = buttons[0], last = buttons.at(-1);
  last.focus(); e.w.document.dispatchEvent(new e.w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.ok(e.w.document.activeElement === first, 'Tab wraps inside the cinematic controls');
  first.focus(); e.w.document.dispatchEvent(new e.w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.ok(e.w.document.activeElement === last, 'Shift+Tab wraps backwards');
  e.w.document.dispatchEvent(new e.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await settle(); assert.equal(e.counts.skip, 1, 'Escape skips the opening');
  await e.close();
  assert.equal(e.frames.size, 0, 'Unmount cancels every cinematic frame');
}
{
  const e = await component();
  await e.click('Skip cinematic introduction'); assert.equal(e.counts.skip, 1, 'Visible skip button works immediately');
  const plays = e.stats().plays;
  e.w.unmountTest(); await settle();
  e.w.document.dispatchEvent(new e.w.Event('visibilitychange')); await e.advance(12000);
  assert.equal(e.stats().plays, plays, 'Unmount never starts external media');
  assert.equal(e.counts.complete.length, 0, 'Unmount prevents a delayed completion');
  assert.equal(e.frames.size, 0, 'Unmount leaves no cinematic animation frame');
  assert.equal(e.errors.length, 0, e.errors.join('\n'));
  e.dom.window.close();
}
for (const settings of [{ props: { motionEnabled: false } }, { reduced: true }]) {
  const e = await component(settings.props, settings);
  await until(() => e.counts.complete.length === 1, 'Reduced motion completes without waiting through the zoom');
  assert.ok(e.film() === null, 'Reduced motion does not mount moving video');
  await e.advance(12000);
  assert.equal(e.counts.complete.length, 1, 'Reduced-motion completion remains idempotent');
  await e.close();
}

// One shell instance verifies pending-data focus, a full reveal, replay, and routing.
process.stdout.write('Checking dashboard handoff and deep-link behavior...\n');
{
  const e = environment({ pendingData: true }); e.w.eval(appCode);
  await until(() => e.section() && e.w.document.querySelector('.loading-screen'), 'Home opens cinema while its data request is pending');
  assert.equal(e.stats().fetches, 1, 'Dashboard fetch starts behind the opening');
  const underlay = e.w.document.querySelector('.dashboard-underlay');
  const loadingMain = e.w.document.getElementById('main-content');
  assert.equal(underlay.dataset.cinema, 'covered');
  assert.ok(underlay.hasAttribute('inert'), 'Covered analytics are not keyboard targets');
  assert.equal(e.w.document.body.style.overflow, 'hidden', 'Opening locks the page without a scroll runway');
  await e.click('Skip cinematic introduction'); await e.advance(100);
  assert.ok(e.section() === null, 'Skip releases the opening even while data is pending');
  assert.ok(e.w.document.activeElement === loadingMain, 'Skip focuses the mounted loading main');
  assert.equal(e.w.document.body.style.overflow, '', 'Skip restores body scrolling');
  await e.releaseData();
  await until(() => e.w.document.querySelector('.ace-overview'), 'Delayed data replaces the loading UI');
  await e.advance(100);
  const actualMain = e.w.document.getElementById('main-content');
  const hero = e.w.document.querySelector('.ace-overview');
  assert.ok(actualMain !== loadingMain, 'The loaded dashboard replaces the loading main');
  assert.ok(e.w.document.activeElement === actualMain, `Late data restores focus instead of leaving it on ${e.w.document.activeElement.tagName}#${e.w.document.activeElement.id}`);
  await e.click('Show cinematic introduction');
  assert.equal(hero.dataset.motion, 'off', 'Hero entrance is held while the opening covers it');
  await e.advance(3800);
  assert.equal(underlay.dataset.cinema, 'revealing', 'Hero appears before the overlay unmounts');
  assert.equal(hero.dataset.motion, 'on', 'Hero motion begins during the reveal');
  assert.ok(underlay.hasAttribute('inert'), 'Controls remain covered until the transition completes');
  await e.click('Replay cinematic introduction');
  assert.equal(underlay.dataset.cinema, 'covered', 'Internal replay covers an already-revealing hero again');
  assert.equal(hero.dataset.motion, 'off', 'Internal replay resets hero motion');
  await e.advance(5000);
  assert.ok(e.section() === null, 'Automatic completion removes the opening');
  assert.equal(underlay.dataset.cinema, 'ready');
  assert.equal(underlay.hasAttribute('inert'), false, 'Completion restores dashboard interaction');
  assert.equal(e.w.document.body.style.overflow, '', 'Completion restores body scrolling');
  assert.ok(e.w.document.activeElement === actualMain, 'Automatic completion transfers focus to the dashboard');
  assert.ok(e.w.document.querySelector('.ace-overview') === hero, 'Replay and handoff preserve the loaded dashboard instance');
  await e.click('Show cinematic introduction');
  e.w.location.hash = 'model'; await settle();
  await until(() => !e.section(), 'An analytical route dismisses the unfinished opening');
  await e.advance(100);
  assert.equal(underlay.hasAttribute('inert'), false);
  assert.equal(e.w.document.body.style.overflow, '');
  assert.equal(e.w.document.activeElement.id, 'main-content', 'Route dismissal moves focus out of the removed opening');
  await e.advance(12000);
  assert.equal(e.w.location.hash, '#model', 'Old cinematic timers cannot override navigation');
  await e.close();
}
{
  const e = environment({ pendingData: true }); e.w.eval(appCode);
  await until(() => e.section(), 'The opening mounts before slow dashboard data');
  await e.advance(5000);
  assert.ok(e.section() === null, 'Automatic completion is independent of a slow data request');
  assert.ok(e.w.document.activeElement === e.w.document.getElementById('main-content'), 'Automatic exit focuses the loading main');
  await e.releaseData();
  await until(() => e.w.document.querySelector('.ace-overview'), 'Slow data eventually renders the hero');
  await e.advance(100);
  assert.ok(e.w.document.activeElement === e.w.document.getElementById('main-content'), 'Focus follows the loaded dashboard after automatic entry');
  await e.close();
}
{
  const e = environment({ hash: '#evidence/q1-decomposition' }); e.w.eval(appCode);
  await until(() => e.w.document.querySelector('.app-shell'), 'Direct evidence route loads');
  assert.ok(e.section() === null, 'Analytical deep links bypass the opening');
  assert.equal(e.w.document.querySelector('.dashboard-underlay').dataset.cinema, 'ready');
  assert.equal(e.w.document.body.style.overflow, '', 'Bypassed opening does not lock scrolling');
  assert.equal(e.w.location.hash, '#evidence/q1-decomposition', 'The evidence anchor is preserved');
  await e.close();
}
process.stdout.write('PASS: 4.8s native deck phases/completion, pause/replay, zero video dependency, keyboard/cleanup, reduced motion, pending-data handoff and direct-route bypass. Particle rendering and pixel composition also require browser QA.\n');
