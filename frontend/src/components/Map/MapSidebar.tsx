import { MetricChips } from './MetricChips';
import { TimeScrubber } from '../Controls/TimeScrubber';
import { StationDetailPanel } from '../StationDetail/StationDetailPanel';

export function MapSidebar() {
  return (
    <div className="left-rail">
      <div className="map-sidebar-controls">
        <MetricChips />
        <div className="metric-group header-legend-group">
          <span className="day-pills-label">Scale</span>
          <div className="header-legend">
            <span className="header-legend-label">Low</span>
            <div className="scrubber-gradient-bar header-legend-bar" />
            <span className="header-legend-label">High</span>
          </div>
        </div>
        <TimeScrubber />
      </div>

      <div className="rail-content">
        <StationDetailPanel />
      </div>
    </div>
  );
}
