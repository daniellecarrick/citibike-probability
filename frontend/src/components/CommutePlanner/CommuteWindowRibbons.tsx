/**
 * Weekday commute windows for this route: the morning and evening windows,
 * each a two-row ribbon of every 5-minute departure. BIKE is the chance of a
 * bike at the start station when you leave; DOCK is the chance of an open
 * dock at the end station when you'd arrive (already shifted by the trip
 * time, so both rows line up under the same departure time). Averaged Mon–Fri.
 */
import { useMemo } from 'react';
import { ProbabilityRibbon } from '../charts/ProbabilityRibbon';
import { useElementWidth } from '../../hooks/useElementWidth';
import { averageInWindow, COMMUTE_WINDOWS, formatTime } from '../../utils/time';
import { fmtPct } from '../../utils/colorScale';
import type { CommuteMatrixResponse } from '../../types';

interface Props {
  /** Must be the 5-minute matrix: the ribbons draw one segment per 5-minute slot. */
  matrix: CommuteMatrixResponse;
  originName: string;
  destName: string;
  /** "bike" or "e-bike" */
  bikeNoun: string;
}

/** Mon–Fri average of one field, as 288 five-minute slots indexed by departure time. */
function weekdaySeries(matrix: CommuteMatrixResponse, field: 'bike_probability' | 'dock_probability'): (number | null)[] {
  const sums = new Array<number>(288).fill(0);
  const counts = new Array<number>(288).fill(0);
  for (const day of matrix.days) {
    if (day.day_of_week > 4) continue;
    for (const b of day.buckets) {
      const v = b[field];
      if (v === null) continue;
      const slot = Math.floor(b.departure_minute / 5);
      sums[slot] += v;
      counts[slot] += 1;
    }
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : null));
}

export function CommuteWindowRibbons({ matrix, originName, destName, bikeNoun }: Props) {
  const bike = useMemo(() => weekdaySeries(matrix, 'bike_probability'), [matrix]);
  const dock = useMemo(() => weekdaySeries(matrix, 'dock_probability'), [matrix]);
  const [boxRef, width] = useElementWidth(600);
  const article = /^[aeiou]/i.test(bikeNoun) ? 'an' : 'a';

  return (
    <div className="card commute-ribbons">
      <div className="card-title">Weekday commute windows</div>
      <p className="matrix-context">
        Every 5-minute departure, averaged Monday to Friday. <strong>BIKE</strong>: {article} {bikeNoun} at {originName} when
        you leave. <strong>DOCK</strong>: an open dock at {destName} when you arrive.
      </p>
      <div className="commute-ribbons-windows" ref={boxRef}>
        {COMMUTE_WINDOWS.map(w => (
          <div key={w.label} className="commute-window-block">
            <div className="commute-window-heading">
              {w.label}{' '}
              <span className="commute-window-range">{formatTime(w.startSlot * 5)}–{formatTime(w.endSlot * 5)}</span>
            </div>
            <div className="commute-body">
              {fmtPct(averageInWindow(bike, w))} chance of {article} {bikeNoun}, {fmtPct(averageInWindow(dock, w))} chance of a dock.
            </div>
            <div className="commute-ribbon">
              <ProbabilityRibbon
                window={w}
                rows={[
                  { label: 'BIKE', values: bike },
                  { label: 'DOCK', values: dock },
                ]}
                width={width}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
