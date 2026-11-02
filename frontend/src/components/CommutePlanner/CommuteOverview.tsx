/**
 * The whole-week picture for a commute, as two cards over the same
 * half-hour matrix: a day × time heatmap, then stacked per-day line charts.
 */
import { useMemo } from 'react';
import { CommuteDayLines } from './CommuteDayLines';
import { CommuteMatrix, contextSentence } from './CommuteMatrix';
import type { CommuteMatrixResponse } from '../../types';

interface Props {
  matrix: CommuteMatrixResponse;
}

export function CommuteOverview({ matrix }: Props) {
  const context = useMemo(() => contextSentence(matrix), [matrix]);

  return (
    <>
      <div className="card commute-overview commute-overview-heatmap">
        <div className="commute-overview-head">
          <div className="card-title">Your week, hour by hour</div>
          {context && <p className="matrix-context">{context}</p>}
        </div>
        <CommuteMatrix matrix={matrix} embedded />
      </div>

      <div className="card commute-overview commute-overview-lines">
        <div className="commute-overview-head">
          <div className="card-title">Day by day</div>
          <p className="matrix-context">Chance of a successful commute across each day, one line per day.</p>
        </div>
        <CommuteDayLines matrix={matrix} />
      </div>
    </>
  );
}
