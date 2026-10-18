/**
 * Day × time-of-day heatmap of commute success probability. Click a cell to
 * set the global day/time (driving RecommendationList below); the cell
 * nearest the current day/time is outlined. Fills the width of its
 * container — GRID_W is measured, not fixed, so more time buckets (finer
 * granularity) still fit the full page width instead of shrinking the SVG.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { probabilityToColor, SCALE_FLOOR } from '../../utils/colorScale';
import { DAYS_FULL, COMMUTE_WINDOWS } from '../../utils/time';
import { tooltipPosition } from '../../hooks/useChartPointer';
import { isTouchDevice, tapOrClick } from '../../utils/device';
import type { CommuteMatrixResponse } from '../../types';

interface Props {
  matrix: CommuteMatrixResponse;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PAD = { t: 22, r: 8, b: 20, l: 34 };
const ROW_H = 20;
/** Below this container width the grid is drawn rotated: days as columns, time running down. */
const VERTICAL_BELOW = 520;
const VPAD = { t: 22, r: 2, b: 4, l: 40 };
const DEFAULT_GRID_W = 900; // used only before the container is first measured

const [AM_WINDOW, PM_WINDOW] = COMMUTE_WINDOWS;
const MORNING_WINDOW: [number, number] = [AM_WINDOW.startSlot * 5, AM_WINDOW.endSlot * 5];
const EVENING_WINDOW: [number, number] = [PM_WINDOW.startSlot * 5, PM_WINDOW.endSlot * 5];

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
  const vertical = containerWidth < VERTICAL_BELOW;

  // Horizontal (desktop): one row per day, time across.
  const gridW = Math.max(200, containerWidth - PAD.l - PAD.r);
  const cellW = gridW / bucketsPerDay;
  const gridH = ROW_H * matrix.days.length;

  // Vertical (phone): one column per day, time running down, so each cell is
  // a finger-sized column instead of a 3px sliver.
  const colW = (containerWidth - VPAD.l - VPAD.r) / Math.max(1, matrix.days.length);
  const vRowH = Math.max(4, Math.min(12, Math.floor(432 / bucketsPerDay)));
  const vGridH = vRowH * bucketsPerDay;

  const width = vertical ? containerWidth : PAD.l + gridW + PAD.r;
  const height = vertical ? VPAD.t + vGridH + VPAD.b : PAD.t + gridH + PAD.b;

  /** Cell rect for a given day row / time bucket, in either orientation. */
  function cellRect(rowIdx: number, colIdx: number) {
    return vertical
      ? { x: VPAD.l + rowIdx * colW, y: VPAD.t + colIdx * vRowH, width: Math.max(1, colW - 2), height: Math.max(1, vRowH - 1) }
      : { x: PAD.l + colIdx * cellW, y: PAD.t + rowIdx * ROW_H, width: Math.max(1, cellW - 1), height: ROW_H - 1 };
  }

  const selectedBucketIdx = Math.floor(selectedTime / matrix.bucket_minutes);

  // Commute windows only apply Mon–Fri (day_of_week 0–4); find the
  // contiguous row range they occupy so the outline skips Sat/Sun rows.
  const weekdayRowIdxs = matrix.days
    .map((day, rowIdx) => (day.day_of_week < 5 ? rowIdx : null))
    .filter((idx): idx is number => idx !== null);
  const weekdayTop = weekdayRowIdxs.length ? Math.min(...weekdayRowIdxs) : null;
  const weekdayBottom = weekdayRowIdxs.length ? Math.max(...weekdayRowIdxs) : null;

  // Touch has no hover: the hint line reports the selected cell instead.
  const touch = isTouchDevice();
  const selectedRowIdx = matrix.days.findIndex(d => d.day_of_week === selectedDay);
  const hintTarget = hover ?? (touch && selectedRowIdx >= 0 ? { day: selectedRowIdx, bucketIdx: selectedBucketIdx } : null);
  const hoverBucket = hintTarget
    ? matrix.days[hintTarget.day]?.buckets[hintTarget.bucketIdx]
    : null;

  const context = useMemo(() => contextSentence(matrix), [matrix]);

  return (
    <div className="commute-matrix card" ref={containerRef}>
      <div className="card-title">Probability of a successful commute by hour and day</div>
      {context && <div className="matrix-context">{context}</div>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {matrix.days.map((day, rowIdx) => (
          <g key={day.day_of_week}>
            {vertical ? (
              <text
                x={VPAD.l + rowIdx * colW + colW / 2 - 1} y={VPAD.t - 8}
                textAnchor="middle"
                fontFamily="'IBM Plex Mono', monospace" fontSize={11}
                fill={day.day_of_week === selectedDay ? '#16181d' : '#6c727e'}
                fontWeight={day.day_of_week === selectedDay ? 700 : 400}
              >
                {DAY_LABELS[day.day_of_week]}
              </text>
            ) : (
              <text
                x={PAD.l - 6} y={PAD.t + rowIdx * ROW_H + ROW_H / 2}
                textAnchor="end" dominantBaseline="middle"
                fontFamily="'IBM Plex Mono', monospace" fontSize={9} fill="#9aa1ad"
              >
                {DAY_LABELS[day.day_of_week]}
              </text>
            )}
            {day.buckets.map((bucket, colIdx) => {
              const isSelected = day.day_of_week === selectedDay && colIdx === selectedBucketIdx;
              return (
                <rect
                  className="matrix-cell"
                  key={bucket.departure_minute}
                  {...cellRect(rowIdx, colIdx)}
                  fill={probabilityToColor(bucket.success_probability)}
                  stroke={isSelected ? '#16181d' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => { if (touch) return; setHover({ day: rowIdx, bucketIdx: colIdx }); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                  onMouseMove={(e) => { if (!touch) setHoverPos({ x: e.clientX, y: e.clientY }); }}
                  onMouseLeave={() => { setHover(null); setHoverPos(null); }}
                  onClick={() => { setDay(day.day_of_week); setTime(bucket.departure_minute); }}
                />
              );
            })}
          </g>
        ))}

        {/* Morning / evening commute window outlines — Mon–Fri rows only */}
        {weekdayTop !== null && weekdayBottom !== null &&
          ([['Morning commute', MORNING_WINDOW], ['Evening commute', EVENING_WINDOW]] as const).map(([label, [start, end]]) => {
            if (vertical) {
              const x1 = VPAD.l + weekdayTop * colW - 1;
              const x2 = VPAD.l + (weekdayBottom + 1) * colW - 1;
              const y1 = VPAD.t + (start / matrix.bucket_minutes) * vRowH - 1;
              const y2 = VPAD.t + (end / matrix.bucket_minutes) * vRowH;
              return (
                <rect key={label} pointerEvents="none" x={x1} y={y1} width={x2 - x1} height={y2 - y1}
                  fill="none" stroke="#16181d" strokeWidth={1.5} rx={3} />
              );
            }
            const x1 = PAD.l + (start / matrix.bucket_minutes) * cellW;
            const x2 = PAD.l + (end / matrix.bucket_minutes) * cellW;
            const y1 = PAD.t + weekdayTop * ROW_H;
            const y2 = PAD.t + (weekdayBottom + 1) * ROW_H;
            return (
              <g key={label} pointerEvents="none">
                <rect
                  x={x1} y={y1}
                  width={x2 - x1} height={y2 - y1}
                  fill="none" stroke="#16181d" strokeWidth={1.5} rx={3}
                />
                <text
                  x={(x1 + x2) / 2} y={PAD.t - 8}
                  textAnchor="middle"
                  fontFamily="'IBM Plex Mono', monospace" fontSize={8} fontWeight={700}
                  letterSpacing="0.04em" fill="#16181d"
                >
                  {label.toUpperCase()}
                </text>
              </g>
            );
          })}

        {/* Time-of-day axis. This SVG's viewBox is sized to the container's
            actual measured pixel width (1 unit = 1px, no scaling), unlike
            AvailabilityChart/RecommendationList which stretch a fixed-width
            viewBox to fill the same max-width:1000px container — so a font
            size here needs to be bumped by that ~1000/700 stretch factor
            (9 → 13) to read as the same size as their axis labels. */}
        {vertical && [0, 3, 6, 9, 12, 15, 18, 21].map(h => (
          <text key={h} x={VPAD.l - 6} y={VPAD.t + (h * 60 / matrix.bucket_minutes) * vRowH}
            textAnchor="end" dominantBaseline="hanging"
            fontFamily="'IBM Plex Mono', monospace" fontSize={11} fill="#9aa1ad">
            {h === 0 ? '12a' : h === 12 ? '12p' : `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`}
          </text>
        ))}
        {!vertical && [0, 6, 12, 18, 24].map(h => {
          const x = PAD.l + (h * 60 / matrix.bucket_minutes) * cellW;
          const label = h === 0 ? '12a' : h === 12 ? '12p' : h === 24 ? '' : `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
          return (
            <text key={h} x={x} y={PAD.t + gridH + 15} textAnchor="middle"
              fontFamily="'IBM Plex Mono', monospace" fontSize={13} fill="#9aa1ad">
              {label}
            </text>
          );
        })}
      </svg>

      {hover && hoverBucket && hoverPos && (
        <div
          className="chart-hover-tooltip"
          style={tooltipPosition(hoverPos.x, hoverPos.y, 150, 64)}
        >
          <div className="chart-tooltip-title">
            {DAY_LABELS[matrix.days[hover.day].day_of_week]} {formatTime(hoverBucket.departure_minute)}
          </div>
          <div className="chart-tooltip-row">
            <span>Success</span>
            <strong>{fmtPct(hoverBucket.success_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>Bike avail.</span>
            <strong>{fmtPct(hoverBucket.bike_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>Dock avail.</span>
            <strong>{fmtPct(hoverBucket.dock_probability)}</strong>
          </div>
        </div>
      )}

      <div className="commute-matrix-footer">
        <div className="commute-matrix-hint">
          {hintTarget && hoverBucket
            ? `${DAY_LABELS[matrix.days[hintTarget.day].day_of_week]} ${formatTime(hoverBucket.departure_minute)} — ${
                hoverBucket.success_probability !== null ? `${Math.round(hoverBucket.success_probability * 100)}%` : 'no data'
              }${touch ? ` · ${tapOrClick()} a cell to change it` : ''}`
            : `${tapOrClick()} a cell to see that day and time below`}
        </div>
        {vertical && <div className="commute-matrix-hint">Outlined: weekday morning and evening commutes</div>}
        <div className="scale-hint">
          {[SCALE_FLOOR, (SCALE_FLOOR + 1) / 2, 1].map(v => (
            <div key={v} style={{ width: 10, height: 10, borderRadius: '50%', background: probabilityToColor(v) }} />
          ))}
          <span>Pink means scarce, blue means plentiful</span>
        </div>
      </div>
    </div>
  );
}
