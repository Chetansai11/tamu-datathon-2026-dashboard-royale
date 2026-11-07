import React, { useId, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Line, ComposedChart, BarChart, Bar, ReferenceLine, ReferenceArea, ScatterChart, Scatter, Cell } from 'recharts';
import { colors, money, number, shortDate, niceName, percent, AnyRecord } from './data';
import { useMotionEnabled } from './motion';

const grid = { stroke: '#293955', strokeOpacity: .6, strokeDasharray: '3 5', vertical: false };
const axis = { axisLine: false, tickLine: false, tick: { fill: '#a8b8d7', fontSize: 11, fontFamily: 'inherit' }, minTickGap: 35 };
const tooltipStyle = { border: '1px solid #3c5278', borderRadius: 12, boxShadow: '0 12px 32px #02061480', fontSize: 12, padding: '12px 16px', backgroundColor: '#131e37', color: '#ecf2ff' };
const animate = (enabled: boolean) => ({ isAnimationActive: enabled, animationDuration: 780, animationEasing: 'ease-out' as const });

export function TrendChart({ series, metric = 'coin', height = 235 }: { series: any[]; metric?: string; height?: number }) {
  const motion = useMotionEnabled();
  const gradient = 'trend-' + useId().replace(/:/g, '');
  return <ResponsiveContainer width="100%" height={height}><AreaChart data={series} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors.teal} stopOpacity={.3}/><stop offset="100%" stopColor={colors.teal} stopOpacity={.015}/></linearGradient></defs><CartesianGrid {...grid}/><XAxis dataKey="date" {...axis} tickFormatter={v => shortDate(v)}/><YAxis {...axis} tickFormatter={v => money(v, true)} width={70}/><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#ecf2ff' }} labelFormatter={v => shortDate(String(v))} formatter={(v: any, key: any) => [money(v), { coin: 'Total wagered', win: 'Actual house win', theo: 'Expected house win' }[key] || key]}/>{metric === 'win' && <Area type="monotone" dataKey="theo" stroke={colors.gold} fill="none" strokeWidth={1.8} strokeDasharray="4 4" {...animate(motion)}/>}<Area type="monotone" dataKey={metric} stroke={colors.teal} fill={'url(#' + gradient + ')'} strokeWidth={2.5} activeDot={{ r: 5, fill: colors.teal, stroke: '#111b30', strokeWidth: 3 }} {...animate(motion)}/></AreaChart></ResponsiveContainer>;
}

export function ModelChart({ predictions }: { predictions: any[] }) {
  const motion = useMotionEnabled();
  const rows = predictions.map(r => ({ ...r, interval: [r.low ?? r.lower, r.high ?? r.upper] }));
  return <ResponsiveContainer width="100%" height={310}><ComposedChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...grid}/><XAxis dataKey="date" {...axis} tickFormatter={shortDate}/><YAxis {...axis} tickFormatter={v => money(v, true)} width={75}/><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#ecf2ff' }} labelFormatter={v => shortDate(String(v))} formatter={(v: any, name: any) => [Array.isArray(v) ? money(v[0]) + '–' + money(v[1]) : money(v), { actual: 'Actual', predicted: 'Weekday model', baseline: 'Training mean', interval: 'Training-calibrated 90% band' }[name] || name]}/><Area dataKey="interval" stroke="none" fill={colors.blue} fillOpacity={.12} {...animate(motion)}/><Line dataKey="actual" stroke={colors.teal} strokeWidth={2.3} dot={false} {...animate(motion)}/><Line dataKey="predicted" stroke={colors.blue} strokeWidth={2.3} dot={false} {...animate(motion)}/><Line dataKey="baseline" stroke={colors.gold} strokeWidth={1.6} strokeDasharray="5 5" dot={false} {...animate(motion)}/></ComposedChart></ResponsiveContainer>;
}

