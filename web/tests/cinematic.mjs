/** Focused cinematic lifecycle checks. Media decoding and pixel transitions need browser QA. */
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
      const media = film();
      if (media && !media.testPaused) {
        media.currentTime = Math.min(5.366667, media.currentTime + delta / 1000);
        if (media.currentTime >= 5.366667 && !media.testEnded) { media.testEnded = true; media.dispatchEvent(new w.Event('ended')); }
      }
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(clock));
      await flush();
    }
    await settle();
  }
  async function ready() {
    assert.ok(film(), 'Video mounted before readiness event');
    Object.defineProperty(film(), 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(film(), 'duration', { configurable: true, value: 5.366667 });
    film().dispatchEvent(new w.Event('canplay'));
    await settle();
  }
  async function click(name) { const button = label(name); assert.ok(button, `Control exists: ${name}`); button.focus(); button.click(); await settle(); }
  async function setHidden(value) { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); await settle(); }
  async function close() { w.unmountTest?.(); await settle(); assert.equal(errors.length, 0, errors.join('\n')); dom.window.close(); }
  return { w, dom, counts, frames, errors, section, label, film, advance, ready, click, setHidden, close,
    stats: () => ({ clock, plays, pauses, scrolls, fetches }),
    releaseData: async () => { assert.ok(resolveData, 'Dashboard fetch started before release'); resolveData({ ok: true, json: async () => data }); await settle(); },
  };
}
async function component(props = {}, settings = {}) {
  const env = environment(settings);
  env.w.eval(componentCode);
  env.w.mountCinema({ motionEnabled: true, src: 'media/test-film.mp4', poster: 'media/test-poster.png', ...props });
  await until(() => env.section(), 'Cinematic component mounts');
  await settle();
  return env;
}

// The opening reaches the dashboard using time alone. No scroll event is sent.
process.stdout.write('Checking automatic cinematic lifecycle...\n');
{
  const e = await component();
  assert.equal(e.film().getAttribute('src'), 'media/test-film.mp4', 'Relative offline media path is retained');
  assert.equal(e.film().muted, true, 'Autoplay is muted');
  assert.ok(e.film().hasAttribute('playsinline'), 'Mobile playback stays inline');
  await e.ready();
  await e.advance(5000); assert.equal(e.section().dataset.phase, 'film');
  await e.advance(800); assert.equal(e.section().dataset.phase, 'card');
  await e.advance(1700); assert.equal(e.section().dataset.phase, 'zoom');
  await e.advance(1000); assert.equal(e.section().dataset.phase, 'reveal');
  assert.equal(e.counts.reveal.length, 1, 'Hero reveal begins exactly once');
  assert.equal(e.counts.complete.length, 0, 'Reveal starts before completion');
  await e.advance(1300);
  assert.equal(e.counts.complete.length, 1, 'Automatic opening completes without scrolling');
  assert.ok(e.counts.complete[0] >= 9600 && e.counts.complete[0] <= 9700, 'Completion follows the 9.6-second active timeline');
  await e.advance(3000);
  assert.equal(e.counts.complete.length, 1, 'Finished frames cannot complete a second time');
  assert.equal(e.counts.reveal.length, 1, 'Finished frames cannot reveal a second time');
  assert.equal(e.stats().scrolls, 0, 'Component completion does not require or request scrolling');
  await e.close();
}

// Pause and hidden tabs freeze both media and the active-time clock; replay resets them.
{
  const e = await component(); await e.ready(); await e.advance(1800);
  await e.click('Pause cinematic introduction');
  const pausedProgress = Number(e.section().dataset.progress);
  assert.equal(e.film().testPaused, true, 'Pause control pauses the film');
  await e.advance(7000);
  assert.equal(Number(e.section().dataset.progress), pausedProgress, 'Paused wall time does not advance the story');
  await e.setHidden(true); await e.setHidden(false);
  assert.equal(e.section().dataset.paused, 'true', 'Visibility cannot override an explicit pause');
  await e.click('Play cinematic introduction'); await e.advance(120);
  assert.ok(Number(e.section().dataset.progress) > pausedProgress, 'Play resumes the active clock');
  await e.setHidden(true);
  const hiddenProgress = Number(e.section().dataset.progress);
  assert.equal(e.film().testPaused, true, 'Hidden tabs pause film');
  await e.advance(12000);
  assert.equal(Number(e.section().dataset.progress), hiddenProgress, 'Hidden wall time is excluded');
  await e.setHidden(false); await e.advance(100);
  assert.ok(Number(e.section().dataset.progress) - hiddenProgress < .02, 'Returning to the tab does not jump ahead');
  await e.click('Replay cinematic introduction');
  assert.equal(e.counts.replay, 1, 'Replay tells the shell to cover the hero again');
  assert.equal(Number(e.section().dataset.progress), 0, 'Replay resets the timeline');
  assert.equal(e.section().dataset.phase, 'film', 'Replay restores the first phase');
  assert.equal(e.film().currentTime, 0, 'Replay resets media time');
  await e.advance(9800);
  assert.equal(e.counts.complete.length, 1, 'Replayed run completes once');
  await e.close();
}

