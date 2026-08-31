/**
 * Day × time-of-day heatmap of commute success probability. Click a cell to
 * set the global day/time (driving RecommendationList below); the cell
 * nearest the current day/time is outlined. Fills the width of its
 * container — GRID_W is measured, not fixed, so more time buckets (finer
 * granularity) still fit the full page width instead of shrinking the SVG.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { probabilityToColor } from '../../utils/colorScale';
import { DAYS_FULL } from '../../utils/time';
import type { CommuteMatrixResponse } from '../../types';

interface Props {
  matrix: CommuteMatrixResponse;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PAD = { t: 8, r: 8, b: 20, l: 34 };
const ROW_H = 20;
const DEFAULT_GRID_W = 900; // used only before the container is first measured

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtPct(p: number | null): string {
  return p !== null ? `${Math.round(p * 100)}%` : '—';
}

type Period = 'morning' | 'afternoon' | 'evening' | 'night';
const PERIOD_PLURAL: Record<Period, string> = {
  morning: 'mornings', afternoon: 'afternoons', evening: 'evenings', night: 'nights',
};

function periodOf(minute: number): Period {
  if (minute >= 300 && minute < 660) return 'morning';   // 5a–11a
  if (minute >= 660 && minute < 960) return 'afternoon';  // 11a–4p
  if (minute >= 960 && minute < 1260) return 'evening';   // 4p–9p
  return 'night';                                          // 9p–5a
}

/** "Monday mornings are the worst, but Thursday evenings are clear" —
 * derived from the day×time success-probability grid, not hardcoded. */
function contextSentence(matrix: CommuteMatrixResponse): string | null {
  const agg = new Map<string, { sum: number; count: number }>();

  for (const day of matrix.days) {
    for (const bucket of day.buckets) {
      if (bucket.success_probability === null) continue;
      const key = `${day.day_of_week}|${periodOf(bucket.departure_minute)}`;
      const entry = agg.get(key) ?? { sum: 0, count: 0 };
      entry.sum += bucket.success_probability;
      entry.count += 1;
      agg.set(key, entry);
    }
  }
  if (agg.size < 2) return null;

  let worstKey = '', bestKey = '';
  let worstAvg = Infinity, bestAvg = -Infinity;
  for (const [key, { sum, count }] of agg) {
    const avg = sum / count;
    if (avg < worstAvg) { worstAvg = avg; worstKey = key; }
    if (avg > bestAvg) { bestAvg = avg; bestKey = key; }
  }
  if (worstKey === bestKey) return null;

  const [worstDay, worstPeriod] = worstKey.split('|') as [string, Period];
  const [bestDay, bestPeriod] = bestKey.split('|') as [string, Period];

  return `${DAYS_FULL[Number(worstDay)]} ${PERIOD_PLURAL[worstPeriod]} are the worst, but ${DAYS_FULL[Number(bestDay)]} ${PERIOD_PLURAL[bestPeriod]} are clear.`;
}

export function CommuteMatrix({ matrix }: Props) {
  const { selectedDay, selectedTime, setDay, setTime } = useStore();
  const [hover, setHover] = useState<{ day: number; bucketIdx: number } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(DEFAULT_GRID_W + PAD.l + PAD.r);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bucketsPerDay = matrix.days[0]?.buckets.length ?? 48;
  const gridW = Math.max(200, containerWidth - PAD.l - PAD.r);
  const cellW = gridW / bucketsPerDay;
  const gridH = ROW_H * matrix.days.length;
  const width = PAD.l + gridW + PAD.r;
  const height = PAD.t + gridH + PAD.b;

  const selectedBucketIdx = Math.floor(selectedTime / matrix.bucket_minutes);

  const hoverBucket = hover
    ? matrix.days[hover.day]?.buckets[hover.bucketIdx]
    : null;

  const context = useMemo(() => contextSentence(matrix), [matrix]);

  return (
    <div className="commute-matrix" ref={containerRef}>
      <div className="card-title">Probability of a successful commute by hour and day</div>
      {context && <div className="matrix-context">{context}</div>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {matrix.days.map((day, rowIdx) => (
          <g key={day.day_of_week}>
            <text
              x={PAD.l - 6} y={PAD.t + rowIdx * ROW_H + ROW_H / 2}
              textAnchor="end" dominantBaseline="middle"
              fontFamily="'IBM Plex Mono', monospace" fontSize={9} fill="#9aa1ad"
            >
              {DAY_LABELS[day.day_of_week]}
            </text>
            {day.buckets.map((bucket, colIdx) => {
              const x = PAD.l + colIdx * cellW;
              const y = PAD.t + rowIdx * ROW_H;
              const isSelected = day.day_of_week === selectedDay && colIdx === selectedBucketIdx;
              return (
                <rect
                  key={bucket.departure_minute}
                  x={x} y={y}
                  width={Math.max(1, cellW - 1)} height={ROW_H - 1}
                  fill={probabilityToColor(bucket.success_probability)}
                  stroke={isSelected ? '#16181d' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => { setHover({ day: rowIdx, bucketIdx: colIdx }); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                  onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => { setHover(null); setHoverPos(null); }}
                  onClick={() => { setDay(day.day_of_week); setTime(bucket.departure_minute); }}
                />
              );
            })}
          </g>
        ))}

        {/* Time-of-day axis */}
        {[0, 6, 12, 18, 24].map(h => {
          const x = PAD.l + (h * 60 / matrix.bucket_minutes) * cellW;
          const label = h === 0 ? '12a' : h === 12 ? '12p' : h === 24 ? '' : `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
          return (
            <text key={h} x={x} y={PAD.t + gridH + 13} textAnchor="middle"
              fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
              {label}
            </text>
          );
        })}
      </svg>

      {hoverBucket && hoverPos && (
        <div
          className="matrix-hover-tooltip"
          style={{ left: hoverPos.x + 14, top: hoverPos.y - 64 }}
        >
          <div className="matrix-tooltip-title">
            {DAY_LABELS[matrix.days[hover!.day].day_of_week]} {formatTime(hoverBucket.departure_minute)}
          </div>
          <div className="matrix-tooltip-row">
            <span>Success</span>
            <strong>{fmtPct(hoverBucket.success_probability)}</strong>
          </div>
          <div className="matrix-tooltip-row">
            <span>Bike avail.</span>
            <strong>{fmtPct(hoverBucket.bike_probability)}</strong>
          </div>
          <div className="matrix-tooltip-row">
            <span>Dock avail.</span>
            <strong>{fmtPct(hoverBucket.dock_probability)}</strong>
          </div>
        </div>
      )}

      <div className="commute-matrix-footer">
        <div className="commute-matrix-hint">
          {hoverBucket
            ? `${DAY_LABELS[matrix.days[hover!.day].day_of_week]} ${formatTime(hoverBucket.departure_minute)} — ${
                hoverBucket.success_probability !== null ? `${Math.round(hoverBucket.success_probability * 100)}%` : 'no data'
              }`
            : 'Click a cell to see that day and time below'}
        </div>
        <div className="scale-hint">
          {[0, 0.5, 1].map(v => (
            <div key={v} style={{ width: 10, height: 10, borderRadius: '50%', background: probabilityToColor(v) }} />
          ))}
          <span>Pink means scarce, blue means plentiful</span>
        </div>
      </div>
    </div>
  );
}
