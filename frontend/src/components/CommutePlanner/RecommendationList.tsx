import { useStore } from '../../store';
import type { Recommendation } from '../../types';
import { probabilityToColor } from '../../utils/colorScale';

interface Props {
  recommendations: Recommendation[];
}

export function RecommendationList({ recommendations }: Props) {
  const { setTime } = useStore();

  if (recommendations.length === 0) return null;

  return (
    <div className="rec-list">
      <h3 className="section-title">Better Times</h3>
      {recommendations.map((r) => {
        const pct = r.success_probability !== null ? Math.round(r.success_probability * 100) : null;
        const offset = r.offset_minutes;
        const offsetLabel =
          offset === 0 ? 'Selected time' : offset > 0 ? `+${offset} min later` : `${Math.abs(offset)} min earlier`;

        return (
          <button
            key={r.departure_time}
            className="rec-item"
            onClick={() => setTime(r.departure_minute)}
          >
            <div className="rec-time">{r.departure_time}</div>
            <div className="rec-offset">{offsetLabel}</div>
            <div
              className="rec-prob"
              style={{ color: probabilityToColor(r.success_probability) }}
            >
              {pct !== null ? `${pct}%` : '—'}
            </div>
          </button>
        );
      })}
    </div>
  );
}
