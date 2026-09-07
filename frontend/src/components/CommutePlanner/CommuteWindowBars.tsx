/**
 * "Morning commute" / "Evening commute" — two cards, each a small-multiple
 * bar chart (one stacked row per weekday, Mon–Fri) showing success
 * probability for every 5-minute departure slot within that commute window.
 * Each bar is drawn as a colored fill in front of a full-height grey track,
 * so it reads as a "how full" gauge rather than a plain bar.
 */
import { useState } from 'react';
import type { CommuteMatrixBucket, CommuteMatrixResponse } from '../../types';
import { probabilityToColor, fmtPct } from '../../utils/colorScale';

interface Props {
  matrix: CommuteMatrixResponse;
  bikeLabel: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Mirrors MORNING_COMMUTE_WINDOW / EVENING_COMMUTE_WINDOW in backend/analytics/commute.py
const WINDOWS: { title: string; range: [number, number] }[] = [
  { title: 'Morning commute', range: [6 * 60, 10 * 60] },
  { title: 'Evening commute', range: [16 * 60, 20 * 60] },
];

// Low success reads as red, high success reads as blue.
const BAR_SCALE = 'redBlue';

function fmtWindowHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12} ${ampm}`;
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function bucketsInWindow(buckets: CommuteMatrixBucket[], [start, end]: [number, number]): CommuteMatrixBucket[] {
  return buckets
    .filter(b => b.departure_minute >= start && b.departure_minute <= end)
    .sort((a, b) => a.departure_minute - b.departure_minute);
}

function WindowCard({
  title, range, days, bikeLabel,
}: {
  title: string;
  range: [number, number];
  days: CommuteMatrixResponse['days'];
  bikeLabel: string;
}) {
  const [hover, setHover] = useState<{ dayOfWeek: number; bucket: CommuteMatrixBucket } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="card commute-window-card">
      <div className="card-title">
        {title} <span className="commute-window-range">({fmtWindowHour(range[0])} – {fmtWindowHour(range[1])})</span>
      </div>
      <div className="window-bar-rows">
        {days.map(day => {
          const buckets = bucketsInWindow(day.buckets, range);
          return (
            <div className="window-bar-row" key={day.day_of_week}>
              <div className="window-bar-row-label">{DAY_LABELS[day.day_of_week]}</div>
              <div className="window-bar-track-group">
                {buckets.map(b => (
                  <div
                    key={b.departure_minute}
                    className="window-bar"
                    onMouseEnter={e => { setHover({ dayOfWeek: day.day_of_week, bucket: b }); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                    onMouseMove={e => setHoverPos({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => { setHover(null); setHoverPos(null); }}
                  >
                    <div className="window-bar-bg" />
                    {b.success_probability !== null && (
                      <div
                        className="window-bar-fill"
                        style={{
                          height: `${Math.max(2, b.success_probability * 100)}%`,
                          background: probabilityToColor(b.success_probability, 1, BAR_SCALE),
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {hover && hoverPos && (
        <div className="chart-hover-tooltip" style={{ left: hoverPos.x + 14, top: hoverPos.y - 74 }}>
          <div className="chart-tooltip-title">
            {DAY_LABELS[hover.dayOfWeek]} {fmtTime(hover.bucket.departure_minute)}
          </div>
          <div className="chart-tooltip-row">
            <span>Success</span>
            <strong>{fmtPct(hover.bucket.success_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>{bikeLabel} avail.</span>
            <strong>{fmtPct(hover.bucket.bike_probability)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span>Dock avail.</span>
            <strong>{fmtPct(hover.bucket.dock_probability)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export function CommuteWindowBars({ matrix, bikeLabel }: Props) {
  const weekdays = matrix.days.filter(d => d.day_of_week < 5);
  if (!weekdays.length) return null;

  return (
    <div className="commute-window-cards">
      {WINDOWS.map(w => (
        <WindowCard key={w.title} title={w.title} range={w.range} days={weekdays} bikeLabel={bikeLabel} />
      ))}
    </div>
  );
}
