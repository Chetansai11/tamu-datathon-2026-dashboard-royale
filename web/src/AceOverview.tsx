import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Play, MoveUpRight } from 'lucide-react';
import { money, number, percent, ratio, shortDate, AnyRecord } from './data';
import ParticleAce from './ParticleAce';

type Props = { totals: AnyRecord; series: AnyRecord[]; motionEnabled: boolean; start: string; end: string; scope: string; onExplore: () => void; onHistory: () => void; onFilm: () => void; onDemand: () => void; onModel: () => void };

function Trace({ values, fixedMax }: { values: number[]; fixedMax?: number }) {
  const finite = values.map(v => Number.isFinite(v) ? v : 0);
  if (!finite.length) return <span className="ace-trace-empty">No observations in scope</span>;
  const low = Math.min(0, ...finite), high = fixedMax ?? Math.max(1, ...finite);
  const zeroY = 31 - (0 - low) / (high - low) * 25;
  const coordinates = finite.map((v, i) => `${(i / Math.max(1, finite.length - 1) * 176).toFixed(1)},${(31 - (v - low) / (high - low) * 25).toFixed(1)}`).join(' ');
  return <svg className="ace-stat-trace" viewBox="0 0 176 36" preserveAspectRatio="none" aria-hidden="true"><path d={`M0 ${zeroY.toFixed(1)}H176`} stroke="currentColor" opacity=".22"/><polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke"/></svg>;
}

export default function AceOverview({ totals: t, series, motionEnabled, start, end, scope, onExplore, onHistory, onFilm, onDemand, onModel }: Props) {
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  useEffect(() => {
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => setVisible(entries.some(e => e.isIntersecting)), { threshold: .05 }) : null;
    if (section.current) observer?.observe(section.current);
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const cards = [
    { label: 'Total wagered', value: money(t.coin, true), detail: `${number(t.spins)} paid spins`, field: 'coin', action: onHistory, target: 'monthly performance', index: '01' },
    { label: 'Actual house win', value: money(t.win, true), detail: `${percent(t.hold)} observed hold`, field: 'win', action: onExplore, target: 'machine evidence', index: '02' },
    { label: 'Expected house win', value: money(t.theo, true), detail: `${percent(t.theoHold)} configured hold`, field: 'theo', action: onModel, target: 'model validation', index: '03' },
    { label: 'Floor availability', value: percent(t.availability), detail: `${number(t.downtime)} machine-hours unavailable`, field: 'availability', action: onDemand, target: 'downtime analysis', index: '04' },
  ];
  return <section ref={section} className="ace-overview" aria-label="The Gilded Ace floor overview" data-active={visible && pageVisible && motionEnabled ? 'true' : 'false'} data-motion={motionEnabled ? 'on' : 'off'}>
    <div className="ace-visual-field"><ParticleAce motionEnabled={motionEnabled}/></div>
    <div className="ace-coordinate ace-coordinate-top" aria-hidden="true">GA / 001<span>THE FLOOR, RECONSIDERED</span><i>♠</i></div>
    <div className="ace-overview-copy">
      <div className="ace-overline"><span/> THE GILDED ACE / FLOOR INTELLIGENCE</div>
      <h1>Read the floor.<br/><span>Find the signal.</span></h1>
      <p>Low earnings don’t tell the whole story.<br/>Separate chance from performance.<br/>Let the evidence make the next move.</p>
      <div className="ace-primary-actions"><button className="ace-enter" onClick={onExplore}>Explore the floor <ArrowUpRight size={17}/></button><button className="ace-film-link" onClick={onFilm} disabled={!motionEnabled} title={motionEnabled ? "Replay cinematic introduction" : "Turn motion on to replay the introduction"}><Play size={12}/> The ace in motion</button></div>
      <div className="ace-verdict-note"><span>THE CALL / JAN–JUN</span><strong>Pause blanket replacement.</strong><p>Inspect one signal. Test one zone.<br/>Keep $91,300 in reserve.</p></div>
    </div>
    <div className="ace-stat-field" role="group" aria-label="Floating floor performance metrics">
      {cards.map((card, i) => <div key={card.field} className={`ace-stat-slot ace-stat-slot-${i}`} style={{ '--order': i } as React.CSSProperties}><div className="ace-stat-drift"><button className="ace-stat-card metric-card" onClick={card.action} aria-label={`${card.label}: ${card.value}. ${card.detail}. Open ${card.target}`}><div className="ace-stat-head"><span>{card.index} / {card.label}</span><MoveUpRight size={12}/></div><strong className="metric-value">{card.value}</strong><span className="metric-detail">{card.detail}</span><Trace fixedMax={card.field === 'availability' ? 100 : undefined} values={series.map(d => card.field === 'availability' ? ratio(d.available, d.scheduled) * 100 : d[card.field])}/><span className="ace-stat-foot">DAILY TRACE <i/> {card.field === 'availability' ? '0–100%' : 'ZERO BASELINE'}</span></button></div></div>)}
    </div>
    <div className="ace-floor-caption"><span className="ace-scope"><i/> {shortDate(start)} — {shortDate(end)}, 2025<span>{scope} · {number(t.machines)} machines in scope</span></span><button onClick={onHistory}>Follow the six-month story <ArrowDown size={14}/></button><span className="ace-gesture">{motionEnabled ? 'MOVE ACROSS THE ACE' : 'MOTION OFF'}<span>SYNTHETIC CASE STUDY / 2025</span></span></div>
  </section>;
}
