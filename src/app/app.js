/* All calculations are local. No network calls, tracking, or external libraries. */
(function () {
  "use strict";
  const monthNames = ["January", "February", "March", "April", "May", "June"];
  const months = monthNames.map((_, i) => `2025-0${i + 1}`);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const div = (a, b) => b ? a / b : null;
  const number = (v, digits = 0) => v == null ? "—" : Number(v).toLocaleString("en-US", {maximumFractionDigits:digits, minimumFractionDigits:digits});
  const money = (v, digits = 0) => v == null ? "—" : `${v < 0 ? "−" : ""}$${number(Math.abs(v), digits)}`;
  const compact = v => v == null ? "—" : `${v < 0 ? "−" : ""}$${new Intl.NumberFormat("en-US", {notation:"compact",maximumFractionDigits:2}).format(Math.abs(v))}`;
  const pct = (v, digits = 1) => v == null ? "—" : `${number(v * 100,digits)}%`;
  const human = key => key.replace(/_/g," ").replace(/usd/g,"USD");
  function decode(data) { return data.daily.map(row => Object.fromEntries(data.schema.map((key, i) => [key, row[i]]))); }
  function selectRows(rows, filters) {
    return rows.filter(r => r.date.slice(0,7) >= filters.start && r.date.slice(0,7) <= filters.end && (!filters.zone || r.zone === filters.zone) && (!filters.bank || r.bank === filters.bank));
  }
  function totals(rows) {
    const result = {coin:0,payout:0,theo:0,available:0,scheduled:0,occupied:0,variance:0,costs:0,faults:0,carded:0,machine_days:rows.length};
    for (const r of rows) for (const key of Object.keys(result)) if (key !== "machine_days") result[key] += n(r[key]);
    result.win = result.coin - result.payout;
    result.residual = result.win - result.theo;
    result.z = div(result.residual, Math.sqrt(result.variance));
    result.hold = div(result.win, result.coin);
    result.theo_hold = div(result.theo, result.coin);
    result.availability = div(result.available, result.scheduled);
    result.down = Math.max(0,result.scheduled - result.available);
    result.occupancy = div(result.occupied, result.available);
    result.theo_hour = div(result.theo, result.available);
    result.coin_hour = div(result.coin, result.available);
    result.machines = new Set(rows.map(r => r.machine)).size;
    result.days = new Set(rows.map(r => r.date)).size;
    return result;
  }
  function grouped(rows, key) {
    const groups = new Map();
    for (const row of rows) { const value = typeof key === "function" ? key(row) : row[key]; if (!groups.has(value)) groups.set(value, []); groups.get(value).push(row); }
    return [...groups].map(([key, group]) => ({key,...totals(group)})).sort((a,b)=>String(a.key).localeCompare(String(b.key)));
  }
  if (typeof module !== "undefined" && module.exports) module.exports = {decode,selectRows,totals,grouped,div};
  if (typeof document === "undefined") return;
  const D = window.DR_DATA;
  if (!D) { document.getElementById("view").innerHTML = '<div class="empty">The data bundle is missing. Run <code>python -m src.build_dashboard</code>, then reopen dashboard/index.html.</div>'; return; }
  const rows = decode(D), R = D.reports || {};
  const state = {page:"overview",start:"2025-01",end:"2025-06",zone:"",bank:"",guest:"all",ranking:"adjusted"};
  const locations = Object.fromEntries(D.locations.map(r=>[r.zone_id,r.zone_name]));
  const machineMeta = Object.fromEntries(D.machines.map(r=>[r.machine_id,r]));
  const sourceEvidence = [
    {id:"validation-data",claim:"The embedded data release passed file integrity, format parity and accounting checks.",source:"src/validate_release.py; outputs/validation.json; official dataset manifest.json",method:R.validation?.method||"Exact SHA-256 and byte sizes; typed CSV/Parquet comparisons in both directions; independent daily money and scope reconciliation.",result:R.validation?`${number(R.validation.manifest?.files)} files verified; ${number(R.validation.manifest?.tables)} tables and ${number(R.validation.manifest?.rows)} rows compared; ${(R.validation.checks||[]).filter(c=>c.passed).length} of ${(R.validation.checks||[]).length} accounting checks passed. Data commit ${R.validation.data_commit}.`:"The validation report is not included in this bundle.",alternative:"Matching files alone would not catch incorrect analytical joins or metric definitions; separate accounting checks test those relationships.",limitation:"These checks establish integrity and internal consistency for this data commit, not causal validity, browser usability, public access or human submission."},
    {id:"floor-math",claim:"Floor totals use the same accounting definitions for every filter.",source:"prepared_daily_view + machine_day + game_math + calendar_day; src/metrics.py",method:"Exclude off-floor rows. Sum wagers, payouts and theoretical win; compute ratios after aggregation. Use dated location and scheduled hours, including the DST gaming day.",result:`${number(D.meta.machine_days)} on-floor machine-days are available for drill-down.`,alternative:"Low total win can reflect fewer days, downtime, a quieter location, or payout variance.",limitation:"Synthetic property. Supplied costs omit rent, taxes, depreciation and some labor."},
    {id:"luck-method",claim:"A payout gap is a reason to inspect, not proof of misconduct.",source:"machine_day.sum_bet_squared × game_math.payout_multiplier_variance; src/metrics.py",method:"z = (sum house win − sum theo) / sqrt(sum payout variance). Variance is converted from cents squared to dollars squared.",result:"The filtered machine table shows the ratio-of-sums hold, theoretical hold, payout z-score and available-hour productivity together.",alternative:"A large residual can be chance, a configuration or meter issue, or model misspecification.",limitation:"Individual screening thresholds do not establish causality. Use the full-period investigation for multiplicity and uncertainty."},
    {id:"guest-scope",claim:"Tracked guests and the whole floor are different populations.",source:"player_period; DATASET.md money definitions",method:"Aggregate each player across the selected complete months before counting ahead/behind or concentration. Player gaming net = payout − wager. Comp economic cost is already in linked POS cost of goods.",result:"Guest filters apply to tracked player outcomes; bank and zone filters apply to floor meters. Guest identities are not exposed in this dashboard.",alternative:"Uncarded play and changes in card usage can alter apparent guest outcomes.",limitation:"A carded guest can also play uncarded. Wager volume includes replayed winnings, not unique cash deposited."}
  ];
  const evidence = [...sourceEvidence];
  for (const [reportKey,report] of Object.entries(R)) {
    if (!report || typeof report !== "object") continue;
    const list = report.evidence || report.claims || [];
    if (Array.isArray(list)) list.forEach((e,i)=>evidence.push({...e,id:e.id||`${reportKey}-${i+1}`,report:reportKey}));
  }
  const evidenceById = Object.fromEntries(evidence.map(e=>[e.id,e]));
  const evidenceButton = (id, label="View evidence ↗") => `<button class="evidence-link" data-evidence="${esc(id)}">${esc(label)}</button>`;
  const firstEvidence = (key,fallback="floor-math") => evidence.find(e=>e.report===key)?.id || fallback;
  const kpi = (label,value,note,id="floor-math") => `<div class="kpi"><div class="kpi-label">${esc(label)}${evidenceButton(id,"↗")}</div><div class="kpi-value">${value}</div><small>${note}</small></div>`;
  const period = () => `${monthNames[months.indexOf(state.start)].slice(0,3)}–${monthNames[months.indexOf(state.end)].slice(0,3)} 2025`;
  const scope = () => `${period()} · ${state.bank || locations[state.zone] || "Whole floor"}`;
  const heading = (eyebrow,title,subtitle,fixed=false) => `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div><span class="scope">${fixed?"Jan–Jun investigation":esc(scope())}</span></div>`;
  const fixedNote = () => `<p class="period-note">Full-period investigation · January 1–June 30. This evidence stays fixed when the exploration filters change.</p>`;
  const panelHead = (title,subtitle,id) => `<div class="panel-head"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:""}</div>${id?evidenceButton(id):""}</div>`;
  const empty = text => `<div class="empty">${esc(text)}</div>`;
  function table(headers, body) { return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`; }
  function lineChart(points,series,label="Daily coin-in") {
    if (!points.length) return empty("No observations in this period.");
    const W=680,H=228,L=52,T=13,B=29,Rt=14;
    const values=points.flatMap(p=>series.map(s=>p[s.key])).filter(v=>v!=null&&Number.isFinite(Number(v)));
    const maximum=Math.max(...values,1)*1.08,minimum=Math.min(0,...values),range=maximum-minimum;
    const x=i=>L+i*(W-L-Rt)/Math.max(1,points.length-1),y=v=>T+(maximum-v)/range*(H-T-B);
    const ticks=Array.from({length:4},(_,i)=>minimum+(maximum-minimum)*i/3);
    let svg=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>`;
    ticks.forEach(v=>{svg+=`<line class="chart-grid" x1="${L}" x2="${W-Rt}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${esc(compact(v))}</text>`;});
    series.forEach(s=>{const path=points.map((p,i)=>p[s.key]==null?null:`${x(i).toFixed(1)},${y(n(p[s.key])).toFixed(1)}`).filter(Boolean).join(" ");svg+=`<polyline points="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width||2}" ${s.dash?'stroke-dasharray="5 4"':""}/>`;});
    [...new Set([0,Math.floor((points.length-1)/2),points.length-1])].forEach(i=>{svg+=`<text x="${x(i)}" y="${H-5}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${esc(points[i].label||points[i].date||points[i].key)}</text>`;});
    svg+="</svg>";
    return `<div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div>${svg}`;
  }
  function bars(groups,key,valueFormat=compact,clickable=false) {
    if (!groups.length) return empty("No observations in this period.");
    const max=Math.max(...groups.map(g=>n(g[key])),1);
    return groups.map(g=>`<div class="bar-row">${clickable?`<button data-zone="${esc(g.key)}" title="Drill into ${esc(locations[g.key]||g.key)}">${esc(locations[g.key]||g.key)} ↗</button>`:`<span>${esc(g.label||locations[g.key]||g.key)}</span>`}<div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,n(g[key])/max*100)}%"></div></div><span class="bar-value">${valueFormat(g[key])}</span></div>`).join("");
  }
  function reportSummary(report) {
    if (!report) return "Analysis is not included in this bundle yet.";
    if (typeof report.summary === "string") return report.summary;
    return report.headline || report.summary?.headline || report.summary?.decision || report.conclusion || "See the measured results and competing explanations below.";
  }
  function factList(obj, limit=12) {
    if (!obj || typeof obj !== "object") return esc(obj||"");
    return `<dl>${Object.entries(obj).filter(([,v])=>v!==null && typeof v!=="object").slice(0,limit).map(([k,v])=>`<dt>${esc(human(k))}</dt><dd>${typeof v==="number"?number(v,Math.abs(v)<10?3:1):esc(v)}</dd>`).join("")}</dl>`;
  }
  function reportDetails(key) { return R[key]?`<details><summary>Inspect reproducible report values</summary><pre class="report-detail">${esc(JSON.stringify(R[key].summary||R[key],null,2))}</pre></details>`:""; }
  function sourcesList(report) { return (report?.sources||[]).length?`<h3>External context · primary sources</h3>${report.sources.map(s=>`<p><a href="${esc(s.url)}" target="_blank" rel="noopener" class="text-link">${esc(s.name)} ↗</a><br><span class="small">${esc(s.use||"")}</span></p>`).join("")}`:""; }
  function overview(filtered,s) {
    const trend=grouped(filtered,"date");
    const zone=grouped(filtered,"zone").sort((a,b)=>b.theo_hour-a.theo_hour);
    const actionSummary=R.actions?.summary||{};
    const q1summary=R.q1?.summary||{};
    const mainTitle=R.q1?"Inspect the causes before replacing the machines.":"Low earnings are a question. Not a verdict.";
    return heading("THE DECISION BRIEF","Luck, location, or a leak?","Separate a weak machine from a weak opportunity. Start with the decision, then trace it to the evidence.")+
      `<section class="banner"><div><span class="eyebrow">THE GENERAL MANAGER'S QUESTION</span><h2>${mainTitle}</h2><p>Compare expected earnings, time on the floor and availability before committing the July budget.</p></div><a class="button" href="#actions">See the action plan →</a></section>`+
      `<div class="kpis">${kpi("Total wagered",compact(s.coin),`${number(s.days)} gaming days · ${number(s.machines)} machines`)}${kpi("Actual house win",compact(s.win),`${pct(s.hold)} hold · ${pct(s.theo_hold)} expected`)}${kpi("Expected house win",compact(s.theo),`${money(s.theo_hour,2)} per available machine-hour`)}${kpi("Floor availability",pct(s.availability),`${number(s.down)} machine-hours unavailable`)}</div>`+
      `<div class="grid"><section class="panel">${panelHead("The floor, day by day","Wager volume includes winnings played again.","floor-math")}${lineChart(trend,[{key:"coin",label:"Coin-in",color:"#397c6b"}])}<div class="chart-caption">Filters use location on each gaming date. <a href="#demand">Explore demand and forecast →</a></div></section><section class="panel">${panelHead("Opportunity varies across the floor","Expected win per available machine-hour","floor-math")}${bars(zone,"theo_hour",v=>money(v,0),true)}<div class="chart-caption">Click a zone to investigate it. This describes location and game mix together.</div></section></div>`+
      `<div class="grid equal"><section class="panel">${panelHead("Three questions before spending","Measured findings, alternatives and explicit uncertainty")}
        <div class="finding"><span class="finding-num">01</span><div><strong>Is the machine weak, or was its opportunity weak?</strong><p>Raw earnings mix lifetime on the floor, availability, game math and payout variance. Review all ten of the GM's candidates together.</p><a class="quiet-link" href="#machines">Open the machine review →</a></div></div>
        <div class="finding"><span class="finding-num">02</span><div><strong>Would more uptime recover play?</strong><p>Downtime opportunity estimates are counterfactuals. Recaptured floor demand can be smaller if guests switch machines.</p><a class="quiet-link" href="#downtime">Inspect the reliability analysis →</a></div></div>
        <div class="finding"><span class="finding-num">03</span><div><strong>What changes a July decision?</strong><p>Forecasts face a May–June holdout. Actions use catalogue prices, lead times and a measurement plan.</p><a class="quiet-link" href="#validation">Check the model →</a></div></div></section>
      <section class="panel">${panelHead("A budget is an option, not a target","July 1–30 · maximum three action types",firstEvidence("actions"))}<div class="kpi-value">${money(actionSummary.reserve??actionSummary.reserve_usd??100000)}</div><p>${R.actions?"Held in reserve after the proposed July actions.":"Available for an evidence-led plan. Final action estimates are being integrated."}</p><div class="notice">No action catalogue entry guarantees an uplift. Every recommendation separates measured exposure from assumed recovery.</div><p>Carded guest findings apply to tracked play. They are never used to encourage heavy losers to gamble more.</p><a class="button" href="#actions">Review costs & tradeoffs →</a></section></div>`;
  }
  function machineTable(list, isFixed=false) {
    return table(["Machine","Expected / avail. h","Availability","Actual hold","Expected hold","Payout z","Context"],list.map(a=>{
      const id=a.machine_id||a.key; const r=a.theo_per_avail_hour??a.theo_hour;
      return `<tr><td><button class="machine-link" data-machine="${esc(id)}">${esc(id)} ↗</button><br><span class="small">${esc(machineMeta[id]?.theme||"")}</span></td><td>${money(r,2)}</td><td>${pct(a.availability)}</td><td>${pct(a.observed_hold??a.hold)}</td><td>${pct(a.theo_hold)}</td><td><span class="${Math.abs(a.luck_z??a.z)>=3?'negative':''}">${number(a.luck_z??a.z,2)}</span></td><td>${isFixed?esc(a.diagnosis||a.recommendation||"Review competing explanations"): `${number(a.machine_days)} days · ${money(a.win)} win`}</td></tr>`;
    }).join(""));
  }
  function machines(filtered,s) {
    const ranked=grouped(filtered,"machine").sort((a,b)=>a.theo_hour-b.theo_hour);
    const fixed=R.q1?.bottom10||[];
    const adjusted=(R.q1?.ranking||[]).slice().sort((a,b)=>(a.adjusted_index??1)-(b.adjusted_index??1));
    return heading("Q1 · MACHINE PERFORMANCE","A fairer machine review","Use expected earnings to remove payout luck; use available hours to account for exposure and reliability.")+
      `<div class="kpis">${kpi("Machines observed",number(s.machines),`${number(s.machine_days)} on-floor machine-days`)}${kpi("Expected / available h",money(s.theo_hour,2),"Ratio of sums · selected scope")}${kpi("Payout residual",compact(s.residual),`${number(s.z,2)} z-score for selected scope`,"luck-method")}${kpi("Availability",pct(s.availability),`${number(s.down)} unavailable hours`)}</div>`+
      `<section class="panel">${panelHead("The GM's ten lowest earners","The original decision set, tested against luck, location and availability.",firstEvidence("q1","luck-method"))}${fixedNote()}${fixed.length?machineTable(fixed,true):empty("The full-period bottom-ten investigation has not been included in this bundle yet.")}</section>`+
      `<section class="panel">${panelHead("Adjusted screening rank","Lower index indicates less demand than comparable exposure would predict.",firstEvidence("q1"))}${fixedNote()}${adjusted.length?table(["Machine","Adjusted index","95% interval","Expected / h","Interpretation"],adjusted.slice(0,20).map(r=>`<tr><td><button class="machine-link" data-machine="${esc(r.machine_id)}">${esc(r.machine_id)} ↗</button></td><td>${number(r.adjusted_index,2)}</td><td>${number(r.adjusted_ci_low,2)}–${number(r.adjusted_ci_high,2)}</td><td>${money(r.theo_per_avail_hour,2)}</td><td>${esc(r.diagnosis||"")}</td></tr>`).join("")):empty("Adjusted ranking is not included yet.")}<div class="notice">Ranking is a screening tool. Uncertainty and peer choice matter; a low rank does not establish that replacement will help.</div>${reportDetails("q1")}</section>`+
      `<section class="panel">${panelHead("Explore current-filter productivity","The 25 lowest expected-win rates in the selected period and location. This is descriptive, not the adjusted screening rank.","floor-math")}${machineTable(ranked.slice(0,25))}</section>`;
  }
  function demand(filtered,s) {
    const monthly=grouped(filtered,r=>r.date.slice(0,7));
    const daily=grouped(filtered,"date");
    const q2=R.q2, forecast=R.forecast;
    return heading("Q2 · DEMAND & MODELING","What changed, and what can we predict?","Separate shifts in volume, opportunity and mix. Future staffing decisions need a forecast that survives a future period.")+
      `<section class="panel">${panelHead("Monthly demand in the selected scope","Rates are calculated from summed wagers and available hours.",firstEvidence("q2"))}${table(["Month","Coin-in","Per gaming day","Per available h","Availability","Occupancy"],monthly.map(r=>`<tr><td>${esc(r.key)}</td><td>${money(r.coin)}</td><td>${money(div(r.coin,r.days))}</td><td>${money(r.coin_hour,2)}</td><td>${pct(r.availability)}</td><td>${pct(r.occupancy)}</td></tr>`).join(""))}</section>`+
      `<div class="grid equal"><section class="panel">${panelHead("Demand through time","Daily wagers for the selected scope","floor-math")}${lineChart(daily,[{key:"coin",label:"Actual coin-in",color:"#397c6b"}])}</section><section class="panel">${panelHead("What explains the change?","Interpretation, not a causal attribution",firstEvidence("q2"))}${fixedNote()}<p>${esc(reportSummary(q2))}</p>${(q2?.evidence||q2?.claims||[]).slice(0,3).map(e=>`<div class="finding"><span class="finding-num">↗</span><div><strong>${esc(e.claim||e.title||e.id)}</strong><p>${esc(typeof e.result==="object"?JSON.stringify(e.result):e.result||"")}</p>${evidenceButton(e.id)}</div></div>`).join("")}${reportDetails("q2")}</section></div>`+
      `<section class="panel">${panelHead("Context and competing explanations","Synthetic property, separate real-world sources",firstEvidence("q2"))}${(q2?.evidence||[]).slice(3).map(e=>`<div class="finding"><span class="finding-num">↗</span><div><strong>${esc(e.claim||e.title)}</strong><p>${esc(e.result)}</p>${evidenceButton(e.id)}</div></div>`).join("")}${sourcesList(q2)}</section>`+forecastPanel(forecast);
  }
  function forecastPanel(forecast) {
    if(!forecast) return `<section class="panel">${panelHead("A forecast tested on the future","Jan–Apr fit · May–Jun holdout")}${empty("Forecast report is not included yet.")}</section>`;
    const s=forecast.summary||{}, points=(forecast.daily||[]).map(r=>({...r,label:r.date||r.gaming_date}));
    return `<section class="panel">${panelHead("A forecast tested on the future","Frozen at April 30 · May 1–June 30 holdout · whole floor",firstEvidence("forecast"))}<div class="kpis">${kpi("Constant mean MAE",compact(s.baseline_mae),"Training-period daily mean",firstEvidence("forecast"))}${kpi("Model MAE",compact(s.model_mae),s.model_name||s.model||"Calendar model",firstEvidence("forecast"))}${kpi("MAE improvement",`${number(s.improvement_pct,1)}%`,"Relative to the constant-mean baseline",firstEvidence("forecast"))}${kpi("Holdout days",number(points.length),"No random split",firstEvidence("forecast"))}</div>${lineChart(points,[{key:"actual",label:"Actual",color:"#234d59",width:2.2},{key:"prediction",label:"Model",color:"#ba8d42"},{key:"baseline",label:"Constant mean",color:"#9ba8ac",dash:true}],"May–June actual coin-in versus frozen model and constant-mean baseline")}<p class="small">The nominal 90% empirical error band covered <strong>${pct(s.coverage_90)}</strong> of holdout days. ${s.interval_radius_usd?`Its training-derived radius is ±${money(s.interval_radius_usd)}.`:""} Undercoverage is a measured limitation; the band is not a guarantee.</p><div class="notice">${esc(s.decision||forecast.decision||"Use validation performance to set staffing expectations. Forecast error is not proof that promotions would increase demand.")}</div><a class="quiet-link" href="#validation">Open the complete validation protocol →</a></section>`;
  }
  function downtime(filtered,s) {
    const q3=R.q3, summaries=q3?.summary||{};
    const relevant=(q3?.daily_bank||[]).filter(r=>String(r.gaming_date||r.date).slice(0,7)>=state.start&&String(r.gaming_date||r.date).slice(0,7)<=state.end&&(!state.zone||r.zone_id===state.zone)&&(!state.bank||r.bank_id===state.bank));
    const lost=relevant.reduce((t,r)=>t+n(r.lost_coin_in??r.estimated_lost_coin_in),0), theo=relevant.reduce((t,r)=>t+n(r.lost_theo??r.estimated_lost_theo),0);
    const shift=q3?.by_shift||[];
    return heading("Q3 · RELIABILITY","Price the opportunity lost to downtime","Unavailable hours are measured. Recoverable play is estimated, and depends on what guests would have done instead.")+
      `<div class="kpis">${kpi("Unavailable hours",number(s.down),`${pct(s.availability==null?null:1-s.availability)} of scheduled machine-hours`)}${kpi("Faults opened",number(s.faults),"Tickets on selected machine-days")}${kpi("Estimated lost coin-in",q3?compact(lost):"—","Counterfactual demand · not observed revenue",firstEvidence("q3"))}${kpi("Expected win opportunity",q3?compact(theo):"—","Before recapture and intervention costs",firstEvidence("q3"))}</div>`+
      `<div class="grid equal"><section class="panel">${panelHead("Where availability breaks down","Unavailable machine-hours by zone","floor-math")}${bars(grouped(filtered,"zone").sort((a,b)=>b.down-a.down),"down",v=>number(v),true)}</section><section class="panel">${panelHead("Timing and capacity","Fault tickets and shift roster are independent evidence",firstEvidence("q3"))}${fixedNote()}<p>${esc(reportSummary(q3))}</p>${shift.length?table(Object.keys(shift[0]).slice(0,6).map(k=>esc(human(k))),shift.map(r=>`<tr>${Object.values(r).slice(0,6).map(v=>`<td>${typeof v==="number"?number(v,1):esc(v)}</td>`).join("")}</tr>`).join("")):""}${reportDetails("q3")}</section></div>`+
      `<section class="panel">${panelHead("Recovery is a scenario","Observed downtime does not equal incremental floor demand",firstEvidence("q3"))}<div class="notice">A guest may switch to another machine instead of leaving. Treat lost coin-in as machine-level opportunity; evaluate floor-level recapture separately. Neither tickets nor staff associations establish the effect of hiring a technician.</div>${(q3?.claims||[]).map(e=>`<div class="finding"><span class="finding-num">↗</span><div><strong>${esc(e.claim||e.title)}</strong><p>${esc(e.result)}</p>${evidenceButton(e.id)}</div></div>`).join("")}${q3?`<details><summary>Full-period estimator and sensitivity values</summary>${factList(summaries,14)}</details>`:""}</section>`;
  }
  function guestWindows(){const w=R.guests?.windows||R.guest_windows?.windows||R.guest_windows||[];return Array.isArray(w)?w:[];}
  function guests() {
    const windows=guestWindows();
    const options=[...new Set(windows.map(w=>w.group_key))].sort((a,b)=>a==="all"?-1:b==="all"?1:a.localeCompare(b));
    const g=windows.find(w=>w.start_month===state.start&&w.end_month===state.end&&w.group_key===state.guest);
    const get=(...keys)=>{for(const k of keys)if(g?.[k]!=null)return g[k];return null;};
    const coin=get("coin_in","tracked_coin_in_usd","coin_in_usd","coin"), payout=get("payout","tracked_payout_usd","payout_usd"), net=get("net","tracked_net_usd","net_usd"),cost=get("comp_cost","comp_cost_usd"), theo=get("theo","theo_usd");
    const comps=R.comps;
    return heading("Q4 & Q5 · TRACKED GUESTS","Outcomes before incentives","Wagers, payouts and net results for carded play. Understand comp costs without treating heavy losses as a marketing opportunity.")+
      `<div class="guest-filter"><label for="guest-group">Guest group</label><select id="guest-group">${options.length?options.map(o=>`<option value="${esc(o)}" ${o===state.guest?"selected":""}>${esc(o==="all"?"All tracked guests":o.replace(":",": ").replace(/_/g," "))}</option>`).join(""):'<option value="all">All tracked guests</option>'}</select><span class="small">${esc(period())} · complete gaming months</span></div><p class="period-note">Guest results respond to period and guest group. Bank and zone filters apply to floor meters, not this guest panel.</p>`+
      `<div class="kpis">${kpi("Tracked wagers",compact(coin),"Includes winnings played again","guest-scope")}${kpi("Tracked payouts",compact(payout),"Game returns, not player profit","guest-scope")}${kpi("Player gaming net",compact(net??(coin!=null&&payout!=null?payout-coin:null)),"Payout − wagers · player perspective","guest-scope")}${kpi("Comp economic cost",compact(cost),`${pct(div(cost,theo))} of tracked theo`,firstEvidence("comps","guest-scope"))}</div>`+
      `<div class="grid equal"><section class="panel">${panelHead("Who is represented?","Each player is aggregated across the selected months first.",firstEvidence("guests","guest-scope"))}${g?`<div class="kpis" style="grid-template-columns:1fr 1fr">${kpi("Active carded players",number(g.active_players),`${number(g.players)} total tracked accounts`,"guest-scope")}${kpi("Finished ahead",pct(g.ahead_share),`${number(g.ahead_players)} of ${number(g.active_players)} with recorded gaming`,"guest-scope")}</div><h3>Concentration of tracked wagers</h3>${bars([{label:"Top 1% of players",share:g.top1_coin_share},{label:"Top 10% of players",share:g.top10_coin_share}],"share",pct)}<p class="small">Rank ${number(g.active_players)} active carded players by wagers. Shares use total tracked wagers as the denominator.</p><h3>Concentration of gross player losses</h3>${bars([{label:"Top 1% of losers",share:g.top1_loss_share},{label:"Top 10% of losers",share:g.top10_loss_share}],"share",pct)}<p class="small">Rank ${number(g.losing_players)} players with a negative period net. Denominator is ${money(g.gross_player_losses)} in summed positive losses; winners are excluded from this denominator.</p><details><summary>Exact group totals and counts</summary>${factList(g,60)}</details>`:empty("Guest-window results are not included in this bundle yet.")}<div class="notice">Concentration is descriptive, not a targeting list. A positive net means the tracked player finished ahead on recorded gaming; it says nothing about uncarded play.</div></section><section class="panel">${panelHead("What changed in the comp program?","Economic cost is counted once, inside POS cost of goods.",firstEvidence("comps","guest-scope"))}${fixedNote()}<p>${esc(reportSummary(comps))}</p>${(comps?.evidence||comps?.claims||[]).slice(0,3).map(e=>`<div class="finding"><span class="finding-num">↗</span><div><strong>${esc(e.claim||e.title||e.id)}</strong><p>${esc(typeof e.result==="object"?JSON.stringify(e.result):e.result||"")}</p>${evidenceButton(e.id)}</div></div>`).join("")}${reportDetails("comps")}</section></div>`;
  }
  function actions() {
    const report=R.actions,s=report?.summary||{},actions=report?.actions||[];
    const spend=s.spend??s.spend_usd??actions.reduce((v,a)=>v+n(a.cost??a.cost_usd),0),reserve=s.reserve??s.reserve_usd??100000-spend;
    return heading("Q6 · THE JULY ACTION PLAN","Spend where evidence changes the decision","Up to three action types. Catalogue prices and lead times. July 1–30, 2025.",true)+
      `<section class="banner"><div><span class="eyebrow">CAPITAL DISCIPLINE</span><h2>${money(spend)} proposed. ${money(reserve)} held back.</h2><p>Keep room to learn. Estimated effects are scenarios, not promised returns.</p></div><a class="button" href="#evidence">Audit the recommendations ↗</a></section>`+
      `<section class="panel">${panelHead("The $100,000 allocation","One budget, including recurring charges and any proposed comp costs.",firstEvidence("actions"))}<div class="budget-meter" aria-label="${pct(spend/100000)} of budget spent"><span style="width:${Math.min(100,spend/1000)}%"></span></div><div class="legend"><span><i class="gold"></i>Funded ${money(spend)}</span><span><i class="grey"></i>Reserve ${money(reserve)}</span></div>${!actions.length?empty("The priced action plan has not been included in this bundle yet."):actions.map((a,i)=>`<article class="action-card"><div><span class="eyebrow">ACTION ${String(i+1).padStart(2,"0")}</span><h3>${esc(a.name||a.action_name||a.action_type_id||a.action)}</h3><p>${esc(a.rationale||a.reason||"")}</p><div class="action-meta">${esc(a.quantity??1)} unit(s) · ${esc(a.lead_days??"—")} lead days · ${esc(a.operating_days??Math.max(0,30-n(a.lead_days)))} benefit days</div><dl><dt>Targets</dt><dd>${esc(Array.isArray(a.targets)?a.targets.join(", "):a.targets||a.target||"See plan")}</dd><dt>Expected effect</dt><dd>${esc(typeof a.expected_effect==="object"?JSON.stringify(a.expected_effect):a.expected_effect||a.expected_benefit||"See sensitivity below")}</dd><dt>Uncertainty</dt><dd>${esc(a.uncertainty||a.limitation||"")}</dd><dt>Measurement</dt><dd>${esc(typeof a.measurement==="object"?JSON.stringify(a.measurement):a.measurement||a.measurement_plan||"")}</dd></dl>${a.benefit_scenarios?`<details><summary>Effect assumptions and sensitivity</summary><pre class="report-detail">${esc(JSON.stringify(a.benefit_scenarios,null,2))}</pre></details>`:""}<div class="section-actions">${(a.evidence_ids||[firstEvidence("actions")]).map(id=>evidenceButton(id)).join("")}</div></div><div class="action-cost">${money(a.cost??a.cost_usd)}<div class="action-meta">July budget cost</div></div></article>`).join("")}</section>`+
      `<section class="panel">${panelHead("What we chose not to fund","Compare with keeping the full budget.",firstEvidence("actions"))}${(report?.alternatives||[]).map(a=>`<div class="finding"><span class="finding-num">↗</span><div><strong>${esc(a.name)} ${a.cost!=null?`· ${money(a.cost)}`:""}</strong><span class="pill ${a.status==="Over budget"?'danger':'warn'}">${esc(a.status)}</span><p>${esc(a.reason)}</p><div class="section-actions">${(a.evidence_ids||[]).map(id=>evidenceButton(id)).join("")}</div></div>`).join("")}</section>`+
      `<section class="panel">${panelHead("Conditional sensitivity, not a forecast","The funded inspection has $0 assumed direct revenue uplift.",firstEvidence("actions"))}<div class="notice">${esc(s.sensitivity_note||"No uplift is guaranteed.")}</div>${report?.scenario_rows?table(["Gap restored if corrected","Conditional gross theo","Net after inspection & outage"],report.scenario_rows.map(r=>`<tr><td>${pct(r.restored_fraction,0)}</td><td>${money(r.gross_conditional_theo)}</td><td>${money(r.net_after_inspection_and_modeled_downtime)}</td></tr>`).join("")):""}<p class="small">The two-hour inspection models ${money(s.modeled_inspection_downtime_theo,2)} of unavailable theo in addition to the ${money(spend)} budget cost. No defect probability is estimated.</p></section>`+
      `<section class="panel">${panelHead("Decision rules and pricing","July 1–30 horizon; lead time and downtime included.",firstEvidence("actions"))}<p>${esc(s.decision||reportSummary(report))}</p><div class="notice">Budget cost = quantity × [one-time cost + daily recurring cost × max(0, 30 − lead days)]. Fixed packages are charged in full. Expected benefits use only the remaining days and deduct intervention downtime.</div>${actions.map(a=>`<p><strong>${esc(a.name)}</strong><br><code>${esc(a.cost_formula||"")}</code><br><span class="small">${esc(a.start_date||"")} to ${esc(a.end_date||"")} · ${number(a.downtime_minutes)} minutes of intervention downtime</span></p>`).join("")}${reportDetails("actions")}</section>`;
  }
  function validation() {
    const f=R.forecast,s=f?.summary||{};
    const checks=[
      ["Accounting identities","All-play win = coin-in − payout. Displayed hold and availability are ratios of sums, including after filters."],
      ["Exposure and location","Off-floor rows are excluded. A machine contributes to each bank only on its dated placement rows."],
      ["Payout uncertainty","Luck z uses bet-squared exposure and configured payout variance. A screen is not a diagnosis."],
      ["Time-based holdout","Model fit uses January–April. May–June is held out. A constant training-period mean is the baseline."],
      ["As-of discipline","Later-published tourism, holdout-day results and future repairs must not enter a forecast made on April 30."],
      ["Tracked-player accounting","Player-months are combined before distinct counts and concentration. POS comp cost is not subtracted twice."],
      ["Action constraints","At most three action types. Lead days, operating days, catalogue costs and incompatible targets are explicit."]
    ];
    const dataCheck=R.validation;
    return heading("VALIDATION · OPEN THE BLACK BOX","Trust the comparisons, inspect the limits","A simple model with a clean holdout is more useful than a complicated model with hindsight.",true)+
      (dataCheck?`<section class="panel">${panelHead("Measured data checks","Executed against the bundled release, not a checklist of intentions","validation-data")}<div class="kpis">${kpi("Files hash-verified",number(dataCheck.manifest?.files),"SHA-256 and byte counts","validation-data")}${kpi("Tables compared",number(dataCheck.manifest?.tables),"Typed CSV ↔ Parquet row parity","validation-data")}${kpi("Rows compared",number(dataCheck.manifest?.rows),"Both directions, including duplicates","validation-data")}${kpi("Accounting checks",`${(dataCheck.checks||[]).filter(c=>c.passed).length}/${(dataCheck.checks||[]).length}`,"Money, scope and time invariants","validation-data")}</div>${(dataCheck.checks||[]).map(c=>`<div class="check"><span class="check-icon">${c.passed?"✓":"!"}</span><div><strong>${esc(c.name)}</strong>${c.max_absolute_error!=null?`<p>Maximum absolute difference: ${number(c.max_absolute_error,4)}</p>`:""}</div></div>`).join("")}<p class="small">${esc(dataCheck.method)}<br>${esc(dataCheck.scope_note)}</p></section>`:"")+
      `<div class="grid equal"><section class="panel">${panelHead("The evaluation protocol","Fixed scope: all floor coin-in",firstEvidence("forecast"))}<div class="check"><span class="check-icon">01</span><div><strong>Fit · January 1–April 30</strong><p>Model selection and training-period estimates use only these 120 days.</p></div></div><div class="check"><span class="check-icon">02</span><div><strong>Freeze · before May 1</strong><p>Predict all 61 holdout days without their realized demand or later revised outside data.</p></div></div><div class="check"><span class="check-icon">03</span><div><strong>Evaluate · May 1–June 30</strong><p>Compare daily absolute errors with a constant training mean. Report honest results even if the model loses.</p></div></div><div class="notice">${esc(s.decision||f?.decision||"Use forecast error to calibrate the operational decision; do not equate demand predictability with a causal promotion effect.")}</div>${reportDetails("forecast")}</section><section class="panel">${panelHead("Methods you can audit","Implementation and tests are supplied with the submission")}${checks.map(([t,d])=>`<div class="check"><span class="check-icon">↗</span><div><strong>${t}</strong><p>${d}</p></div></div>`).join("")}</section></div>${forecastPanel(f)}<section class="panel">${panelHead("Reproducibility and limits","Current bundle provenance")}${factList(D.meta)}<p>Source code, report JSON and the claims appendix describe the transformations. <a href="reports.json" download>Download report data</a>.</p><p>Draft data can change. Refresh the official dataset and rebuild before submission. Public hosting and a private-window access test require the human publishing step.</p></section>`;
  }
  function evidenceCard(e) {
    const title=e.claim||e.title||e.id;
    const string=v=>typeof v==="object"?JSON.stringify(v):v;
    return `<article class="evidence-card" id="claim-${esc(e.id)}"><span class="eyebrow">${esc(e.id)}</span><h3>${esc(title)}</h3><dl><dt>Table / query</dt><dd><code>${esc(string(e.source||e.table||e.tables||"See source module"))}${e.query?`<br>${esc(string(e.query))}`:""}</code></dd>${e.method?`<dt>Method</dt><dd>${esc(string(e.method))}</dd>`:""}<dt>Result</dt><dd>${esc(string(e.result||e.finding||""))}</dd><dt>Alternative</dt><dd>${esc(string(e.alternative||e.alternative_explanation||"See report method"))}</dd><dt>Limitation</dt><dd>${esc(string(e.limitation||e.limitations||"Synthetic challenge data; observational evidence."))}</dd></dl>${e.url?`<p><a class="text-link" target="_blank" rel="noopener" href="${esc(e.url)}">Primary source ↗</a></p>`:""}</article>`;
  }
  function evidencePage() {
    return heading("CLAIMS & EVIDENCE","Every claim has a way back","The result, the source, a competing explanation and what remains uncertain.",true)+
      `<div class="notice">All casino and guest findings concern a fictional property. Real external sources provide context only; they do not establish causes at this casino.</div>${evidence.map(evidenceCard).join("")}<section class="panel">${panelHead("AI-use disclosure","TAMU Datathon 2026")}<p>OpenAI Codex GPT agents assisted with data analysis, implementation, validation checks, visualization and draft explanation. The supplied casino data and action catalogue were created by the challenge organizers. The human team is responsible for reviewing results, recording the video, publication and submission.</p><p>No real guest identities are included. No generated recommendations target heavy losers for more gambling.</p><a href="reports.json" download class="quiet-link">Download the full report bundle →</a></section>`;
  }
  function showEvidence(id) {
    const e=evidenceById[id];
    document.getElementById("dialog-body").innerHTML=e?`<h2 id="dialog-title">Trace the claim</h2>${evidenceCard(e)}`:`<h2 id="dialog-title">Evidence reference</h2><p>The reference ${esc(id)} is not included in this bundle. See the full report JSON and source appendix.</p>`;
    document.getElementById("evidence-dialog").showModal();
  }
  function showMachine(id) {
    const selected=selectRows(rows,state).filter(r=>r.machine===id),s=totals(selected),r=R.q1?.ranking?.find(r=>r.machine_id===id),meta=machineMeta[id]||{};
    document.getElementById("dialog-body").innerHTML=`<h2 id="dialog-title">${esc(id)} · ${esc(meta.theme||"")}</h2><p class="small">${esc(scope())} · ${esc(meta.manufacturer||"")}</p><div class="kpis" style="grid-template-columns:1fr 1fr">${kpi("House win",compact(s.win),"Selected period")}${kpi("Expected win",compact(s.theo),`${money(s.theo_hour,2)} per available hour`)}</div><div class="evidence-card">${factList({availability:s.availability,payout_z:s.z,observed_hold:s.hold,theoretical_hold:s.theo_hold,on_floor_days:s.machine_days,unavailable_hours:s.down})}</div>${r?`<h3>Full-period diagnosis</h3><p>${esc(r.diagnosis||"")}</p><div class="evidence-card"><dl><dt>Luck / payout</dt><dd>${esc(r.luck_test||"")}</dd><dt>Location</dt><dd>${esc(r.location_test||"")}</dd><dt>Availability</dt><dd>${esc(r.downtime_test||"")}</dd><dt>Demand</dt><dd>${esc(r.demand_test||"")}</dd><dt>Adjusted index</dt><dd>${number(r.adjusted_index,2)} · 95% interval ${number(r.adjusted_ci_low,2)}–${number(r.adjusted_ci_high,2)}</dd><dt>Multiplicity</dt><dd>Family-wise adjusted payout p = ${number(r.payout_p_bonferroni,5)}. Inspection is a lead, not an accusation.</dd><dt>Placements</dt><dd>${esc((r.bank_ids||[]).join(", "))} · ${esc((r.zone_names||[]).join(", "))}</dd><dt>Exposure</dt><dd>${number(r.machine_days)} days · ${esc(r.first_day)} to ${esc(r.last_day)} · ${r.on_floor_at_end?"On floor at June 30":"Already retired by June 30"}</dd></dl></div>`:""}${evidenceButton(firstEvidence("q1","luck-method"))}`;
    document.getElementById("evidence-dialog").showModal();
  }
  function render() {
    state.page=location.hash.slice(1).split("/")[0]||"overview";
    if(!["overview","machines","demand","downtime","guests","actions","validation","evidence"].includes(state.page))state.page="overview";
    document.querySelectorAll("nav a").forEach(a=>{const active=a.dataset.page===state.page;a.classList.toggle("active",active);if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");});
    const selected=selectRows(rows,state),s=totals(selected);
    const pages={overview,machines,demand,downtime,guests,actions,validation,evidence:evidencePage};
    document.getElementById("view").innerHTML=pages[state.page](selected,s);
    document.title=`${document.querySelector('nav a.active')?.textContent.trim()||"Floor Intelligence"} · The Gilded Ace`;
    const group=document.getElementById("guest-group");if(group)group.addEventListener("change",()=>{state.guest=group.value;render();});
  }
  function updateBanks() {
    const banks=[...new Set(D.locations.filter(r=>!state.zone||r.zone_id===state.zone).map(r=>r.bank_id))].sort();
    if(!banks.includes(state.bank))state.bank="";
    document.getElementById("bank").innerHTML='<option value="">All banks</option>'+banks.map(b=>`<option value="${esc(b)}" ${b===state.bank?"selected":""}>${esc(b)}</option>`).join("");
  }
  for(const [id,key] of [["start-month","start"],["end-month","end"]]) {
    const select=document.getElementById(id);select.innerHTML=months.map((m,i)=>`<option value="${m}" ${m===state[key]?"selected":""}>${monthNames[i]}</option>`).join("");
    select.addEventListener("change",()=>{state[key]=select.value;if(state.start>state.end){state[key==="start"?"end":"start"]=select.value;document.getElementById(key==="start"?"end-month":"start-month").value=select.value;}render();});
  }
  document.getElementById("zone").innerHTML+=[...Object.entries(locations)].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join("");
  document.getElementById("zone").addEventListener("change",e=>{state.zone=e.target.value;state.bank="";updateBanks();render();});
  document.getElementById("bank").addEventListener("change",e=>{state.bank=e.target.value;render();});
  document.getElementById("reset").addEventListener("click",()=>{Object.assign(state,{start:"2025-01",end:"2025-06",zone:"",bank:"",guest:"all"});document.getElementById("start-month").value=state.start;document.getElementById("end-month").value=state.end;document.getElementById("zone").value="";updateBanks();render();});
  document.addEventListener("click",e=>{const ev=e.target.closest("[data-evidence]"),machine=e.target.closest("[data-machine]"),zone=e.target.closest("[data-zone]");if(ev){if(document.getElementById("evidence-dialog").open)document.getElementById("evidence-dialog").close();showEvidence(ev.dataset.evidence);}if(machine)showMachine(machine.dataset.machine);if(zone){state.zone=zone.dataset.zone;state.bank="";document.getElementById("zone").value=state.zone;updateBanks();render();}});
  document.getElementById("close-dialog").addEventListener("click",()=>document.getElementById("evidence-dialog").close());
  document.getElementById("evidence-dialog").addEventListener("click",e=>{if(e.target===e.currentTarget)e.currentTarget.close();});
  window.addEventListener("hashchange",()=>{render();window.scrollTo({top:0,behavior:"instant"});});
  updateBanks();render();
  window.DR_APP={state,totals,selectRows,render};
})();
