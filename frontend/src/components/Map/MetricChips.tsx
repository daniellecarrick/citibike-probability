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
  );
}
