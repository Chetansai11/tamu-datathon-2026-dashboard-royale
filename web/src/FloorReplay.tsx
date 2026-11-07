import React, { useEffect, useId, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Film, Info, TrendingUp, Minus } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { aggregate, money, number, percent, ratio, colors, shortDate } from './data';

const periods = [
  ['2025-01-01', '2025-01-31', 'January'],
  ['2025-02-01', '2025-02-28', 'February'],
  ['2025-03-01', '2025-03-31', 'March'],
  ['2025-04-01', '2025-04-30', 'April'],
  ['2025-05-01', '2025-05-31', 'May'],
  ['2025-06-01', '2025-06-30', 'June'],
];

export default function FloorReplay({ data, motionEnabled }: { data: any; motionEnabled: boolean }) {
  const [month, setMonth] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [metric, setMetric] = useState<'coin' | 'theo'>('coin');
  const gradient = 'month-flow-' + useId().replace(/:/g, '');
  const frames = useMemo(() => periods.map(p => aggregate(data, p[0], p[1], 'all', 'all')), [data]);
  const frame = frames[month];
  const period = periods[month];
  const dailyMean = ratio(frame.totals[metric], frame.totals.days);
  const priorMean = month > 0 ? ratio(frames[month - 1].totals[metric], frames[month - 1].totals.days) : NaN;
  const change = priorMean > 0 ? dailyMean / priorMean - 1 : NaN;
  const label = metric === 'coin' ? 'wagers' : 'expected win';
  const peak = frame.series.reduce((best: any, row: any) => !best || row[metric] > best[metric] ? row : best, null);
  // Keep the same vertical scale across replay months for a truthful visual comparison.
  const axisMax = useMemo(() => {
    const maximum = Math.max(1, ...frames.flatMap(f => f.series.map(d => d[metric])));
    const step = metric === 'coin' ? 500000 : 50000;
    return Math.ceil(maximum / step) * step;
  }, [frames, metric]);
  const ticks = frame.series.filter((_, index) => index % 7 === 0 || index === frame.series.length - 1).map(d => d.date);

  useEffect(() => { if (!motionEnabled) setPlaying(false); }, [motionEnabled]);
  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);
  useEffect(() => {
    if (!playing || !motionEnabled) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(month + 1, periods.length - 1);
      setMonth(next);
      if (next === periods.length - 1) setPlaying(false);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [playing, month, motionEnabled]);

  const chooseMonth = (index: number) => { setPlaying(false); setMonth(index); };
  const togglePlayback = () => {
    if (playing) { setPlaying(false); return; }
    if (month === periods.length - 1) setMonth(0);
    setPlaying(true);
  };

  return <section className="floor-replay month-performance panel" aria-labelledby="floor-replay-heading">
    <div className="panel-head"><div><span className="eyebrow"><Film size={13}/> HISTORY IN MOTION</span><h3 id="floor-replay-heading">The floor, month by month.</h3><p>A clearer look at the daily rhythm behind each month.</p></div><button className={'btn replay-play' + (playing ? ' active' : '')} aria-label={playing ? 'Pause floor replay' : 'Play floor replay'} onClick={togglePlayback} disabled={!motionEnabled}>{playing ? <Pause size={15}/> : month === 5 ? <RotateCcw size={15}/> : <Play size={15}/>} {playing ? 'Pause' : month === 5 ? 'Replay' : 'Play history'}</button></div>
    <div className="replay-controls"><div className="replay-months" role="group" aria-label="Historical floor month">{periods.map((item, index) => <button key={item[0]} className={'replay-month' + (index === month ? ' active' : '')} aria-label={'Replay ' + item[2] + ' 2025'} aria-pressed={index === month} onClick={() => chooseMonth(index)}><span>{item[2].slice(0, 3)}</span><small>2025</small></button>)}</div><div className="replay-progress" aria-hidden="true"><span style={{ width: ((month + 1) / periods.length * 100) + '%', transition: motionEnabled ? 'width 650ms ease' : 'none' }}/></div></div>
    <div className="month-focus-header">
      <div className="month-focus-title"><span className="month-caption">{period[2]} 2025 <i/> {frame.totals.days} gaming days</span><strong className="month-total">{money(frame.totals[metric], true)}</strong><span className="month-total-label">Total {label} · all floor zones</span></div>
      <div className="month-focus-tools"><div className="segmented" role="group" aria-label="Monthly performance measure"><button aria-label="Monthly wagers" aria-pressed={metric === 'coin'} className={metric === 'coin' ? 'active' : ''} onClick={() => { setMetric('coin'); setPlaying(false); }}>Wagers</button><button aria-label="Monthly expected win" aria-pressed={metric === 'theo'} className={metric === 'theo' ? 'active' : ''} onClick={() => { setMetric('theo'); setPlaying(false); }}>Expected win</button></div><div className={'month-change ' + (change < 0 ? 'down' : '')}>{Number.isFinite(change) ? <><TrendingUp size={14}/><strong>{change >= 0 ? '+' : '−'}{percent(Math.abs(change))}</strong><span>daily average vs {periods[month - 1][2]}</span></> : <><Minus size={14}/><span>First month in the investigation</span></>}</div></div>
    </div>
    <div className="month-chart-legend"><span><i/>Daily {label}</span><span><i className="average"/>Monthly average <b>{money(dailyMean, true)} / day</b></span></div>
    <div className="replay-chart month-trend-chart" role="img" aria-label={`${period[2]} 2025 daily ${label}. Total ${money(frame.totals[metric])}; daily average ${money(dailyMean)}. Same vertical scale across months.`} onPointerDown={() => setPlaying(false)} onFocusCapture={() => setPlaying(false)}>
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={frame.series} margin={{top:18,right:18,left:0,bottom:4}} accessibilityLayer>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={colors.teal} stopOpacity={.3}/><stop offset="1" stopColor={colors.teal} stopOpacity={.015}/></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="#2b3b56" strokeOpacity={.65} strokeDasharray="3 6"/>
        <XAxis dataKey="date" ticks={ticks} tickFormatter={shortDate} axisLine={false} tickLine={false} minTickGap={20} tick={{fill:'#a8b8d7',fontSize:11}} dy={9}/>
        <YAxis domain={[0,axisMax]} tickCount={5} tickFormatter={value => money(value,true)} axisLine={false} tickLine={false} width={72} tick={{fill:'#a8b8d7',fontSize:11}}/>
        <Tooltip cursor={{stroke:'#8fe9ff',strokeDasharray:'4 4'}} content={({active,payload,label:day}:any) => active && payload?.length ? <div className="month-chart-tooltip"><span>{shortDate(String(day))}, 2025 · gaming day</span><strong>{money(payload[0].value)}</strong><small>Daily {label}</small></div> : null}/>
        <ReferenceLine y={dailyMean} stroke={colors.gold} strokeDasharray="6 5" strokeOpacity={.85}/>
        <Area key={metric} type="linear" dataKey={metric} stroke={colors.teal} strokeWidth={2.5} fill={'url(#'+gradient+')'} dot={false} activeDot={{r:5,fill:colors.teal,stroke:'#101b30',strokeWidth:3}} isAnimationActive={motionEnabled} animationDuration={650} animationEasing="ease-out"/>
      </AreaChart></ResponsiveContainer>
    </div>
    <div className="month-chart-foot"><span><TrendingUp size={14}/> Busiest {label} day: <b>{peak ? shortDate(peak.date) : '—'}</b> <strong>{peak ? money(peak[metric],true) : '—'}</strong></span><span>Daily totals · consistent scale across months</span></div>
    <div className="replay-summary" aria-live="polite" aria-atomic="true"><div><small>Average {label} / day</small><strong>{money(dailyMean, true)}</strong></div><div><small>Expected win / available hr</small><strong>{money(ratio(frame.totals.theo, frame.totals.available))}</strong></div><div><small>Availability</small><strong>{percent(frame.totals.availability)}</strong></div><div><small>Machines active in month</small><strong>{number(frame.machines.length)}</strong></div></div>
    <div className="replay-meta month-event"><Info size={14}/><span>{month === 2 ? 'Back Forty entrance walkway closed March 3. This annotation does not establish a causal effect.' : month === 3 ? 'Back Forty entrance walkway reopened April 7. This annotation does not establish a causal effect.' : 'Daily averages account for different month lengths; total wagers include money replayed through machines.'}</span></div>
    <p className="replay-note"><span>Historical monthly review · independent of the global filters. A gaming day starts at 6 a.m. {motionEnabled ? 'Select a month or measure to pause; playback also pauses when you leave this tab.' : 'Motion is off; select months manually.'}</span></p>
  </section>;
}
