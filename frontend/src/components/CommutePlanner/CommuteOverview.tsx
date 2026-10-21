/**
 * The whole-week picture for a commute: every half hour of every day, as
 * either a heatmap (default) or stacked per-day line charts. Both views read
 * the same matrix and both set the global day/time when tapped.
 */
import { useMemo, useState } from 'react';
import { CommuteDayLines } from './CommuteDayLines';
import { CommuteMatrix, contextSentence } from './CommuteMatrix';
import type { CommuteMatrixResponse } from '../../types';

type View = 'heatmap' | 'lines';

const VIEW_KEY = 'commute-overview-view';

/** Remembered per browser; storage can be unavailable (private mode, etc.). */
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'lines' ? 'lines' : 'heatmap';
  } catch {
    return 'heatmap';
  }
}

interface Props {
  matrix: CommuteMatrixResponse;
  bikeLabel: string;
}

export function CommuteOverview({ matrix, bikeLabel }: Props) {
  const [view, setView] = useState<View>(readView);
  const context = useMemo(() => contextSentence(matrix), [matrix]);

  function choose(next: View) {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* not persisted */ }
  }

  return (
    <div className="card commute-overview">
      <div className="commute-overview-head">
        <div className="commute-overview-titles">
          <div className="card-title">Your week, hour by hour</div>
          {context && <p className="matrix-context">{context}</p>}
        </div>
        <div className="mode-toggle-track commute-overview-toggle" role="group" aria-label="Chart type">
          <button
            className={`mode-toggle-btn${view === 'heatmap' ? ' active' : ''}`}
            aria-pressed={view === 'heatmap'}
            onClick={() => choose('heatmap')}
          >
            Heatmap
          </button>
          <button
            className={`mode-toggle-btn${view === 'lines' ? ' active' : ''}`}
            aria-pressed={view === 'lines'}
            onClick={() => choose('lines')}
          >
            Lines
          </button>
        </div>
      </div>

      {view === 'heatmap'
        ? <CommuteMatrix matrix={matrix} embedded />
        : <CommuteDayLines matrix={matrix} bikeLabel={bikeLabel} />}
    </div>
  );
}
