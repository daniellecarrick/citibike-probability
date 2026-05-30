import { useStationDetail } from '../../hooks/useStationDetail';
import { useStore } from '../../store';
import { probabilityToColor } from '../../utils/colorScale';
import { InventoryChart } from './InventoryChart';
import { StressScoreBadge } from './StressScoreBadge';
import type { Metric } from '../../types';

const METRIC_LABELS: Record<Metric, string> = {
  bikes: 'Any Bike',
  classic: 'Classic',
  ebikes: 'E-Bike',
  docks: 'Dock',
};

const METRIC_COLORS: Record<Metric, string> = {
  bikes: '#0057B8',
  classic: '#0ea5e9',
  ebikes: '#8b5cf6',
  docks: '#f59e0b',
};

function ProbBar({ label, prob, color }: { label: string; prob: number | null; color: string }) {
  const pct = prob !== null ? Math.round(prob * 100) : null;
  return (
    <div className="prob-row">
      <span className="prob-label">{label}</span>
      <div className="prob-bar-track">
        <div
          className="prob-bar-fill"
          style={{ width: pct !== null ? `${pct}%` : '0%', background: probabilityToColor(prob) }}
        />
      </div>
      <span className="prob-pct" style={{ color }}>
        {pct !== null ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

export function StationDetailPanel() {
  const { selectedStationId, selectStation } = useStore();
  const { detail, loading } = useStationDetail();

  if (!selectedStationId) return null;

  return (
    <div className="station-panel">
      <button className="panel-close" onClick={() => selectStation(null)}>×</button>

      {loading && <div className="panel-loading">Loading...</div>}

      {!loading && !detail && <div className="panel-error">Station not found</div>}

      {detail && (
        <>
          <h2 className="panel-title">{detail.station_name}</h2>
          <div className="panel-subtitle">
            Capacity: {detail.capacity ?? 'Unknown'} · {detail.distributions.bikes.sample_count} samples
          </div>

          <section className="panel-section">
            <h3 className="section-title">Availability Probability</h3>
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <ProbBar
                key={m}
                label={METRIC_LABELS[m]}
                prob={detail.probabilities[m].probability}
                color={METRIC_COLORS[m]}
              />
            ))}
          </section>

          <section className="panel-section">
            <h3 className="section-title">Stress Scores</h3>
            <div className="stress-grid">
              {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
                <StressScoreBadge
                  key={m}
                  score={detail.stress_scores[m].stress_score}
                  metric={METRIC_LABELS[m]}
                />
              ))}
            </div>
          </section>

          <section className="panel-section">
            <h3 className="section-title">Bike Inventory Distribution</h3>
            <InventoryChart
              histogram={detail.distributions.bikes.histogram}
              color={METRIC_COLORS.bikes}
            />
            <div className="stat-row">
              <span>Mean: {detail.distributions.bikes.mean?.toFixed(1) ?? '—'}</span>
              <span>Median: {detail.distributions.bikes.median?.toFixed(1) ?? '—'}</span>
              <span>σ: {detail.distributions.bikes.std_dev?.toFixed(1) ?? '—'}</span>
            </div>
            <div className="stat-row">
              <span>P10: {detail.distributions.bikes.p10 ?? '—'}</span>
              <span>P25: {detail.distributions.bikes.p25 ?? '—'}</span>
              <span>P75: {detail.distributions.bikes.p75 ?? '—'}</span>
              <span>P90: {detail.distributions.bikes.p90 ?? '—'}</span>
            </div>
          </section>

          <section className="panel-section">
            <h3 className="section-title">Nearby Stations</h3>
            <ul className="nearby-list">
              {detail.nearby_stations.map((s) => (
                <li key={s.station_id}>
                  <button
                    className="nearby-btn"
                    onClick={() => selectStation(s.station_id)}
                  >
                    {s.station_name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
