import { useState } from 'react';
import { useStore, METRIC_LABEL } from '../../store';
import { DAYS_FULL } from '../../utils/time';
import { MetricChips } from './MetricChips';
import { TimeScrubber } from '../Controls/TimeScrubber';

function formatShortTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

/** Floating "Map options" menu (desktop): availability, day, time, and play
 * controls, collapsed behind a hamburger trigger that floats over the map.
 * The trigger's label reflects what the map is currently showing. */
export function MapOptionsMenu() {
  const [open, setOpen] = useState(false);
  const { selectedMetric, selectedDay, selectedTime } = useStore();

  const metricPhrase = selectedMetric === 'fullness' ? 'Station fullness' : `${METRIC_LABEL[selectedMetric]} availability`;
  const label = `${metricPhrase} ${DAYS_FULL[selectedDay]} at ${formatShortTime(selectedTime)}`;

  return (
    <div className="map-options-wrap">
      <button
        className={`map-options-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <svg width="16" height="13" viewBox="0 0 16 13" fill="none">
          <path d="M1 1.5h14M3 6.5h10M5 11.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        {label}
      </button>

      {open && (
        <>
          <div className="map-options-backdrop" onClick={() => setOpen(false)} />
          <div className="map-options-panel">
            <MetricChips />
            <TimeScrubber />
            <div className="metric-group">
              <span className="filter-label">Scale</span>
              <div className="header-legend">
                <span className="header-legend-label">Low</span>
                <div className="scrubber-gradient-bar header-legend-bar" />
                <span className="header-legend-label">High</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
