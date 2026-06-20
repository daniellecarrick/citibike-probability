import { useState } from 'react';
import { useStore, type Metric } from '../../store';
import type { DayOfWeek } from '../../types';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'ebike',    label: 'E-Bike' },
  { key: 'bike',     label: 'Bike' },
  { key: 'dock',     label: 'Dock' },
  { key: 'fullness', label: '% Full' },
];

const DAYS: { letter: string; full: string; value: DayOfWeek }[] = [
  { letter: 'S', full: 'Sunday',    value: 6 },
  { letter: 'M', full: 'Monday',    value: 0 },
  { letter: 'T', full: 'Tuesday',   value: 1 },
  { letter: 'W', full: 'Wednesday', value: 2 },
  { letter: 'T', full: 'Thursday',  value: 3 },
  { letter: 'F', full: 'Friday',    value: 4 },
  { letter: 'S', full: 'Saturday',  value: 5 },
];

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function MobileFilterMenu() {
  const [open, setOpen] = useState(false);
  const { selectedDay, selectedTime, selectedMetric, setDay, setTime, setMetric } = useStore();

  return (
    <div className="mobile-filter-wrap">
      {open && (
        <>
          <div className="mobile-filter-backdrop" onClick={() => setOpen(false)} />
          <div className="mobile-filter-panel">
            <div className="mobile-filter-section">
              <span className="mobile-filter-label">Availability</span>
              <div className="mode-toggle-track">
                {METRICS.map(m => (
                  <button
                    key={m.key}
                    className={`mode-toggle-btn${selectedMetric === m.key ? ' active' : ''}`}
                    onClick={() => setMetric(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mobile-filter-section">
              <span className="mobile-filter-label">Day</span>
              <div className="day-pills-track">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    className={`day-pill${selectedDay === d.value ? ' active' : ''}`}
                    title={d.full}
                    onClick={() => setDay(d.value)}
                  >
                    {d.letter}
                  </button>
                ))}
              </div>
            </div>

            <div className="mobile-filter-section">
              <span className="mobile-filter-label">Time · {formatTime(selectedTime)}</span>
              <input
                type="range"
                min={0}
                max={1435}
                step={5}
                value={selectedTime}
                onChange={e => setTime(Number(e.target.value))}
                className="mobile-time-range"
              />
              <div className="mobile-time-ticks">
                <span>12a</span>
                <span>6a</span>
                <span>12p</span>
                <span>6p</span>
                <span>12a</span>
              </div>
            </div>
          </div>
        </>
      )}

      <button
        className={`mobile-filter-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Filters"
      >
        {open ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="16" height="13" viewBox="0 0 16 13" fill="none">
            <path d="M1 1.5h14M3 6.5h10M5 11.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
