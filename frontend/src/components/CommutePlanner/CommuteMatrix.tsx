/**
 * Day × time-of-day heatmap of commute success probability. Click a cell to
 * set the global day/time (driving the forecast-card + RecommendationList
 * below); the cell nearest the current day/time is outlined.
 */
import { useState } from 'react';
import { useStore } from '../../store';
import { probabilityToColor } from '../../utils/colorScale';
import type { CommuteMatrixResponse } from '../../types';

interface Props {
  matrix: CommuteMatrixResponse;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PAD = { t: 8, r: 8, b: 20, l: 34 };
const ROW_H = 20;
const GRID_W = 432;

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function CommuteMatrix({ matrix }: Props) {
  const { selectedDay, selectedTime, setDay, setTime } = useStore();
  const [hover, setHover] = useState<{ day: number; bucketIdx: number } | null>(null);

  const bucketsPerDay = matrix.days[0]?.buckets.length ?? 48;
  const cellW = GRID_W / bucketsPerDay;
  const gridH = ROW_H * matrix.days.length;
  const width = PAD.l + GRID_W + PAD.r;
  const height = PAD.t + gridH + PAD.b;

  const selectedBucketIdx = Math.floor(selectedTime / matrix.bucket_minutes);

  const hoverBucket = hover
    ? matrix.days[hover.day]?.buckets[hover.bucketIdx]
    : null;

  return (
    <div className="commute-matrix">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {matrix.days.map((day, rowIdx) => (
          <g key={day.day_of_week}>
            <text
              x={PAD.l - 6} y={PAD.t + rowIdx * ROW_H + ROW_H / 2}
              textAnchor="end" dominantBaseline="middle"
              fontFamily="'IBM Plex Mono', monospace" fontSize={9} fill="#9aa1ad"
            >
              {DAY_LABELS[day.day_of_week]}
            </text>
            {day.buckets.map((bucket, colIdx) => {
              const x = PAD.l + colIdx * cellW;
              const y = PAD.t + rowIdx * ROW_H;
              const isSelected = day.day_of_week === selectedDay && colIdx === selectedBucketIdx;
              return (
                <rect
                  key={bucket.departure_minute}
                  x={x} y={y}
                  width={Math.max(1, cellW - 1)} height={ROW_H - 1}
                  fill={probabilityToColor(bucket.success_probability)}
                  stroke={isSelected ? '#16181d' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover({ day: rowIdx, bucketIdx: colIdx })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => { setDay(day.day_of_week); setTime(bucket.departure_minute); }}
                />
              );
            })}
          </g>
        ))}

        {/* Time-of-day axis */}
        {[0, 6, 12, 18, 24].map(h => {
          const x = PAD.l + (h * 60 / matrix.bucket_minutes) * cellW;
          const label = h === 0 ? '12a' : h === 12 ? '12p' : h === 24 ? '' : `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`;
          return (
            <text key={h} x={x} y={PAD.t + gridH + 13} textAnchor="middle"
              fontFamily="'IBM Plex Mono', monospace" fontSize={8} fill="#9aa1ad">
              {label}
            </text>
          );
        })}
      </svg>

      <div className="commute-matrix-footer">
        <div className="commute-matrix-hint">
          {hoverBucket
            ? `${DAY_LABELS[matrix.days[hover!.day].day_of_week]} ${formatTime(hoverBucket.departure_minute)} — ${
                hoverBucket.success_probability !== null ? `${Math.round(hoverBucket.success_probability * 100)}%` : 'no data'
              }`
            : 'Click a cell to see that day and time below'}
        </div>
        <div className="scale-hint">
          {[0, 0.5, 1].map(v => (
            <div key={v} style={{ width: 10, height: 10, borderRadius: '50%', background: probabilityToColor(v) }} />
          ))}
          <span>Pink means scarce, blue means plentiful</span>
        </div>
      </div>
    </div>
  );
}
