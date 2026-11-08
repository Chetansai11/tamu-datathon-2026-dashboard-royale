import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';

type Props = { motionEnabled: boolean; src: string; poster?: string; onSkip: () => void };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (a: number, b: number, n: number) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };
const spade = 'M100 12C84 35 35 63 35 99C35 134 74 146 94 118C93 142 85 158 71 174H129C115 158 107 142 106 118C126 146 165 134 165 99C165 63 116 35 100 12Z';

/** A decorative film and native card rig; the analytics remain outside this section. */
export default function CinematicOpening({ motionEnabled, src, poster, onSkip }: Props) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(false);
  const visibleRef = useRef(true);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!src);
  const [finished, setFinished] = useState(false);
  const id = 'cinema-' + useId().replace(/:/g, '');

  useEffect(() => { setReady(false); setFailed(!src); setFinished(false); }, [src]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const section = root.current;
    const surface = stage.current;
    if (!section || !surface) return;
    let raf = 0;
    let lastBeat = '';
    const paint = (progress: number) => {
      const travel = ease(.12, .64, progress);
      const emergence = ease(.5, .88, progress);
      const finish = ease(.78, 1, progress);
      section.style.setProperty('--cinema-progress', String(progress));
      section.style.setProperty('--cinema-travel', String(travel));
      section.style.setProperty('--cinema-emergence', String(emergence));
      section.style.setProperty('--cinema-finish', String(finish));
      section.style.setProperty('--cinema-card-x', `${70 - travel * 90}px`);
      section.style.setProperty('--cinema-card-y', `${70 - travel * 110 + emergence * 65}px`);
      section.style.setProperty('--cinema-card-turn', `${-32 + travel * 395}deg`);
      section.style.setProperty('--cinema-card-tilt', `${-16 + travel * 21}deg`);
      section.style.setProperty('--cinema-card-scale', String(.72 + travel * .45 - emergence * .22));
      section.style.setProperty('--cinema-spade-rise', `${30 - emergence * 145}px`);
      section.style.setProperty('--cinema-spade-scale', String(.5 + emergence * .7));
      const beat = progress < .32 ? '0' : progress < .72 ? '1' : '2';
      if (beat !== lastBeat) {
        lastBeat = beat; section.dataset.beat = beat;
        section.querySelectorAll<HTMLElement>('.cinema-chapter').forEach((chapter, index) => {
          const hidden = String(index) !== beat;
          chapter.setAttribute('aria-hidden', String(hidden));
          chapter.inert = hidden;
        });
      }
    };
    if (!motionEnabled) { paint(1); return; }
    const update = () => {
      raf = 0;
      if (pausedRef.current) return;
      const rect = section.getBoundingClientRect();
      const span = Math.max(1, section.offsetHeight - surface.offsetHeight);
      paint(clamp((16 - rect.top) / span));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [motionEnabled, paused]);

  useEffect(() => {
    const film = video.current;
    if (!film) return;
    let disposed = false;
    const synchronize = () => {
      if (disposed) return;
      if (!motionEnabled || paused || finished || !ready || !visibleRef.current || document.hidden) { film.pause(); return; }
      const attempt = film.play();
      attempt?.catch(error => { if (!disposed && error?.name !== 'AbortError') setPaused(true); });
    };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      visibleRef.current = entries.some(entry => entry.isIntersecting);
      synchronize();
    }, { threshold: .15 }) : null;
    if (stage.current) observer?.observe(stage.current);
    document.addEventListener('visibilitychange', synchronize);
    synchronize();
    return () => { disposed = true; observer?.disconnect(); document.removeEventListener('visibilitychange', synchronize); film.pause(); };
  }, [motionEnabled, paused, finished, ready, src, failed]);

  const replay = () => {
    if (!motionEnabled) return;
    setPaused(false); setFinished(false);
    if (video.current) { try { video.current.currentTime = 0; } catch { /* Wait for metadata if the film is still loading. */ } }
    root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <section ref={root} className="cinema-opening" data-beat="0" data-motion={motionEnabled ? 'on' : 'off'} data-paused={paused ? 'true' : 'false'} data-media={ready && !failed ? 'ready' : 'fallback'} aria-label="The Gilded Ace cinematic introduction">
    <div className="cinema-stage" ref={stage}>
      <div className="cinema-film-bed" aria-hidden="true">
        {poster && <img className="cinema-poster" src={poster} alt="" onError={event => { event.currentTarget.style.display = 'none'; }}/>} 
        {!!src && !failed && motionEnabled && <video ref={video} className="cinema-film" src={src} poster={poster} muted playsInline preload="metadata" onCanPlay={() => setReady(true)} onEnded={() => setFinished(true)} onError={() => { setFailed(true); setReady(false); }}/>} 
      </div>
      <div className="cinema-wash" aria-hidden="true"/>
      <div className="cinema-grid" aria-hidden="true"/>
      <div className="cinema-topline"><span><i/> THE GILDED ACE</span><button type="button" className="cinema-skip" aria-label="Skip cinematic introduction" onClick={onSkip}>Skip to dashboard <ArrowUpRight size={14}/></button></div>
      <div className="cinema-copy">
        <span className="cinema-kicker"><Sparkles size={13}/> A NEW PERSPECTIVE ON THE FLOOR</span>
        <div className="cinema-chapters">
          <div className="cinema-chapter cinema-chapter-one"><span className="cinema-chapter-number">01 / THE DEAL</span><h2>Every card<br/>has a <em>story.</em></h2><p>A moment of chance. Six months of evidence.<br/>{' '}Look closer at what the floor is telling you.</p></div>
          <div className="cinema-chapter cinema-chapter-two"><span className="cinema-chapter-number">02 / THE TURN</span><h2>Change your<br/><em>perspective.</em></h2><p>Behind the lowest earnings: luck, location,<br/>{' '}and the questions worth asking.</p></div>
          <div className="cinema-chapter cinema-chapter-three"><span className="cinema-chapter-number">03 / THE REVEAL</span><h2>The edge is<br/>in the <em>evidence.</em></h2><p>Read the floor. Make the right move.</p><button type="button" className="cinema-enter" aria-label="Open the dashboard" onClick={onSkip}>Enter floor intelligence <ArrowUpRight size={17}/></button></div>
        </div>
      </div>
      <div className="cinema-card-scene" aria-hidden="true">
        <div className="cinema-orbit-halo"/>
        <div className="cinema-card-shadow"/>
        <div className="cinema-flying-card">
          <div className="cinema-card-face"><div className="cinema-card-line"/><span className="cinema-card-index">A<span>♠</span></span><svg className="cinema-card-mark" viewBox="0 0 200 190"><path d={spade}/></svg><span className="cinema-card-name">THE GILDED ACE</span><span className="cinema-card-index cinema-card-index-bottom">A<span>♠</span></span></div>
          <div className="cinema-card-back"><div/><span>♠</span></div>
        </div>
        <div className="cinema-emerging-ace"><svg viewBox="0 0 200 190" fill="none"><defs><linearGradient id={id} x1="35" y1="15" x2="164" y2="175" gradientUnits="userSpaceOnUse"><stop stopColor="#fff1c4"/><stop offset=".35" stopColor="#f7d78e"/><stop offset=".65" stopColor="#d5973e"/><stop offset="1" stopColor="#ffdb8e"/></linearGradient></defs><path d={spade} fill="#69451e" transform="translate(7 8)"/><path d={spade} fill={`url(#${id})`} stroke="#ffe4a7" strokeWidth=".7"/><path d="M100 22C85 42 49 64 48 91" stroke="#fff4d5" strokeWidth="1.6" strokeOpacity=".75" strokeLinecap="round"/></svg></div>
        <span className="cinema-glint cinema-glint-one"/><span className="cinema-glint cinema-glint-two"/><span className="cinema-glint cinema-glint-three"/>
        <div className="cinema-scene-label"><span/> LUCK. LOCATION. OR A LEAK?</div>
      </div>
      <div className="cinema-bottomline"><div className="cinema-scroll-cue"><ArrowDown size={15}/><span>{motionEnabled ? 'SCROLL TO REVEAL' : 'EXPLORE THE EVIDENCE'}</span></div><div className="cinema-controls"><button type="button" aria-label={paused || !motionEnabled ? 'Play cinematic introduction' : 'Pause cinematic introduction'} aria-pressed={!paused && motionEnabled} disabled={!motionEnabled} onClick={() => setPaused(value => !value)}>{paused || !motionEnabled ? <Play size={14}/> : <Pause size={14}/>}<span>{!motionEnabled ? 'Motion off' : paused ? 'Play' : 'Pause'}</span></button><button type="button" aria-label="Replay cinematic introduction" disabled={!motionEnabled} onClick={replay}><RotateCcw size={14}/><span>Replay</span></button></div></div>
      <div className="cinema-progress" aria-hidden="true"><span/></div>
    </div>
  </section>;
}
