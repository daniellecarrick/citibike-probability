/**
 * "Your week at a glance" scorecard (7 days × morning/evening commute window,
 * one average success % per tile) plus a zoom chart of the selected tile at
 * 5-minute resolution. Tiles, the zoom chart, and the headline all share the
 * global selectedDay/selectedTime, so clicking either chart moves the others.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { useIsMobile } from '../../hooks/useIsMobile';
import { fmtPct, probabilityToColor, SCALE_FLOOR } from '../../utils/colorScale';
import { COMMUTE_WINDOWS, DAYS_FULL, formatTime } from '../../utils/time';
import type { CommuteMatrixBucket, CommuteMatrixResponse, DayOfWeek } from '../../types';

interface Props {
  /** Must be the 5-minute matrix — tiles and the zoom chart read every slot. */
  matrix: CommuteMatrixResponse;
  bikeLabel: string;
}

type WindowKey = 'am' | 'pm';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const [AM_WINDOW, PM_WINDOW] = COMMUTE_WINDOWS;
const WINDOWS: Record<WindowKey, { label: string; range: [number, number] }> = {
  am: { label: 'Morning', range: [AM_WINDOW.startSlot * 5, AM_WINDOW.endSlot * 5] },
  pm: { label: 'Evening', range: [PM_WINDOW.startSlot * 5, PM_WINDOW.endSlot * 5] },
};
const WINDOW_KEYS: WindowKey[] = ['am', 'pm'];

/** Success probability at or above this counts as "reliable" for the leave-by hint. */
const RELIABLE = 0.85;

function fmtHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

function windowHours(w: WindowKey): string {
  const [start, end] = WINDOWS[w].range;
  return `${fmtHour(start).replace(/ (AM|PM)$/, '')}–${fmtHour(end)}`;
}

function windowOf(minute: number): WindowKey | null {
  return WINDOW_KEYS.find(k => minute >= WINDOWS[k].range[0] && minute < WINDOWS[k].range[1]) ?? null;
}

function bucketsInWindow(buckets: CommuteMatrixBucket[], w: WindowKey): CommuteMatrixBucket[] {
  const [start, end] = WINDOWS[w].range;
  return buckets
    .filter(b => b.departure_minute >= start && b.departure_minute < end)
    .sort((a, b) => a.departure_minute - b.departure_minute);
}

interface WindowSummary {
  buckets: CommuteMatrixBucket[];
  avg: number | null;
  best: CommuteMatrixBucket | null;
  /** Latest departure before success first drops below RELIABLE; null if it starts below or never drops. */
  leaveBy: CommuteMatrixBucket | null;
  allReliable: boolean;
}

function summarize(buckets: CommuteMatrixBucket[]): WindowSummary {
  const known = buckets.filter(b => b.success_probability !== null);
  if (known.length === 0) return { buckets, avg: null, best: null, leaveBy: null, allReliable: false };
  const avg = known.reduce((sum, b) => sum + b.success_probability!, 0) / known.length;
  const best = known.reduce((a, b) => (b.success_probability! > a.success_probability! ? b : a));
  const firstBad = known.findIndex(b => b.success_probability! < RELIABLE);
  return {
    buckets,
    avg,
    best,
    leaveBy: firstBad > 0 ? known[firstBad - 1] : null,
    allReliable: firstBad === -1,
  };
}

function summaryHint(s: WindowSummary): string {
  if (s.avg === null) return 'No data';
  if (s.allReliable) return 'Steady all window';
  if (s.leaveBy) return `Leave by ${formatTime(s.leaveBy.departure_minute)}`;
  return `Best ${formatTime(s.best!.departure_minute)}`;
}

