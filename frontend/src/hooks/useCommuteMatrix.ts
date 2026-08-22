import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useStore } from '../store';
import type { CommuteMatrixResponse } from '../types';

/**
 * Fetches the day×time success-probability matrix for the current commute
 * pair. Deliberately not keyed on selectedDay/selectedTime — the matrix is
 * what lets the user pick those, not something driven by them.
 */
export function useCommuteMatrix() {
  const { commute } = useStore();
  const [matrix, setMatrix] = useState<CommuteMatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!commute || !commute.originId || !commute.destId) { setMatrix(null); return; }
    setLoading(true);
    api.commute.matrix(commute.originId, commute.destId)
      .then(setMatrix)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [commute?.originId, commute?.destId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { matrix, loading };
}
