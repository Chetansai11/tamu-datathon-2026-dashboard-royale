import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronRight, SkipForward, X } from 'lucide-react';
import { aggregate, niceName, type AnyRecord } from './data';
import './floor-transition.css';

type Props = { data: any; motionEnabled: boolean; onContinue: () => void; onClose: () => void };
type Point = { x: number; y: number };
type PositionedMachine = AnyRecord & { actualX: number; actualY: number };
type MachineMark = PositionedMachine & { px: number; py: number; origin: Point; candidate: boolean; inspection: boolean };
type Chapter = 'candidates' | 'location' | 'inspection';
const SNAPSHOT = '2025-06-30';
const START = '2025-01-01';
const INSPECTION_ID = 'M-1158';

// The starting positions are decorative. Only the final positions encode data.
const spadeOutline: Point[] = [{ x: 0, y: -1 }];
function curve(a: Point, b: Point, end: Point) {
  const start = spadeOutline[spadeOutline.length - 1];
  for (let i = 1; i <= 20; i++) {
    const t = i / 20, s = 1 - t;
    spadeOutline.push({ x: s ** 3 * start.x + 3 * s * s * t * a.x + 3 * s * t * t * b.x + t ** 3 * end.x, y: s ** 3 * start.y + 3 * s * s * t * a.y + 3 * s * t * t * b.y + t ** 3 * end.y });
  }
}
curve({ x: -.25, y: -.64 }, { x: -.88, y: -.25 }, { x: -.92, y: .15 });
curve({ x: -.99, y: .65 }, { x: -.35, y: .89 }, { x: -.12, y: .5 });
curve({ x: -.14, y: .8 }, { x: -.22, y: .95 }, { x: -.36, y: 1.12 });
spadeOutline.push({ x: .36, y: 1.12 });
curve({ x: .22, y: .95 }, { x: .14, y: .8 }, { x: .12, y: .5 });
curve({ x: .35, y: .89 }, { x: .99, y: .65 }, { x: .92, y: .15 });
curve({ x: .88, y: -.25 }, { x: .25, y: -.64 }, { x: 0, y: -1 });
const spadePath = spadeOutline.map((p, i) => `${i ? 'L' : 'M'}${360 + p.x * 185},${275 + p.y * 185}`).join(' ') + 'Z';
function insideSpade(p: Point) {
  let inside = false;
  for (let i = 0, j = spadeOutline.length - 1; i < spadeOutline.length; j = i++) {
    const a = spadeOutline[i], b = spadeOutline[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function halton(index: number, base: number) {
  let result = 0, fraction = 1 / base;
  while (index > 0) { result += fraction * (index % base); index = Math.floor(index / base); fraction /= base; }
  return result;
}
function decorativeOrigins(count: number) {
  const points: Point[] = [];
  for (let i = 1; points.length < count; i++) {
    const p = { x: halton(i, 2) * 2 - 1, y: halton(i, 3) * 2.12 - 1 };
    if (insideSpade(p)) points.push({ x: 360 + p.x * 185, y: 275 + p.y * 185 });
  }
  return points;
}

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
  const [formed, setFormed] = useState(!animate);
  const [chapter, setChapter] = useState<Chapter>('candidates');

  const floor = useMemo(() => {
    const snapshot = aggregate(data, SNAPSHOT, SNAPSHOT, 'all', 'all');
    const reported = data.reports?.q1?.bottom10;
    const candidates: string[] = Array.isArray(reported) && reported.length
      ? reported.map((row: AnyRecord) => row.machine_id)
      : aggregate(data, START, SNAPSHOT, 'all', 'all').machines.sort((a, b) => a.win - b.win).slice(0, 10).map(m => m.id);
    const candidateSet = new Set(candidates);
    const activeSet = new Set(snapshot.machines.map(m => m.id));
    const locations = new Map<string, AnyRecord>((data.locations || []).map((loc: AnyRecord) => [loc.location_id, loc]));
    // Resolve the location attached to this machine-day. Never substitute an
    // index grid or the machine catalogue's potentially later placement.
    const positioned = snapshot.machines.flatMap<PositionedMachine>(m => {
      const loc = locations.get(m.location);
      return loc && Number.isFinite(loc.x_m) && Number.isFinite(loc.y_m)
        ? [{ ...m, actualX: loc.x_m, actualY: loc.y_m }] : [];
    });
    const minX = Math.min(...positioned.map(m => m.actualX), 0);
    const maxX = Math.max(...positioned.map(m => m.actualX), 1);
    const minY = Math.min(...positioned.map(m => m.actualY), 0);
    const maxY = Math.max(...positioned.map(m => m.actualY), 1);
    // A common scale for both axes preserves the supplied spatial geometry.
    const scale = Math.min(614 / (maxX - minX || 1), 494 / (maxY - minY || 1));
    const offsetX = (720 - (maxX - minX) * scale) / 2;
    const offsetY = 67 + (494 - (maxY - minY) * scale) / 2;
    const origins = decorativeOrigins(positioned.length);
    const marks = positioned.map<MachineMark>((m, i) => ({ ...m, px: offsetX + (m.actualX - minX) * scale, py: offsetY + (m.actualY - minY) * scale, origin: origins[i], candidate: candidateSet.has(m.id), inspection: m.id === INSPECTION_ID }));
    const zones = [...new Set(marks.map(m => m.zone))].map(zone => {
      const members = marks.filter(m => m.zone === zone);
      return { id: zone, name: niceName(zone, data.zones), x: members.reduce((total, m) => total + m.px, 0) / members.length, y: Math.min(...members.map(m => m.py)) - 15 };
    });
    const backForty = snapshot.machines.filter(m => m.zone === 'Z-B40');
    const historicalBackForty = new Set<string>();
    const ix = Object.fromEntries(data.dailyColumns.map((column: string, i: number) => [column, i]));
    for (const row of data.daily || []) {
      const date = data.dates[row[ix.date]], machineId = data.machines[row[ix.machine]]?.id;
      if (date >= START && date <= SNAPSHOT && row[ix.zone] === 'Z-B40' && candidateSet.has(machineId)) historicalBackForty.add(machineId);
    }
    const signal = (data.reports?.q1?.ranking || []).find((row: AnyRecord) => row.machine_id === INSPECTION_ID)
      || (reported || []).find((row: AnyRecord) => row.machine_id === INSPECTION_ID);
    return {
      marks, zones, activeCount: snapshot.machines.length, candidateCount: candidates.length,
      activeCandidates: candidates.filter(machineId => activeSet.has(machineId)).length,
      absent: candidates.filter(machineId => !activeSet.has(machineId)),
      unmapped: snapshot.machines.length - marks.length, backFortyCount: backForty.length,
      backFortyCandidates: backForty.filter(m => candidateSet.has(m.id)).length,
      historicalBackFortyCount: historicalBackForty.size,
      signalPresent: activeSet.has(INSPECTION_ID), signalZ: signal?.luck_z,
    };
  }, [data]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(!!query?.matches);
    query?.addEventListener?.('change', change);
    return () => query?.removeEventListener?.('change', change);
  }, []);
  useEffect(() => {
    if (!animate) { setFormed(true); return; }
    if (formed) return;
    const timer = window.setTimeout(() => setFormed(true), 2500);
    return () => window.clearTimeout(timer);
  }, [animate, formed]);
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
      // Defer until root removes inert. A StrictMode remount cancels restoration.
      queueMicrotask(() => { if (!mountedRef.current && previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true }); });
    };
  }, []);

  const selectChapter = (next: Chapter) => { setFormed(true); setChapter(next); };
  const phase = formed || !animate ? 'floor' : 'forming';
  return createPortal(
    <div className="ace-floor-transition" data-phase={phase} data-motion={animate ? 'on' : 'off'} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="af-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={id + '-title'} aria-describedby={id + '-description'}>
        <header className="af-header">
          <div><span className="af-eyebrow">FIELD STUDY / 01</span><h2 id={id + '-title'} tabIndex={-1} ref={headingRef}>Behind the ace.<br />{' '}<span>A floor of decisions.</span></h2></div>
          <button className="af-close" onClick={onClose} aria-label="Close floor preview"><X size={19} /></button>
        </header>
        <p id={id + '-description'} className="af-description">One mark, one active machine. Follow the evidence from a six-month shortlist to its place on the floor.</p>
        <div className="af-content">
          <div className="af-map-column">
            <div className="af-map-meta"><span><i /> JUNE 30, 2025</span><span>{floor.activeCount} ACTIVE MACHINES</span></div>
            <div className="af-map-wrap">
              <svg className="af-map" viewBox="0 0 720 610" role="img" aria-labelledby={id + '-map-title ' + id + '-map-description'}>
                <title id={id + '-map-title'}>Casino floor snapshot, June 30, 2025</title>
                <desc id={id + '-map-description'}>{floor.marks.length} machines at their dated floor coordinates. Brass diamonds identify {floor.activeCandidates} present members of the fixed January–June bottom {floor.candidateCount}. Sage marks identify other Back Forty machines. M-1158 has a clay inspection outline. {floor.absent.length} historical candidates are absent from this snapshot. Decorative initial positions do not encode data.</desc>
                <defs><pattern id={id + '-grid'} width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#c4a77d" fillOpacity=".13" /></pattern></defs>
                <rect className="af-floor-grid" x="15" y="15" width="690" height="580" rx="5" fill={'url(#' + id + '-grid)'} />
                <path className="af-spade-ghost" d={spadePath} fill="#c4a77d" fillOpacity=".025" stroke="#c4a77d" strokeWidth="1" strokeOpacity=".24" aria-hidden="true" />
                <g className="af-zone-labels" aria-hidden="true">{floor.zones.map(zone => <text key={zone.id} x={zone.x} y={zone.y} textAnchor="middle" className={zone.id === 'Z-B40' ? 'af-back-forty-label' : undefined}>{zone.name.toUpperCase()}</text>)}</g>
                {floor.marks.map((machine, index) => {
                  const emphasis = chapter === 'candidates' ? machine.candidate : chapter === 'location' ? machine.zone === 'Z-B40' : machine.inspection;
                  const style = { '--af-start-x': `${machine.origin.x - machine.px}px`, '--af-start-y': `${machine.origin.y - machine.py}px`, '--af-delay': `${(index % 17) * 8}ms` } as CSSProperties;
                  return <g key={machine.id} transform={`translate(${machine.px} ${machine.py})`} data-machine-id={machine.id} data-candidate={String(machine.candidate)} data-zone={machine.zone} data-inspection-signal={String(machine.inspection)} className={'af-machine-position' + (emphasis ? ' af-emphasized' : '')}>
                    <g className="af-machine" style={style}>
                      <path className={'af-machine-mark' + (machine.candidate ? ' af-candidate' : machine.zone === 'Z-B40' ? ' af-back-forty' : '') + (machine.inspection ? ' af-inspection' : '')} d={machine.candidate ? 'M0 -5.2 5.2 0 0 5.2 -5.2 0Z' : 'M-3.1 -3.1H3.1V3.1H-3.1Z'} />
                      <title>{machine.id} · {niceName(machine.zone, data.zones)} · {machine.bank}{machine.candidate ? ' · January–June bottom 10' : ''}{machine.inspection ? ' · Payout inspection signal; not proof of a fault' : ''}</title>
                    </g>
                  </g>;
                })}
                <text className="af-map-coordinate-note" x="360" y="593" textAnchor="middle">DATED MACHINE PLACEMENTS · EQUAL SCALE ON BOTH AXES</text>
              </svg>
              <div className="af-formation-note" aria-hidden="true"><span>FROM SYMBOL TO SIGNAL</span><i /></div>
            </div>
            <div className="af-legend" aria-label="Map legend">
              <span><i className="af-key-other" />Other machines</span><span><i className="af-key-back" />Other Back Forty</span><span><i className="af-key-candidate" />Bottom 10 candidate</span><span><i className="af-key-signal" />Inspection signal</span>
            </div>
            {floor.unmapped > 0 && <p className="af-data-note">{floor.unmapped} active machine{floor.unmapped === 1 ? ' has' : 's have'} no valid dated coordinates and {floor.unmapped === 1 ? 'is' : 'are'} omitted from the map.</p>}
          </div>
          <aside className="af-evidence" aria-label="Explore the floor evidence">
            <div className="af-chapters" aria-label="Evidence layers">
              <button aria-pressed={chapter === 'candidates'} onClick={() => selectChapter('candidates')}><span>01</span>Candidates<ChevronRight size={14} /></button>
              <button aria-pressed={chapter === 'location'} onClick={() => selectChapter('location')}><span>02</span>Back Forty<ChevronRight size={14} /></button>
              <button aria-pressed={chapter === 'inspection'} onClick={() => selectChapter('inspection')}><span>03</span>Inspection signal<ChevronRight size={14} /></button>
            </div>
            <div className="af-chapter-copy" aria-live="polite" aria-atomic="true">
              {chapter === 'candidates' && <><span className="af-copy-kicker">THE MANAGER’S SHORTLIST</span><div className="af-big-number">{floor.activeCandidates}<span> / {floor.candidateCount}</span></div><h3>Still on the floor.</h3><p>The bottom {floor.candidateCount} are fixed by total actual house win over January 1–June 30, 2025. This is a shortlist to investigate, not a replacement verdict.</p><div className="af-evidence-note"><strong>{floor.absent.length} absent from this snapshot</strong><span>{floor.absent.length ? floor.absent.join(' · ') : 'All historical candidates are present.'}</span></div></>}
              {chapter === 'location' && <><span className="af-copy-kicker">PLACEMENT IS PART OF THE STORY</span><div className="af-big-number">{floor.backFortyCount}<span> machines</span></div><h3>One shared location.</h3><p>{floor.backFortyCount} machines occupy Back Forty on June 30, including {floor.backFortyCandidates} of the historical candidates. Sage marks show the rest of this zone.</p><div className="af-evidence-note"><strong>{floor.historicalBackFortyCount} of {floor.candidateCount} spent time here</strong><span>January–June history. A location association supports a placement test; it does not establish a cause.</span></div></>}
              {chapter === 'inspection' && <><span className="af-copy-kicker">A SEPARATE STATISTICAL SIGNAL</span><div className="af-machine-id">M-1158</div><h3>Inspect. Then decide.</h3><p>The January–June payout screen flags M-1158 after correcting for tests across the floor{Number.isFinite(floor.signalZ) ? ` (z = ${floor.signalZ.toFixed(2)})` : ''}. Its clay outline is separate from candidate and location membership.</p><div className="af-evidence-note af-inspection-note"><strong>A signal is not proof of a defect.</strong><span>{floor.signalPresent ? 'Present in the June 30 snapshot. ' : 'Absent from this snapshot. '}Check payout configuration and records before recommending replacement.</span></div></>}
            </div>
          </aside>
        </div>
        <footer className="af-footer">
          <div className="af-snapshot-caption"><span>FLOOR / JUNE 30, 2025</span><p>Candidates / January–June 2025<br />Explorer opens the full six-month history.</p></div>
          <div className="af-actions"><button className="af-skip" onClick={() => setFormed(true)} disabled={phase === 'floor'}>{phase === 'floor' ? <Check size={15} /> : <SkipForward size={15} />}{phase === 'floor' ? 'Floor revealed' : 'Skip animation'}</button><button className="af-continue" onClick={onContinue}>Open six-month explorer<ArrowRight size={16} /></button></div>
        </footer>
        <span className="af-sr-only" role="status">{phase === 'forming' ? 'Revealing the floor. You can skip the animation or open the explorer immediately.' : `Floor revealed: ${floor.activeCount} active machines on June 30, 2025.`}</span>
      </div>
    </div>, document.body,
  );
}
