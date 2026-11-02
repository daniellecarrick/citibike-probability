/**
 * "Usually 7–12 bikes at 8:30 AM": the typical count at the selected day and
 * time, as one bar from 0 to the station's capacity. The darker band is the
 * middle half of past snapshots (25th–75th percentile), the lighter band
 * the middle 80% (10th–90th), and the tick is the median.
 */
import type { StationContext } from '../../types';
import { formatTime } from '../../utils/time';

const NOUN: Record<StationContext['range']['metric'], [string, string]> = {
  bikes: ['bike', 'bikes'],
  ebikes: ['e-bike', 'e-bikes'],
  docks: ['open dock', 'open docks'],
};

interface Props {
  context: StationContext;
  selectedTime: number;
}

export function TypicalRange({ context, selectedTime }: Props) {
  const { range, capacity } = context;
  const [one, many] = NOUN[range.metric];

  if (range.sample_count === 0 || range.p25 === null || range.p75 === null || range.median === null) {
    return <div className="typical-range-empty">Not enough history at {formatTime(selectedTime)} yet.</div>;
  }

  const lo = Math.round(range.p25);
  const hi = Math.round(range.p75);
  const typical = lo === hi ? `${lo} ${lo === 1 ? one : many}` : `${lo}–${hi} ${many}`;
  // Capacity is the scale's end; fall back to the highest value seen if it's unknown.
  const max = Math.max(1, capacity ?? 0, Math.ceil(range.p90 ?? range.p75));
  const pct = (v: number) => `${(Math.min(Math.max(v, 0), max) / max) * 100}%`;
  const band = (from: number, to: number) => ({ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` });

  return (
    <div className="typical-range">
      <div className="typical-range-headline">
        Usually <strong>{typical}</strong> at {formatTime(selectedTime)}
      </div>
      <div
        className="typical-range-bar"
        role="img"
        aria-label={`Typically ${lo} to ${hi} ${many}, median ${Math.round(range.median)}, out of ${max}`}
      >
        {range.p10 !== null && range.p90 !== null && (
          <span className="typical-range-outer" style={band(range.p10, range.p90)} />
        )}
        <span className={`typical-range-inner typical-range-${range.metric}`} style={band(range.p25, range.p75)} />
        <span className="typical-range-median" style={{ left: pct(range.median) }} />
      </div>
      <div className="typical-range-scale">
        <span>0</span>
        <span>median {Math.round(range.median)}</span>
        <span>{capacity !== null ? `${max} docks` : max}</span>
      </div>
    </div>
  );
}
