import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import ParticleAce from './ParticleAce';

type Props = {
  motionEnabled: boolean; onSkip: () => void; onComplete: () => void;
  onRevealStart?: () => void; onReplayStart?: () => void;
};
type Phase = 'deal' | 'ace' | 'zoom' | 'reveal';
const DURATION = 4800;
const REVEAL_START = 3550;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (start: number, end: number, time: number) => { const v = clamp((time - start) / (end - start)); return v * v * (3 - 2 * v); };
const spade = 'M100 12C84 35 35 63 35 99C35 134 74 146 94 118C93 142 85 158 71 174H129C115 158 107 142 106 118C126 146 165 134 165 99C165 63 116 35 100 12Z';

/** Original geometric court-card illustrations; no image or video downloads. */
function CourtPortrait({ joker = false }: { joker?: boolean }) {
  return <g strokeLinecap="round" strokeLinejoin="round">
    <circle cx="100" cy="134" r="57" fill="none" stroke="#b49a63" strokeWidth=".7" />
    <circle cx="100" cy="134" r="52" fill="none" stroke="#b49a63" strokeWidth=".3" strokeDasharray="1 3" />
    {joker ? <>
      <path d="M51 124Q43 89 43 77Q66 81 82 107Q80 80 99 64Q116 87 117 108Q133 86 158 84L148 124Q128 117 118 133H76Q66 117 51 124Z" fill="#242527" stroke="#b49a63" strokeWidth="1.5" />
      <path d="M82 107Q86 82 99 64L106 113M117 108Q134 87 158 84L133 125M51 124L43 77L72 119" fill="#b49a63" stroke="#353535" strokeWidth=".7" />
      <g fill="#bd9c58" stroke="#55504a" strokeWidth="1"><circle cx="43" cy="76" r="5"/><circle cx="99" cy="63" r="5"/><circle cx="158" cy="83" r="5"/></g>
      <path d="M75 120Q101 111 126 122L123 153Q117 175 101 178Q82 175 77 153Z" fill="#ecece7" stroke="#333538" strokeWidth="1.8" />
      <path d="M79 130Q88 123 95 132M107 131Q116 124 122 131M100 134L97 148L104 148M87 155Q100 170 115 153Q101 159 87 155Z" fill="none" stroke="#353535" strokeWidth="1.6" />
      <path d="M78 138L88 143L84 150ZM121 137L112 143L117 150Z" fill="#b49a63" />
      <path d="M75 166L64 178L80 191L94 180L106 192L120 178L136 184L126 165L117 175L102 183L86 176Z" fill="#b49a63" stroke="#353535" strokeWidth="1.2" />
      <path d="M64 179Q50 195 51 225H149Q150 201 135 183L120 191L103 205L82 193Z" fill="#242527" stroke="#b49a63" strokeWidth="1.5" />
      <path d="M75 195L89 209L76 223L63 209ZM118 195L132 209L119 223L105 209Z" fill="#b49a63"/>
      <path d="M96 202L105 209L97 219L89 211Z" fill="#e0e2df" />
    </> : <>
      <path d="M69 120Q55 98 68 85Q62 75 79 68Q99 54 121 69Q139 77 132 96L135 125L123 140H78Z" fill="#252729" stroke="#b49a63" strokeWidth="1.2" />
      <path d="M70 88L63 60L85 72L100 48L115 72L138 59L131 88Z" fill="#b49a63" stroke="#363532" strokeWidth="1.3" />
      <path d="M73 80H128M76 87H125" stroke="#eeeadc" strokeWidth="1.3" />
      <g fill="#303235"><path d="M97 65L101 58L105 65L101 73Z"/><circle cx="79" cy="76" r="2.4"/><circle cx="121" cy="76" r="2.4"/></g>
      <path d="M78 100Q101 90 123 103L120 139L111 159L99 166L85 155L76 134Z" fill="#e4e5e1" stroke="#323436" strokeWidth="1.6" />
      <path d="M79 111L93 109M108 109L121 113M87 116H91M111 117H116M100 113L96 132L103 133" fill="none" stroke="#333538" strokeWidth="1.7" />
      <path d="M78 128Q83 146 94 140Q99 134 104 141Q115 145 123 130L121 158L100 181L79 158Z" fill="#303235" stroke="#b49a63" strokeWidth=".8" />
      <path d="M88 149Q101 154 113 148M90 159L100 169L110 158" fill="none" stroke="#b9b8ac" strokeWidth="1" />
      <path d="M78 156L61 174L43 225H157L139 175L122 156L100 185Z" fill="#27292b" stroke="#b49a63" strokeWidth="1.6" />
      <path d="M62 175L87 193L74 225H59L76 199L57 190M138 175L113 193L127 225H143L125 199L144 191" fill="#b49a63" stroke="#343434" strokeWidth=".7" />
      <path d="M79 163L100 186L121 163M86 188L100 200L114 188M95 204L100 210L106 204L101 198Z" fill="none" stroke="#e4e5df" strokeWidth="1.2" />
      <path d="M147 111L139 220" stroke="#b49a63" strokeWidth="4"/><path d="M143 104L148 91L153 105L147 114Z" fill="#b49a63" stroke="#343434" strokeWidth="1" />
    </>}
    <path d="M53 231H147M70 236H130" stroke="#b49a63" strokeWidth=".7" />
  </g>;
}

