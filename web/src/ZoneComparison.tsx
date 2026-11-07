import { ArrowUpRight, Info } from 'lucide-react';
import { niceName, number } from './data';

type Props = { zones: any[]; data: any; onSelectZone: (zone: string) => void };
const rateLabel = (value: number) => Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  : '—';

export default function ZoneComparison({ zones, data, onSelectZone }: Props) {
  const rows = [...(zones || [])].map(zone => ({
    ...zone,
    label: niceName(zone.id, data?.zones),
    rate: zone.available > 0 && Number.isFinite(zone.theoHour) ? zone.theoHour : NaN,
  })).sort((a, b) => (Number.isFinite(b.rate) ? b.rate : -Infinity) - (Number.isFinite(a.rate) ? a.rate : -Infinity) || a.label.localeCompare(b.label));
  const valid = rows.filter(row => Number.isFinite(row.rate) && row.rate >= 0);
  const available = valid.reduce((total, row) => total + row.available, 0);
  const expected = valid.reduce((total, row) => total + row.theo, 0);
  const benchmark = available > 0 ? expected / available : NaN;
  const maximum = Math.max(5, Math.ceil(Math.max(0, ...valid.map(row => row.rate)) / 5) * 5);
  const marker = Number.isFinite(benchmark) ? Math.max(0, Math.min(100, benchmark / maximum * 100)) : null;

  if (!rows.length) return <div className="zone-comparison zone-comparison-empty">No zone activity in this selection. Adjust the period or floor filters.</div>;

  return <div className="zone-comparison">
    <div className="zone-comparison-intro">
      <span>Expected win per available machine-hour</span>
      <span className="zone-benchmark-key"><i aria-hidden="true"/> Scope average <strong>{rateLabel(benchmark)}</strong></span>
    </div>
    <div className="zone-ranking" aria-label="Zone performance ranked by expected win per available machine-hour">
      {rows.map((row, index) => <button type="button" key={row.id} className={'zone-ranking-row' + (row.id === 'Z-B40' ? ' zone-in-focus' : '')} aria-label={'Explore ' + row.label} onClick={() => onSelectZone(row.id)} data-zone={row.id}>
        <span className="zone-ranking-heading">
          <span className="zone-ranking-name"><span className="zone-rank-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><strong>{row.label}</strong>{row.id === 'Z-B40' && <span className="zone-focus-tag">In focus</span>}</span>
          <span className="zone-ranking-value">{rateLabel(row.rate)} <ArrowUpRight size={13} aria-hidden="true"/></span>
        </span>
        <span className="zone-ranking-track" aria-hidden="true">
          <span className="zone-ranking-fill" style={{ width: (Number.isFinite(row.rate) ? Math.max(0, Math.min(100, row.rate / maximum * 100)) : 0) + '%' }}/>
          {marker != null && <i className="zone-ranking-benchmark" style={{ left: marker + '%' }}/>}
        </span>
        <span className="zone-ranking-context">{number(row.count)} machines active in selection{!Number.isFinite(row.rate) && ' · no available hours'}</span>
      </button>)}
    </div>
    <div className="zone-comparison-scale" aria-hidden="true"><span>$0</span><span>Same scale for every zone</span><span>{rateLabel(maximum)} / h</span></div>
    <p className="zone-comparison-note"><Info size={13} aria-hidden="true"/><span>Rates reflect game mix and location; they are descriptive, not causal. Select a zone to inspect its machines. Scope average uses total expected win ÷ total available hours.</span></p>
  </div>;
}
