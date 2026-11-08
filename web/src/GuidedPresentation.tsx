import { useLayoutEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, Info, MapPin, ShieldCheck, X } from 'lucide-react';
import { aggregate, money, niceName, number, percent, shortDate } from './data';
import { ModelChart } from './Charts';
import Decomposition from './Decomposition';
import { MotionContext } from './motion';
import './presentation.css';

type Props = {
  data: any;
  motionEnabled: boolean;
  onClose: () => void;
  onNavigate: (page: string) => void;
};

const chapters = [
  { label: 'The question', title: 'Should the bottom ten go?' },
  { label: 'The earnings gap', title: 'Follow the gap, one component at a time.' },
  { label: 'The location', title: 'A machine inherits its surroundings.' },
  { label: 'Your selection', title: 'Change the scope. Challenge the answer.' },
  { label: 'The holdout', title: 'A forecast has to earn its place.' },
  { label: 'The decision', title: 'Price the next step. Keep your options.' },
];

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const signedPercent = (value: number) => finite(value) ? `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%` : '—';
const previousDay = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(value.getTime())) return '';
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};
const horizonLabel = (value: string) => {
  const [first, last] = String(value || '').split(' to ');
  const from = new Date(`${first}T12:00:00`), to = new Date(`${last}T12:00:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return value || 'See the action evidence for the decision horizon';
  if (first.slice(0, 7) === last.slice(0, 7)) return `${from.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}–${to.getDate()}, ${to.getFullYear()}`;
  return `${from.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} – ${to.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
};
const monthLabel = (date: string) => new Date(`${date.slice(0, 7)}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

function Figure({ label, value, detail, tone = '' }: { label: string; value: string; detail?: string; tone?: string }) {
  return <div className={`presentation-figure ${tone}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

/** A manual, data-backed presentation. Dashboard filters remain independent. */
export default function GuidedPresentation({ data, motionEnabled, onClose, onNavigate }: Props) {
  const [chapter, setChapter] = useState(0);
  const [period, setPeriod] = useState('full');
  const [bank, setBank] = useState('all');
  const [motionPaused, setMotionPaused] = useState(false);
  const presentationMotion = motionEnabled && !motionPaused;
  const dialog = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef({ onClose, onNavigate });
  callbacks.current = { onClose, onNavigate };
  const titleId = useId();
  const descriptionId = useId();
  const start = data.meta?.windowStart || data.dates?.[0] || '';
  const end = data.meta?.windowEnd || data.dates?.at(-1) || '';
  const monthStart = `${end.slice(0, 7)}-01`;
  const selectedStart = period === 'full' ? start : monthStart;
  const full = useMemo(() => aggregate(data, start, end, 'all', 'all'), [data, start, end]);
  const scoped = useMemo(() => period === 'full' && bank === 'all' ? full : aggregate(data, selectedStart, end, 'all', bank), [data, full, period, bank, selectedStart, end]);
  const bankOptions = useMemo(() => [...(data.banks || [])].sort((a: any, b: any) => String(a.id || a.bank_id).localeCompare(String(b.id || b.bank_id))), [data]);
  const bottomTen = data.reports?.decomp?.gm_bottom10 || data.reports?.q1?.bottom10 || [];
  const closure = data.reports?.q2?.closure;
  const closureZone = closure ? niceName(closure.affected_zone, data.zones) : '';
  const closureRows = (closure?.periods || []).filter((row: any) => row.group === closureZone);
  const closureMaximum = Math.max(1, ...closureRows.map((row: any) => Number(row.coin_in_per_available_hour) || 0));
  const model = data.model || {};
  const forecast = data.reports?.forecast?.summary || {};
  const modelMAE = model.modelMAE ?? forecast.model_mae;
  const baselineMAE = model.baselineMAE ?? forecast.baseline_mae;
  const coverage = forecast.coverage_90 ?? model.holdoutIntervalCoverage;
  const improvement = finite(modelMAE) && finite(baselineMAE) && baselineMAE > 0 ? (baselineMAE - modelMAE) / baselineMAE : NaN;
  const predictions = model.predictions || (data.reports?.forecast?.daily || []).map((row: any) => ({ ...row, predicted: row.prediction }));
  const actionReport = data.reports?.actions || {};
  const actions = actionReport.actions || [];
  const actionSummary = actionReport.summary || {};
  const budget = actionSummary.budget;
  const spend = actionSummary.spend ?? (actions.length ? actions.reduce((total: number, action: any) => total + (Number(action.cost) || 0), 0) : NaN);
  const reserve = actionSummary.reserve ?? (finite(budget) && finite(spend) ? budget - spend : NaN);
  const inspectionSignals = data.reports?.q1?.summary?.inspection_signals || [];
  const lastChapter = chapter === chapters.length - 1;

  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.style.overflow = 'hidden';
    if (scrollbar && document.documentElement.clientWidth > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight || '0') + scrollbar}px`;
    const background = [...document.body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(dialog.current));
    const saved = background.map(element => ({ element, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') }));
    saved.forEach(({ element }) => { element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true'); });
    const focusable = () => [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])') || [])].filter(element => !element.closest('[inert], [hidden]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); callbacks.current.onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); heading.current?.focus(); return; }
      const first = items[0], last = items[items.length - 1], active = document.activeElement;
      if (event.shiftKey && (active === first || !items.includes(active as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !dialog.current?.contains(active))) { event.preventDefault(); first.focus(); }
    };
    const keepFocus = (event: FocusEvent) => { if (event.target instanceof Node && !dialog.current?.contains(event.target)) heading.current?.focus({ preventScroll: true }); };
    // The dashboard already routes this evidence event. Dismiss its presentation layer too.
    const evidence = () => callbacks.current.onClose();
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', keepFocus);
    window.addEventListener('open-evidence', evidence);
    heading.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', keepFocus);
      window.removeEventListener('open-evidence', evidence);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      saved.forEach(({ element, inert, hidden }) => {
        if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
      });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => { content.current?.scrollTo?.({ top: 0, behavior: 'auto' }); heading.current?.focus({ preventScroll: true }); }, [chapter]);
  const next = () => setChapter(current => Math.min(chapters.length - 1, current + 1));
  const navigate = (page: string) => callbacks.current.onNavigate(page);

  return createPortal(<MotionContext.Provider value={presentationMotion}><div className="guided-presentation" data-step={chapter} data-motion={presentationMotion ? 'on' : 'off'} data-testid="guided-presentation" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <header className="presentation-topbar"><div className="presentation-brand"><span aria-hidden="true">♠</span><div><strong>THE GILDED ACE</strong><small>A guided investigation</small></div></div><div className="presentation-topbar-controls"><button type="button" className="presentation-motion" aria-label="Toggle presentation animations" aria-pressed={presentationMotion} disabled={!motionEnabled} onClick={() => setMotionPaused(value => !value)} title={!motionEnabled ? 'Motion follows your dashboard or system preference' : 'Pause or resume presentation animations'}>{presentationMotion ? 'Motion on' : 'Motion off'}</button><button type="button" className="presentation-exit" onClick={onClose} aria-label="Close presentation"><span>Exit presentation</span><X size={19}/></button></div></header>
    <nav className="presentation-progress" aria-label="Presentation chapters"><ol>{chapters.map((item, index) => <li key={item.label}><button type="button" onClick={() => setChapter(index)} aria-current={index === chapter ? 'step' : undefined} aria-label={`Chapter ${index + 1}: ${item.label}`} className={index < chapter ? 'complete' : ''}><span>{index < chapter ? <Check size={13}/> : String(index + 1).padStart(2, '0')}</span><span>{item.label}</span></button></li>)}</ol></nav>
    <div className="presentation-scroll" ref={content}>
      <main className="presentation-content" key={chapter}>
        <div className="presentation-kicker">THE INVESTIGATION <span aria-hidden="true">/</span> {String(chapter + 1).padStart(2, '0')}{chapter === 5 && <span className="presentation-horizon">Decision horizon · {horizonLabel(actionSummary.horizon)}</span>}</div>
        <h1 id={titleId} ref={heading} tabIndex={-1}>{chapters[chapter].title}</h1>
        <p className="presentation-description" id={descriptionId}>{[
          'The manager wants to replace the ten lowest earners. Start by asking what those earnings actually measure.',
          'Low earnings combine game math, location, time on the floor and payout variation. Follow the signed contributions before blaming the hardware.',
          'The dated walkway record gives us a useful comparison. It gives us an association to investigate, not an intervention effect to promise.',
          'These controls recalculate the actual machine-day records. Try the final month, then one bank, and watch the totals respond.',
          'The weekday model and a constant baseline face the same later dates. The test stays frozen; its uncertainty stays visible.',
          'Use known catalog prices to buy information and test a location hypothesis. Keep uncommitted money available for the next verified finding.',
        ][chapter]}</p>

        {chapter === 0 && <section className="presentation-opening" aria-label="The management question">
          <div className="presentation-question-card"><span className="presentation-card-ace" aria-hidden="true">♠</span><span className="presentation-label">THE PROPOSED RULE</span><blockquote>“Replace the {bottomTen.length || 'ten'} machines that earned the least.”</blockquote><p>A ranking tells us where to look.<br/> The explanation tells us what to do.</p></div>
          <div className="presentation-question-evidence"><div className="presentation-figures three"><Figure label="Candidates in the report" value={number(bottomTen.length)} detail="fixed full-period bottom group"/><Figure label="Machines observed" value={number(full.totals.machines)} detail="unique IDs across the period"/><Figure label="Gaming days" value={number(full.totals.days)} detail={`${shortDate(start)} – ${shortDate(end)}, ${end.slice(0, 4)}`}/></div><div className="presentation-thesis"><ShieldCheck size={22}/><div><strong>Explain before replacing.</strong><p>Compare configured game math, dated placement, available hours and payout variation. A screening signal calls for an inspection; it does not establish a defect.</p></div></div><div className="presentation-signal"><span>Corrected full-period payout signals</span><strong>{number(inspectionSignals.length)}</strong><small>{inspectionSignals.length ? inspectionSignals.join(' · ') : 'No signals in the supplied report'}</small></div></div>
        </section>}

        {chapter === 1 && <section className="presentation-decomposition" aria-label="Explain the bottom ten"><Decomposition data={data}/>{!data.reports?.decomp && <p className="presentation-note">The decomposition report is unavailable in this release.</p>}<div className="presentation-takeaway"><Info size={18}/><p>The benchmark is ten average machines. These are retrospective accounting contributions; the order of adjustment matters. They do not estimate what a replacement would earn.</p></div></section>}

        {chapter === 2 && <section className="presentation-location" aria-label="Dated location evidence">
          {closure ? <><div className="presentation-location-stat"><span className="presentation-label"><MapPin size={15}/>{closureZone} · {closure.walkway_id}</span><strong>{signedPercent(closure.ratio_of_ratios_change_pct)}</strong><p>change in the zone’s relative wager rate during the closure, compared with {closure.control}.</p>{Array.isArray(closure.ci95_pct) && <small>Descriptive 95% interval: {signedPercent(closure.ci95_pct[0])} to {signedPercent(closure.ci95_pct[1])}</small>}<div className="presentation-location-dates"><span><b>Closed</b>{shortDate(closure.closure_start)}</span><ChevronRight size={18}/><span><b>Reopened</b>{shortDate(closure.reopening_date)}</span></div></div><div className="presentation-location-chart"><h2>{closureZone} wager rate</h2><p>Dollars wagered per available machine-hour</p>{closureRows.map((row: any) => <div className={`presentation-location-row ${row.period === 'closed' ? 'closed' : ''}`} key={row.period}><div><span>{row.period === 'before' ? 'Before closure' : row.period === 'closed' ? 'Walkway closed' : 'After reopening'}<small>{row.period === 'before' ? `${shortDate(start)} – ${shortDate(previousDay(closure.closure_start))}` : row.period === 'closed' ? `${shortDate(closure.closure_start)} – ${shortDate(previousDay(closure.reopening_date))}` : `${shortDate(closure.reopening_date)} – ${shortDate(end)}`}</small></span><strong>{money(row.coin_in_per_available_hour)}</strong></div><div className="presentation-rate-track" aria-hidden="true"><i style={{ width: `${Math.max(0, row.coin_in_per_available_hour) / closureMaximum * 100}%` }}/></div></div>)}<small className="presentation-chart-axis">$0 <span>Common zero-based scale</span> {money(closureMaximum)} / h</small></div><div className="presentation-takeaway"><Info size={18}/><p>{closure.limitation || 'Game mix, guest mix, seasonality and play displaced into comparison zones remain alternative explanations.'}</p></div></> : <p className="presentation-note">The dated closure comparison is unavailable in this release.</p>}
        </section>}

        {chapter === 3 && <section className="presentation-scope" aria-label="Interactive scope demonstration"><div className="presentation-scope-controls"><label htmlFor="presentation-period">Period<select aria-label="Presentation period" id="presentation-period" value={period} onChange={event => setPeriod(event.target.value)}><option value="full">Full period · {shortDate(start)} – {shortDate(end)}</option><option value="last-month">{monthLabel(end)}</option></select></label><label htmlFor="presentation-bank">Bank<select aria-label="Presentation bank" id="presentation-bank" value={bank} onChange={event => setBank(event.target.value)}><option value="all">All banks</option>{bankOptions.map((item: any) => <option value={item.id || item.bank_id} key={item.id || item.bank_id}>{item.id || item.bank_id} · {niceName(item.zone || item.zone_id, data.zones)}</option>)}</select></label><button type="button" onClick={() => { setPeriod('full'); setBank('all'); }} disabled={period === 'full' && bank === 'all'}>Reset selection</button></div><div className="presentation-scope-status" role="status" aria-live="polite">{number(scoped.totals.machines)} machines · {number(scoped.totals.days)} gaming days · {number(scoped.totals.count)} machine-day records</div><div className="presentation-figures four" data-testid="presentation-scope-totals"><Figure label="Total wagered" value={money(scoped.totals.coin, true)} detail={money(scoped.totals.coin)}/><Figure label="Actual house win" value={money(scoped.totals.win, true)} detail={money(scoped.totals.win)}/><Figure label="Expected house win" value={money(scoped.totals.theo, true)} detail={money(scoped.totals.theo)}/><Figure label="Floor availability" value={percent(scoped.totals.availability)} detail={`${number(scoped.totals.available)} / ${number(scoped.totals.scheduled)} machine-hours`}/></div><div className="presentation-scope-formula"><span>THE DENOMINATOR MATTERS</span><strong>Σ available hours <span>÷</span> Σ scheduled hours</strong><p>Availability is calculated from summed hours. Wagers include replayed winnings; they are neither unique cash deposits nor profit.</p></div><div className="presentation-takeaway"><Info size={18}/><p>This demonstration has its own selection. The full-period decomposition, frozen model test and priced recommendation keep their stated evidence windows.</p></div></section>}

        {chapter === 4 && <section className="presentation-model" aria-label="Frozen model validation"><div className="presentation-model-period"><span><b>Train</b>{shortDate(model.trainStart || forecast.train_start)} – {shortDate(model.trainEnd || forecast.train_end)}</span><ArrowRight size={18}/><span><b>Holdout</b>{shortDate(model.testStart || forecast.test_start)} – {shortDate(model.testEnd || forecast.test_end)}</span><small>{number(model.testDays ?? forecast.test_days)} test days · no refitting</small></div><div className="presentation-figures three"><Figure label="Constant baseline MAE" value={money(baselineMAE, true)} detail={`${money(baselineMAE)} mean absolute daily error`}/><Figure label="Weekday model MAE" value={money(modelMAE, true)} detail={`${money(modelMAE)} · ${percent(improvement)} lower error`} tone="sage"/><Figure label="Actual band coverage" value={percent(coverage)} detail="for a nominal 90% forecast band" tone={coverage < .9 ? 'clay' : ''}/></div><div className="presentation-model-chart">{predictions.length > 0 ? <ModelChart predictions={predictions}/> : <p className="presentation-note">Daily holdout predictions are unavailable.</p>}<div className="presentation-chart-legend"><span><i className="actual"/>Actual wagers</span><span><i className="predicted"/>Weekday model</span><span><i className="baseline"/>Constant baseline</span></div></div><div className="presentation-takeaway"><ShieldCheck size={18}/><p>Choose the model form on January–February fits tested against March–April, then refit on January–April. {finite(coverage) && coverage < .9 ? 'The band undercovers the holdout: uncertainty is greater than the nominal label suggests. ' : ''}One test window does not establish a causal staffing return.</p><button type="button" className="presentation-link" onClick={() => navigate('model')}>Open model lab <ArrowUpRight size={16}/></button></div></section>}

        {chapter === 5 && <section className="presentation-decision" aria-label="Priced recommendation"><div className="presentation-figures three"><Figure label="Proposed catalog spend" value={money(spend)} detail={`${number(actionSummary.action_types ?? actions.length)} action types`} tone="brass"/><Figure label="Budget preserved" value={money(reserve)} detail={`of ${money(budget)} available`}/><Figure label="Assumed direct uplift" value={money(actionSummary.expected_direct_revenue_uplift)} detail="benefits require a measured test"/></div><div className="presentation-action-list">{actions.map((action: any, index: number) => <article key={action.action_type_id}><span className="presentation-action-number">{String(index + 1).padStart(2, '0')}</span><div><h2>{action.name}</h2><p>{(action.targets || []).map((target: string) => niceName(target, data.zones)).join(' · ')} <span aria-hidden="true">/</span> {number(action.lead_days)} lead day{action.lead_days === 1 ? '' : 's'} <span aria-hidden="true">/</span> {number(action.operating_days)} operating days</p><small>{action.action_type_id === 'A-INSPECT' ? 'Verify the signal. Inspection does not guarantee a fault, a repair or extra revenue.' : 'Test the location hypothesis. Watch for play displaced from other zones.'}</small></div><strong>{money(action.cost)}</strong></article>)}</div><div className="presentation-takeaway"><ShieldCheck size={18}/><p>Keep all funds is a valid comparator. Before spending, register the measurement plan, check disruption and revisit the assumptions in Action studio. Do not target heavy losers to increase play.</p></div><div className="presentation-final-actions"><button type="button" className="presentation-primary" onClick={() => navigate('actions')}>Open action studio <ArrowUpRight size={17}/></button><button type="button" className="presentation-secondary" onClick={() => navigate('evidence')}>Inspect the evidence <ArrowUpRight size={17}/></button><span>Every recommendation has a source, an alternative and a limit.</span></div></section>}
      </main>
    </div>
    <footer className="presentation-footer"><button type="button" className="presentation-back" aria-label="Previous chapter" disabled={chapter === 0} onClick={() => setChapter(current => Math.max(0, current - 1))}><ArrowLeft size={17}/>Previous</button><span className="presentation-page-count" aria-live="polite">Chapter {chapter + 1} of {chapters.length}</span><div>{!lastChapter && <button type="button" className="presentation-skip" onClick={next}>Skip chapter</button>}<button type="button" className="presentation-primary" aria-label={lastChapter ? 'Finish presentation' : 'Next chapter'} onClick={lastChapter ? onClose : next}>{lastChapter ? 'Finish presentation' : 'Next chapter'}<ArrowRight size={17}/></button></div></footer>
  </div></MotionContext.Provider>, document.body);
}