export function CommuteWeekView({ matrix, bikeLabel }: Props) {
  const { selectedDay, selectedTime, setDay, setTime } = useStore();
  const isMobile = useIsMobile(640);
  const [win, setWin] = useState<WindowKey>(() => windowOf(selectedTime) ?? 'am');

  // Follow the selected time into whichever window it lands in; outside both
  // windows, keep showing the last one.
  useEffect(() => {
    const w = windowOf(selectedTime);
    if (w) setWin(w);
  }, [selectedTime]);

  const summaries = useMemo(() => {
    const out = new Map<string, WindowSummary>();
    for (const day of matrix.days) {
      for (const w of WINDOW_KEYS) out.set(`${day.day_of_week}${w}`, summarize(bucketsInWindow(day.buckets, w)));
    }
    return out;
  }, [matrix]);

  const days = [...matrix.days].sort((a, b) => a.day_of_week - b.day_of_week);

  function handleTile(day: DayOfWeek, w: WindowKey) {
    setWin(w);
    setDay(day);
    const [start, end] = WINDOWS[w].range;
    if (selectedTime >= start && selectedTime < end) return;
    const s = summaries.get(`${day}${w}`);
    setTime((s?.leaveBy ?? s?.best)?.departure_minute ?? start);
  }

  function tile(day: DayOfWeek, w: WindowKey) {
    const s = summaries.get(`${day}${w}`)!;
    const selected = day === selectedDay && w === win;
    const label = `${DAYS_FULL[day]} ${WINDOWS[w].label.toLowerCase()}: ${fmtPct(s.avg)} average`;
    return (
      <button
        key={`${day}${w}`}
        className={`week-tile${selected ? ' selected' : ''}${day > 4 ? ' weekend' : ''}`}
        onClick={() => handleTile(day, w)}
        aria-pressed={selected}
        aria-label={label}
      >
        <span className="week-tile-pct" style={{ color: probabilityToColor(s.avg) }}>{fmtPct(s.avg)}</span>
        <span className="week-tile-hint">{summaryHint(s)}</span>
        <span className="week-tile-strip" aria-hidden="true">
          {s.buckets.filter((_, i) => i % 2 === 0).map(b => (
            <i key={b.departure_minute} style={{ background: probabilityToColor(b.success_probability) }} />
          ))}
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="card week-glance">
        <div className="card-title">Your week at a glance</div>
        <p className="week-glance-sub">
          Average chance of finding a bike and a dock during each commute window. Click a tile to zoom in.
        </p>
        {isMobile ? (
          <div className="week-grid week-grid-mobile">
            <div />
            {WINDOW_KEYS.map(w => (
              <div key={w} className="week-grid-colhead week-grid-window">
                {WINDOWS[w].label}<span>{windowHours(w)}</span>
              </div>
            ))}
            {days.map(d => (
              <div key={d.day_of_week} style={{ display: 'contents' }}>
                <div className="week-grid-rowhead week-grid-day">{DAY_LABELS[d.day_of_week]}</div>
                {WINDOW_KEYS.map(w => tile(d.day_of_week, w))}
              </div>
            ))}
          </div>
        ) : (
          <div className="week-grid" style={{ gridTemplateColumns: `108px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map(d => (
              <div key={d.day_of_week} className={`week-grid-colhead week-grid-day${d.day_of_week > 4 ? ' weekend' : ''}`}>
                {DAY_LABELS[d.day_of_week]}
              </div>
            ))}
            {WINDOW_KEYS.map(w => (
              <div key={w} style={{ display: 'contents' }}>
                <div className="week-grid-rowhead week-grid-window">
                  {WINDOWS[w].label}<span>{windowHours(w)}</span>
                </div>
                {days.map(d => tile(d.day_of_week, w))}
              </div>
            ))}
          </div>
        )}
        <div className="scale-hint">
          {[SCALE_FLOOR, (SCALE_FLOOR + 1) / 2, 1].map(v => (
            <div key={v} style={{ width: 10, height: 10, borderRadius: '50%', background: probabilityToColor(v) }} />
          ))}
          <span>Pink means scarce, blue means plentiful</span>
        </div>
      </div>

      <WindowZoomChart
        matrix={matrix}
        day={selectedDay}
        win={win}
        summary={summaries.get(`${selectedDay}${win}`) ?? null}
        selectedTime={selectedTime}
        onPick={setTime}
        bikeLabel={bikeLabel}
      />
    </>
  );
}

const W = 700;
const H = 250;
const PAD = { l: 38, r: 14, t: 22, b: 26 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

function WindowZoomChart({
  matrix, day, win, summary, selectedTime, onPick, bikeLabel,
}: {
  matrix: CommuteMatrixResponse;
  day: DayOfWeek;
  win: WindowKey;
  summary: WindowSummary | null;
  selectedTime: number;
  onPick: (minute: number) => void;
  bikeLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<CommuteMatrixBucket | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const [start, end] = WINDOWS[win].range;
  const lastMinute = end - matrix.bucket_minutes;
  const isWeekend = day > 4;
  const selectedBuckets = summary?.buckets ?? [];
  // Faint comparison lines: the other days of the same kind (weekdays vs weekend).
  const peers = matrix.days
    .filter(d => d.day_of_week !== day && (d.day_of_week > 4) === isWeekend)
    .map(d => bucketsInWindow(d.buckets, win));

  // Floor the y-axis at 40% unless the data goes lower, so typical commutes use the full height.
  const allValues = [selectedBuckets, ...peers].flat()
    .map(b => b.success_probability)
    .filter((v): v is number => v !== null);
  const yMin = Math.min(0.4, Math.floor((allValues.length ? Math.min(...allValues) : 1) * 5) / 5);

  const x = (m: number) => PAD.l + ((m - start) / (lastMinute - start)) * IW;
  const y = (p: number) => PAD.t + (1 - (p - yMin) / (1 - yMin)) * IH;

  function linePath(buckets: CommuteMatrixBucket[]): string {
    let d = '';
    let drawing = false;
    for (const b of buckets) {
      if (b.success_probability === null) { drawing = false; continue; }
      d += `${drawing ? 'L' : 'M'}${x(b.departure_minute).toFixed(1)},${y(b.success_probability).toFixed(1)} `;
      drawing = true;
    }
    return d.trim();
  }

  const known = selectedBuckets.filter(b => b.success_probability !== null);
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].filter(v => v >= yMin);
  const hourTicks: number[] = [];
  for (let m = start; m <= end; m += 60) hourTicks.push(m);

  function bucketAt(clientX: number): CommuteMatrixBucket | null {
    const svg = svgRef.current;
    if (!svg || selectedBuckets.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    const minute = start + ((vx - PAD.l) / IW) * (lastMinute - start);
    return selectedBuckets.reduce((a, b) =>
      Math.abs(b.departure_minute - minute) < Math.abs(a.departure_minute - minute) ? b : a);
  }

  const showSelected = selectedTime >= start && selectedTime < end && selectedBuckets.length > 0;
  const selectedBucket = showSelected
    ? selectedBuckets.reduce((a, b) =>
      Math.abs(b.departure_minute - selectedTime) < Math.abs(a.departure_minute - selectedTime) ? b : a)
    : null;

  const title = `${DAYS_FULL[day]} ${WINDOWS[win].label.toLowerCase()}`;

  return (
    <div className="card window-zoom">
      <div className="window-zoom-head">
        <div>
          <div className="card-title">{title}</div>
          <p className="week-glance-sub">
            Every {matrix.bucket_minutes}-minute departure from {formatTime(start)} to {formatTime(end)}
          </p>
        </div>
        <div className="window-zoom-legend">
          <span>
            <span className="window-zoom-swatch window-zoom-swatch-day" />{DAYS_FULL[day]}
          </span>
          {peers.length > 0 && (
            <span>
              <span className="window-zoom-swatch window-zoom-swatch-peer" />
              Other {isWeekend ? 'weekend day' : 'weekdays'}
            </span>
          )}
        </div>
      </div>

      {known.length === 0 ? (
        <div className="availability-chart-empty">Not enough data yet for this window.</div>
      ) : (
        <svg
          ref={svgRef}
          className="window-zoom-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Chance of a successful commute by departure time, ${title}`}
          onMouseMove={e => { setHover(bucketAt(e.clientX)); setHoverPos({ x: e.clientX, y: e.clientY }); }}
          onMouseLeave={() => { setHover(null); setHoverPos(null); }}
          onClick={e => { const b = bucketAt(e.clientX); if (b) onPick(b.departure_minute); }}
        >
          <defs>
            <linearGradient id="window-zoom-line" x1={PAD.l} x2={PAD.l + IW} y1="0" y2="0" gradientUnits="userSpaceOnUse">
              {known.map(b => (
                <stop
                  key={b.departure_minute}
                  offset={`${(((b.departure_minute - start) / (lastMinute - start)) * 100).toFixed(1)}%`}
                  stopColor={probabilityToColor(b.success_probability)}
                />
              ))}
            </linearGradient>
          </defs>

          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={PAD.l + IW} y1={y(v)} y2={y(v)} stroke="#eceef2" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle"
                fontFamily="'IBM Plex Mono',monospace" fontSize={10} fill="#9aa1ad">
                {Math.round(v * 100)}%
              </text>
            </g>
          ))}


          {hourTicks.map(m => (
            <text key={m} x={x(Math.min(m, lastMinute))} y={H - 8} textAnchor="middle"
              fontFamily="'IBM Plex Mono',monospace" fontSize={10} fill="#9aa1ad">
              {fmtHour(m).replace(' ', '').toLowerCase()}
            </text>
          ))}

          {peers.map((p, i) => (
            <path key={i} d={linePath(p)} fill="none" stroke="#c9ced6" strokeWidth={1.5} strokeLinejoin="round" />
          ))}
          <path d={linePath(selectedBuckets)} fill="none" stroke="url(#window-zoom-line)"
            strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

          {summary?.leaveBy && summary.leaveBy.success_probability !== null && (() => {
            const lx = x(summary.leaveBy.departure_minute);
            const ly = y(summary.leaveBy.success_probability);
            return (
              <g pointerEvents="none">
                <circle cx={lx} cy={ly} r={4.5} fill="white" stroke="#16181d" strokeWidth={2} />
                <text x={lx} y={ly - 10} textAnchor={lx > W - 120 ? 'end' : 'middle'}
                  fontSize={11} fontWeight={600} fill="#16181d">
                  Leave by {formatTime(summary.leaveBy.departure_minute)}
                </text>
              </g>
            );
          })()}

          {selectedBucket && selectedBucket.success_probability !== null && (
            <g pointerEvents="none">
              <line x1={x(selectedBucket.departure_minute)} x2={x(selectedBucket.departure_minute)}
                y1={PAD.t} y2={PAD.t + IH} stroke="#16181d" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <circle cx={x(selectedBucket.departure_minute)} cy={y(selectedBucket.success_probability)} r={6}
                fill={probabilityToColor(selectedBucket.success_probability)} stroke="white" strokeWidth={2} />
            </g>
          )}

          {hover && (
            <line x1={x(hover.departure_minute)} x2={x(hover.departure_minute)} y1={PAD.t} y2={PAD.t + IH}
              stroke="#16181d" strokeWidth={1} opacity={0.25} pointerEvents="none" />
          )}
          {/* Transparent hit area so clicks between lines still register */}
          <rect x={PAD.l} y={PAD.t} width={IW} height={IH} fill="transparent" style={{ cursor: 'crosshair' }} />
        </svg>
      )}

      <div className="window-zoom-foot">Click the chart to set your departure time.</div>

      {hover && hoverPos && (
        <div className="chart-hover-tooltip" style={{ left: hoverPos.x + 14, top: hoverPos.y - 74 }}>
          <div className="chart-tooltip-title">{DAY_LABELS[day]} {formatTime(hover.departure_minute)}</div>
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
