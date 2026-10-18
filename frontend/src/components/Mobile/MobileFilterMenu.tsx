import { useState } from 'react';
import { useStore, type Metric } from '../../store';
import type { DayOfWeek, Station } from '../../types';
import { MethodologyModal } from '../Methodology/MethodologyModal';
import { StationSearchModal } from './StationSearchModal';
import { formatTime } from '../../utils/time';

const METRICS: { key: Metric; label: string; long: string }[] = [
  { key: 'ebike',    label: 'E-Bike', long: 'E-bike availability' },
  { key: 'bike',     label: 'Bike',   long: 'Bike availability' },
  { key: 'dock',     label: 'Dock',   long: 'Dock availability' },
  { key: 'fullness', label: '% Full', long: 'How full stations are' },
];

const DAYS: { letter: string; short: string; value: DayOfWeek }[] = [
  { letter: 'S', short: 'Sun', value: 6 },
  { letter: 'M', short: 'Mon', value: 0 },
  { letter: 'T', short: 'Tue', value: 1 },
  { letter: 'W', short: 'Wed', value: 2 },
  { letter: 'T', short: 'Thu', value: 3 },
  { letter: 'F', short: 'Fri', value: 4 },
  { letter: 'S', short: 'Sat', value: 5 },
];

const DAY_MINUTES = 24 * 60;

/**
 * Mobile map chrome: an always-visible status pill (what the map is showing,
 * tap to change it), a station search button, a color legend, and the
 * metric/day/time filters as a bottom sheet.
 */
export function MobileFilterMenu({ stations }: { stations: Station[] }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const {
    selectedDay, selectedTime, selectedMetric, selectedStationId,
    setDay, setTime, setMetric, selectStation,
  } = useStore();

  const metric = METRICS.find(m => m.key === selectedMetric) ?? METRICS[0];
  const day = DAYS.find(d => d.value === selectedDay) ?? DAYS[0];
  const stepTime = (delta: number) => setTime((selectedTime + delta + DAY_MINUTES) % DAY_MINUTES);
  const isFullness = selectedMetric === 'fullness';

  return (
    <>
      {methodologyOpen && <MethodologyModal onClose={() => setMethodologyOpen(false)} />}
      {searchOpen && (
        <StationSearchModal
          stations={stations}
          selectedId={selectedStationId}
          onSelect={id => selectStation(id)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <div className="mobile-map-toolbar">
        <button
          className="mobile-map-status"
          onClick={() => setOpen(true)}
          aria-label={`${metric.long}, ${day.short} ${formatTime(selectedTime)}. Change filters`}
        >
          <span className="mobile-map-status-text">
            <span className="mobile-map-status-metric">{metric.label}</span>
            <span className="mobile-map-status-sep" aria-hidden="true">·</span>
            {day.short} {formatTime(selectedTime)}
          </span>
          <svg width="16" height="13" viewBox="0 0 16 13" fill="none" aria-hidden="true">
            <path d="M1 1.5h14M3 6.5h10M5 11.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
        <button className="mobile-map-search" onClick={() => setSearchOpen(true)} aria-label="Search stations">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="7.75" cy="7.75" r="5.75" stroke="currentColor" strokeWidth="1.75" />
            <path d="M12.25 12.25 16 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="mobile-map-legend" aria-hidden="true">
        <span>{isFullness ? 'Empty' : 'Scarce'}</span>
        <span className="mobile-map-legend-bar" />
        <span>{isFullness ? 'Full' : 'Plentiful'}</span>
      </div>

      {open && (
        <>
          <div className="mobile-sheet-backdrop mobile-filter-backdrop" onClick={() => setOpen(false)} />
          <div className="mobile-filter-sheet" role="dialog" aria-modal="true" aria-label="Map filters">
            <div className="mobile-filter-sheet-head">
              <span className="mobile-filter-sheet-title">Show the map for</span>
              <button className="mobile-filter-done" onClick={() => setOpen(false)}>Done</button>
            </div>

            <div className="mobile-filter-section">
              <span className="mobile-filter-label">Availability</span>
              <div className="mode-toggle-track mobile-filter-track">
                {METRICS.map(m => (
                  <button
                    key={m.key}
                    className={`mode-toggle-btn${selectedMetric === m.key ? ' active' : ''}`}
                    aria-pressed={selectedMetric === m.key}
                    onClick={() => setMetric(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mobile-filter-section">
              <span className="mobile-filter-label">Day</span>
              <div className="day-pills-track mobile-filter-track">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    className={`day-pill${selectedDay === d.value ? ' active' : ''}`}
                    aria-label={d.short}
                    aria-pressed={selectedDay === d.value}
                    onClick={() => setDay(d.value)}
                  >
                    {d.letter}
                  </button>
                ))}
              </div>
            </div>

            <div className="mobile-filter-section">
              <div className="mobile-filter-time-row">
                <span className="mobile-filter-label">Time</span>
                <span className="mobile-filter-time-value">{formatTime(selectedTime)}</span>
              </div>
              <div className="mobile-time-control">
                <button className="mobile-time-step" onClick={() => stepTime(-15)} aria-label="15 minutes earlier">−15m</button>
                <div className="mobile-time-range-wrap">
                  <input
                    type="range"
                    min={0}
                    max={1435}
                    step={5}
                    value={selectedTime}
                    onChange={e => setTime(Number(e.target.value))}
                    className="mobile-time-range"
                    aria-label="Time of day"
                    aria-valuetext={formatTime(selectedTime)}
                  />
                  <div className="mobile-time-ticks" aria-hidden="true">
                    <span>12a</span>
                    <span>6a</span>
                    <span>12p</span>
                    <span>6p</span>
                    <span>12a</span>
                  </div>
                </div>
                <button className="mobile-time-step" onClick={() => stepTime(15)} aria-label="15 minutes later">+15m</button>
              </div>
            </div>

            <button
              className="mobile-methodology-link"
              onClick={() => { setMethodologyOpen(true); setOpen(false); }}
            >
              How is this calculated?
            </button>
          </div>
        </>
      )}
    </>
  );
}
