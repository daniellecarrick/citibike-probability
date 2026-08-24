import { useStore, METRIC_LABEL } from '../../store';
import { DAYS_FULL } from '../../utils/time';
import { MetricChips } from './MetricChips';
import { TimeScrubber } from '../Controls/TimeScrubber';

function formatShortTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

/** Row below the header (Map view only): availability filter + time scrubber,
 * plus a page title that reflects the current filter selections. */
export function MapControlsBar() {
  const { selectedMetric, selectedDay, selectedTime } = useStore();

  const metricPhrase = selectedMetric === 'fullness' ? 'Station fullness' : `${METRIC_LABEL[selectedMetric]} availability`;
  const title = `${metricPhrase} ${DAYS_FULL[selectedDay]} ${formatShortTime(selectedTime)}`;

  return (
    <div className="map-controls-bar">
      <h1 className="map-page-title">{title}</h1>
      <div className="map-controls-row">
        <MetricChips />

        <TimeScrubber />
        <div className="metric-group header-legend-group">
          <span className="filter-label">Scale</span>
          <div className="header-legend">
            <span className="header-legend-label">Low</span>
            <div className="scrubber-gradient-bar header-legend-bar" />
            <span className="header-legend-label">High</span>
          </div>
        </div>
      </div>

    </div>
  );
}
