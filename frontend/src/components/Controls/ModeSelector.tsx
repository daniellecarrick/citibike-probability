import { useStore } from '../../store';
import type { MapMode, Metric } from '../../types';

const METRICS: { value: Metric; label: string }[] = [
  { value: 'bikes', label: 'Bikes' },
  { value: 'classic', label: 'Classic' },
  { value: 'ebikes', label: 'E-Bikes' },
  { value: 'docks', label: 'Docks' },
];

const MAP_MODES: { value: MapMode; label: string }[] = [
  { value: 'stations', label: 'Stations' },
  { value: 'heat', label: 'Heat Map' },
];

export function ModeSelector() {
  const { selectedMetric, mapMode, setMetric, setMapMode } = useStore();

  return (
    <div className="mode-selector">
      <div className="control-group">
        <label className="control-label">Metric</label>
        <div className="button-group">
          {METRICS.map((m) => (
            <button
              key={m.value}
              className={`btn ${selectedMetric === m.value ? 'btn-active' : ''}`}
              onClick={() => setMetric(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <label className="control-label">View</label>
        <div className="button-group">
          {MAP_MODES.map((m) => (
            <button
              key={m.value}
              className={`btn ${mapMode === m.value ? 'btn-active' : ''}`}
              onClick={() => setMapMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
