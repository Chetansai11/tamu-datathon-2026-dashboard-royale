import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Info, Pause, Play, RotateCcw } from 'lucide-react';
import { money } from './data';
import { useMotionEnabled } from './motion';
import './waterfall.css';

const definitions = [
  { key: 'exposure', label: 'Exposure', color: '#b0aba0', title: 'Less time on the floor changes the comparison.', detail: 'Different available machine-hours account for this part of the gap. A shorter operating history is not the same thing as a weaker machine.' },
  { key: 'game', label: 'Game math', color: '#c4a77d', title: 'Game math accounts for the largest part.', detail: 'The configured games have different expected returns to the house. This is a product-mix contribution, not a measured benefit from changing games.' },
  { key: 'location', label: 'Location', color: '#91a69a', title: 'Where a machine sits matters.', detail: 'Nine of these ten machines spent time in Back Forty. Retrospective location rates describe the gap; they do not prove what a move or new sign would earn.' },
  { key: 'luck', label: 'Payout residual', color: '#cd8a7e', title: 'Realized payouts add another layer.', detail: 'Actual house win differs from theoretical win on the observed wagers. This residual can reflect chance, configuration or recording; it does not establish a defect.' },
  { key: 'machine', label: 'Machine term', color: '#a8c1ae', title: 'The machine term goes the other way.', detail: 'The adjusted machine contribution offsets part of the deficit. It is descriptive, and an aggregate positive contribution does not clear every individual machine.' },
  { key: 'gap', label: 'Net gap', color: '#e9e5dc', title: 'The gap is real. Its causes need different decisions.', detail: 'The signed contributions reconcile to the gap against ten average machines. Inspect the payout signal and test the location hypothesis before blanket replacement.' },
];
const LAST = definitions.length - 1;
const STEP_DURATION_MS = 4000;
const exactMoney = (value: number) => `${value < 0 ? '−' : value > 0 ? '+' : ''}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value))}`;
const axisMoney = (value: number) => value === 0 ? '$0' : `${value < 0 ? '−' : ''}$${Math.abs(value / 1000).toFixed(0)}k`;