export function SimpleBar({ data, dataKey = 'value', nameKey = 'name', dollars = false, height = 235, color = colors.teal, onClick }: { data: any[]; dataKey?: string; nameKey?: string; dollars?: boolean; height?: number; color?: string; onClick?: (row: any) => void }) {
  const motion = useMotionEnabled();
  const gradient = 'bars-' + useId().replace(/:/g, '');
  return <ResponsiveContainer width="100%" height={height}><BarChart data={data} margin={{ top: 10, left: -14, right: 6, bottom: 5 }}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color}/><stop offset="100%" stopColor={color} stopOpacity={.45}/></linearGradient></defs><CartesianGrid {...grid}/><XAxis dataKey={nameKey} {...axis} minTickGap={4}/><YAxis {...axis} domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} tickFormatter={v => dollars ? money(v, true) : number(v)} width={65}/><ReferenceLine y={0} stroke="#65799d"/><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#ecf2ff' }} itemStyle={{ color: '#ecf2ff' }} cursor={{ fill: '#8098c214' }} formatter={(v: any) => dollars ? money(v) : number(v, 1)}/><Bar dataKey={dataKey} fill={'url(#' + gradient + ')'} radius={[5, 5, 0, 0]} maxBarSize={48} onClick={onClick ? (row: any) => onClick(row) : undefined} cursor={onClick ? 'pointer' : undefined} {...animate(motion)}/></BarChart></ResponsiveContainer>;
}

export function LuckChart({ machines, onSelect }: { machines: AnyRecord[]; onSelect: (row: any) => void }) {
  const motion = useMotionEnabled();
  const points: AnyRecord[] = machines.map(m => ({ ...m, x: m.theoHour, y: m.z }));
  return <ResponsiveContainer width="100%" height={310}><ScatterChart margin={{ top: 15, left: 0, right: 10, bottom: 18 }}><CartesianGrid {...grid}/><XAxis type="number" dataKey="x" name="Expected win / available hour" {...axis} tickFormatter={v => money(v)} label={{ value: 'Expected house win / available hour', position: 'insideBottom', offset: -12, fill: '#a8b8d7', fontSize: 11 }}/><YAxis type="number" dataKey="y" name="Payout residual" {...axis} tickFormatter={v => v + 'σ'} width={42}/><ReferenceArea y1={-3} y2={3} fill={colors.teal} fillOpacity={.045}/><ReferenceLine y={0} stroke="#65799d"/><ReferenceLine y={-3} stroke={colors.orange} strokeDasharray="5 4"/><ReferenceLine y={3} stroke={colors.orange} strokeDasharray="5 4"/><Tooltip cursor={{ stroke: '#9db7da', strokeDasharray: '3 3' }} content={({ active, payload }: any) => active && payload?.length ? <div className="chart-tooltip"><strong>{payload[0].payload.id}</strong><span>{payload[0].payload.theme}</span><span>Theo / available hour: {money(payload[0].payload.theoHour)}</span><span>Actual − expected: {money(payload[0].payload.residual)}</span><span>Standardized residual: {number(payload[0].payload.z, 2)}σ</span></div> : null}/><Scatter data={points} onClick={onSelect} cursor="pointer" {...animate(motion)}>{points.map(p => <Cell key={p.id} fill={Math.abs(p.z) > 3 ? colors.orange : colors.teal} fillOpacity={.76}/>)}</Scatter></ScatterChart></ResponsiveContainer>;
}