// Missing, failed, blocked and never-ready media all retain an automatic exit.
for (const kind of ['missing', 'error', 'blocked', 'never-ready']) {
  const e = await component({ src: kind === 'missing' ? '' : 'media/test-film.mp4' }, { rejectPlay: kind === 'blocked' });
  if (kind === 'error') { e.film().dispatchEvent(new e.w.Event('error')); await settle(); }
  if (kind === 'blocked') await e.ready();
  if (kind === 'never-ready') {
    await e.advance(1500);
    assert.equal(e.section().dataset.media, 'loading', 'A cold film receives a bounded startup grace');
    assert.equal(Number(e.section().dataset.progress), 0, 'Loading time does not consume the film timeline');
    await e.click('Pause cinematic introduction'); await e.advance(5000);
    assert.equal(e.section().dataset.media, 'loading', 'Manual pause suspends the startup grace');
    await e.click('Play cinematic introduction');
    await e.setHidden(true); await e.advance(5000); await e.setHidden(false);
    assert.equal(e.section().dataset.media, 'loading', 'Hidden time does not exhaust the startup grace');
    await e.advance(1500);
  }
  await until(() => e.section().dataset.media === 'fallback', `${kind} media selects the native fallback`);
  assert.ok(e.label('Skip cinematic introduction'), `${kind} media still permits immediate skip`);
  assert.notEqual(e.section().dataset.paused, 'true', `${kind} media does not trap the opening in a paused state`);
  await e.advance(10000);
  assert.equal(e.counts.complete.length, 1, `${kind} media completes automatically`);
  await e.close();
}

// Controls retain keyboard access, Escape, and cleanup independent of real media.
{
  const e = await component(); await e.ready(); await e.advance(300);
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
  const e = await component(); await e.ready();
  await e.click('Skip cinematic introduction'); assert.equal(e.counts.skip, 1, 'Visible skip button works immediately');
  const plays = e.stats().plays;
  e.w.unmountTest(); await settle();
  e.w.document.dispatchEvent(new e.w.Event('visibilitychange')); await e.advance(12000);
  assert.equal(e.stats().plays, plays, 'Unmount removes media visibility listeners');
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
  await e.click('Show cinematic introduction'); await e.ready();
  assert.equal(hero.dataset.motion, 'off', 'Hero entrance is held while the opening covers it');
  await e.advance(8500);
  assert.equal(underlay.dataset.cinema, 'revealing', 'Hero appears before the overlay unmounts');
  assert.equal(hero.dataset.motion, 'on', 'Hero motion begins during the reveal');
  assert.ok(underlay.hasAttribute('inert'), 'Controls remain covered until the transition completes');
  await e.click('Replay cinematic introduction');
  assert.equal(underlay.dataset.cinema, 'covered', 'Internal replay covers an already-revealing hero again');
  assert.equal(hero.dataset.motion, 'off', 'Internal replay resets hero motion');
  await e.advance(9800);
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
  const e = environment({ hash: '#evidence/q1-decomposition' }); e.w.eval(appCode);
  await until(() => e.w.document.querySelector('.app-shell'), 'Direct evidence route loads');
  assert.ok(e.section() === null, 'Analytical deep links bypass the opening');
  assert.equal(e.w.document.querySelector('.dashboard-underlay').dataset.cinema, 'ready');
  assert.equal(e.w.document.body.style.overflow, '', 'Bypassed opening does not lock scrolling');
  assert.equal(e.w.location.hash, '#evidence/q1-decomposition', 'The evidence anchor is preserved');
  await e.close();
}
process.stdout.write('PASS: automatic cinematic phases/completion, visible-time pause/replay, media fallbacks, keyboard/cleanup, reduced motion, pending-data handoff and direct-route bypass. Media decoding and pixel composition still require browser QA.\n');