function CardArtwork({ kind }: { kind: 'king' | 'joker' | 'ace' | 'back' }) {
  const front = kind !== 'back';
  return <svg viewBox="0 0 200 290" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="198" height="288" rx="11" fill={front ? '#e5e7e3' : '#181c20'} stroke={front ? '#f3f3ea' : '#92794e'} strokeWidth="1.4" />
    <rect x="9" y="9" width="182" height="272" rx="6" stroke={front ? '#ad9568' : '#8a754f'} strokeWidth=".65" />
    <rect x="13" y="13" width="174" height="264" rx="4" stroke={front ? '#b6b7ac' : '#42484b'} strokeWidth=".4" />
    {front ? <>
      <g fill="#292d2e" fontFamily="Georgia,serif" textAnchor="middle">
        <text x="29" y="43" fontSize={kind === 'joker' ? '24' : '30'}>{kind === 'king' ? 'K' : kind === 'joker' ? 'J' : 'A'}</text>
        <text x="29" y="64" fontSize="18">{kind === 'joker' ? '✧' : '♠'}</text>
        <g transform="rotate(180 100 145)"><text x="29" y="43" fontSize={kind === 'joker' ? '24' : '30'}>{kind === 'king' ? 'K' : kind === 'joker' ? 'J' : 'A'}</text><text x="29" y="64" fontSize="18">{kind === 'joker' ? '✧' : '♠'}</text></g>
      </g>
      {kind === 'ace' ? <>
        <g className="cinema-card-mark" transform="translate(37 78) scale(.63)"><path d={spade} fill="#252a2d"/><path d={spade} fill="none" stroke="#ba9b5c" strokeWidth="1.6"/><path d="M100 29C84 51 52 70 50 94" stroke="#d0b477" strokeWidth=".8" /></g>
        <text x="100" y="221" fill="#8c734b" fontSize="6" letterSpacing="2.3" textAnchor="middle" fontFamily="monospace">THE GILDED ACE</text>
      </> : <CourtPortrait joker={kind === 'joker'} />}
      <text x="100" y="256" fill="#6c6658" fontSize="8" letterSpacing="3" textAnchor="middle" fontFamily="monospace">{kind === 'ace' ? 'A C E' : kind.toUpperCase()}</text>
      <path d="M61 33H85M115 33H139M61 260H78M122 260H139" stroke="#ad9568" strokeWidth=".6" />
    </> : <>
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${18 + i * 20} 18L182 ${182 - i * 20}M18 ${108 + i * 20}L${182 - i * 20} 272M${18 + i * 20} 272L182 ${108 + i * 20}M18 ${182 - i * 20}L${182 - i * 20} 18`} stroke="#7b6a4c" strokeWidth=".4" opacity=".35" />)}
      <path d="M100 60L161 145L100 230L39 145Z" fill="#181c20" stroke="#ad925a" strokeWidth="1" />
      <path d="M100 70L153 145L100 220L47 145Z" fill="none" stroke="#ad925a" strokeWidth=".4" />
      <g transform="translate(54 101) scale(.46)"><path d={spade} fill="#b99c63" /></g>
      <path d="M86 85H114M86 205H114" stroke="#b99c63" strokeWidth=".6"/>
    </>}
  </svg>;
}

const deck = [
  [-45, -58, -31, .67, 70], [-31, -22, 23, .50, 330], [37, -52, 29, .69, 100], [47, -8, -20, .43, 360],
  [-39, 25, 36, .50, -540], [31, 22, -37, .58, -400], [-18, -62, -12, .44, 140], [17, -83, 31, .53, 470],
  [-49, -84, 53, .34, 650], [43, -92, -44, .41, 700],
] as const;

/** A 4.8-second native deck-to-particle opening. Only active, visible time counts. */
export default function CinematicOpening({ motionEnabled, onSkip, onComplete, onRevealStart, onReplayStart }: Props) {
  const root = useRef<HTMLElement>(null);
  const elapsed = useRef(0);
  const pausedRef = useRef(false);
  const completed = useRef(false);
  const revealed = useRef(false);
  const phaseRef = useRef<Phase>('deal');
  const callbacks = useRef({ onSkip, onComplete, onRevealStart, onReplayStart });
  callbacks.current = { onSkip, onComplete, onRevealStart, onReplayStart };
  const paint = useRef<(time: number) => void>(() => {});
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<Phase>('deal');
  const [replayVersion, setReplayVersion] = useState(0);
  const [systemReduced, setSystemReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const animate = motionEnabled && !systemReduced;
  const id = 'cinema-' + useId().replace(/:/g, '');

  paint.current = (time: number) => {
    const section = root.current;
    if (!section) return;
    const arrival = ease(0, 650, time), part = ease(1450, 2450, time), emergence = ease(1450, 2250, time);
    const reveal = ease(REVEAL_START, 4750, time);
    const set = (name: string, value: string | number) => section.style.setProperty(`--cinema-${name}`, String(value));
    set('progress', clamp(time / DURATION)); set('opacity', 1 - reveal); set('bed-opacity', 1 - ease(3650, 4700, time));
    set('copy-opacity', 1 - ease(1300, 2050, time)); set('ui-opacity', 1 - ease(3850, 4700, time));
    set('court-opacity', 1 - ease(2100, 2700, time)); set('deck-opacity', 1 - ease(1650, 2650, time));
    set('king-x', `${-100 - part * 320}px`); set('king-y', `${-135 * (1 - arrival) + time * .014 + part * 380}px`);
    set('king-turn', `${-19 + arrival * 5 - part * 42}deg`); set('king-tilt', `${-19 + arrival * 12 + part * 16}deg`);
    set('joker-x', `${104 + part * 330}px`); set('joker-y', `${-205 * (1 - arrival) + 15 + time * .009 + part * 310}px`);
    set('joker-turn', `${21 - arrival * 6 + part * 48}deg`); set('joker-tilt', `${24 - arrival * 18 - part * 23}deg`);
    set('card-y', `${58 * (1 - emergence)}px`); set('card-scale', .76 + emergence * .24);
    set('card-turn', `${-8 * (1 - emergence)}deg`); set('card-tilt', `${-28 * (1 - emergence)}deg`);
    set('card-opacity', ease(450, 1100, time) * (1 - ease(2400, 2860, time))); set('mark-opacity', 1 - ease(2100, 2500, time));
    set('particle-opacity', ease(2080, 2490, time));
    section.dataset.progress = clamp(time / DURATION).toFixed(4);
    section.dataset.aceFront = time >= 1840 ? 'true' : 'false';
    const cards = section.querySelectorAll<HTMLElement>('.cinema-rain-card');
    cards.forEach((card, index) => {
      const [x, y, turn, scale, delay] = deck[index];
      const fall = Math.max(0, time - delay) / 2450;
      card.style.transform = `translate3d(calc(-50% + ${x + Math.sin(fall * 1.4 + index) * 6}vw),calc(-50% + ${y + fall * 125}vh),0) rotateX(${18 + fall * 45}deg) rotateY(${(index % 2 ? -1 : 1) * (22 + fall * 75)}deg) rotateZ(${turn + fall * (index % 2 ? -55 : 65)}deg) scale(${scale})`;
    });
    const nextPhase: Phase = time < 1450 ? 'deal' : time < 2750 ? 'ace' : time < REVEAL_START ? 'zoom' : 'reveal';
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
    let disposed = false, frame = 0, lastTime: number | null = null;
    const finish = () => {
      if (disposed || completed.current) return;
      elapsed.current = DURATION; paint.current(DURATION); completed.current = true;
      callbacks.current.onComplete();
    };
    const tick = (timestamp: number) => {
      frame = 0;
      if (disposed || completed.current) return;
      if (pausedRef.current || document.hidden) { lastTime = null; return; }
      const delta = lastTime === null ? 0 : Math.max(0, timestamp - lastTime);
      lastTime = timestamp; elapsed.current = Math.min(DURATION, elapsed.current + delta);
      paint.current(elapsed.current);
      if (elapsed.current >= DURATION) { finish(); return; }
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (!disposed && !frame && !completed.current && !pausedRef.current && !document.hidden) frame = requestAnimationFrame(tick); };
    const visibilityChanged = () => {
      lastTime = null;
      if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; }
      else start();
    };
    if (!animate) { finish(); return () => { disposed = true; }; }
    paint.current(elapsed.current); start();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => { disposed = true; if (frame) cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibilityChanged); };
  }, [animate, paused, replayVersion]);

  const skip = () => { if (completed.current) return; completed.current = true; callbacks.current.onSkip(); };
  const skipRef = useRef(skip); skipRef.current = skip;
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); skipRef.current(); return; }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !buttons.includes(document.activeElement as HTMLButtonElement))) { event.preventDefault(); last.focus({ preventScroll: true }); }
      else if (!event.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) { event.preventDefault(); first.focus({ preventScroll: true }); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, []);
  const togglePaused = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };
  const replay = () => {
    if (!animate) return;
    callbacks.current.onReplayStart?.(); elapsed.current = 0; completed.current = false; revealed.current = false;
    pausedRef.current = false; phaseRef.current = 'deal'; setPaused(false); setPhase('deal');
    paint.current(0); setReplayVersion(value => value + 1);
  };
  const phaseLabel = phase === 'deal' ? '01 / THE DEAL' : phase === 'ace' ? '02 / THE ACE' : '03 / THE SIGNAL';

  return <section ref={root} className="cinema-opening" data-phase={phase} data-progress="0" data-motion={animate ? 'on' : 'off'} data-paused={paused ? 'true' : 'false'} role="dialog" aria-modal="true" aria-labelledby={id + '-title'} aria-describedby={id + '-description'}>
    <div className="cinema-stage">
      <div className="cinema-backdrop" aria-hidden="true" />
      <div className="cinema-orbit" aria-hidden="true" />
      <div className="cinema-topline"><span><i />THE GILDED ACE</span><button type="button" className="cinema-close" aria-label="Skip cinematic introduction" title="Enter dashboard · Esc" onClick={skip}><X size={17} /></button></div>
      <div className="cinema-card-scene" aria-hidden="true">
        <div className="cinema-deck-rain">{deck.map((_, index) => <div key={index} className={`cinema-rain-card cinema-rain-card-${index}`}><CardArtwork kind="back" /></div>)}</div>
        <div className="cinema-flying-card"><CardArtwork kind="ace" /></div>
        <div className="cinema-court-card cinema-king"><CardArtwork kind="king" /></div>
        <div className="cinema-court-card cinema-joker"><CardArtwork kind="joker" /></div>
      </div>
      <div className="cinema-particle-field" aria-hidden="true">{animate && <ParticleAce motionEnabled={animate && !paused} cinematicTime={elapsed} />}</div>
      <div className="cinema-copy"><span className="cinema-kicker">CHANCE IS ONLY THE BEGINNING</span><h2 id={id + '-title'}>Find your <em>ace.</em></h2><p id={id + '-description'} className="cinema-sr-only">A falling deck parts around the king and joker. An ace emerges in silver and gold particles, revealing the dashboard automatically.</p></div>
      <div className="cinema-bottomline"><span className="cinema-phase-label">{phaseLabel}</span><div className="cinema-controls"><button type="button" aria-label={paused ? 'Play cinematic introduction' : 'Pause cinematic introduction'} aria-pressed={!paused} disabled={!animate} onClick={togglePaused}>{paused ? <Play size={14} /> : <Pause size={14} />}<span>{paused ? 'Play' : 'Pause'}</span></button><button type="button" aria-label="Replay cinematic introduction" disabled={!animate} onClick={replay}><RotateCcw size={14} /><span>Replay</span></button></div></div>
      <div className="cinema-progress" aria-hidden="true"><span /></div>
    </div>
  </section>;
}
