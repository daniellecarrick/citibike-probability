interface Props {
  score: number | null;
  metric: string;
}

function color(score: number | null) {
  if (score === null) return '#888';
  if (score < 25) return '#22c55e';
  if (score < 60) return '#f59e0b';
  return '#ef4444';
}

function label(score: number | null) {
  if (score === null) return 'No data';
  if (score < 25) return 'Low stress';
  if (score < 60) return 'Moderate';
  return 'High stress';
}

export function StressScoreBadge({ score, metric }: Props) {
  return (
    <div className="stress-badge" style={{ borderColor: color(score) }}>
      <span className="stress-value" style={{ color: color(score) }}>
        {score !== null ? `${score.toFixed(0)}` : '—'}
      </span>
      <span className="stress-label">{label(score)}</span>
      <span className="stress-metric">{metric} stress</span>
    </div>
  );
}
