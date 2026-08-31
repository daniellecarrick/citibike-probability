/**
 * Heatmap "ribbon" strip: one row per series, each row divided into 288
 * 5-min-slot segments colored red (low probability) → blue (high probability).
 * Shared time axis marks the AM/PM commute windows across all rows.
 */
import { useRef, useState } from 'react';
import { probabilityToColor } from '../../utils/colorScale';

interface Row {
  label: string;
  values: (number | null)[]; // length 288, index = 5-min slot; null = no data (renders as a gap)
}

interface Props {
  rows: Row[];
  currentSlot?: number;
  width?: number;
  labelWidth?: number;
  rowHeight?: number;
}

const SLOTS = 288;
const AXIS_H = 20;
const COMMUTE_WINDOWS: [number, number, string][] = [
  [7 * 12, 9 * 12, 'AM commute'],   // 7am–9am
  [17 * 12, 19 * 12, 'PM commute'], // 5pm–7pm
];

function slotToTime(slot: number): string {
  const mins = slot * 5;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function ProbabilityRibbon({
  rows, currentSlot, width = 340, labelWidth = 40, rowHeight = 22,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);

  const PAD = { l: labelWidth, r: 8 };
  const W = width - PAD.l - PAD.r;
  const segW = W / SLOTS;
  const ROW_GAP = 3;
  const rowY = (i: number) => AXIS_H + i * (rowHeight + ROW_GAP);
  const height = AXIS_H + rows.length * (rowHeight + ROW_GAP) - ROW_GAP;

  const xAt = (slot: number) => PAD.l + slot * segW;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = (e.clientX - rect.left) * (width / rect.width);
    const slot = Math.max(0, Math.min(
      SLOTS - 1,
      Math.floor((Math.max(PAD.l, Math.min(PAD.l + W, svgX)) - PAD.l) / segW),
    ));
    setHoverSlot(slot);
  }

  const nowX = currentSlot !== undefined ? xAt(currentSlot) + segW / 2 : null;
  const hoverX = hoverSlot !== null ? xAt(hoverSlot) : null;

  const TIP_W = 88;
  const TIP_H = 16 + rows.length * 13;
  const tipX = hoverX !== null
    ? (hoverX + TIP_W + 6 > PAD.l + W ? hoverX - TIP_W - 6 : hoverX + 6)
    : 0;
  const tipY = AXIS_H + 2;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverSlot(null)}
      style={{ cursor: 'crosshair' }}
    >
      {/* Commute window shading, spans full ribbon height */}
      {COMMUTE_WINDOWS.map(([start, end, label]) => (
        <g key={label}>
          <rect
            x={xAt(start)} y={0} width={xAt(end) - xAt(start)} height={height}
            fill="#16181d" fillOpacity={0.04}
          />
          <line x1={xAt(start)} x2={xAt(start)} y1={0} y2={height} stroke="#16181d" strokeOpacity={0.18} strokeWidth={1} strokeDasharray="2 2" />
          <line x1={xAt(end)} x2={xAt(end)} y1={0} y2={height} stroke="#16181d" strokeOpacity={0.18} strokeWidth={1} strokeDasharray="2 2" />
          <text
            x={(xAt(start) + xAt(end)) / 2} y={13} textAnchor="middle"
            fontFamily="'IBM Plex Mono', monospace" fontSize={9} fontWeight={600} fill="#6c727e"
          >
            {label}
          </text>
        </g>
      ))}

      {/* Hour axis ticks */}
      {[0, 6, 12, 18, 24].map(h => {
        const x = xAt(h * 12);
        const label = h === 0 ? '12a' : h === 12 ? '12p' : h === 24 ? '' : `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
        return label ? (
          <line key={h} x1={x} x2={x} y1={AXIS_H - 3} y2={height} stroke="#eceef2" strokeWidth={1} />
        ) : null;
      })}

      {/* Ribbon rows */}
      {rows.map((row, ri) => (
        <g key={row.label}>
          <text
            x={0} y={rowY(ri) + rowHeight / 2} dominantBaseline="middle"
            fontFamily="'IBM Plex Mono', monospace" fontSize={9} fontWeight={600} fill="#6c727e"
          >
            {row.label}
          </text>
          {row.values.map((v, i) => v === null ? null : (
            <rect
              key={i}
              className="ribbon-segment"
              x={xAt(i)} y={rowY(ri)}
              width={Math.max(segW, segW + 0.6)} height={rowHeight}
              fill={probabilityToColor(v, 1, 'redBlue')}
            />
          ))}
          <rect x={PAD.l} y={rowY(ri)} width={W} height={rowHeight} fill="none" stroke="#16181d" strokeOpacity={0.08} strokeWidth={1} />
        </g>
      ))}

      {/* Now marker */}
      {nowX !== null && (
        <line x1={nowX} x2={nowX} y1={0} y2={height}
          stroke="#16181d" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.6} />
      )}

      {/* Hover crosshair + tooltip */}
      {hoverX !== null && hoverSlot !== null && (
        <g>
          <line x1={hoverX + segW / 2} x2={hoverX + segW / 2} y1={0} y2={height}
            stroke="white" strokeWidth={1} opacity={0.85} />
          <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx={4}
            fill="white" fillOpacity={0.97} stroke="#eceef2" strokeWidth={1} />
          <text x={tipX + 8} y={tipY + 12}
            fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
            {slotToTime(hoverSlot)}
          </text>
          {rows.map((row, i) => {
            const v = row.values[hoverSlot];
            return (
              <text key={row.label} x={tipX + 8} y={tipY + 25 + i * 13}
                fontFamily="'IBM Plex Mono', monospace" fontSize={9} fontWeight={600}
                fill={v === null ? '#9aa1ad' : probabilityToColor(v, 1, 'redBlue')}>
                {row.label}: {v === null ? '—' : `${Math.round(v * 100)}%`}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}
