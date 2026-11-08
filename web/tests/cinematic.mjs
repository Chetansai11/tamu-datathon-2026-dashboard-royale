/** Focused component checks; jsdom media is mocked, not a browser decoding test. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import CinematicOpening from './src/CinematicOpening';
      const root=createRoot(document.getElementById('root'));
      window.mountCinema=props=>root.render(React.createElement(CinematicOpening,{...props,onSkip:()=>window.skips++}));
      window.unmountCinema=()=>root.unmount();`,
    resolveDir: web, loader: 'tsx', sourcefile: 'cinematic-test-entry.tsx',
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
});
const errors = [];
const console = new VirtualConsole();
console.on('jsdomError', error => errors.push(error.message));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console,
});
const w = dom.window;
let scrolled = 0, hidden = false, plays = 0, pauses = 0, scrollRequests = 0;
const observers = [];
w.skips = 0;
w.addEventListener('error', event => errors.push(event.error?.stack || event.message));
Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => hidden });
Object.defineProperty(w.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() {
  return this.classList.contains('cinema-opening') ? 1800 : this.classList.contains('cinema-stage') ? 900 : 0;
} });
w.HTMLElement.prototype.getBoundingClientRect = function () {
  const top = this.classList.contains('cinema-opening') ? 16 - scrolled : 16;
  return { x: 0, y: top, top, left: 0, width: 1200, height: this.offsetHeight, bottom: top + this.offsetHeight, right: 1200, toJSON() {} };
};
w.HTMLElement.prototype.scrollIntoView = function () {
  scrollRequests++; scrolled = 0; w.dispatchEvent(new w.Event('scroll'));
};
w.HTMLMediaElement.prototype.play = function () { plays++; this.testPaused = false; return Promise.resolve(); };
w.HTMLMediaElement.prototype.pause = function () { pauses++; this.testPaused = true; };
w.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
  observe(element) { this.element = element; }
  disconnect() { this.disconnected = true; }
};
w.eval(compiled.outputFiles[0].text);
const section = () => w.document.querySelector('.cinema-opening');
const button = label => w.document.querySelector(`[aria-label="${label}"]`);
const film = () => w.document.querySelector('video');
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
async function until(predicate, message) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await settle();
  assert.ok(predicate(), message);
}
async function mount(props) { w.mountCinema(props); await settle(); }
async function scrollTo(progress) { scrolled = progress * 900; w.dispatchEvent(new w.Event('scroll')); await settle(); }
function visible(value) { const active = observers.filter(observer => !observer.disconnected).at(-1); assert.ok(active, 'Media visibility observer exists'); active.callback([{ isIntersecting: value }]); }
function expectChapter(index) {
  assert.equal(section().dataset.beat, String(index), 'Scroll selects the appropriate story chapter');
  [...w.document.querySelectorAll('.cinema-chapter')].forEach((chapter, current) => {
    assert.equal(chapter.getAttribute('aria-hidden'), String(current !== index), 'Only the current story is exposed');
    assert.equal(chapter.inert, current !== index, 'Inactive chapters cannot retain keyboard controls');
  });
}

await mount({ motionEnabled: true, src: '' });
await until(() => section()?.dataset.beat === '0' && w.document.querySelector('.cinema-chapter-one')?.getAttribute('aria-hidden') === 'false', 'Initial chapter becomes accessible');
assert.equal(film(), null, 'An empty source does not create a broken video');
assert.equal(section().dataset.media, 'fallback', 'An empty source selects native artwork');
assert.ok(w.document.querySelector('.cinema-flying-card') && w.document.querySelector('.cinema-emerging-ace'), 'Fallback contains the card and emerging spade');
expectChapter(0);
await scrollTo(.5); expectChapter(1);
button('Pause cinematic introduction').click(); await settle();
assert.equal(section().dataset.paused, 'true', 'Pause stops the opening timeline');
const pausedProgress = section().style.getPropertyValue('--cinema-progress');
await scrollTo(.9);
assert.equal(section().style.getPropertyValue('--cinema-progress'), pausedProgress, 'Scrolling does not advance a paused rig');
button('Play cinematic introduction').click(); await settle(); expectChapter(2);
button('Open the dashboard').click();
assert.equal(w.skips, 1, 'The final chapter opens the dashboard');
button('Replay cinematic introduction').click(); await settle();
assert.equal(scrollRequests, 1, 'Replay returns to the opening'); expectChapter(0);
button('Skip cinematic introduction').click();
assert.equal(w.skips, 2, 'Skip works without any film');

await mount({ motionEnabled: true, src: 'media/test-film.mp4', poster: 'media/test-poster.jpg' });
await until(() => !!film(), 'A supplied source mounts the film');
assert.equal(film().getAttribute('src'), 'media/test-film.mp4', 'Relative media path survives for offline companions');
assert.equal(film().muted, true, 'Film playback is muted');
assert.ok(film().hasAttribute('playsinline'), 'Film remains inline on mobile');
assert.equal(plays, 0, 'Autoplay waits for a usable media frame');
film().dispatchEvent(new w.Event('canplay')); await settle();
assert.equal(section().dataset.media, 'ready', 'Ready film replaces the media fallback');
assert.ok(plays > 0 && film().testPaused === false, 'Ready visible film plays');
visible(false); await settle();
assert.equal(film().testPaused, true, 'Film pauses outside the viewport');
const beforeReturn = plays;
visible(true); await settle();
assert.ok(plays > beforeReturn && film().testPaused === false, 'An unfinished film resumes when visible');
hidden = true; w.document.dispatchEvent(new w.Event('visibilitychange')); await settle();
assert.equal(film().testPaused, true, 'Hidden tabs pause media');
hidden = false; w.document.dispatchEvent(new w.Event('visibilitychange')); await settle();
assert.equal(film().testPaused, false, 'Visible tabs resume unfinished media');
button('Pause cinematic introduction').click(); await settle();
assert.equal(film().testPaused, true, 'The opening pause control also pauses film');
const beforePausedVisibility = plays;
visible(false); visible(true); await settle();
assert.equal(plays, beforePausedVisibility, 'Visibility does not override manual pause');
button('Play cinematic introduction').click(); await settle();
assert.equal(film().testPaused, false, 'The play control resumes film');
film().currentTime = 7; film().dispatchEvent(new w.Event('ended')); await settle();
const afterEnded = plays;
visible(false); visible(true); await settle();
assert.equal(plays, afterEnded, 'Completed film does not autoplay a second time');
button('Replay cinematic introduction').click(); await settle();
assert.equal(film().currentTime, 0, 'Replay resets film time');
assert.ok(plays > afterEnded, 'Explicit replay permits a new playthrough');
film().dispatchEvent(new w.Event('error')); await settle();
assert.equal(film(), null, 'A failed film is removed');
assert.equal(section().dataset.media, 'fallback', 'Media error preserves native card/spade fallback');
assert.ok(button('Skip cinematic introduction'), 'Media failure cannot block entering the dashboard');

await mount({ motionEnabled: false, src: 'media/test-film.mp4', poster: 'media/test-poster.jpg' });
await until(() => section().dataset.beat === '2', 'Reduced motion goes directly to the final chapter');
assert.equal(film(), null, 'Reduced motion does not mount video');
assert.equal(section().dataset.motion, 'off', 'Reduced-motion CSS mode shortens the runway');
expectChapter(2);
assert.equal(button('Play cinematic introduction').disabled, true, 'Reduced motion prevents local playback');
assert.equal(button('Replay cinematic introduction').disabled, true, 'Reduced motion prevents replay');
await scrollTo(.1); expectChapter(2);
button('Skip cinematic introduction').click();
assert.equal(w.skips, 3, 'Reduced motion retains direct dashboard access');
const playCountAtUnmount = plays;
w.unmountCinema(); await settle();
assert.ok(observers.every(observer => observer.disconnected), 'All visibility observers are disposed');
w.document.dispatchEvent(new w.Event('visibilitychange')); w.dispatchEvent(new w.Event('scroll')); await settle();
assert.equal(plays, playCountAtUnmount, 'Unmount removes playback listeners');
assert.ok(pauses > 0, 'Media cleanup paused playback');
assert.equal(errors.length, 0, errors.join('\n'));
process.stdout.write('PASS: cinematic pause/play/replay/skip, scroll chapter accessibility, reduced motion, absent/failed media fallback, muted inline playback, visibility pause, play-once behavior and cleanup. Media decoding and pixels require browser QA.\n');
dom.window.close();
