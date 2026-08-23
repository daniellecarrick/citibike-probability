import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useStore } from '../store';
import type { CommuteAvailabilitySeries, DayOfWeek } from '../types';

/**
 * Fetches the 5-min absolute-count series (bikes at origin, docks at
 * destination) for the current commute pair on the selected day. Unlike the
 * matrix, this is day-specific, so it refetches when selectedDay changes.
 */
export function useCommuteAvailabilitySeries() {
  const { commute, selectedDay } = useStore();
  const [series, setSeries] = useState<CommuteAvailabilitySeries | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!commute || !commute.originId || !commute.destId) { setSeries(null); return; }
    setLoading(true);
    api.commute.availabilitySeries(commute.originId, commute.destId, selectedDay as DayOfWeek)
      .then(setSeries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [commute?.originId, commute?.destId, selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  return { series, loading };
}
