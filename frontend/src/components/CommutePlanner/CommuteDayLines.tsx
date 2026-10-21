/**
 * Small-multiple line charts, one row per day of the week, stacked on a
 * shared time-of-day axis: the same day × time success probabilities as the
 * heatmap, read as seven shapes instead of a grid of colors. Each line is
 * colored by its own value (pink scarce → blue plentiful) over a faint area
 * fill; weekday commute windows are shaded. Tapping/clicking a point sets
 * the global day and time, like a heatmap cell.
 *
 * Adapted from the archived "Best time to leave" chart
 * (archive/RecommendationList.line-chart.tsx), extended to all 7 days and
 * drawn as one SVG so a single pointer handler can hit-test row + time.
 */
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { useElementWidth } from '../../hooks/useElementWidth';
import { tooltipPosition, useChartPointer } from '../../hooks/useChartPointer';
import { fmtPct, probabilityToColor } from '../../utils/colorScale';
import { COMMUTE_WINDOWS, formatTime } from '../../utils/time';
import type { CommuteMatrixBucket, CommuteMatrixResponse } from '../../types';

interface Props {
  matrix: CommuteMatrixResponse;
  bikeLabel: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MINUTES = 24 * 60;
const [AM_WINDOW, PM_WINDOW] = COMMUTE_WINDOWS;
const WINDOWS: [number, number][] = [
  [AM_WINDOW.startSlot * 5, AM_WINDOW.endSlot * 5],
  [PM_WINDOW.startSlot * 5, PM_WINDOW.endSlot * 5],
];

const ROW_GAP = 6;
const AXIS_H = 20;

function axisLabel(h: number): string {
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  return `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
}

export function CommuteDayLines({ matrix, bikeLabel }: Props) {
  const { selectedDay, selectedTime } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ row: number; bucket: CommuteMatrixBucket } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Real-pixel layout, so text stays legible at any width.
  const [boxRef, width] = useElementWidth(900);
  const narrow = width < 520;
  const LABEL_W = narrow ? 38 : 48;
  const PAD_R = 6;
  const ROW_H = narrow ? 38 : 44;

  const days = useMemo(() => [...matrix.days].sort((a, b) => a.day_of_week - b.day_of_week), [matrix]);
  const plotW = Math.max(100, width - LABEL_W - PAD_R);
  const height = days.length * ROW_H + (days.length - 1) * ROW_GAP + AXIS_H;
  const lastMinute = DAY_MINUTES - matrix.bucket_minutes;

  const x = (minute: number) => LABEL_W + (minute / lastMinute) * plotW;
  const rowTop = (row: number) => row * (ROW_H + ROW_GAP);
  // 3px inset top and bottom so a line at 0% or 100% isn't clipped by its own stroke.
  const y = (row: number, p: number) => rowTop(row) + 3 + (1 - p) * (ROW_H - 6);

  const rows = useMemo(() => days.map((day, row) => {
    let line = '';
    let area = '';
    let segStart: number | null = null;
    let prevX = 0;
    const base = rowTop(row) + ROW_H - 3;
    const closeArea = () => {
      if (segStart !== null) area += `L${prevX.toFixed(1)},${base} L${segStart.toFixed(1)},${base} Z `;
      segStart = null;
    };
    for (const b of day.buckets) {
      if (b.success_probability === null) { closeArea(); continue; }
      const px = x(b.departure_minute);
      const py = y(row, b.success_probability);
      if (segStart === null) {
        line += `M${px.toFixed(1)},${py.toFixed(1)} `;
        area += `M${px.toFixed(1)},${base} L${px.toFixed(1)},${py.toFixed(1)} `;
        segStart = px;
      } else {
        line += `L${px.toFixed(1)},${py.toFixed(1)} `;
        area += `L${px.toFixed(1)},${py.toFixed(1)} `;
      }
      prevX = px;
    }
    closeArea();
    return { day, line: line.trim(), area: area.trim() };
  }), [days, width, ROW_H]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Row and nearest bucket under a client point; null outside the plot. */
  function hitTest(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return null;
    const sx = ((clientX - rect.left) / rect.width) * width;
    const sy = ((clientY - rect.top) / rect.height) * height;
    const row = Math.floor(sy / (ROW_H + ROW_GAP));
    if (row < 0 || row >= days.length) return null;
    const minute = ((Math.max(LABEL_W, sx) - LABEL_W) / plotW) * lastMinute;
    const bucket = days[row].buckets.reduce((a, b) =>
      Math.abs(b.departure_minute - minute) < Math.abs(a.departure_minute - minute) ? b : a);
    return { row, bucket };
  }

  const pointer = useChartPointer({
    onHover: (cx, cy) => { setHover(hitTest(cx, cy)); setHoverPos({ x: cx, y: cy }); },
    onLeave: () => { setHover(null); setHoverPos(null); },
  });

  const selectedRow = days.findIndex(d => d.day_of_week === selectedDay);
  const selectedBucket = selectedRow >= 0
    ? days[selectedRow].buckets.reduce((a, b) =>
      Math.abs(b.departure_minute - selectedTime) < Math.abs(a.departure_minute - selectedTime) ? b : a)
    : null;
  const axisHours = narrow ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const hoverDay = hover ? days[hover.row].day_of_week : null;

  return (
    <div className="commute-day-lines" ref={boxRef}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Chance of a successful commute across the day, one line per day of the week"
        {...pointer}
        style={{ display: 'block', cursor: 'crosshair', touchAction: 'pan-y' }}
      >
        <defs>
          {rows.map(({ day }) => {
            const known = day.buckets.filter(b => b.success_probability !== null);
            return (
              <linearGradient key={day.day_of_week} id={`day-line-${day.day_of_week}`}
                gradientUnits="userSpaceOnUse" x1={LABEL_W} x2={LABEL_W + plotW} y1={0} y2={0}>
                {known.map(b => (
                  <stop key={b.departure_minute}
                    offset={`${((b.departure_minute / lastMinute) * 100).toFixed(2)}%`}
                    stopColor={probabilityToColor(b.success_probability)} />
                ))}
              </linearGradient>
            );
          })}
        </defs>

        {rows.map(({ day, line, area }, row) => {
          const top = rowTop(row);
          const weekend = day.day_of_week > 4;
          const isSelected = day.day_of_week === selectedDay;
          return (
            <g key={day.day_of_week} opacity={weekend ? 0.6 : 1}>
              <text x={0} y={top + ROW_H / 2} dominantBaseline="middle"
                fontFamily="'IBM Plex Mono', monospace" fontSize={narrow ? 11 : 12}
                fontWeight={isSelected ? 700 : 400}
                fill={isSelected ? '#16181d' : '#6c727e'}>
                {DAY_LABELS[day.day_of_week]}
              </text>

              {/* Row background, plus commute-window shading on weekdays */}
              <rect x={LABEL_W} y={top} width={plotW} height={ROW_H} rx={4} fill="#f7f8fa" />
              {!weekend && WINDOWS.map(([start, end]) => (
                <rect key={start} x={x(start)} y={top} width={x(end) - x(start)} height={ROW_H} fill="#eceef2" />
              ))}
              {/* 50% guide: the bottom of the color scale, where every line reads fully pink */}
              <line x1={LABEL_W} x2={LABEL_W + plotW} y1={y(row, 0.5)} y2={y(row, 0.5)}
                stroke="#dfe3e8" strokeWidth={1} strokeDasharray="2 3" />

              {area && <path d={area} fill={`url(#day-line-${day.day_of_week})`} opacity={0.14} />}
              {line && (
                <path d={line} fill="none" stroke={`url(#day-line-${day.day_of_week})`}
                  strokeWidth={isSelected ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
              )}
            </g>
          );
        })}

        {/* Selected day/time: a dashed line through every row, a dot on the selected day */}
        <line x1={x(Math.min(selectedTime, lastMinute))} x2={x(Math.min(selectedTime, lastMinute))} y1={0} y2={height - AXIS_H}
          stroke="#16181d" strokeWidth={1} strokeDasharray="3 3" opacity={0.35} pointerEvents="none" />
        {selectedBucket && selectedBucket.success_probability !== null && (
          <circle cx={x(selectedBucket.departure_minute)} cy={y(selectedRow, selectedBucket.success_probability)} r={5}
            fill={probabilityToColor(selectedBucket.success_probability)} stroke="#fff" strokeWidth={2} pointerEvents="none" />
        )}

        {hover && hover.bucket.success_probability !== null && (
          <g pointerEvents="none">
            <line x1={x(hover.bucket.departure_minute)} x2={x(hover.bucket.departure_minute)} y1={0} y2={height - AXIS_H}
              stroke="#16181d" strokeWidth={1} opacity={0.2} />
            <circle cx={x(hover.bucket.departure_minute)} cy={y(hover.row, hover.bucket.success_probability)} r={4}
              fill="#fff" stroke={probabilityToColor(hover.bucket.success_probability)} strokeWidth={2} />
          </g>
        )}

        {/* Shared time axis */}
        {axisHours.map(h => (
          <text key={h} x={x(Math.min(h * 60, lastMinute))} y={height - 5}
            textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}
            fontFamily="'IBM Plex Mono', monospace" fontSize={11} fill="#9aa1ad">
            {axisLabel(h)}
          </text>
        ))}
      </svg>

      <div className="commute-matrix-footer">
        <div className="commute-matrix-hint">
          Shaded: weekday commute windows
        </div>
      </div>

      {hover && hoverPos && hoverDay !== null && (
        <div className="chart-hover-tooltip" style={tooltipPosition(hoverPos.x, hoverPos.y, 150, 74)}>
          <div className="chart-tooltip-title">{DAY_LABELS[hoverDay]} {formatTime(hover.bucket.departure_minute)}</div>
          <div className="chart-tooltip-row">
            <span>Success</span>
            <strong>{fmtPct(hover.bucket.success_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>{bikeLabel} avail.</span>
            <strong>{fmtPct(hover.bucket.bike_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>Dock avail.</span>
            <strong>{fmtPct(hover.bucket.dock_probability)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
