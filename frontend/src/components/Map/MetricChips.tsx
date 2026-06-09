import { useStore, type Metric } from '../../store';

const CHIPS: { key: Metric; label: string }[] = [
  { key: 'bike',        label: 'Bike Availability' },
  { key: 'ebike',       label: 'E-Bike Availability' },
  { key: 'dock',        label: 'Dock Availability' },
  { key: 'reliability', label: 'Reliability Score' },
  { key: 'stress',      label: 'Stress Score' },
];

export function MetricChips() {
  const { selectedMetric, setMetric } = useStore();

  return (
    <div className="metric-chips">
      {/* Desktop: vertical chip list */}
      <div className="metric-chips-list">
        {CHIPS.map(c => (
          <button
            key={c.key}
            className={`metric-chip ${selectedMetric === c.key ? 'active' : 'inactive'}`}
            onClick={() => setMetric(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Mobile: compact select */}
      <select
        className="metric-chips-select"
        value={selectedMetric}
        onChange={e => setMetric(e.target.value as Metric)}
      >
        {CHIPS.map(c => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>
    </div>
  );
}
