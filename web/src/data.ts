export type AnyRecord = Record<string, any>;
export const money = (value: number, compact = false) => {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '';
  const n = Math.abs(value);
  if (compact && n >= 1e6) return `${sign}$${(n / 1e6).toFixed(2)}m`;
  if (compact && n >= 1e3) return `${sign}$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return sign + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};
export const number = (n: number, digits = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
export const percent = (n: number, digits = 1) => Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—';
export const ratio = (a: number, b: number) => b ? a / b : NaN;
export const shortDate = (v: string) => new Date(v + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const monthName = (v: string) => new Date(v.slice(0, 7) + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short' });
export const colors = { teal: '#57e3ff', gold: '#f4c66b', orange: '#ff879b', dark: '#c8d8ff', blue: '#a997ff', muted: '#7d92bd' };
export function sum(rows: AnyRecord[], field: string) { return rows.reduce((total, row) => total + (+row[field] || 0), 0); }
const sumKeys = ['coin', 'payout', 'win', 'theo', 'available', 'scheduled', 'occupied', 'spins', 'variance', 'cost', 'faults', 'cardedCoin', 'peerTheo', 'lostTheo'];
export function aggregate(data: any, start: string, end: string, zone: string, bank: string) {
  const cols: string[] = data.dailyColumns;
  const ix = Object.fromEntries(cols.map((key, i) => [key, i]));
  const machines = new Map<number, AnyRecord>();
  const days = new Map<string, AnyRecord>();
  const zoneGroups = new Map<string, AnyRecord>();
  const bankGroups = new Map<string, AnyRecord>();
  let count = 0;
  for (const row of data.daily || []) {
    const date = data.dates[row[ix.date]];
    if (date < start || date > end || (zone !== 'all' && row[ix.zone] !== zone) || (bank !== 'all' && row[ix.bank] !== bank)) continue;
    count++;
    const machineIndex = row[ix.machine];
    if (!machines.has(machineIndex)) machines.set(machineIndex, { ...data.machines[machineIndex], index: machineIndex, days: 0, zone: row[ix.zone], bank: row[ix.bank], lastDate: date, ...Object.fromEntries(sumKeys.map(k => [k, 0])) });
    const m = machines.get(machineIndex)!;
    if (date >= m.lastDate) {
      m.zone = row[ix.zone]; m.bank = row[ix.bank]; m.lastDate = date;
      if (ix.location != null) { m.location = row[ix.location]; const loc = (data.locations || []).find((l: any) => l.location_id === m.location); if (loc) { m.x = loc.x_m; m.y = loc.y_m; } }
    }
    m.days++;
    if (!days.has(date)) days.set(date, { date, ...Object.fromEntries(sumKeys.map(k => [k, 0])) });
    const d = days.get(date)!;
    for (const key of sumKeys) { const value = +row[ix[key]] || 0; m[key] += value; d[key] += value; }
    for (const [field, group] of [['zone', zoneGroups], ['bank', bankGroups]] as [string, Map<string, AnyRecord>][]) {
      const id = row[ix[field]];
      if (!group.has(id)) group.set(id, { id, machineIds: new Set(), coin: 0, win: 0, theo: 0, available: 0, scheduled: 0, lostTheo: 0, faults: 0 });
      const g = group.get(id)!; g.machineIds.add(machineIndex);
      ['coin', 'win', 'theo', 'available', 'scheduled', 'lostTheo', 'faults'].forEach(k => g[k] += +row[ix[k]] || 0);
    }
  }
  const machineRows: AnyRecord[] = [...machines.values()].map(m => ({ ...m, hold: ratio(m.win, m.coin), theoHold: ratio(m.theo, m.coin), availability: ratio(m.available, m.scheduled), occupancy: ratio(m.occupied, m.available), theoHour: ratio(m.theo, m.available), coinHour: ratio(m.coin, m.available), residual: m.win - m.theo, z: m.variance > 0 ? (m.win - m.theo) / Math.sqrt(m.variance) : 0, peerIndex: m.peerTheo > 0 ? m.theo / m.peerTheo : null, downtime: Math.max(0, m.scheduled - m.available) }));
  const series = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totals: AnyRecord = Object.fromEntries(sumKeys.map(k => [k, sum(series, k)]));
  Object.assign(totals, { machines: machineRows.length, days: series.length, availability: ratio(totals.available, totals.scheduled), occupancy: ratio(totals.occupied, totals.available), hold: ratio(totals.win, totals.coin), theoHold: ratio(totals.theo, totals.coin), residual: totals.win - totals.theo, downtime: Math.max(0, totals.scheduled - totals.available), cardedShare: ratio(totals.cardedCoin, totals.coin), count });
  const zones: AnyRecord[] = [];
  const banks: AnyRecord[] = [];
  for (const [field, group] of [['zone', zoneGroups], ['bank', bankGroups]] as [string, Map<string, AnyRecord>][]) {
    const target = field === 'zone' ? zones : banks;
    group.forEach(g => target.push({ ...g, count: g.machineIds.size, availability: ratio(g.available, g.scheduled), coinHour: ratio(g.coin, g.available), theoHour: ratio(g.theo, g.available), downtime: g.scheduled - g.available }));
  }
  const downtimeRows = (data.reports?.q3?.daily_bank || []).filter((r: any) => r.gaming_date.slice(0, 10) >= start && r.gaming_date.slice(0, 10) <= end && (zone === 'all' || r.zone_id === zone) && (bank === 'all' || r.bank_id === bank));
  if (downtimeRows.length) { totals.lostTheo = sum(downtimeRows, 'lost_theo'); totals.lostCoin = sum(downtimeRows, 'lost_coin_in'); }
  return { totals, series, machines: machineRows, zones, banks, downtimeRows };
}
export function csvDownload(rows: AnyRecord[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]).filter(key => ['string', 'number', 'boolean'].includes(typeof rows[0][key]));
  const quote = (value: any) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const text = keys.map(quote).join(',') + '\n' + rows.map(row => keys.map(k => quote(row[k])).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function niceName(id: any, records: any[] = []) { const found = records.find(r => (r.id || r.zone_id || r.bank_id) === id); return found?.name || found?.zone_name || found?.bank_name || String(id || '').replace(/^Z-/, '').replaceAll('_', ' '); }