export default function Decomposition({ data }: any) {
  const motion = useMotionEnabled();
  const section = useRef<HTMLElement>(null);
  const started = useRef(false);
  const [step, setStep] = useState(motion ? 0 : LAST);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const id = `gap-waterfall-${useId().replace(/:/g, '')}`;
  const d = data.reports?.decomp;

  useEffect(() => {
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { threshold: .18 }) : null;
    if (section.current) observer?.observe(section.current);
    if (!observer) setVisible(true);
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [Boolean(d)]);

  useEffect(() => {
    if (!motion) { setPlaying(false); setStep(LAST); started.current = true; return; }
    if (visible && pageVisible && !started.current) { started.current = true; setStep(0); setPlaying(true); }
  }, [motion, visible, pageVisible]);

  useEffect(() => {
    if (!motion || !playing || !visible || !pageVisible) return;
    if (step >= LAST) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setStep(value => Math.min(LAST, value + 1)), STEP_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [motion, playing, visible, pageVisible, step]);

  if (!d?.gm_bottom10_totals) return null;
  const totals = d.gm_bottom10_totals;
  if (!definitions.every(item => Number.isFinite(totals[item.key]))) return null;
  const selected = definitions[step];
  let running = 0;
  const bars = definitions.map((item, index) => {
    const value = Number(totals[item.key]);
    const start = index === LAST ? 0 : running;
    const end = index === LAST ? value : running + value;
    if (index !== LAST) running = end;
    return { ...item, value, start, end };
  });
  const difference = Math.abs(running - totals.gap);
  const lower = Math.floor(Math.min(0, ...bars.map(bar => Math.min(bar.start, bar.end))) / 100000) * 100000;
  const upper = Math.ceil(Math.max(0, ...bars.map(bar => Math.max(bar.start, bar.end))) / 100000) * 100000;
  const span = upper - lower || 1;
  const plotTop = 68, plotBottom = 298, plotLeft = 76, stride = 117, barWidth = 67;
  const y = (value: number) => plotTop + (upper - value) / span * (plotBottom - plotTop);
  const selectStep = (index: number) => { started.current = true; setPlaying(false); setStep(index); };
  const togglePlayback = () => {
    started.current = true;
    if (playing) { setPlaying(false); return; }
    if (step === LAST) setStep(0);
    setPlaying(true);
  };
  const showingAll = !motion || step === LAST;

  return <section ref={section} className="panel decomposition-panel gap-waterfall" aria-labelledby={`${id}-heading`} data-motion={motion ? 'on' : 'off'} data-step={step} data-playing={playing ? 'true' : 'false'}>
    <div className="gap-waterfall-heading"><div><div className="eyebrow">FIXED JAN–JUN 2025 / THE GM’S BOTTOM TEN</div><h3 id={`${id}-heading`}>Unpack the earnings gap.</h3><p>Follow the dollars before replacing the machines.</p></div><div className="gap-waterfall-total"><strong>{money(Math.abs(totals.gap))}</strong><span>less than ten average machines</span></div></div>
    <div className="gap-story-controls"><span className="gap-story-progress">{motion ? `${String(step + 1).padStart(2, '0')} / 06` : 'FULL BREAKDOWN'}<i/> {motion && playing && (!visible || !pageVisible) ? 'Playback paused out of view' : motion && playing ? 'Following the evidence' : 'Select a contribution'}</span><div><button className="gap-step-arrow" aria-label="Previous earnings-gap step" disabled={step === 0} onClick={() => selectStep(Math.max(0, step - 1))}><ChevronLeft size={16}/></button><button className="gap-step-arrow" aria-label="Next earnings-gap step" disabled={step === LAST} onClick={() => selectStep(Math.min(LAST, step + 1))}><ChevronRight size={16}/></button><button className="btn gap-play" onClick={togglePlayback} disabled={!motion} aria-label={!motion ? 'Earnings-gap animation disabled by motion preference' : playing ? 'Pause earnings-gap story' : step === LAST ? 'Replay earnings-gap story' : 'Play earnings-gap story'}>{playing ? <Pause size={14}/> : step === LAST ? <RotateCcw size={14}/> : <Play size={14}/>} {!motion ? 'Motion off' : playing ? 'Pause' : step === LAST ? 'Replay' : 'Play story'}</button></div></div>
    <div className="gap-story-caption" aria-live={playing ? 'off' : 'polite'}><span className="gap-caption-marker" style={{ background: selected.color }}/><div><h4>{selected.title}</h4><p>{selected.detail}</p></div><strong style={{ color: selected.color }}>{exactMoney(totals[selected.key])}</strong></div>
    <div className="gap-chart-scroll" tabIndex={0} role="region" aria-label="Earnings-gap waterfall chart. Scroll horizontally on a narrow screen; exact values and step controls follow.">
      <svg className="gap-waterfall-chart" viewBox="0 0 800 360" aria-hidden="true">
        <text className="gap-axis-title" x="10" y="18">HOUSE WIN DIFFERENCE · USD</text>
        {[0, 1, 2, 3].map(index => { const value = upper - span * index / 3; return <g key={index}><line className={value === 0 ? 'gap-zero-axis' : 'gap-grid-line'} x1={plotLeft - 13} x2="784" y1={y(value)} y2={y(value)}/><text className="gap-axis-label" x={plotLeft - 22} y={y(value) + 4} textAnchor="end">{axisMoney(value)}</text></g>; })}
        {upper !== 0 && lower !== 0 && <line className="gap-zero-axis" x1={plotLeft - 13} x2="784" y1={y(0)} y2={y(0)}/>}
        {bars.map((bar, index) => {
          const x = plotLeft + index * stride, top = Math.min(y(bar.start), y(bar.end)), height = Math.abs(y(bar.start) - y(bar.end));
          const revealed = showingAll || index <= step;
          const active = index === step;
          return <g key={bar.key} className={`gap-waterfall-column${revealed ? ' is-revealed' : ''}${active ? ' is-selected' : ''}`}>
            <text className="gap-bar-value" x={x + barWidth / 2} y="44" textAnchor="middle" fill={bar.color}>{bar.value > 0 ? '+' : ''}{money(bar.value, true)}</text>
            {index < LAST - 1 && <line className="gap-connector" x1={x + barWidth} x2={x + stride} y1={y(bar.end)} y2={y(bar.end)}/>}
            <rect className="gap-waterfall-bar" x={x} y={top} width={barWidth} height={height} rx={height > 5 ? 2 : 0} fill={bar.color}/>
            {bar.key === 'machine' && <g className="gap-offset-marker"><line x1={x + barWidth / 2} x2={x + barWidth / 2} y1={top - 25} y2={top - 6} stroke={bar.color}/><path d={`M${x + barWidth / 2 - 4},${top - 10}L${x + barWidth / 2},${top - 5}L${x + barWidth / 2 + 4},${top - 10}`} fill="none" stroke={bar.color}/><text x={x + barWidth / 2} y={top - 31} textAnchor="middle" fill={bar.color}>offset ↑</text></g>}
            <text className="gap-bar-label" x={x + barWidth / 2} y="326" textAnchor="middle">{bar.label}</text>
            <text className="gap-bar-order" x={x + barWidth / 2} y="345" textAnchor="middle">{index === LAST ? 'TOTAL' : `0${index + 1}`}</text>
          </g>;
        })}
      </svg>
    </div>
    <div className="gap-chart-note"><span>One shared dollar scale. Rounded chart labels; exact amounts below. The positive machine term is shown at its true size.</span><span className="gap-mobile-scroll">Swipe chart to see all six columns →</span></div>
    <div className="gap-contribution-steps" role="group" aria-label="Exact earnings-gap contributions and story steps">{bars.map((bar, index) => <button key={bar.key} className={index === step ? 'is-selected' : ''} aria-pressed={index === step} onClick={() => selectStep(index)}><span><i style={{ background: bar.color }}/>{bar.label}</span><strong>{exactMoney(bar.value)}</strong></button>)}</div>
    <div className="gap-waterfall-method"><Info size={15}/><p>Fixed January–June finding; independent of explorer filters. Retrospective decomposition, not a causal estimate. Display order groups the negative contributions before the positive machine offset; the underlying attribution is unchanged.{difference >= .005 && ` Source rounding leaves a $${difference.toFixed(2)} difference between published components and total.`}</p><button className="text-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-evidence', { detail: 'q1-decomposition' }))}>Trace the finding <ArrowUpRight size={14}/></button></div>
  </section>;
}
