import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw } from 'lucide-react';

type Props = {
  motionEnabled: boolean; src: string; poster?: string; onSkip: () => void;
  onComplete: () => void; onRevealStart?: () => void; onReplayStart?: () => void;
};
type Phase = 'film' | 'card' | 'zoom' | 'reveal';
type MediaState = 'loading' | 'ready' | 'fallback';
const DURATION = 9600;
const REVEAL_START = 8150;
const STARTUP_GRACE = 2800;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (start: number, end: number, time: number) => { const value = clamp((time - start) / (end - start)); return value * value * (3 - 2 * value); };
const spade = 'M100 12C84 35 35 63 35 99C35 134 74 146 94 118C93 142 85 158 71 174H129C115 158 107 142 106 118C126 146 165 134 165 99C165 63 116 35 100 12Z';

/** A bounded, active-time film-to-card opening. The real dashboard is underneath. */
export default function CinematicOpening({ motionEnabled, src, poster, onSkip, onComplete, onRevealStart, onReplayStart }: Props) {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const elapsed = useRef(0);
  const startupElapsed = useRef(0);
  const timelineStarted = useRef(!src);
  const pausedRef = useRef(false);
  const completed = useRef(false);
  const revealed = useRef(false);
  const mediaReady = useRef(false);
  const mediaFailed = useRef(!src);
  const previousSource = useRef(src);
  const phaseRef = useRef<Phase>('film');
  const callbacks = useRef({ onSkip, onComplete, onRevealStart, onReplayStart });
  callbacks.current = { onSkip, onComplete, onRevealStart, onReplayStart };
  const playFilm = useRef<() => void>(() => {});
  const paint = useRef<(time: number) => void>(() => {});
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<Phase>('film');
  const [media, setMedia] = useState<MediaState>(src ? 'loading' : 'fallback');
  const [replayVersion, setReplayVersion] = useState(0);
  const [systemReduced, setSystemReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const animate = motionEnabled && !systemReduced;
  const id = 'cinema-' + useId().replace(/:/g, '');

  paint.current = (time: number) => {
    const section = root.current;
    if (!section) return;
    const progress = clamp(time / DURATION);
    const travel = ease(mediaFailed.current ? 300 : 5050, 6650, time);
    const emergence = ease(6400, 7250, time);
    const zoom = ease(6900, 9000, time);
    const reveal = ease(REVEAL_START, 9500, time);
    const cardOpacity = ease(mediaFailed.current ? 100 : 5050, mediaFailed.current ? 1150 : 5800, time) * (1 - ease(6850, 7650, time));
    section.style.setProperty('--cinema-progress', String(progress));
    section.style.setProperty('--cinema-opacity', String(1 - reveal));
    section.style.setProperty('--cinema-bed-opacity', String(1 - ease(8250, 9500, time)));
    section.style.setProperty('--cinema-film-opacity', String((mediaFailed.current ? .23 : 1) * (1 - ease(5250, 5900, time))));
    section.style.setProperty('--cinema-copy-opacity', String(1 - ease(4100, 5450, time)));
    section.style.setProperty('--cinema-copy-y', `${-ease(4100, 5450, time) * 14}px`);
    section.style.setProperty('--cinema-ui-opacity', String(1 - ease(8550, 9500, time)));
    section.style.setProperty('--cinema-card-opacity', String(cardOpacity));
    section.style.setProperty('--cinema-card-x', `${20 * (1 - travel)}vw`);
    section.style.setProperty('--cinema-card-y', `${9 * (1 - travel) + emergence * 11}vh`);
    section.style.setProperty('--cinema-card-turn', `${-48 + travel * 52}deg`);
    section.style.setProperty('--cinema-card-tilt', `${-11 + travel * 13}deg`);
    section.style.setProperty('--cinema-card-roll', `${-17 + travel * 15}deg`);
    section.style.setProperty('--cinema-card-scale', String(.87 + travel * .2));
    section.style.setProperty('--cinema-mark-opacity', String(1 - emergence));
    section.style.setProperty('--cinema-ace-opacity', String(emergence));
    section.style.setProperty('--cinema-ace-y', `${(1 - emergence) * 16}px`);
    section.style.setProperty('--cinema-ace-turn', `${-17 * (1 - emergence)}deg`);
    section.style.setProperty('--cinema-ace-scale', String((.68 + emergence * .44) * (1 + zoom * 9.7)));
    // The growing symbol darkens into graphite before it fills the frame; no white flash.
    section.style.setProperty('--cinema-ace-shade', String(.93 * ease(7650, 8650, time)));
    section.dataset.progress = progress.toFixed(4);
    const nextPhase: Phase = time < 5400 ? 'film' : time < 7200 ? 'card' : time < REVEAL_START ? 'zoom' : 'reveal';
    section.dataset.phase = nextPhase;
    if (phaseRef.current !== nextPhase) { phaseRef.current = nextPhase; setPhase(nextPhase); }
    if (time >= REVEAL_START && !revealed.current) { revealed.current = true; callbacks.current.onRevealStart?.(); }
  };

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const changed = () => setSystemReduced(!!query?.matches);
    query?.addEventListener?.('change', changed);
    return () => query?.removeEventListener?.('change', changed);
  }, []);

  useEffect(() => {
    if (previousSource.current === src) return;
    previousSource.current = src;
    elapsed.current = 0; completed.current = false; revealed.current = false;
    startupElapsed.current = 0; timelineStarted.current = !src;
    mediaReady.current = false; mediaFailed.current = !src; phaseRef.current = 'film';
    setMedia(src ? 'loading' : 'fallback'); setPhase('film');
  }, [src]);

  useEffect(() => {
    let disposed = false, frame = 0, lastTime: number | null = null, pendingPlay = false;
    const film = video.current;
    const stopFilm = () => { try { film?.pause(); } catch { /* Media is decorative. */ } };
    const fallback = () => {
      if (disposed || mediaFailed.current) return;
      mediaFailed.current = true; mediaReady.current = false; setMedia('fallback'); stopFilm();
    };
    const synchronizeFilm = () => {
      if (disposed || !film) return;
      if (!animate || pausedRef.current || document.hidden || completed.current || mediaFailed.current || elapsed.current >= 5900) { stopFilm(); return; }
      if (pendingPlay || !film.paused) return;
      film.muted = true; film.playsInline = true;
      try {
        const attempt = film.play();
        pendingPlay = !!attempt;
        attempt?.then(() => { pendingPlay = false; }, error => { pendingPlay = false; if (!disposed && error?.name !== 'AbortError') fallback(); });
      } catch { fallback(); }
    };
    playFilm.current = synchronizeFilm;
    const finish = () => {
      if (disposed || completed.current) return;
      paint.current(DURATION); // Terminal overlay opacity is zero before App removes it.
      elapsed.current = DURATION; completed.current = true; stopFilm();
      callbacks.current.onComplete();
    };
    const tick = (timestamp: number) => {
      frame = 0;
      if (disposed || completed.current) return;
      if (pausedRef.current || document.hidden) { lastTime = null; stopFilm(); return; }
      const delta = lastTime === null ? 0 : Math.max(0, timestamp - lastTime);
      lastTime = timestamp;
      if (!timelineStarted.current) {
        if (!mediaReady.current && !mediaFailed.current) {
          startupElapsed.current += delta;
          if (startupElapsed.current >= STARTUP_GRACE) fallback();
        }
        if (mediaReady.current || mediaFailed.current) {
          // A cold film gets its full sequence after readiness. Startup waiting
          // is bounded independently and never consumes the film's five seconds.
          timelineStarted.current = true;
          if (root.current) root.current.dataset.startup = 'finished';
        } else {
          if (root.current) root.current.dataset.startup = 'waiting';
          paint.current(0);
          frame = requestAnimationFrame(tick);
          return;
        }
      } else elapsed.current = Math.min(DURATION, elapsed.current + delta);
      paint.current(elapsed.current);
      if (elapsed.current >= DURATION) { finish(); return; }
      if (elapsed.current >= 5900) stopFilm();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!disposed && !frame && !completed.current && !pausedRef.current && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const visibilityChanged = () => {
      lastTime = null;
      if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; stopFilm(); }
      else { synchronizeFilm(); start(); }
    };
    if (!animate) { finish(); return () => { disposed = true; stopFilm(); }; }
    if (film && film.readyState >= 2 && !mediaFailed.current) { mediaReady.current = true; setMedia('ready'); }
    paint.current(elapsed.current);
    synchronizeFilm();
    start();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibilityChanged);
      stopFilm();
      playFilm.current = () => {};
    };
  }, [animate, paused, src, replayVersion]);

  const skip = () => {
    if (completed.current) return;
    completed.current = true;
    try { video.current?.pause(); } catch { /* The exit stays available. */ }
    callbacks.current.onSkip();
  };
  const skipRef = useRef(skip);
  skipRef.current = skip;
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); skipRef.current(); return; }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !buttons.includes(document.activeElement as HTMLButtonElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, []);

  const togglePaused = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };
  const replay = () => {
    if (!animate) return;
    callbacks.current.onReplayStart?.();
    elapsed.current = 0; completed.current = false; revealed.current = false;
    startupElapsed.current = 0;
    pausedRef.current = false; phaseRef.current = 'film';
    mediaFailed.current = !src; mediaReady.current = !!video.current && video.current.readyState >= 2;
    timelineStarted.current = mediaReady.current || mediaFailed.current;
    setPaused(false); setPhase('film'); setMedia(mediaFailed.current ? 'fallback' : mediaReady.current ? 'ready' : 'loading');
    try { if (video.current) video.current.currentTime = 0; } catch { /* Continue the native sequence if the video cannot seek. */ }
    paint.current(0); setReplayVersion(value => value + 1);
  };
  const mediaIsReady = () => {
    if (mediaFailed.current || completed.current) return;
    mediaReady.current = true; setMedia('ready'); playFilm.current();
  };
  const mediaError = () => { mediaFailed.current = true; mediaReady.current = false; setMedia('fallback'); try { video.current?.pause(); } catch { /* Native sequence remains independent. */ } };
  const phaseLabel = phase === 'film' ? '01 / THE DEAL' : phase === 'card' ? '02 / THE TURN' : '03 / THE REVEAL';

  return <section ref={root} className="cinema-opening" data-phase={phase} data-progress="0" data-startup={timelineStarted.current ? 'finished' : 'waiting'} data-motion={animate ? 'on' : 'off'} data-paused={paused ? 'true' : 'false'} data-media={media} role="dialog" aria-modal="true" aria-labelledby={id + '-title'} aria-describedby={id + '-description'}>
    <div className="cinema-stage">
      <div className="cinema-backdrop" aria-hidden="true" />
      <div className="cinema-film-bed" aria-hidden="true">
        {poster && <img className="cinema-poster" src={poster} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />}
        {!!src && animate && <video ref={video} className="cinema-film" src={src} poster={poster} autoPlay={!paused} muted playsInline preload="auto" onLoadedData={mediaIsReady} onCanPlay={mediaIsReady} onPlaying={mediaIsReady} onError={mediaError} />}
      </div>
      <div className="cinema-wash" aria-hidden="true" />
      <div className="cinema-topline"><span><i />THE GILDED ACE</span><button type="button" className="cinema-skip" aria-label="Skip cinematic introduction" onClick={skip}>Skip to dashboard<ArrowUpRight size={15} /></button></div>
      <div className="cinema-copy"><span className="cinema-kicker">A MOMENT OF CHANCE</span><h2 id={id + '-title'}>The ace<br /><span>in motion.</span></h2><p id={id + '-description'}>Six months of evidence.<br />A different way to read the floor.</p></div>
      <div className="cinema-card-scene" aria-hidden="true">
        <div className="cinema-flying-card">
          <div className="cinema-card-face"><div className="cinema-card-line" /><span className="cinema-card-index">A<span>♠</span></span><svg className="cinema-card-mark" viewBox="0 0 200 190"><path d={spade} /></svg><span className="cinema-card-name">THE GILDED ACE</span><span className="cinema-card-index cinema-card-index-bottom">A<span>♠</span></span></div>
          <div className="cinema-card-back"><div /><span>♠</span></div>
        </div>
        <div className="cinema-emerging-ace"><svg viewBox="0 0 200 190" fill="none"><defs><linearGradient id={id + '-metal'} x1="43" y1="23" x2="157" y2="171" gradientUnits="userSpaceOnUse"><stop stopColor="#e6ddc9" /><stop offset=".35" stopColor="#c9b38c" /><stop offset=".7" stopColor="#8d7451" /><stop offset="1" stopColor="#c6ad82" /></linearGradient></defs><path d={spade} fill="#52442f" transform="translate(3 4)" /><path d={spade} fill={`url(#${id}-metal)`} stroke="#d8c8a9" strokeWidth=".65" /><path d="M100 22C85 42 49 64 48 91" stroke="#eae1ce" strokeWidth="1.2" strokeOpacity=".65" strokeLinecap="round" /><path className="cinema-ace-shade" d={spade} transform="translate(3 4)" fill="#080808" stroke="#080808" strokeWidth="1.5" /><path className="cinema-ace-shade" d={spade} fill="#080808" stroke="#080808" strokeWidth="1.5" /></svg></div>
      </div>
      <div className="cinema-bottomline"><span className="cinema-phase-label">{phaseLabel}</span><div className="cinema-controls"><button type="button" aria-label={paused ? 'Play cinematic introduction' : 'Pause cinematic introduction'} aria-pressed={!paused} disabled={!animate} onClick={togglePaused}>{paused ? <Play size={15} /> : <Pause size={15} />}<span>{paused ? 'Play' : 'Pause'}</span></button><button type="button" aria-label="Replay cinematic introduction" disabled={!animate} onClick={replay}><RotateCcw size={15} /><span>Replay</span></button></div></div>
      <div className="cinema-progress" aria-hidden="true"><span /></div>
    </div>
  </section>;
}
