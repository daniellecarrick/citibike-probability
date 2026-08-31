/**
 * "Best time to leave" — gradient line chart sweeping ±60min around the
 * selected departure time, full width to match the other results charts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Recommendation } from '../../types';
import { probabilityToColor } from '../../utils/colorScale';

interface Props {
  recommendations: Recommendation[];
}

const DEFAULT_W = 900;
const H = 150;
const PAD = { l: 28, r: 12, t: 14, b: 20 };

function fmtPct(p: number | null): string {
  return p !== null ? `${Math.round(p * 100)}%` : '—';
}

export function RecommendationList({ recommendations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(DEFAULT_W);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const IW = Math.max(100, width - PAD.l - PAD.r);
  const IH = H - PAD.t - PAD.b;

  const best = useMemo(() =>
    recommendations.reduce((a, b) =>
      (b.success_probability ?? 0) > (a.success_probability ?? 0) ? b : a,
      recommendations[0]
    ), [recommendations]);

  if (!recommendations.length) return null;

  // Build points across all recommendations sorted by offset
  const sorted = [...recommendations].sort((a, b) => a.offset_minutes - b.offset_minutes);

  // Fixed domain: ±60 min around the user's selected time (offset 0 = selected time)
  const domainMin = -60;
  const domainMax = 60;
  const domainSpan = 120;

  const pts = sorted
    .filter(r => r.success_probability !== null && r.offset_minutes >= domainMin && r.offset_minutes <= domainMax)
    .map(r => ({
      x: PAD.l + ((r.offset_minutes - domainMin) / domainSpan) * IW,
      y: PAD.t + (1 - (r.success_probability ?? 0)) * IH,
      r: r,
    }));

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || pts.length === 0) return;
    const scale = width / rect.width;
    const svgX = (e.clientX - rect.left) * scale;
    let closest = 0;
    let closestDist = Infinity;
    pts.forEach((p, i) => {
      const dist = Math.abs(p.x - svgX);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    setHoverIdx(closest);
    setHoverPos({ x: e.clientX, y: e.clientY });
  }

  function handleMouseLeave() {
    setHoverIdx(null);
    setHoverPos(null);
  }

  const hoverPt = hoverIdx !== null ? pts[hoverIdx] : null;

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const first = pts[0];
  const last  = pts[pts.length - 1];
  const areaPath = first && last
    ? `${linePath} L${last.x.toFixed(1)},${(PAD.t + IH).toFixed(1)} L${first.x.toFixed(1)},${(PAD.t + IH).toFixed(1)} Z`
    : '';

  // "now" marker sits at offset 0 (the user's currently selected time)
  const nowX = PAD.l + (0 - domainMin) / domainSpan * IW;
  const bestPt = pts.find(p => p.r.departure_minute === best?.departure_minute);

  const bestColor = probabilityToColor(best?.success_probability ?? null);

  return (
    <div className="rec-chart" ref={containerRef}>
      <div className="rec-card-header">
        <span className="rec-card-title">Best time to leave</span>
        <span className="rec-pct-label">% Success</span>
      </div>
      {best && (
        <div className="rec-subtitle">
          Best around{' '}
          <strong style={{ color: bestColor }}>{best.departure_time}</strong> at{' '}
          <strong style={{ color: bestColor }}>
            {best.success_probability !== null ? `${Math.round(best.success_probability * 100)}%` : '—'}
          </strong>
          {best.offset_minutes < 0 ? ' — leaving earlier beats the rush.' : best.offset_minutes > 0 ? ' — a bit later works better.' : ' — your selected time is optimal.'}
        </div>
      )}

      <svg
        ref={svgRef}
        width={width} height={H} viewBox={`0 0 ${width} ${H}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id="rec-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#ff2d78" />
            <stop offset="50%"  stopColor="#8b3df5" />
            <stop offset="100%" stopColor="#1fa2ff" />
          </linearGradient>
          <linearGradient id="rec-area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#8b3df5" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#8b3df5" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {[0, 50, 100].map(pct => {
          const y = PAD.t + (1 - pct / 100) * IH;
          return (
            <g key={pct}>
              <line x1={PAD.l} x2={PAD.l + IW} y1={y} y2={y} stroke="#eceef2" strokeWidth={1} />
              <text x={PAD.l - 4} y={y} textAnchor="end" dominantBaseline="middle"
                fontFamily="'IBM Plex Mono',monospace" fontSize={8} fill="#9aa1ad">{pct}</text>
            </g>
          );
        })}

        {/* Area + line */}
        {pts.length > 1 && (
          <>
            <path d={areaPath} fill="url(#rec-area-grad)" />
            <path d={linePath} fill="none" stroke="url(#rec-line-grad)" strokeWidth={2.5} strokeLinejoin="round" />
          </>
        )}

        {/* Now marker */}
        {nowX >= PAD.l && nowX <= PAD.l + IW && (
          <line x1={nowX} x2={nowX} y1={PAD.t} y2={PAD.t + IH}
            stroke="#16181d" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        )}

        {/* Best dot */}
        {bestPt && (
          <>
            <circle cx={bestPt.x} cy={bestPt.y} r={5} fill={bestColor} />
            <text x={bestPt.x} y={bestPt.y - 8} textAnchor="middle"
              fontFamily="'IBM Plex Mono',monospace" fontSize={8} fill={bestColor}>
              {best?.departure_time}
            </text>
          </>
        )}

        {/* X-axis labels: left edge · best (centre) · right edge — the edge
            label is skipped whenever it lands on the same point as "best"
            (e.g. the optimal time sits right at the ±60min window edge),
            since drawing both there would overlap into unreadable text. */}
        {first && first.r.departure_minute !== best?.departure_minute && (
          <text x={first.x} y={H - 4} textAnchor="start"
            fontFamily="'IBM Plex Mono',monospace" fontSize={8} fill="#9aa1ad">
            {first.r.departure_time}
          </text>
        )}
        {bestPt && (
          <text x={bestPt.x} y={H - 4} textAnchor="middle"
            fontFamily="'IBM Plex Mono',monospace" fontSize={8} fill="#9aa1ad">
            {best?.departure_time}
          </text>
        )}
        {last && last.r.departure_minute !== first?.r.departure_minute
          && last.r.departure_minute !== best?.departure_minute && (
          <text x={last.x} y={H - 4} textAnchor="end"
            fontFamily="'IBM Plex Mono',monospace" fontSize={8} fill="#9aa1ad">
            {last.r.departure_time}
          </text>
        )}

        {/* Hover crosshair + dot */}
        {hoverPt && (
          <g>
            <line x1={hoverPt.x} x2={hoverPt.x} y1={PAD.t} y2={PAD.t + IH}
              stroke="#16181d" strokeWidth={1} strokeDasharray="3 2" opacity={0.3} />
            <circle cx={hoverPt.x} cy={hoverPt.y} r={4}
              fill="white" stroke={probabilityToColor(hoverPt.r.success_probability)} strokeWidth={2} />
          </g>
        )}
      </svg>

      {hoverPt && hoverPos && (
        <div
          className="chart-hover-tooltip"
          style={{ left: hoverPos.x + 14, top: hoverPos.y - 74 }}
        >
          <div className="chart-tooltip-title">{hoverPt.r.departure_time} → {hoverPt.r.arrival_time}</div>
          <div className="chart-tooltip-row">
            <span>Success</span>
            <strong>{fmtPct(hoverPt.r.success_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>Bike avail.</span>
            <strong>{fmtPct(hoverPt.r.bike_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>Dock avail.</span>
            <strong>{fmtPct(hoverPt.r.dock_probability)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
