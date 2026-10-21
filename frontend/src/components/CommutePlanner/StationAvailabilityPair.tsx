/**
 * The rider's two questions, side by side: can I get a bike at the origin
 * when I leave, and can I dock it at the destination when I arrive? Each
 * panel leads with the typical count at that moment, then a line chart of
 * the average count in every 5-minute slot of the selected day. Read-only:
 * hover or drag shows values; day/time change only from the dropdowns.
 */
import { useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { tooltipPosition, useChartPointer } from '../../hooks/useChartPointer';
import { formatTime } from '../../utils/time';
import { ROUTE_DEST_COLOR, ROUTE_ORIGIN_COLOR } from './CommuteRouteMap';
import type { CommuteAvailabilitySeries, CommuteAvailabilitySlot } from '../../types';

/** Mirrors AVAILABILITY_THRESHOLD in backend/analytics/probability.py: fewer than this counts as none. */
const AVAILABLE_MIN = 2;
const DAY_MINUTES = 24 * 60;
const PAD = { l: 28, r: 8, t: 8, b: 20 };

type SeriesKey = 'bikes_available' | 'docks_available';

function nearestSlot(slots: CommuteAvailabilitySlot[], minute: number): CommuteAvailabilitySlot | null {
  if (slots.length === 0) return null;
  return slots.reduce((a, b) => (Math.abs(b.minute - minute) < Math.abs(a.minute - minute) ? b : a));
}

function plural(n: number, [one, many]: [string, string]): string {
  return n === 1 ? one : many;
}

interface PanelProps {
  role: 'origin' | 'destination';
  stationName: string;
  slots: CommuteAvailabilitySlot[];
  valueKey: SeriesKey;
  /** The moment this panel is about: departure (origin) or arrival (destination), minutes since midnight. */
  focusMinute: number;
  noun: [string, string];
  color: string;
}

function AvailabilityPanel({ role, stationName, slots, valueKey, focusMinute, noun, color }: PanelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<CommuteAvailabilitySlot | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [boxRef, W] = useElementWidth(440);
  const H = 150;
  const IW = W - PAD.l - PAD.r;
  const IH = H - PAD.t - PAD.b;

  const values = slots.map(s => s[valueKey]).filter((v): v is number => v !== null);
  const hasData = values.length > 0;
  const yMax = Math.max(4, Math.ceil(Math.max(0, ...values) * 1.15));
  const x = (m: number) => PAD.l + (m / (DAY_MINUTES - 5)) * IW;
  const y = (v: number) => PAD.t + (1 - v / yMax) * IH;

  // Line + area, broken wherever a slot has no data.
  let line = '';
  let area = '';
  let segStart: number | null = null;
  let prevX = 0;
  const base = y(0);
  for (const s of slots) {
    const v = s[valueKey];
    if (v === null) {
      if (segStart !== null) area += `L${prevX.toFixed(1)},${base} Z `;
      segStart = null;
      continue;
    }
    const px = x(s.minute);
    const py = y(v);
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
  if (segStart !== null) area += `L${prevX.toFixed(1)},${base} Z`;

  // Arrivals past midnight fall on the next day, which this series doesn't cover.
  const inDay = focusMinute < DAY_MINUTES;
  const focusSlot = inDay ? nearestSlot(slots, focusMinute) : null;
  const focusValue = focusSlot && Math.abs(focusSlot.minute - focusMinute) <= 5 ? focusSlot[valueKey] : null;
  const rounded = focusValue !== null ? Math.round(focusValue) : null;
  const scarce = rounded !== null && rounded < AVAILABLE_MIN;

  function slotAt(clientX: number): CommuteAvailabilitySlot | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    const sx = ((clientX - rect.left) / rect.width) * W;
    return nearestSlot(slots, ((sx - PAD.l) / IW) * (DAY_MINUTES - 5));
  }

  const pointer = useChartPointer({
    onHover: (cx, cy) => { setHover(slotAt(cx)); setHoverPos({ x: cx, y: cy }); },
    onLeave: () => { setHover(null); setHoverPos(null); },
  });

  const verb = role === 'origin' ? 'Pick up' : 'Drop off';
  const when = role === 'origin' ? 'when you leave' : 'when you arrive';
  const yTicks = [0, Math.round(yMax / 2), yMax];

  return (
    <div className={`pair-panel pair-panel-${role}`}>
      <div className="pair-panel-eyebrow">
        <span className="pair-panel-dot" style={{ background: color }} />
        {verb}
      </div>
      <div className="pair-panel-station">{stationName}</div>
      <div className="pair-panel-stat">
        <span className={`pair-panel-count${scarce ? ' scarce' : ''}`}>
          {rounded ?? '—'}
        </span>
        <span className="pair-panel-count-label">
          {rounded !== null
            ? <>{plural(rounded, noun)} usually there at {formatTime(focusMinute)}</>
            : inDay ? <>no data for {formatTime(focusMinute)}</> : <>arrival is after midnight</>}
        </span>
      </div>

      <div ref={boxRef} className="pair-panel-chart">
        {!hasData ? (
          <div className="availability-chart-empty">Not enough data yet for this day.</div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Average ${noun[1]} at ${stationName} through the day, ${when}`}
            {...pointer}
            style={{ display: 'block', cursor: 'crosshair', touchAction: 'pan-y' }}
          >
            {yTicks.map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={PAD.l + IW} y1={y(v)} y2={y(v)} stroke="#eceef2" strokeWidth={1} />
                <text x={PAD.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle"
                  fontFamily="'IBM Plex Mono',monospace" fontSize={11} fill="#9aa1ad">{v}</text>
              </g>
            ))}

            <path d={area} fill={color} opacity={0.08} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

            {/* Departure (origin) / arrival (destination) */}
            {inDay && (
              <g pointerEvents="none">
                <line x1={x(focusMinute)} x2={x(focusMinute)} y1={PAD.t} y2={base}
                  stroke="#16181d" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
                {focusValue !== null && (
                  <circle cx={x(focusMinute)} cy={y(focusValue)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
                )}
              </g>
            )}

            {hover && hover[valueKey] !== null && (
              <g pointerEvents="none">
                <line x1={x(hover.minute)} x2={x(hover.minute)} y1={PAD.t} y2={base}
                  stroke="#16181d" strokeWidth={1} opacity={0.2} />
                <circle cx={x(hover.minute)} cy={y(hover[valueKey]!)} r={4} fill="#fff" stroke={color} strokeWidth={2} />
              </g>
            )}

            {[0, 6, 12, 18, 24].map(h => (
              <text key={h} x={x(Math.min(h * 60, DAY_MINUTES - 5))} y={H - 5}
                textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}
                fontFamily="'IBM Plex Mono',monospace" fontSize={11} fill="#9aa1ad">
                {h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : `${h % 12}${h < 12 ? 'a' : 'p'}`}
              </text>
            ))}
          </svg>
        )}
      </div>

      {hover && hoverPos && (
        <div className="chart-hover-tooltip" style={tooltipPosition(hoverPos.x, hoverPos.y, 150, 54)}>
          <div className="chart-tooltip-title">{formatTime(hover.minute)}</div>
          <div className="chart-tooltip-row">
            <span style={{ color }}>{noun[1][0].toUpperCase() + noun[1].slice(1)}</span>
            <strong>{hover[valueKey] !== null ? Math.round(hover[valueKey]!) : '—'}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  series: CommuteAvailabilitySeries;
  departMinute: number;
  travelMinutes: number;
  /** [singular, plural], e.g. ['e-bike', 'e-bikes']. */
  bikeNoun: [string, string];
}

export function StationAvailabilityPair({ series, departMinute, travelMinutes, bikeNoun }: Props) {
  return (
    <div className="card station-pair">
      <div className="card-title">Can you get a bike? Can you dock it?</div>
      <p className="station-pair-sub">
        Average counts for every 5 minutes of the selected day.
      </p>
      <div className="station-pair-grid">
        <AvailabilityPanel
          role="origin"
          stationName={series.origin.name}
          slots={series.slots}
          valueKey="bikes_available"
          focusMinute={departMinute}
          noun={bikeNoun}
          color={ROUTE_ORIGIN_COLOR}
        />
        <AvailabilityPanel
          role="destination"
          stationName={series.destination.name}
          slots={series.slots}
          valueKey="docks_available"
          focusMinute={departMinute + travelMinutes}
          noun={['open dock', 'open docks']}
          color={ROUTE_DEST_COLOR}
        />
      </div>
    </div>
  );
}