export function FloorMap({ machines, data, selectedBank, onSelectBank, compact = false }: { machines: AnyRecord[]; data: any; selectedBank?: string; onSelectBank: (bank: string) => void; compact?: boolean }) {
  const motion = useMotionEnabled();
  const pattern = 'floor-' + useId().replace(/:/g, '');
  const marks = useMemo(() => {
    const locations = data.locations || [];
    return machines.map((m, i): AnyRecord => {
      const loc = locations.find((l: any) => (l.id || l.location_id) === m.location);
      return { ...m, mapX: +(m.x ?? loc?.x ?? loc?.x_m ?? (i % 22)), mapY: +(m.y ?? loc?.y ?? loc?.y_m ?? Math.floor(i / 22)) };
    });
  }, [machines, data]);
  const known = (data.locations || []).filter((l: any) => l.node_type === 'slot' || String(l.id || l.location_id).startsWith('L-'));
  const xs = known.length ? known.map((l: any) => +(l.x ?? l.x_m)) : marks.map(m => m.mapX);
  const ys = known.length ? known.map((l: any) => +(l.y ?? l.y_m)) : marks.map(m => m.mapY);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  const sx = (x: number) => 30 + (x - minX) / (maxX - minX || 1) * 585;
  const sy = (y: number) => 40 + (y - minY) / (maxY - minY || 1) * 245;
  // A fixed full-period scale keeps colors comparable across filters and replay frames.
  const values = (data.machines || []).map((m: any) => m.metrics?.theoPerHour).filter(Number.isFinite).sort((a: number, b: number) => a - b);
  const q1 = values[Math.floor(values.length / 3)] || 0, q2 = values[Math.floor(values.length * 2 / 3)] || 0;
  const color = (m: any) => m.availability < .95 ? colors.orange : m.theoHour < q1 ? '#6672d7' : m.theoHour < q2 ? '#53acd5' : colors.teal;
  const zones = [...new Set(marks.map(m => m.zone))].map(zone => {
    const members = marks.filter(m => m.zone === zone);
    return { id: zone, name: niceName(zone, data.zones), x: members.reduce((sum, m) => sum + sx(m.mapX), 0) / members.length, y: Math.min(...members.map(m => sy(m.mapY))) - 13 };
  });
  return <div className={'floor-map ' + (compact ? 'compact' : '')}><svg viewBox="0 0 645 330" role="img" aria-label="Interactive casino floor with actual dated machine placements. Fixed full-period yield color scale; coral indicates availability below 95 percent."><defs><pattern id={pattern} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#637ba4" fillOpacity=".3"/></pattern><radialGradient id={pattern + '-bed'}><stop offset="0%" stopColor="#142744"/><stop offset="100%" stopColor="#0b1225"/></radialGradient></defs><rect x="1" y="1" width="643" height="328" rx="14" fill={'url(#' + pattern + '-bed)'} stroke="#2b3d60"/><rect x="12" y="12" width="621" height="302" rx="8" fill={'url(#' + pattern + ')'}/>{zones.map(z => <text key={z.id} x={z.x} y={z.y} textAnchor="middle" fill={z.id === 'Z-B40' ? colors.gold : '#a6bbde'} fontSize={compact ? 8 : 9} fontWeight="600" letterSpacing=".5">{z.name.toUpperCase()}</text>)}{marks.map(m => <g key={m.id} tabIndex={0} role="button" aria-label={m.id + ', bank ' + m.bank + ', ' + money(m.theoHour) + ' expected win per available hour. Select bank.'} onClick={() => onSelectBank(m.bank)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectBank(m.bank); } }} style={{ cursor: 'pointer' }}><rect x={sx(m.mapX) - 6} y={sy(m.mapY) - 6} width="12" height="13" rx="4" fill={color(m)} opacity={selectedBank === m.bank ? .3 : .1} style={{ transition: motion ? 'x 650ms ease, y 650ms ease, fill 650ms ease' : 'none' }}/><rect x={sx(m.mapX) - 3.5} y={sy(m.mapY) - 3.5} width="7" height="8" rx="1.6" fill={color(m)} stroke={selectedBank === m.bank ? colors.gold : '#b8d8ff'} strokeOpacity={selectedBank === m.bank ? 1 : .25} strokeWidth={selectedBank === m.bank ? 1.7 : .5} style={{ transition: motion ? 'x 650ms ease, y 650ms ease, fill 650ms ease' : 'none' }}/><title>{m.id} · {niceName(m.zone, data.zones)} · {m.bank}{'\n'}Theo/hour {money(m.theoHour)} · Availability {percent(m.availability)}</title></g>)}<path d="M295 310 h55" stroke={colors.gold} strokeWidth="2"/><text x="322" y="322" textAnchor="middle" fill="#91a7cb" fontSize="6.5" letterSpacing=".6">ACTUAL FLOOR COORDINATES · LAST PLACEMENT IN SELECTED PERIOD</text></svg><div className="map-legend"><span><i style={{ background: '#6672d7' }}/> Lower yield</span><span><i style={{ background: colors.teal }}/> Higher yield</span><span><i style={{ background: colors.orange }}/> Availability &lt; 95%</span></div></div>;
}
