/**
 * Line chart of absolute availability across the day: bikes at the origin
 * station vs. open docks at the destination station, one point per 5-min
 * slot — the raw counts the success probability is built from.
 */
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { CommuteAvailabilitySeries, CommuteAvailabilitySlot } from '../../types';

interface Props {
  series: CommuteAvailabilitySeries;
}

const W = 700;
const H = 220;
const PAD = { l: 32, r: 16, t: 12, b: 22 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;
const DAY_MINUTES = 24 * 60;

const BIKE_COLOR = '#16181d';
const DOCK_COLOR = '#1fa2ff';

function xScale(minute: number): number {
  return PAD.l + (minute / (DAY_MINUTES - 1)) * IW;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function nearestSlot(slots: CommuteAvailabilitySlot[], minute: number): CommuteAvailabilitySlot | null {
  if (slots.length === 0) return null;
  return slots.reduce((closest, slot) =>
    Math.abs(slot.minute - minute) < Math.abs(closest.minute - minute) ? slot : closest
  );
}

function buildLinePath(
  slots: CommuteAvailabilitySlot[],
  key: 'bikes_available' | 'docks_available',
  yScale: (v: number) => number,
): string {
  let d = '';
  let drawing = false;
  for (const slot of slots) {
    const v = slot[key];
    if (v === null) { drawing = false; continue; }
    const x = xScale(slot.minute);
    const y = yScale(v);
    d += `${drawing ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    drawing = true;
  }
  return d.trim();
}

export function AvailabilityChart({ series }: Props) {
  const { selectedTime } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverSlot, setHoverSlot] = useState<CommuteAvailabilitySlot | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const { bikePath, dockPath, yTicks, yDomainMax, hasData } = useMemo(() => {
    const values = series.slots
      .flatMap(s => [s.bikes_available, s.docks_available])
      .filter((v): v is number => v !== null);

    if (values.length === 0) {
      return { bikePath: '', dockPath: '', yTicks: [0, 1], yDomainMax: 1, hasData: false };
    }

    const maxValue = Math.max(...values);
    const yDomainMax = Math.max(1, Math.ceil(maxValue * 1.15));
    const yScale = (v: number) => PAD.t + (1 - v / yDomainMax) * IH;

    return {
      bikePath: buildLinePath(series.slots, 'bikes_available', yScale),
      dockPath: buildLinePath(series.slots, 'docks_available', yScale),
      yTicks: [0, Math.round(yDomainMax / 2), yDomainMax],
      yDomainMax,
      hasData: true,
    };
  }, [series]);

  const yScale = (v: number) => PAD.t + (1 - v / yDomainMax) * IH;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = W / rect.width;
    const svgX = (e.clientX - rect.left) * scale;
    const minute = ((svgX - PAD.l) / IW) * (DAY_MINUTES - 1);
    setHoverSlot(nearestSlot(series.slots, minute));
    setHoverPos({ x: e.clientX, y: e.clientY });
  }

  function handleMouseLeave() {
    setHoverSlot(null);
    setHoverPos(null);
  }

  const nowX = xScale(selectedTime);

  return (
    <div className="card availability-chart">
      <div className="card-title">Availability throughout the day</div>

      <div className="availability-chart-legend">
        <span className="availability-legend-item">
          <span className="availability-legend-dot" style={{ background: BIKE_COLOR }} />
          Bikes at {series.origin.name}
        </span>
        <span className="availability-legend-item">
          <span className="availability-legend-dot" style={{ background: DOCK_COLOR }} />
          Docks at {series.destination.name}
        </span>
      </div>

      {!hasData ? (
        <div className="availability-chart-empty">Not enough data yet for this day.</div>
      ) : (
        <svg
          ref={svgRef}
          width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'crosshair' }}
        >
          {/* Gridlines + y-axis labels */}
          {yTicks.map(v => {
            const y = PAD.t + (1 - v / yTicks[yTicks.length - 1]) * IH;
            return (
              <g key={v}>
                <line x1={PAD.l} x2={PAD.l + IW} y1={y} y2={y} stroke="#eceef2" strokeWidth={1} />
                <text x={PAD.l - 6} y={y} textAnchor="end" dominantBaseline="middle"
                  fontFamily="'IBM Plex Mono',monospace" fontSize={9} fill="#9aa1ad">
                  {v}
                </text>
              </g>
            );
          })}

          {/* Series lines */}
          <path d={bikePath} fill="none" stroke={BIKE_COLOR} strokeWidth={2} strokeLinejoin="round" />
          <path d={dockPath} fill="none" stroke={DOCK_COLOR} strokeWidth={2} strokeLinejoin="round" />

          {/* Selected-time marker */}
          <line x1={nowX} x2={nowX} y1={PAD.t} y2={PAD.t + IH}
            stroke="#16181d" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />

          {/* X-axis labels */}
          {[0, 6, 12, 18, 24].map(h => {
            const x = xScale(Math.min(h * 60, DAY_MINUTES - 1));
            const label = h === 0 ? '12a' : h === 12 ? '12p' : h === 24 ? '12a' : `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
            return (
              <text key={h} x={x} y={H - 6} textAnchor="middle"
                fontFamily="'IBM Plex Mono',monospace" fontSize={9} fill="#9aa1ad">
                {label}
              </text>
            );
          })}

          {/* Hover crosshair + value dots */}
          {hoverSlot && (
            <g>
              <line x1={xScale(hoverSlot.minute)} x2={xScale(hoverSlot.minute)} y1={PAD.t} y2={PAD.t + IH}
                stroke="#16181d" strokeWidth={1} strokeDasharray="3 2" opacity={0.3} />
              {hoverSlot.bikes_available !== null && (
                <circle cx={xScale(hoverSlot.minute)} cy={yScale(hoverSlot.bikes_available)} r={4}
                  fill="white" stroke={BIKE_COLOR} strokeWidth={2} />
              )}
              {hoverSlot.docks_available !== null && (
                <circle cx={xScale(hoverSlot.minute)} cy={yScale(hoverSlot.docks_available)} r={4}
                  fill="white" stroke={DOCK_COLOR} strokeWidth={2} />
              )}
            </g>
          )}
        </svg>
      )}

      {hoverSlot && hoverPos && (
        <div
          className="chart-hover-tooltip"
          style={{ left: hoverPos.x + 14, top: hoverPos.y - 64 }}
        >
          <div className="chart-tooltip-title">{formatTime(hoverSlot.minute)}</div>
          <div className="chart-tooltip-row">
            <span>Bikes</span>
            <strong>{hoverSlot.bikes_available ?? '—'}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>Docks</span>
            <strong>{hoverSlot.docks_available ?? '—'}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
