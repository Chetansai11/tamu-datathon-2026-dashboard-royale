import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, X, Film, Info } from 'lucide-react';
import { aggregate, money, number, percent, niceName, ratio } from './data';
import { FloorMap } from './Charts';

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
  const [bank, setBank] = useState('');
  const period = periods[month];
  const frame = useMemo(() => aggregate(data, periods[month][0], periods[month][1], 'all', 'all'), [data, month]);
  const selectedBank = frame.banks.find(row => row.id === bank);

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
      setBank('');
      if (next === periods.length - 1) setPlaying(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [playing, month, motionEnabled]);

  const chooseMonth = (index: number) => { setPlaying(false); setMonth(index); setBank(''); };
  const togglePlayback = () => {
    if (playing) { setPlaying(false); return; }
    if (month === periods.length - 1) setMonth(0);
    setBank('');
    setPlaying(true);
  };

  return <section className="floor-replay panel" aria-labelledby="floor-replay-heading">
    <div className="panel-head"><div><span className="eyebrow"><Film size={13}/> Historical replay · monthly data</span><h3 id="floor-replay-heading">Six months. One evolving floor.</h3><p>Trace the floor through time. Select a month, then inspect any bank.</p></div><button className={'btn replay-play' + (playing ? ' active' : '')} aria-label={playing ? 'Pause floor replay' : 'Play floor replay'} onClick={togglePlayback} disabled={!motionEnabled}>{playing ? <Pause size={15}/> : month === 5 ? <RotateCcw size={15}/> : <Play size={15}/>} {playing ? 'Pause' : month === 5 ? 'Replay' : 'Play history'}</button></div>
    <div className="replay-controls"><div className="replay-months" role="group" aria-label="Historical floor month">{periods.map((item, index) => <button key={item[0]} className={'replay-month' + (index === month ? ' active' : '')} aria-label={'Replay ' + item[2] + ' 2025'} aria-pressed={index === month} onClick={() => chooseMonth(index)}><span>{item[2].slice(0, 3)}</span><small>2025</small></button>)}</div><div className="replay-progress" aria-hidden="true"><span style={{ width: ((month + 1) / periods.length * 100) + '%', transition: motionEnabled ? 'width 650ms ease' : 'none' }}/></div></div>
    <div className="replay-meta"><strong>{period[2]} 2025</strong><span>{month === 2 ? 'Back Forty entrance walkway closed March 3' : month === 3 ? 'Back Forty entrance walkway reopened April 7' : 'Monthly performance · all floor zones'}</span></div>
    <div className="replay-chart"><FloorMap data={data} machines={frame.machines} selectedBank={bank} onSelectBank={value => { setPlaying(false); setBank(value); }}/></div>
    <div className="replay-summary" aria-live="polite" aria-atomic="true"><div><small>Total wagers</small><strong>{money(frame.totals.coin, true)}</strong></div><div><small>Expected win / available hr</small><strong>{money(ratio(frame.totals.theo, frame.totals.available))}</strong></div><div><small>Availability</small><strong>{percent(frame.totals.availability)}</strong></div><div><small>Machines active in month</small><strong>{number(frame.machines.length)}</strong></div></div>
    {selectedBank && <div className="replay-bank-detail"><span><strong>{niceName(bank, data.banks)}</strong> · {number(selectedBank.count)} machines · {money(selectedBank.theoHour)} expected win / available hour · {percent(selectedBank.availability)} availability</span><button aria-label="Close replay bank details" onClick={() => { setPlaying(false); setBank(''); }}><X size={15}/></button></div>}
    <p className="replay-note"><Info size={13}/><span>Fixed full-period yield scale; positions show each machine’s last dated placement in the month. Animated transitions are retrospective, not live telemetry. {motionEnabled ? 'Playback pauses when you inspect the floor or leave this tab.' : 'Motion is off; select months manually.'} This full-floor replay has its own month control, independent of the global filters.</span></p>
  </section>;
}
