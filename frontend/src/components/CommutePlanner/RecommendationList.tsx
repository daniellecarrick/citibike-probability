/**
 * "Better departure windows" — non-interactive gradient line chart
 * sweeping ±3h from selected departure time.
 */
import { useMemo } from 'react';
import type { Recommendation } from '../../types';
import { probabilityToColor } from '../../utils/colorScale';

interface Props {
  recommendations: Recommendation[];
  currentTime?: number; // minutes since midnight (unused — kept for future reference line)
}

const W = 332;
const H = 124;
const PAD = { l: 24, r: 10, t: 12, b: 18 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

export function RecommendationList({ recommendations }: Props) {
  const best = useMemo(() =>
    recommendations.reduce((a, b) =>
      (b.success_probability ?? 0) > (a.success_probability ?? 0) ? b : a,
      recommendations[0]
    ), [recommendations]);

  if (!recommendations.length) return null;

  // Build points across all recommendations sorted by offset
  const sorted = [...recommendations].sort((a, b) => a.offset_minutes - b.offset_minutes);

  // Fixed 2-hour domain centered on the best departure time
  const bestOffset = best?.offset_minutes ?? 0;
  const domainMin = bestOffset - 60;
  const domainMax = bestOffset + 60;
  const domainSpan = 120;

  const pts = sorted
    .filter(r => r.success_probability !== null && r.offset_minutes >= domainMin && r.offset_minutes <= domainMax)
    .map(r => ({
      x: PAD.l + ((r.offset_minutes - domainMin) / domainSpan) * IW,
      y: PAD.t + (1 - (r.success_probability ?? 0)) * IH,
      r: r,
    }));

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
    <div className="card">
      <div className="rec-card-header">
        <span className="rec-card-title">Better departure windows</span>
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

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
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

        {/* X-axis labels: left edge · best (centre) · right edge */}
        {first && (
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
        {last && last.r.departure_minute !== first?.r.departure_minute && (
          <text x={last.x} y={H - 4} textAnchor="end"
            fontFamily="'IBM Plex Mono',monospace" fontSize={8} fill="#9aa1ad">
            {last.r.departure_time}
          </text>
        )}
      </svg>
    </div>
  );
}
