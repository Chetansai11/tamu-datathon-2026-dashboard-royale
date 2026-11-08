import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { aggregate, money, niceName, type AnyRecord } from './data';
import './floor-transition.css';

type Props = { data: any; motionEnabled: boolean; onContinue: () => void; onClose: () => void };
type Candidate = {
  id: string; rank: number; win: number; expected: number; days: number;
  firstDate: string; lastDate: string; activeAtEnd: boolean; shortExposure: boolean;
  backFortyHistory: boolean; locationNames: string[]; inspectionSignal: boolean;
  z: number; adjustedP: number;
};
const START = '2025-01-01';
const END = '2025-06-30';
const steps = ['Shortlist', 'Location', 'Decision'];
const exactMoney = (value: number) => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : '—';
const dateLabel = (date: string) => date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown';

export default function AceFloorTransition({ data, motionEnabled, onContinue, onClose }: Props) {
  const id = 'ace-floor-' + useId().replace(/:/g, '');
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const animate = motionEnabled && !reducedMotion;
  const [entered, setEntered] = useState(!animate);
  const [step, setStep] = useState(0);

  const story = useMemo(() => {
    const reported: AnyRecord[] = data.reports?.q1?.bottom10 || [];
    const source: AnyRecord[] = reported.length ? reported.slice(0, 10) : aggregate(data, START, END, 'all', 'all').machines
      .sort((a, b) => a.win - b.win).slice(0, 10)
      .map(m => ({ machine_id: m.id, house_win: m.win, theo: m.theo, machine_days: m.days, luck_z: m.z, payout_p_bonferroni: m.metrics?.bonferroniP, inspect_signal: m.metrics?.bonferroniP < .05 }));
    const histories = new Map<string, { dates: Set<string>; zones: Set<string> }>(source.map(row => [row.machine_id, { dates: new Set<string>(), zones: new Set<string>() }] as const));
    const ix = Object.fromEntries((data.dailyColumns || []).map((column: string, index: number) => [column, index]));
    for (const row of data.daily || []) {
      const date = data.dates[row[ix.date]];
      const history = histories.get(data.machines[row[ix.machine]]?.id);
      if (history && date >= START && date <= END) { history.dates.add(date); history.zones.add(row[ix.zone]); }
    }
    const candidates: Candidate[] = source.map((row, index) => {
      const history = histories.get(row.machine_id)!;
      const dates = [...history.dates].sort();
      const days = dates.length || row.machine_days;
      const locationNames = history.zones.size ? [...history.zones].map(zone => niceName(zone, data.zones)) : row.zone_names || [];
      return {
        id: row.machine_id, rank: index + 1, win: row.house_win, expected: row.theo, days,
        firstDate: dates[0] || row.first_day || '', lastDate: dates[dates.length - 1] || row.last_day || '',
        activeAtEnd: dates.length ? history.dates.has(END) : !!row.on_floor_at_end,
        shortExposure: row.short_exposure ?? days < 181,
        backFortyHistory: history.zones.size ? history.zones.has('Z-B40') : locationNames.includes('Back Forty'),
        locationNames, inspectionSignal: row.inspect_signal ?? row.payout_p_bonferroni < .05,
        z: row.luck_z, adjustedP: row.payout_p_bonferroni,
      };
    });
    return {
      candidates,
      locationCount: candidates.filter(machine => machine.backFortyHistory).length,
      signalCount: candidates.filter(machine => machine.inspectionSignal).length,
      inactiveCount: candidates.filter(machine => !machine.activeAtEnd).length,
      shortCount: candidates.filter(machine => machine.shortExposure).length,
      arrival: candidates.find(machine => machine.firstDate > START),
      signal: candidates.find(machine => machine.id === 'M-1158'),
    };
  }, [data]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(!!query?.matches);
    query?.addEventListener?.('change', change);
    return () => query?.removeEventListener?.('change', change);
  }, []);
  useEffect(() => {
    if (!animate) { setEntered(true); return; }
    if (entered) return;
    const timer = window.setTimeout(() => setEntered(true), 1100);
    return () => window.clearTimeout(timer);
  }, [animate, entered]);
  useEffect(() => {
    if (!previousFocusRef.current) previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mountedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    headingRef.current?.focus({ preventScroll: true });
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || []);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); headingRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('keydown', keydown, true);
      document.body.style.overflow = previousOverflow;
      // Root clears background inert in this commit; StrictMode remounts cancel restoration.
      queueMicrotask(() => { if (!mountedRef.current && previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true }); });
    };
  }, []);

  const selectStep = (next: number) => {
    setEntered(true);
    setStep(Math.max(0, Math.min(2, next)));
    // Keep each new explanation visible when advancing from the sticky controls.
    if (dialogRef.current) dialogRef.current.scrollTop = 0;
  };
  const phase = entered || !animate ? 'ready' : 'entering';
  const signal = story.signal;
  const headlines = ['Ten low earners. Look closer.', 'Nine share a location history.', 'One payout signal. Check it.'];
  const explanations = [
    'These are the ten lowest earners by actual house win over January–June; low totals alone do not justify replacement.',
    'Nine candidates spent time in Back Forty during January–June, including M-1158.',
    'M-1158 warrants a payout inspection after correcting for tests across all machines screened.',
  ];

  return createPortal(
    <div className="ace-floor-transition" data-step={step} data-phase={phase} data-motion={animate ? 'on' : 'off'} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="af-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={id + '-title'} aria-describedby={id + '-description'}>
        <header className="af-header">
          <div className="af-title-group"><span className="af-ace-stamp" aria-hidden="true">♠</span><div><h2 id={id + '-title'} tabIndex={-1} ref={headingRef}>Explore the floor</h2><p>January–June 2025</p></div></div>
          <nav className="af-steps" aria-label="Floor story steps">{steps.map((label, index) => <button key={label} aria-pressed={step === index} onClick={() => selectStep(index)}><span>{String(index + 1).padStart(2, '0')}</span>{label}</button>)}</nav>
          <button className="af-close" onClick={onClose} aria-label="Close floor preview"><X size={19} /></button>
        </header>
        <div className="af-story-heading" aria-live="polite" aria-atomic="true"><span className="af-eyebrow">{step === 0 ? 'THE SHORTLIST' : step === 1 ? 'THE SHARED CONTEXT' : 'THE NEXT DECISION'}</span><h3>{headlines[step]}</h3><p id={id + '-description'}>{explanations[step]}</p></div>
        <div className="af-content">
          <section className="af-card-field" aria-label="The fixed ten lowest-earning machines">
            <div className="af-card-grid-caption"><span>Actual house win · rounded dollars</span><span>Fixed rank order</span></div>
            <svg className="af-deal-ghost" viewBox="0 0 240 260" aria-hidden="true"><path d="M120 15C101 48 35 85 25 125C10 182 76 210 110 174C108 203 99 222 82 244H158C141 222 132 203 130 174C164 210 230 182 215 125C205 85 139 48 120 15Z" /></svg>
            <div className="af-card-grid">{story.candidates.map((machine, index) => {
              const emphasized = step === 0 || (step === 1 ? machine.backFortyHistory : machine.inspectionSignal);
              const status = !machine.activeAtEnd ? 'Inactive June 30' : machine.firstDate > START ? `New ${dateLabel(machine.firstDate)}` : 'Active June 30';
              const style = { '--af-card-order': index, '--af-deal-x': `${(2 - index % 5) * 18}px`, '--af-deal-turn': `${(index % 5 - 2) * 3}deg` } as CSSProperties;
              return <article key={machine.id} className={'af-candidate-card' + (emphasized ? ' af-emphasized' : '')} style={style} data-machine-id={machine.id} data-back-forty-history={String(machine.backFortyHistory)} data-inspection-signal={String(machine.inspectionSignal)} data-active-at-end={String(machine.activeAtEnd)} data-short-exposure={String(machine.shortExposure)} aria-label={`Rank ${machine.rank}, ${machine.id}`}>
                <div className="af-card-top"><span className="af-rank" aria-label={`Rank ${machine.rank}`}>{String(machine.rank).padStart(2, '0')}</span><h4>{machine.id}</h4><span className="af-card-suit" aria-hidden="true">♠</span></div>
                <div className="af-card-win" title={`Exact actual house win: ${exactMoney(machine.win)}`}>{money(machine.win)}</div>
                <span className="af-card-metric-label">Actual house win</span>
                <div className="af-card-days"><strong>{machine.days}</strong> active days</div>
                <div className={'af-location-badge' + (machine.backFortyHistory ? ' af-location-back' : '')} title={`January–June location history: ${machine.locationNames.join(', ')}`}><i aria-hidden="true" />{machine.backFortyHistory ? 'Back Forty' : machine.locationNames.includes('High-Limit Room') ? 'High-Limit Room' : machine.locationNames.join(', ') || 'Location unknown'}</div>
                <div className="af-card-status" data-inactive={String(!machine.activeAtEnd)}>{status}</div>
                <span className="af-inspection-badge" aria-hidden={step !== 2 || !machine.inspectionSignal}>{machine.inspectionSignal && step === 2 ? 'Inspection signal' : '\u00a0'}</span>
              </article>;
            })}</div>
            <p className="af-layout-note">Ranked evidence cards · location badges show January–June history.</p>
          </section>
          <aside className="af-evidence" aria-label="Evidence for the current step">
            {step === 0 && <><span className="af-rail-kicker">CONTEXT BEFORE ACTION</span><div className="af-rail-number">{story.candidates.length}<span> candidates</span></div><dl className="af-rail-facts"><div><dt>Shorter exposure</dt><dd>{story.shortCount} machines</dd></div><div><dt>Inactive by June 30</dt><dd>{story.inactiveCount} machines</dd></div></dl><p className="af-context-note">{story.arrival?.id} joined on {dateLabel(story.arrival?.firstDate || '')}, with only {story.arrival?.days} active days to earn its place.</p></>}
            {step === 1 && <><span className="af-rail-kicker">SHARED LOCATION HISTORY</span><div className="af-rail-number af-sage">{story.locationCount}<span> of {story.candidates.length}</span></div><p className="af-rail-label">Spent time in Back Forty</p><div className="af-location-key"><i /><span>Sage cards share this history.<br />M-1158 is one of the nine.</span></div><p className="af-context-note">A shared location is an association. Test placement before attributing cause.</p></>}
            {step === 2 && <><span className="af-rail-kicker">{story.signalCount} PAYOUT INSPECTION SIGNAL</span><div className="af-signal-id">{signal?.id || 'M-1158'}</div><dl className="af-signal-facts"><div><dt>Actual house win</dt><dd>{exactMoney(signal?.win ?? NaN)}</dd></div><div><dt>Expected house win</dt><dd>{money(signal?.expected ?? NaN)}</dd></div></dl><div className="af-statistical-evidence"><span>z = {Number.isFinite(signal?.z) ? signal!.z.toFixed(2) : '—'}</span><span>Adjusted p = {Number.isFinite(signal?.adjustedP) ? signal!.adjustedP.toFixed(6) : '—'}</span></div><p className="af-context-note af-clay-note">Bonferroni-adjusted across the floor. A signal is not proof of a defect.</p></>}
          </aside>
        </div>
        <footer className="af-footer">
          <div className="af-step-controls"><button onClick={() => selectStep(step - 1)} disabled={step === 0} aria-label="Previous floor story step"><ArrowLeft size={16} /><span>Back</span></button><span className="af-step-count">{step + 1} / 3</span><button onClick={() => selectStep(step + 1)} disabled={step === 2} aria-label="Next floor story step"><span>Next</span><ArrowRight size={16} /></button></div>
          <div className="af-takeaway"><strong>Pause blanket replacement.</strong><span>Inspect M-1158. Test Back Forty.</span></div>
          <button className="af-continue" onClick={onContinue}>Open six-month explorer<ArrowRight size={16} /></button>
        </footer>
      </div>
    </div>, document.body,
  );
}
