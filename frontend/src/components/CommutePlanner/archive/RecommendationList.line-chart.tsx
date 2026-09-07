/**
 * ARCHIVED — not imported anywhere. Kept as a reference copy of the
 * "Best time to leave" line-chart design (one small-multiple line chart per
 * weekday, Mon–Fri) before it was replaced by CommuteWindowBars.tsx's
 * grey-track bar-chart design (see that file for the active component).
 */
/**
 * "Best time to leave" — one small-multiple line chart per weekday (Mon–Fri;
 * weekends are excluded since this is a commute planner), showing success
 * probability across the day with the morning/evening commute windows
 * shaded and the best departure time within each window called out.
 */
import { useMemo, useState } from 'react';
import type { CommuteMatrixBucket, CommuteMatrixDay, CommuteMatrixResponse } from '../../../types';
import { probabilityToColor, fmtPct } from '../../../utils/colorScale';

const AXIS_HOURS = [0, 6, 12, 18, 24];

function axisLabel(h: number): string {
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  return `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
}

interface Props {
  matrix: CommuteMatrixResponse;
  bikeLabel: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Mirrors MORNING_COMMUTE_WINDOW / EVENING_COMMUTE_WINDOW in backend/analytics/commute.py
const MORNING_WINDOW: [number, number] = [6 * 60, 10 * 60];
const EVENING_WINDOW: [number, number] = [16 * 60, 20 * 60];

const DAY_MINUTES = 24 * 60;
// Matches AvailabilityChart's viewBox width (700) so both charts render at
// the same px-per-unit scale in their equal-width (max-width: 1000px)
// containers — otherwise identical fontSize/strokeWidth values render at
// different actual sizes because the two SVGs stretch their coordinate
// systems by different factors to fill the same container.
const W = 700;
const H = 34;
const PAD = { l: 3, r: 3, t: 4, b: 4 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

// Low success reads as red, high success reads as blue.
const LINE_SCALE = 'redBlue';

function xScale(minute: number): number {
  return PAD.l + (minute / (DAY_MINUTES - 1)) * IW;
}

function yScale(p: number): number {
  return PAD.t + (1 - p) * IH;
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface PeakRun {
  startMinute: number;
  endMinute: number;
  value: number;
}

/**
 * Finds every local-maximum run within a commute window — a bucket (or a
 * flat stretch of equal-valued consecutive buckets) that's strictly higher
 * than its immediate neighbors. There can be more than one distinct peak in
 * a window, and a peak that's flat across several buckets (e.g. 100% for
 * the whole window) collapses into a single run instead of one point per
 * bucket, so the caller can draw one marker per genuine peak rather than a
 * pile of overlapping dots.
 */
function findPeakRuns(
  buckets: CommuteMatrixBucket[],
  [start, end]: [number, number],
): PeakRun[] {
  const inWindow = buckets
    .filter(b => b.departure_minute >= start && b.departure_minute <= end && b.success_probability !== null)
    .sort((a, b) => a.departure_minute - b.departure_minute);

  const runs: PeakRun[] = [];
  let i = 0;
  while (i < inWindow.length) {
    const value = inWindow[i].success_probability as number;
    let j = i;
    while (j + 1 < inWindow.length && inWindow[j + 1].success_probability === value) j++;

    const prevValue = i > 0 ? (inWindow[i - 1].success_probability as number) : null;
    const nextValue = j + 1 < inWindow.length ? (inWindow[j + 1].success_probability as number) : null;
    const isPeak = (prevValue === null || value > prevValue) && (nextValue === null || value > nextValue);

    if (isPeak) {
      runs.push({ startMinute: inWindow[i].departure_minute, endMinute: inWindow[j].departure_minute, value });
    }
    i = j + 1;
  }
  return runs;
}

/** Shared time-of-day axis rendered once above Monday's row and once below
 * Friday's — the per-row charts share this axis instead of each labeling
 * their own. Uses the same x-scale/padding as the row charts so ticks line
 * up under the correct time. */
function TimeAxis({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <div className={`rec-time-axis rec-time-axis-${edge}`}>
      <div className="rec-day-row-label" aria-hidden="true" />
      <div className="rec-day-row-chart">
        <svg width="100%" viewBox={`0 0 ${W} 14`}>
          {AXIS_HOURS.map(h => {
            const x = xScale(h * 60);
            const anchor = h === 0 ? 'start' : h === 24 ? 'end' : 'middle';
            return (
              <text key={h} x={x} y={11} textAnchor={anchor}
                fontFamily="'IBM Plex Mono',monospace" fontSize={9} fill="#9aa1ad">
                {axisLabel(h)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function DayMultiple({ day, bikeLabel, bucketMinutes }: { day: CommuteMatrixDay; bikeLabel: string; bucketMinutes: number }) {
  const [hover, setHover] = useState<CommuteMatrixBucket | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const pts = useMemo(() => day.buckets
    .filter(b => b.success_probability !== null)
    .map(b => ({
      x: xScale(b.departure_minute),
      y: yScale(b.success_probability as number),
      b,
    })), [day]);

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const peakRuns = useMemo(() => [
    ...findPeakRuns(day.buckets, MORNING_WINDOW),
    ...findPeakRuns(day.buckets, EVENING_WINDOW),
  ], [day]);

  const morningX1 = xScale(MORNING_WINDOW[0]);
  const morningX2 = xScale(MORNING_WINDOW[1]);
  const eveningX1 = xScale(EVENING_WINDOW[0]);
  const eveningX2 = xScale(EVENING_WINDOW[1]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = W / rect.width;
    const svgX = (e.clientX - rect.left) * scale;
    const minute = ((svgX - PAD.l) / IW) * (DAY_MINUTES - 1);
    let closest: CommuteMatrixBucket | null = null;
    let closestDist = Infinity;
    for (const p of pts) {
      const dist = Math.abs(p.b.departure_minute - minute);
      if (dist < closestDist) { closestDist = dist; closest = p.b; }
    }
    setHover(closest);
    setHoverPos({ x: e.clientX, y: e.clientY });
  }

  function handleMouseLeave() {
    setHover(null);
    setHoverPos(null);
  }

  const gradientId = `rec-line-grad-${day.day_of_week}`;

  return (
    <div className="rec-day-row">
      <div className="rec-day-row-label">{DAY_LABELS[day.day_of_week]}</div>

      <div className="rec-day-row-chart">
        <svg
          width="100%" viewBox={`0 0 ${W} ${H}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'crosshair' }}
        >
          <defs>
            {/* Colors each point along the line by its own success probability —
                low reads red, high reads blue — instead of one flat stroke color. */}
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={PAD.l} x2={PAD.l + IW} y1={0} y2={0}>
              {pts.map((p, i) => (
                <stop key={i} offset={`${((p.x - PAD.l) / IW) * 100}%`}
                  stopColor={probabilityToColor(p.b.success_probability, 1, LINE_SCALE)} />
              ))}
            </linearGradient>
          </defs>

          {/* Commute window shading */}
          <rect x={morningX1} y={PAD.t} width={morningX2 - morningX1} height={IH} fill="var(--control-track)" />
          <rect x={eveningX1} y={PAD.t} width={eveningX2 - eveningX1} height={IH} fill="var(--control-track)" />

          {pts.length > 1 && (
            <path d={linePath} fill="none" stroke={`url(#${gradientId})`} strokeWidth={2} strokeLinejoin="round" />
          )}

          {/* Peak markers within each commute window: a single point gets a
              dot, a flat run (e.g. 100% across several buckets) gets one
              rounded bar spanning it instead of a dot per bucket. */}
          {peakRuns.map((run, i) => {
            const color = probabilityToColor(run.value, 1, LINE_SCALE);
            const y = yScale(run.value);
            if (run.startMinute === run.endMinute) {
              return (
                <circle key={i} cx={xScale(run.startMinute)} cy={y} r={3}
                  fill={color} stroke="white" strokeWidth={1} />
              );
            }
            const barH = 5;
            const x1 = xScale(run.startMinute - bucketMinutes / 2);
            const x2 = xScale(run.endMinute + bucketMinutes / 2);
            return (
              <rect key={i} x={x1} y={y - barH / 2} width={x2 - x1} height={barH}
                rx={barH / 2} fill={color} stroke="white" strokeWidth={1} />
            );
          })}

          {/* Hover crosshair + dot */}
          {hover && (
            <g>
              <line x1={xScale(hover.departure_minute)} x2={xScale(hover.departure_minute)}
                y1={PAD.t} y2={PAD.t + IH}
                stroke="#16181d" strokeWidth={1} strokeDasharray="2 2" opacity={0.3} />
              {hover.success_probability !== null && (
                <circle cx={xScale(hover.departure_minute)} cy={yScale(hover.success_probability)} r={3}
                  fill="white" stroke={probabilityToColor(hover.success_probability, 1, LINE_SCALE)} strokeWidth={1.5} />
              )}
            </g>
          )}
        </svg>
      </div>

      {hover && hoverPos && (
        <div className="chart-hover-tooltip" style={{ left: hoverPos.x + 14, top: hoverPos.y - 64 }}>
          <div className="chart-tooltip-title">{DAY_LABELS[day.day_of_week]} {fmtTime(hover.departure_minute)}</div>
          <div className="chart-tooltip-row">
            <span>Success</span>
            <strong>{fmtPct(hover.success_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>{bikeLabel} avail.</span>
            <strong>{fmtPct(hover.bike_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>Dock avail.</span>
            <strong>{fmtPct(hover.dock_probability)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecommendationList({ matrix, bikeLabel }: Props) {
  const weekdays = matrix.days.filter(d => d.day_of_week < 5);
  if (!weekdays.length) return null;

  return (
    <div className="rec-chart card">
      <div className="rec-card-header">
        <span className="rec-card-title">Best time to leave</span>
      </div>
      <div className="rec-day-rows">
        <TimeAxis edge="top" />
        {weekdays.map(day => (
          <DayMultiple key={day.day_of_week} day={day} bikeLabel={bikeLabel} bucketMinutes={matrix.bucket_minutes} />
        ))}
        <TimeAxis edge="bottom" />
      </div>
    </div>
  );
}
