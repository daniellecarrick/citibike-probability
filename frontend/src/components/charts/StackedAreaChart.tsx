/**
 * Stacked area chart: x axis = time of day (288 5-min slots), y axis = bike
 * count. Each layer's values are stacked on top of the ones before it.
 */
import { useRef, useState } from 'react';

interface Layer {
  label: string;
  color: string;
  values: number[]; // length 288, index = 5-min slot
}

interface Props {
  layers: Layer[];
  width?: number;
  height?: number;
  percentMode?: boolean; // when true, y axis is fixed 0-100 and values are shown as %
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

export function StackedAreaChart({ layers, width = 340, height = 110, percentMode = false }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);

  const W = width - PAD.l - PAD.r;
  const H = height - PAD.t - PAD.b;
  const slotCount = layers[0]?.values.length ?? 0;

  // Cumulative stack per slot: stacks[slot][layerIndex] = running total through that layer
  const stacks: number[][] = Array.from({ length: slotCount }, (_, slot) => {
    let running = 0;
    return layers.map(l => (running += l.values[slot] ?? 0));
  });

  const maxTotal = Math.max(1, ...stacks.map(s => s[s.length - 1] ?? 0));
  const yDomainMax = percentMode ? 100 : Math.max(1, Math.ceil(maxTotal * 1.15));

  const xAt = (slot: number) => PAD.l + (slot / Math.max(1, slotCount - 1)) * W;
  const yAt = (v: number) => PAD.t + (1 - v / yDomainMax) * H;

  function areaPathFor(layerIndex: number): string {
    if (slotCount === 0) return '';
    const topPts = stacks.map((s, i) => ({ x: xAt(i), y: yAt(s[layerIndex]) }));
    const baseline = layerIndex === 0 ? null : stacks.map((s, i) => ({ x: xAt(i), y: yAt(s[layerIndex - 1]) }));
    const top = topPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const bottom = baseline
      ? [...baseline].reverse().map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      : `L${xAt(slotCount - 1).toFixed(1)},${yAt(0).toFixed(1)} L${xAt(0).toFixed(1)},${yAt(0).toFixed(1)}`;
    return `${top} ${bottom} Z`;
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || slotCount === 0) return;
    const svgX = (e.clientX - rect.left) * (width / rect.width);
    const slot = Math.max(0, Math.min(
      slotCount - 1,
      Math.round(((Math.max(PAD.l, Math.min(PAD.l + W, svgX)) - PAD.l) / W) * (slotCount - 1)),
    ));
    setHoverSlot(slot);
  }

  const yTicks = percentMode ? [0, 50, 100] : [0, Math.round(yDomainMax / 2), yDomainMax];
  const hoverX = hoverSlot !== null ? xAt(hoverSlot) : null;

  const TIP_W = 92;
  const TIP_H = 18 + layers.length * 13;
  const tipX = hoverX !== null
    ? (hoverX + TIP_W + 6 > PAD.l + W ? hoverX - TIP_W - 6 : hoverX + 6)
    : 0;
  const tipY = PAD.t + 4;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        {layers.map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6c727e' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverSlot(null)}
        style={{ cursor: 'crosshair' }}
      >
        {/* Gridlines */}
        {yTicks.map(v => {
          const y = yAt(v);
          return (
            <g key={v}>
              <line x1={PAD.l} x2={PAD.l + W} y1={y} y2={y} stroke="#eceef2" strokeWidth={1} />
              <text x={PAD.l - 4} y={y} textAnchor="end" dominantBaseline="middle"
                fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
                {percentMode ? `${v}%` : v}
              </text>
            </g>
          );
        })}

        {/* Stacked areas, bottom layer first so later layers draw on top */}
        {layers.map((l, i) => (
          <path key={l.label} d={areaPathFor(i)} fill={l.color} fillOpacity={0.75} stroke={l.color} strokeWidth={1} />
        ))}

        {/* Hover crosshair + tooltip */}
        {hoverX !== null && hoverSlot !== null && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={PAD.t + H}
              stroke="#16181d" strokeWidth={1} strokeDasharray="3 2" opacity={0.35} />
            <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx={4}
              fill="white" fillOpacity={0.97} stroke="#eceef2" strokeWidth={1} />
            <text x={tipX + 8} y={tipY + 12}
              fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
              {slotToTime(hoverSlot)}
            </text>
            {layers.map((l, i) => (
              <text key={l.label} x={tipX + 8} y={tipY + 25 + i * 13}
                fontFamily="'IBM Plex Mono', monospace" fontSize={9} fontWeight={600} fill={l.color}>
                {l.label}: {percentMode ? `${(l.values[hoverSlot] ?? 0).toFixed(0)}%` : (l.values[hoverSlot] ?? 0).toFixed(1)}
              </text>
            ))}
          </g>
        )}

        {/* X axis hour labels */}
        {[0, 6, 12, 18, 24].map(h => {
          const x = PAD.l + (h * 12 / Math.max(1, slotCount - 1)) * W;
          const label = h === 0 ? '12a' : h === 12 ? '12p' : h === 24 ? '' : `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
          return (
            <text key={h} x={x} y={PAD.t + H + 12} textAnchor="middle"
              fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
