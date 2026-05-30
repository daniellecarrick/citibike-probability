import { useState } from 'react';
import { useCommute } from '../../hooks/useCommute';
import { useStore } from '../../store';
import { probabilityToColor } from '../../utils/colorScale';
import { RecommendationList } from './RecommendationList';
import type { Station } from '../../types';

interface Props {
  stations: Station[];
}

function ProbStat({ label, value }: { label: string; value: number | null }) {
  const pct = value !== null ? Math.round(value * 100) : null;
  return (
    <div className="commute-stat">
      <div className="commute-stat-label">{label}</div>
      <div
        className="commute-stat-value"
        style={{ color: probabilityToColor(value) }}
      >
        {pct !== null ? `${pct}%` : '—'}
      </div>
    </div>
  );
}

export function CommutePlanner({ stations }: Props) {
  const { commute, setCommute } = useStore();
  const { result, recommendations, loading } = useCommute();

  const [originId, setOriginId] = useState(commute?.originId ?? '');
  const [destId, setDestId] = useState(commute?.destId ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (originId && destId) setCommute({ originId, destId });
  };

  return (
    <div className="commute-planner">
      <h2 className="panel-title">Commute Planner</h2>

      <form className="commute-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>Origin</label>
          <select value={originId} onChange={(e) => setOriginId(e.target.value)}>
            <option value="">Select station...</option>
            {stations.map((s) => (
              <option key={s.station_id} value={s.station_id}>
                {s.station_name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Destination</label>
          <select value={destId} onChange={(e) => setDestId(e.target.value)}>
            <option value="">Select station...</option>
            {stations.map((s) => (
              <option key={s.station_id} value={s.station_id}>
                {s.station_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="btn btn-active"
          disabled={!originId || !destId}
        >
          Calculate
        </button>
      </form>

      {loading && <div className="panel-loading">Calculating...</div>}

      {result && !loading && (
        <div className="commute-result">
          <div className="commute-route">
            <span className="route-station">{result.origin.name}</span>
            <span className="route-arrow">→</span>
            <span className="route-station">{result.destination.name}</span>
          </div>
          <div className="commute-times">
            {result.departure_time} → {result.arrival_time}
            <span className="travel-duration">({result.travel_minutes} min ride)</span>
          </div>

          <div className="commute-stats">
            <ProbStat label="Bike available" value={result.bike_probability} />
            <ProbStat label="Dock available" value={result.dock_probability} />
            <div className="commute-stat commute-success">
              <div className="commute-stat-label">Commute success</div>
              <div
                className="commute-stat-value commute-stat-big"
                style={{ color: probabilityToColor(result.success_probability) }}
              >
                {result.success_probability !== null
                  ? `${Math.round(result.success_probability * 100)}%`
                  : '—'}
              </div>
            </div>
          </div>

          <RecommendationList recommendations={recommendations} />
        </div>
      )}
    </div>
  );
}
