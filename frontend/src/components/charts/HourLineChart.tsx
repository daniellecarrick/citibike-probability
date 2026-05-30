/**
 * Gradient-stroked probability-by-hour line chart.
 * Takes an array of 288 values (one per 5-min slot) and renders a 340×110 SVG.
 */
import { useRef } from 'react';

interface Props {
  values: number[];        // length 288, index = 5-min slot
  currentSlot?: number;   // highlight marker
  width?: number;
  height?: number;
}

const PAD = { t: 10, r: 8, b: 20, l: 28 };

export function HourLineChart({ values, currentSlot, width = 340, height = 110 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

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

  // Y-axis labels
  const yLabels = [0, 50, 100];
  const gradId = 'hlc-grad';

  return (
    <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ff2d78" />
          <stop offset="50%"  stopColor="#8b3df5" />
          <stop offset="100%" stopColor="#1fa2ff" />
        </linearGradient>
        <linearGradient id={`${gradId}-area`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#8b3df5" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#8b3df5" stopOpacity="0" />
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
