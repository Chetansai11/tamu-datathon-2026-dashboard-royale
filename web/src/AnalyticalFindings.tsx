import { useState } from 'react';
import { ArrowUpRight, Info } from 'lucide-react';
import { money, number, percent } from './data';
import './findings.css';

export function AdjustedCandidates({data}:{data:any}) {
  const [expanded,setExpanded]=useState(false);
  const rows=[...(data.reports?.decomp?.machine_weak_after_location||[])].sort((a:any,b:any)=>a.machine_factor-b.machine_factor);
  const gm=new Set(data.facts.bottomTen);
  const example=rows.find((r:any)=>r.machine_id==='M-1244');
  return <section className="panel findings-panel adjusted-candidates">
    <div className="panel-head"><div><span className="eyebrow">Q1 / FIXED JANUARY–JUNE INVESTIGATION</span><h2>Low earnings and weak adjusted demand are different lists.</h2></div></div>
    <p>The lowest adjusted factors are {rows.slice(0,3).map((r:any)=>`${r.machine_id} (${number(r.machine_factor,2)}×)`).join(', ')}. None is in the GM’s raw bottom ten. {example&&<>M-1244 is another example ({number(example.machine_factor,2)}×), ranked {rows.indexOf(example)+1} by this factor.</>}</p>
    <div className="findings-table"><table><thead><tr><th>Rank / machine</th><th>Historical zone</th><th>Adjusted factor</th><th>Conditional 95% range</th><th>GM’s bottom ten?</th></tr></thead><tbody>{rows.slice(0,expanded?rows.length:3).map((r:any,i:number)=><tr key={r.machine_id}><td><strong>{i+1}. {r.machine_id}</strong><small>{r.theme}</small></td><td>{r.zones.join(', ')}</td><td>{number(r.machine_factor,3)}×</td><td>{number(r.machine_ci[0],3)}–{number(r.machine_ci[1],3)}</td><td>{gm.has(r.machine_id)?'Yes':'No'}</td></tr>)}</tbody></table></div>
    <div className="findings-foot"><button className="text-btn" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'Show first three':`Show all ${rows.length} below-benchmark candidates`}</button><a href="#evidence/q1-decomposition">Inspect the method <ArrowUpRight size={14}/></a></div>
    <p className="findings-note">Factor = observed theoretical win ÷ the benchmark after adjusting for exposure, game and location; 1 means benchmark demand. Rows have a conditional interval below 1. Peer benchmarks are held fixed in the bootstrap, and these intervals are not simultaneous or causal. They support investigation, not automatic replacement.</p>
    <p className="findings-note">Limited cross-zone game support matters: M-1532 is the only Classic Sevens machine in High-Limit, so that game–zone comparison is sparse and its location factor falls back to neutral. The new Aurora Link title appears only in Center Pit. Game and location effects cannot be cleanly separated there. {rows.filter((r:any)=>gm.has(r.machine_id)).length} of the GM’s ten also fall below this conditional benchmark; a positive combined machine term does not clear every machine.</p>
  </section>;
}

const shifts:any={day:['Day','06:00–14:00'],swing:['Swing','14:00–22:00'],grave:['Graveyard','22:00–06:00']};
export function DowntimeTiming({data}:{data:any}) {
  const rows=[...(data.reports.q3.by_shift||[])].sort((a:any,b:any)=>b.lost_theo-a.lost_theo);
  const total=rows.reduce((s:number,r:any)=>s+r.lost_theo,0),maximum=Math.max(1,...rows.map((r:any)=>r.lost_theo));
  const worstHours=[...rows].sort((a:any,b:any)=>b.down_hours-a.down_hours)[0];
  return <section className="panel findings-panel downtime-timing"><div className="panel-head"><div><span className="eyebrow">Q3 / FIXED JANUARY–JUNE · FULL FLOOR</span><h2>When the lost capacity mattered most.</h2></div></div><p>Swing shift has the largest estimated missed theoretical win: {money(rows[0].lost_theo)} ({percent(rows[0].lost_theo/total)} of the total). {shifts[worstHours.shift][0]} has the most unavailable hours, showing why hours and value need separate rankings.</p>
    <div className="findings-table"><table><thead><tr><th>Shift · local clock</th><th>Estimated missed theo</th><th>Unavailable hours</th><th>Unavailable / scheduled</th><th>Estimated missing wagers</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.shift}><td><strong>{shifts[r.shift][0]}</strong><small>{shifts[r.shift][1]}</small></td><td><strong>{money(r.lost_theo)}</strong><span className="shift-value-rail"><i style={{width:`${100*r.lost_theo/maximum}%`}}/></span></td><td>{number(r.down_hours,1)}</td><td>{percent(r.down_hours/(r.available_hours+r.down_hours),2)}</td><td>{money(r.lost_coin_in)}</td></tr>)}</tbody></table></div>
    <p className="findings-note">This hourly investigation stays fixed when explorer filters change. Clock times use America/Los_Angeles; the gaming day starts at 06:00 and includes DST. Missed theo and wagers are gross counterfactual opportunities before displacement, not observed losses or guaranteed recoverable revenue.</p>
  </section>;
}

export function TourismContext({data}:{data:any}) {
  const s=data.reports.q2.summary,source=data.reports.q2.sources.find((x:any)=>x.name==='LVCVA tourism indicators');
  return <section className="panel findings-panel tourism-context"><div className="panel-head"><div><span className="eyebrow">Q2 / EXTERNAL CONTEXT · JANUARY TO JUNE 2025</span><h2>A softer city is context, not the whole explanation.</h2></div></div><div className="findings-context-grid"><div><small>Las Vegas visitors / calendar day</small><strong>{number(s.city_daily_visitation_change_pct,2)}%</strong><span>Bundled LVCVA revised series</span></div><div><small>Casino wagers / available hour</small><strong>{number(s.jan_to_jun_available_hour_change_pct,2)}%</strong><span>Fictional floor · exposure adjusted</span></div><div><small>Casino wagers / gaming day</small><strong>{number(s.jan_to_jun_daily_change_pct,2)}%</strong><span>Fictional floor · daily totals</span></div></div><p className="findings-note"><Info size={14}/> These are different measures and populations. Similar declines are consistent with softer destination demand; they do not establish why this casino changed. The numeric visitor comparison uses the organizer-bundled 2026-08-20 revision, unavailable at the 2025 forecast origin. It is excluded from model features. <a href={source.url} target="_blank" rel="noreferrer">LVCVA research source</a></p></section>;
}

export function FundedTiming({data}:{data:any}) {
  const weekdays=data.reports.forecast.weekday;
  const low=weekdays.find((r:any)=>r.weekday==='Wednesday'),high=weekdays.find((r:any)=>r.weekday==='Saturday');
  return <section className="panel findings-panel funded-timing"><div className="panel-head"><div><span className="eyebrow">FORECAST → FUNDED EXECUTION</span><h2>Inspect promptly, away from the predicted peak.</h2></div></div><p>The frozen weekday model estimates {money(low.mean_coin_in)} wagers on Wednesdays versus {money(high.mean_coin_in)} on Saturdays. The funded inspection stays on Wednesday, July 2, after its one-day catalog lead. That is the second-lowest predicted weekday, avoiding the peak without postponing a payout investigation until Tuesday, July 8.</p><p className="findings-note">Keep the inspection on July 2 and wayfinding trial on July 11–30. The payout inspection signal is not delayed just to reach another Tuesday. This timing preference does not change the $8,700 cost, lead times, modeled benefit days or imply measured savings. The floor-wide weekday forecast does not identify a quiet hour for a particular machine.</p></section>;
}
