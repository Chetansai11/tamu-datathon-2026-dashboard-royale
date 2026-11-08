import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download, Info, RotateCcw } from 'lucide-react';
import { csvDownload, money } from './data';
import { evaluateJulyScenario } from './july-monitoring.mjs';
import './july-monitoring.css';

const dollars = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
const statusLabels: Record<string, string> = { awaiting_data: 'Not supplied', within_band: 'Within band', watch: 'Watch', review: 'Review', invalid: 'Use nonnegative dollars, max 2 decimals' };

export default function JulyMonitoring({ plan }: { plan: any }) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === '#model/july-monitoring') section.current?.scrollIntoView({ block: 'start' });
  }, []);
  if (!plan) return null;
  const rows = evaluateJulyScenario(plan, inputs), visible = expanded ? rows : rows.slice(0, 7);
  const entered = rows.filter((r: any) => r.actual !== null).length;
  return <section ref={section} id="july-monitoring" className="panel findings-panel july-monitoring">
    <div className="panel-head"><div><span className="eyebrow">JULY 1–30 / FULL-FLOOR MONITORING PLAN</span><h2>A forecast with a rule for every day.</h2></div><button className="btn" onClick={() => csvDownload(plan.daily.map((r: any) => ({ date: r.date, weekday: r.weekday, predicted_wagers_usd: r.prediction, watch_below_usd: r.watch_below, watch_above_usd: r.watch_above, actual_wagers_usd: '', observation_status: 'not supplied', review_rule: `${plan.policy.consecutive_review_days} consecutive days outside the same side; missing days reset`, model_frozen_at: plan.model_frozen_at })), 'gilded-ace-july-monitoring.csv')}><Download size={15}/>Download July plan</button></div>
    <p>Thirty daily forecasts extend the original weekday model frozen on April 30. This plan was prepared retrospectively; no July observations are supplied and no July accuracy is claimed. The historical test above remains unchanged.</p>
    <div className="findings-context-grid"><div><small>Predicted July wagers</small><strong>{money(rows.reduce((s: number, r: any) => s + r.prediction, 0), true)}</strong><span>30 gaming days · throughput, not revenue</span></div><div><small>Daily empirical band radius</small><strong>{money(plan.calibration.radius_usd)}</strong><span>March–April errors · nominal 90%, not guaranteed</span></div><div><small>Review trigger</small><strong>{plan.policy.consecutive_review_days} days</strong><span>Consecutive breaches on the same side</span></div></div>
    <div className="july-rules"><div><span className="status-pill amber">Watch</span><p>Below the lower threshold or above the upper threshold. First check meter completeness, events and availability.</p></div><div><span className="status-pill orange">Review</span><p>Two consecutive gaming dates outside the same side. Investigate with floor and operations teams; do not automatically replace machines or claim pilot success.</p></div><div><span className="status-pill">Reset</span><p>A missing or invalid value breaks the streak. Equality is within the band. A change of direction starts a new streak.</p></div></div>
    <div className="july-checker-heading"><div><h3>Try the alert rules.</h3><p>Illustrative inputs only · {entered} entered. Values stay in this view and never alter the historical data.</p></div><button className="text-btn" disabled={!Object.keys(inputs).length} onClick={() => setInputs({})}><RotateCcw size={14}/>Clear scenario</button></div>
    <div className="findings-table"><table><caption className="sr-only">July forecast thresholds and illustrative alert checker, all values in USD</caption><thead><tr><th>Gaming date</th><th>Forecast</th><th>Watch below / above</th><th>Scenario wagers</th><th>Scenario result</th></tr></thead><tbody>{visible.map((r: any) => <tr key={r.date}><td><strong>{r.date}</strong><small>{r.weekday}</small></td><td>{dollars(r.prediction)}</td><td><span>{dollars(r.watch_below)}</span><small>{dollars(r.watch_above)}</small></td><td><input aria-label={`Scenario wagers ${r.date}`} aria-invalid={r.status === 'invalid'} inputMode="decimal" type="text" value={inputs[r.date] ?? ''} placeholder="Not supplied" onChange={e => setInputs(v => ({ ...v, [r.date]: e.target.value }))}/></td><td><span className={`status-pill ${r.status === 'review' ? 'orange' : r.status === 'watch' ? 'amber' : ''}`} data-alert-status={r.status}>{statusLabels[r.status]}</span>{r.direction && <small>{r.direction === 'below' ? 'Below' : 'Above'} band · streak {r.consecutive_breaches}</small>}</td></tr>)}</tbody></table></div>
    <div className="findings-foot"><button className="text-btn" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Show first week' : 'Show all 30 July days'}</button><a href="#evidence/forecast-july-monitoring">Methods and limits <ArrowUpRight size={14}/></a></div>
    <p className="findings-note"><Info size={14}/>Gaming dates run 06:00–06:00 in America/Los_Angeles. Dollar thresholds are shown to the cent. The two-day rule is an operational choice with no calibrated false-alarm rate; repeated checks can produce false alerts. This calendar-only model omits holidays and events, including July 4, and does not refit on May–June. Forecast deviations alone cannot identify a signage effect or machine defect. Keep matched-zone and whole-floor pilot measurements separate.</p>
  </section>;
}
