/**
 * Line chart of absolute availability across the day: bikes at the origin
 * station vs. open docks at the destination station, one point per 5-min
 * slot — the raw counts the success probability is built from.
 */
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { useElementWidth } from '../../hooks/useElementWidth';
import { tooltipPosition, useChartPointer } from '../../hooks/useChartPointer';
import type { CommuteAvailabilitySeries, CommuteAvailabilitySlot } from '../../types';

interface Props {
  series: CommuteAvailabilitySeries;
  bikeLabel: string;
}

const PAD = { l: 32, r: 16, t: 12, b: 22 };
const DAY_MINUTES = 24 * 60;

const BIKE_COLOR = '#1fa2ff';
const DOCK_COLOR = '#16181d';

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
  xScale: (minute: number) => number,
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

export function AvailabilityChart({ series, bikeLabel }: Props) {
  const { selectedTime } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverSlot, setHoverSlot] = useState<CommuteAvailabilitySlot | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Real-pixel viewBox so axis labels stay legible on a phone.
  const [boxRef, W] = useElementWidth(700);
  const H = W < 480 ? 180 : 220;
  const IW = W - PAD.l - PAD.r;
  const IH = H - PAD.t - PAD.b;
  const xScale = (minute: number) => PAD.l + (minute / (DAY_MINUTES - 1)) * IW;

  const { yTicks, yDomainMax, hasData } = useMemo(() => {
    const values = series.slots
      .flatMap(s => [s.bikes_available, s.docks_available])
      .filter((v): v is number => v !== null);

    if (values.length === 0) return { yTicks: [0, 1], yDomainMax: 1, hasData: false };

    const yDomainMax = Math.max(1, Math.ceil(Math.max(...values) * 1.15));
    return { yTicks: [0, Math.round(yDomainMax / 2), yDomainMax], yDomainMax, hasData: true };
  }, [series]);

  const yScale = (v: number) => PAD.t + (1 - v / yDomainMax) * IH;
  const bikePath = hasData ? buildLinePath(series.slots, 'bikes_available', xScale, yScale) : '';
  const dockPath = hasData ? buildLinePath(series.slots, 'docks_available', xScale, yScale) : '';

  function hoverAt(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = (clientX - rect.left) * (W / rect.width);
    const minute = ((svgX - PAD.l) / IW) * (DAY_MINUTES - 1);
    setHoverSlot(nearestSlot(series.slots, minute));
    setHoverPos({ x: clientX, y: clientY });
  }

  const pointer = useChartPointer({
    onHover: hoverAt,
    // The tooltip is position:fixed, so it hides on lift rather than
    // floating in place once the page scrolls.
    onLeave: () => { setHoverSlot(null); setHoverPos(null); },
  });

  const nowX = xScale(selectedTime);

  return (
    <div className="card availability-chart">
      <div className="card-title">Availability throughout the day</div>

      <div className="availability-chart-legend">
        <span className="availability-legend-item">
          <span className="availability-legend-dot" style={{ background: BIKE_COLOR }} />
          {bikeLabel} at {series.origin.name}
        </span>
        <span className="availability-legend-item">
          <span className="availability-legend-dot" style={{ background: DOCK_COLOR }} />
          Docks at {series.destination.name}
        </span>
      </div>

      <div ref={boxRef}>
      {!hasData ? (
        <div className="availability-chart-empty">Not enough data yet for this day.</div>
      ) : (
        <svg
          ref={svgRef}
          width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
          {...pointer}
          style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
        >
          {/* Gridlines + y-axis labels */}
          {yTicks.map(v => {
            const y = PAD.t + (1 - v / yTicks[yTicks.length - 1]) * IH;
            return (
              <g key={v}>
                <line x1={PAD.l} x2={PAD.l + IW} y1={y} y2={y} stroke="#eceef2" strokeWidth={1} />
                <text x={PAD.l - 6} y={y} textAnchor="end" dominantBaseline="middle"
                  fontFamily="'IBM Plex Mono',monospace" fontSize={11} fill="#9aa1ad">
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
              <text key={h} x={x} y={H - 6} textAnchor={h === 24 ? 'end' : 'middle'}
                fontFamily="'IBM Plex Mono',monospace" fontSize={11} fill="#9aa1ad">
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
      </div>

      {hoverSlot && hoverPos && (
        <div
          className="chart-hover-tooltip"
          style={tooltipPosition(hoverPos.x, hoverPos.y, 150, 64)}
        >
          <div className="chart-tooltip-title">{formatTime(hoverSlot.minute)}</div>
          <div className="chart-tooltip-row">
            <span style={{ color: BIKE_COLOR }}>{bikeLabel}</span>
            <strong>{hoverSlot.bikes_available !== null ? Math.round(hoverSlot.bikes_available) : '—'}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span style={{ color: DOCK_COLOR }}>Docks</span>
            <strong>{hoverSlot.docks_available !== null ? Math.round(hoverSlot.docks_available) : '—'}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
