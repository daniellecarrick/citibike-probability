/**
 * Line chart of absolute availability across the day: bikes at the origin
 * station vs. open docks at the destination station, one point per 5-min
 * slot — the raw counts the success probability is built from.
 */
import { useMemo } from 'react';
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

  const { bikePath, dockPath, yTicks, hasData } = useMemo(() => {
    const values = series.slots
      .flatMap(s => [s.bikes_available, s.docks_available])
      .filter((v): v is number => v !== null);

    if (values.length === 0) {
      return { bikePath: '', dockPath: '', yTicks: [0, 1], hasData: false };
    }

    const maxValue = Math.max(...values);
    const yDomainMax = Math.max(1, Math.ceil(maxValue * 1.15));
    const yScale = (v: number) => PAD.t + (1 - v / yDomainMax) * IH;

    return {
      bikePath: buildLinePath(series.slots, 'bikes_available', yScale),
      dockPath: buildLinePath(series.slots, 'docks_available', yScale),
      yTicks: [0, Math.round(yDomainMax / 2), yDomainMax],
      hasData: true,
    };
  }, [series]);

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
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
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
        </svg>
      )}
    </div>
  );
}
