/**
 * Heatmap "ribbon" strip: one row per series, each row divided into 5-min-slot
 * segments colored red (low probability) → blue (high probability). Renders
 * a single commute window at a time — the caller stacks separate AM/PM
 * instances rather than this component drawing them side-by-side.
 */
import { useRef, useState } from 'react';
import { probabilityToColor } from '../../utils/colorScale';
import type { CommuteWindow } from '../../utils/time';

interface Row {
  label: string;
  values: (number | null)[]; // length 288, index = 5-min slot; null = no data (renders as a gap)
}

interface Props {
  window: CommuteWindow;
  rows: Row[];
  width?: number;
  labelWidth?: number;
  rowHeight?: number;
}

const AXIS_H = 6;
const BOTTOM_H = 14;
const SLOTS_PER_HOUR = 12;

function hourLabel(h: number): string {
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${h < 12 ? 'a' : 'p'}`;
}

function slotToTime(slot: number): string {
  const mins = slot * 5;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function ProbabilityRibbon({
  window: w, rows, width = 340, labelWidth = 44, rowHeight = 22,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);

  const PAD = { l: labelWidth, r: 8 };
  const totalW = width - PAD.l - PAD.r;
  const slots = w.endSlot - w.startSlot;
  const segW = totalW / slots;
  const xAt = (localSlot: number) => PAD.l + localSlot * segW;

  const ROW_GAP = 3;
  const rowY = (i: number) => AXIS_H + i * (rowHeight + ROW_GAP);
  const height = AXIS_H + rows.length * (rowHeight + ROW_GAP) - ROW_GAP + BOTTOM_H;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = (e.clientX - rect.left) * (width / rect.width);
    if (svgX < PAD.l || svgX > PAD.l + totalW) { setHoverSlot(null); return; }
    const local = Math.max(0, Math.min(slots - 1, Math.floor((svgX - PAD.l) / segW)));
    setHoverSlot(w.startSlot + local);
  }

  const hoverX = hoverSlot !== null ? xAt(hoverSlot - w.startSlot) : null;

  const TIP_W = 96;
  const TIP_H = 16 + rows.length * 13;
  const tipX = hoverX !== null
    ? (hoverX + TIP_W + 6 > PAD.l + totalW ? hoverX - TIP_W - 6 : hoverX + 6)
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
      {/* Hour ticks */}
      {Array.from({ length: slots / SLOTS_PER_HOUR + 1 }, (_, hi) => {
        const hourSlot = hi * SLOTS_PER_HOUR;
        const x = xAt(hourSlot);
        const h = Math.floor((w.startSlot + hourSlot) / SLOTS_PER_HOUR);
        return (
          <g key={hi}>
            <line x1={x} x2={x} y1={AXIS_H - 3} y2={height - BOTTOM_H} stroke="#eceef2" strokeWidth={1} />
            <text x={x} y={height - 2} textAnchor="middle"
              fontFamily="'IBM Plex Mono', monospace" fontSize={10} fill="#9aa1ad">
              {hourLabel(h)}
            </text>
          </g>
        );
      })}

      {/* Ribbon rows */}
      {rows.map((row, ri) => (
        <g key={row.label}>
          <text
            x={0} y={rowY(ri) + rowHeight / 2} dominantBaseline="middle"
            fontFamily="'IBM Plex Mono', monospace" fontSize={11} fill="#9aa1ad"
          >
            {row.label}
          </text>
          {Array.from({ length: slots }, (_, local) => {
            const v = row.values[w.startSlot + local];
            return v === null ? null : (
              <rect
                key={local}
                className="ribbon-segment"
                x={xAt(local)} y={rowY(ri)}
                width={Math.max(segW, segW + 0.6)} height={rowHeight}
                fill={probabilityToColor(v, 1, 'redBlue')}
              />
            );
          })}
          <rect x={PAD.l} y={rowY(ri)} width={totalW} height={rowHeight}
            fill="none" stroke="#16181d" strokeOpacity={0.08} strokeWidth={1} />
        </g>
      ))}

      {/* Hover crosshair + tooltip */}
      {hoverX !== null && hoverSlot !== null && (
        <g>
          <line x1={hoverX + segW / 2} x2={hoverX + segW / 2} y1={AXIS_H - 3} y2={height - BOTTOM_H}
            stroke="white" strokeWidth={1} opacity={0.85} />
          <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx={4}
            fill="white" fillOpacity={0.97} stroke="#eceef2" strokeWidth={1} />
          <text x={tipX + 8} y={tipY + 12}
            fontFamily="'IBM Plex Mono', monospace" fontSize={10} fill="#9aa1ad">
            {slotToTime(hoverSlot)}
          </text>
          {rows.map((row, i) => {
            const v = row.values[hoverSlot];
            return (
              <text key={row.label} x={tipX + 8} y={tipY + 25 + i * 13}
                fontFamily="'IBM Plex Mono', monospace" fontSize={11} fontWeight={600}
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
