import { useStore, type Metric } from '../../store';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'ebike',    label: 'E-Bike' },
  { key: 'bike',     label: 'Bike' },
  { key: 'dock',     label: 'Dock' },
  { key: 'fullness', label: '% Full' },
];

export function MetricChips() {
  const { selectedMetric, setMetric } = useStore();

  return (
    <div className="metric-group">
      <span className="day-pills-label">Availability</span>
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
  );
}
