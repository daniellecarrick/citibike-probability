/**
 * Gradient-stroked probability-by-hour line chart.
 * Takes an array of 288 values (one per 5-min slot) and renders a 340×110 SVG.
 */
import { useRef, useState } from 'react';
import { probabilityToColor } from '../../utils/colorScale';

interface Props {
  values: number[];        // length 288, index = 5-min slot
  currentSlot?: number;   // highlight marker
  width?: number;
  height?: number;
}

const PAD = { t: 10, r: 8, b: 20, l: 28 };

function slotToTime(slot: number): string {
  const mins = slot * 5;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function HourLineChart({ values, currentSlot, width = 340, height = 110 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);

  const W = width - PAD.l - PAD.r;
  const H = height - PAD.t - PAD.b;

  // Build path points
  const pts = values.map((v, i) => ({
    x: PAD.l + (i / (values.length - 1)) * W,
    y: PAD.t + (1 - v) * H,
  }));

  const linePath = pts.length > 1
    ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    : '';

  const areaPath = linePath
    ? `${linePath} L${(PAD.l + W).toFixed(1)},${(PAD.t + H).toFixed(1)} L${PAD.l.toFixed(1)},${(PAD.t + H).toFixed(1)} Z`
    : '';

  const nowX = currentSlot !== undefined
    ? PAD.l + (currentSlot / (values.length - 1)) * W
    : null;
  const nowY = currentSlot !== undefined && values[currentSlot] !== undefined
    ? PAD.t + (1 - values[currentSlot]) * H
    : null;

  // Hover state derived values
  const hoverX = hoverSlot !== null ? PAD.l + (hoverSlot / (values.length - 1)) * W : null;
  const hoverY = hoverSlot !== null && values[hoverSlot] !== undefined
    ? PAD.t + (1 - values[hoverSlot]) * H
    : null;
  const hoverVal = hoverSlot !== null ? values[hoverSlot] : null;

  const TIP_W = 64;
  const TIP_H = 33;
  const tipX = hoverX !== null
    ? (hoverX + TIP_W + 6 > PAD.l + W ? hoverX - TIP_W - 6 : hoverX + 6)
    : 0;
  const tipY = hoverY !== null
    ? (hoverY - TIP_H - 6 < PAD.t ? hoverY + 8 : hoverY - TIP_H - 6)
    : 0;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = (e.clientX - rect.left) * (width / rect.width);
    const slot = Math.max(0, Math.min(
      values.length - 1,
      Math.round(((Math.max(PAD.l, Math.min(PAD.l + W, svgX)) - PAD.l) / W) * (values.length - 1)),
    ));
    setHoverSlot(slot);
  }

  // Y-axis labels
  const yLabels = [0, 50, 100];
  const gradId = 'hlc-grad';

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
      <defs>
        <linearGradient id={gradId} x1="0" y1={PAD.t} x2="0" y2={PAD.t + H} gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1fa2ff" />
          <stop offset="50%"  stopColor="#8b3df5" />
          <stop offset="100%" stopColor="#ff2d78" />
        </linearGradient>
        <linearGradient id={`${gradId}-area`} x1="0" y1={PAD.t} x2="0" y2={PAD.t + H} gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1fa2ff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ff2d78" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Gridlines */}
      {yLabels.map(pct => {
        const y = PAD.t + (1 - pct / 100) * H;
        return (
          <g key={pct}>
            <line x1={PAD.l} x2={PAD.l + W} y1={y} y2={y} stroke="#eceef2" strokeWidth={1} />
            <text x={PAD.l - 4} y={y} textAnchor="end" dominantBaseline="middle"
              fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
              {pct}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      {areaPath && <path d={areaPath} fill={`url(#${gradId}-area)`} />}

      {/* Line */}
      {linePath && (
        <path d={linePath} fill="none" stroke={`url(#${gradId})`} strokeWidth={2.5} strokeLinejoin="round" />
      )}

      {/* Now marker */}
      {nowX !== null && nowY !== null && (
        <>
          <line x1={nowX} x2={nowX} y1={PAD.t} y2={PAD.t + H}
            stroke="#16181d" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          <circle cx={nowX} cy={nowY} r={4}
            fill="white" stroke="#16181d" strokeWidth={1.5} />
        </>
      )}

      {/* Hover crosshair + tooltip */}
      {hoverX !== null && hoverY !== null && hoverVal !== null && (
        <g>
          <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={PAD.t + H}
            stroke="#16181d" strokeWidth={1} strokeDasharray="3 2" opacity={0.25} />
          <circle cx={hoverX} cy={hoverY} r={4}
            fill="white" stroke={probabilityToColor(hoverVal)} strokeWidth={2} />
          <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx={4}
            fill="white" fillOpacity={0.97} stroke="#eceef2" strokeWidth={1} />
          <text x={tipX + 8} y={tipY + 13}
            fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
            {slotToTime(hoverSlot!)}
          </text>
          <text x={tipX + 8} y={tipY + 26}
            fontFamily="'IBM Plex Mono', monospace" fontSize={11} fontWeight="600"
            fill={probabilityToColor(hoverVal)}>
            {Math.round(hoverVal * 100)}%
          </text>
        </g>
      )}

      {/* X axis hour labels */}
      {[0, 6, 12, 18, 24].map(h => {
        const x = PAD.l + (h * 12 / (values.length - 1)) * W;
        const label = h === 0 ? '12a' : h === 12 ? '12p' : h === 24 ? '' : `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
        return (
          <text key={h} x={x} y={PAD.t + H + 12} textAnchor="middle"
            fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
