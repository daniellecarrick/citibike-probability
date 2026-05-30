import type { HistogramBucket } from '../../types';
import { probabilityToColor } from '../../utils/colorScale';

interface Props {
  histogram: HistogramBucket[];
}

export function BarHistogram({ histogram }: Props) {
  if (!histogram.length) return null;
  const maxCount = Math.max(...histogram.map(b => b.count), 1);

  return (
    <div className="bar-histogram">
      {histogram.map((b, i) => {
        const t = i / (histogram.length - 1);
        return (
          <div key={b.label} className="bar-histogram-col">
            <div
              className="bar-histogram-bar"
              style={{
                height: `${Math.round((b.count / maxCount) * 54)}px`,
                background: probabilityToColor(t),
              }}
            />
            <span className="bar-histogram-label">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
