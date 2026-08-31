/**
 * Heatmap "ribbon" strip: one row per series, each row divided into 5-min-slot
 * segments colored red (low probability) → blue (high probability). Zoomed
 * into just the AM/PM commute windows, shown side-by-side.
 */
import { useRef, useState } from 'react';
import { probabilityToColor } from '../../utils/colorScale';
import { COMMUTE_WINDOWS, type CommuteWindow } from '../../utils/time';

interface Row {
  label: string;
  values: (number | null)[]; // length 288, index = 5-min slot; null = no data (renders as a gap)
}

interface Props {
  rows: Row[];
  width?: number;
  labelWidth?: number;
  rowHeight?: number;
}

const AXIS_H = 28;
const BOTTOM_H = 14;
const WINDOW_GAP = 20;
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
  rows, width = 340, labelWidth = 40, rowHeight = 22,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; slot: number } | null>(null);

  const PAD = { l: labelWidth, r: 8 };
  const totalW = width - PAD.l - PAD.r;
  const n = COMMUTE_WINDOWS.length;
  const windowW = (totalW - WINDOW_GAP * (n - 1)) / n;

  const windows = COMMUTE_WINDOWS.map((w, i) => ({
    ...w,
    slots: w.endSlot - w.startSlot,
    x0: PAD.l + i * (windowW + WINDOW_GAP),
  }));
  const segWFor = (w: CommuteWindow & { slots: number }) => windowW / w.slots;
  const xAt = (w: CommuteWindow & { slots: number; x0: number }, localSlot: number) =>
    w.x0 + localSlot * segWFor(w);

  const ROW_GAP = 3;
  const rowY = (i: number) => AXIS_H + i * (rowHeight + ROW_GAP);
  const height = AXIS_H + rows.length * (rowHeight + ROW_GAP) - ROW_GAP + BOTTOM_H;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = (e.clientX - rect.left) * (width / rect.width);
    for (const w of windows) {
      if (svgX >= w.x0 && svgX <= w.x0 + windowW) {
        const local = Math.max(0, Math.min(w.slots - 1, Math.floor((svgX - w.x0) / segWFor(w))));
        setHover({ x: xAt(w, local), slot: w.startSlot + local });
        return;
      }
    }
    setHover(null);
  }

  const hoverX = hover !== null ? hover.x : null;
  const hoverSlot = hover !== null ? hover.slot : null;
  const segW = hover !== null ? segWFor(windows.find(w => hoverSlot! >= w.startSlot && hoverSlot! < w.endSlot)!) : 0;

  const TIP_W = 88;
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
      onMouseLeave={() => setHover(null)}
      style={{ cursor: 'crosshair' }}
    >
      {/* Per-window title + hour ticks */}
      {windows.map(w => (
        <g key={w.key}>
          <text
            x={w.x0 + windowW / 2} y={12} textAnchor="middle"
            fontFamily="'IBM Plex Mono', monospace" fontSize={9} fontWeight={600} fill="#6c727e"
          >
            {w.label}
          </text>
          {Array.from({ length: w.slots / SLOTS_PER_HOUR + 1 }, (_, hi) => {
            const hourSlot = hi * SLOTS_PER_HOUR;
            const x = xAt(w, hourSlot);
            const h = Math.floor((w.startSlot + hourSlot) / SLOTS_PER_HOUR);
            return (
              <g key={hi}>
                <line x1={x} x2={x} y1={AXIS_H - 3} y2={height - BOTTOM_H} stroke="#eceef2" strokeWidth={1} />
                <text x={x} y={height - 2} textAnchor="middle"
                  fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
                  {hourLabel(h)}
                </text>
              </g>
            );
          })}
        </g>
      ))}

      {/* Ribbon rows */}
      {rows.map((row, ri) => (
        <g key={row.label}>
          <text
            x={0} y={rowY(ri) + rowHeight / 2} dominantBaseline="middle"
            fontFamily="'IBM Plex Mono', monospace" fontSize={9} fontWeight={600} fill="#6c727e"
          >
            {row.label}
          </text>
          {windows.map(w => {
            const wSegW = segWFor(w);
            return Array.from({ length: w.slots }, (_, local) => {
              const v = row.values[w.startSlot + local];
              return v === null ? null : (
                <rect
                  key={local}
                  className="ribbon-segment"
                  x={xAt(w, local)} y={rowY(ri)}
                  width={Math.max(wSegW, wSegW + 0.6)} height={rowHeight}
                  fill={probabilityToColor(v, 1, 'redBlue')}
                />
              );
            });
          })}
          {windows.map(w => (
            <rect key={w.key} x={w.x0} y={rowY(ri)} width={windowW} height={rowHeight}
              fill="none" stroke="#16181d" strokeOpacity={0.08} strokeWidth={1} />
          ))}
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
