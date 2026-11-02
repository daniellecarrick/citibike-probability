/**
 * A station's whole day as one line: 288 five-minute values (0–1) on a
 * 12a–12a axis, colored pink (low) → blue (high), with the selected time
 * marked. Two sizes:
 *   - compact: the map's hover tooltip; stretches to its box, no interaction.
 *   - full: the station side panel; drawn at its real pixel width with
 *     y-axis labels, and hover (or drag, on touch) reads off a value.
 */
import { useId, useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useChartPointer } from '../../hooks/useChartPointer';
import { formatTime } from '../../utils/time';

interface Props {
  series: (number | null)[];
  /** Selected time of day, minutes since midnight. */
  selectedTime: number;
  variant?: 'compact' | 'full';
  /** Formats a hovered value, e.g. "72% full". Full variant only. */
  formatValue?: (v: number | null) => string;
}

const SLOTS = 288;

export function StationDayChart({ series, selectedTime, variant = 'compact', formatValue }: Props) {
  const gradId = useId().replace(/:/g, '');
  const full = variant === 'full';
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxRef, measured] = useElementWidth(380);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);

  // Compact: a fixed 287×56 box stretched to fit. Full: real pixels, room for labels.
  const W = full ? measured : SLOTS - 1;
  const H = full ? 120 : 56;
  const PAD = full ? { l: 34, r: 6, t: 8, b: 20 } : { l: 0, r: 0, t: 4, b: 4 };
  const IW = W - PAD.l - PAD.r;
  const IH = H - PAD.t - PAD.b;
  const x = (slot: number) => PAD.l + (slot / (SLOTS - 1)) * IW;
  const y = (v: number) => PAD.t + (1 - v) * IH;
  const base = PAD.t + IH;

  let line = '';
  let gap = true;
  for (let i = 0; i < SLOTS; i++) {
    const v = series[i];
    if (v === null || v === undefined) { gap = true; continue; }
    line += `${gap ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    gap = false;
  }
  // Area: missing slots sit on the baseline (reads better than jagged gaps).
  const area = `M${x(0)},${base} ` + series.map((v, i) => `L${x(i).toFixed(1)},${(v == null ? base : y(v)).toFixed(1)}`).join(' ') + ` L${x(SLOTS - 1)},${base} Z`;

  const selectedSlot = Math.min(SLOTS - 1, Math.floor(selectedTime / 5));

  function slotAt(clientX: number): number | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    const sx = ((clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(SLOTS - 1, Math.round(((sx - PAD.l) / IW) * (SLOTS - 1))));
  }
  const pointer = useChartPointer({
    onHover: cx => setHoverSlot(slotAt(cx)),
    onLeave: () => setHoverSlot(null),
    persistOnTouch: true,
  });

  const hoverValue = hoverSlot !== null ? series[hoverSlot] ?? null : null;
  // Keep the in-chart readout on the side of the crosshair with more room.
  const readoutLeft = hoverSlot !== null && x(hoverSlot) > W / 2;

  const svg = (
    <svg
      ref={svgRef}
      className={full ? 'station-day-chart-svg' : 'hover-tooltip-chart'}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={full ? 'xMidYMid meet' : 'none'}
      {...(full ? pointer : {})}
      style={full ? { display: 'block', width: '100%', touchAction: 'pan-y', cursor: 'crosshair' } : undefined}
      role={full ? 'img' : undefined}
      aria-label={full ? 'Through the day, 12 AM to midnight' : undefined}
    >
      <defs>
        <linearGradient id={`${gradId}-line`} x1="0" y1={PAD.t} x2="0" y2={base} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1fa2ff" />
          <stop offset="50%" stopColor="#8b3df5" />
          <stop offset="100%" stopColor="#ff2d78" />
        </linearGradient>
        <linearGradient id={`${gradId}-fill`} x1="0" y1={PAD.t} x2="0" y2={base} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1fa2ff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ff2d78" stopOpacity="0" />
        </linearGradient>
      </defs>

      {full && [0, 0.5, 1].map(v => (
        <g key={v}>
          <line x1={PAD.l} x2={PAD.l + IW} y1={y(v)} y2={y(v)} stroke="#eceef2" strokeWidth={1} />
          <text x={PAD.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle"
            fontFamily="'IBM Plex Mono', monospace" fontSize={11} fill="#9aa1ad">{Math.round(v * 100)}%</text>
        </g>
      ))}

      <path d={area} fill={`url(#${gradId}-fill)`} />
      <path d={line} fill="none" stroke={`url(#${gradId}-line)`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Selected time */}
      <line x1={x(selectedSlot)} x2={x(selectedSlot)} y1={full ? PAD.t : 0} y2={full ? base : H}
        stroke="#16181d" strokeWidth={1.5} strokeOpacity={0.35} strokeDasharray="3,2" />

      {full && hoverSlot !== null && (
        <g pointerEvents="none">
          <line x1={x(hoverSlot)} x2={x(hoverSlot)} y1={PAD.t} y2={base} stroke="#16181d" strokeWidth={1} opacity={0.25} />
          {hoverValue !== null && (
            <circle cx={x(hoverSlot)} cy={y(hoverValue)} r={4} fill="#fff" stroke="#16181d" strokeWidth={1.5} />
          )}
          <text
            x={x(hoverSlot) + (readoutLeft ? -8 : 8)} y={PAD.t + 10}
            textAnchor={readoutLeft ? 'end' : 'start'}
            fontSize={12} fontWeight={600} fill="#16181d"
            paintOrder="stroke" stroke="#ffffff" strokeWidth={4} strokeLinejoin="round"
          >
            {formatTime(hoverSlot * 5)} · {formatValue ? formatValue(hoverValue) : hoverValue === null ? 'no data' : `${Math.round(hoverValue * 100)}%`}
          </text>
        </g>
      )}

      {full && [0, 6, 12, 18, 24].map(h => (
        <text key={h} x={x(Math.min(h * 12, SLOTS - 1))} y={H - 5}
          textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}
          fontFamily="'IBM Plex Mono', monospace" fontSize={11} fill="#9aa1ad">
          {h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : `${h % 12}${h < 12 ? 'a' : 'p'}`}
        </text>
      ))}
    </svg>
  );

  if (!full) return svg;
  return <div ref={boxRef} className="station-day-chart">{svg}</div>;
}
