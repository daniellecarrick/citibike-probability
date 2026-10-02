import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Station } from '../types';

/** Static station identity (name, capacity, location) — unlike the old
 * per-time-slot detail endpoint, this doesn't depend on day/time. */
export function useStationInfo(stationId: string | null) {
  const [info, setInfo] = useState<Station | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stationId) { setInfo(null); return; }
    setLoading(true);
    api.stations.get(stationId)
      .then(setInfo)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [stationId]);

  return { info, loading };
}
