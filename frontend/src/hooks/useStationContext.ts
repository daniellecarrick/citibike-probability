import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useStore, type Metric } from '../store';
import type { StationContext } from '../types';

/** % Full is bikes ÷ docks, so its typical range is described in bikes. */
export const CONTEXT_METRIC: Record<Metric, 'bikes' | 'ebikes' | 'docks'> = {
  bike: 'bikes', ebike: 'ebikes', dock: 'docks', fullness: 'bikes', reliability: 'bikes', stress: 'bikes',
};

/**
 * Typical range for the side panel, at the map's
 * selected day, time and metric. Waits briefly before fetching so dragging
 * the time or playing the animation doesn't fire a request per step.
 */
export function useStationContext(stationId: string | null) {
  const { selectedDay, selectedTime, selectedMetric } = useStore();
  const [context, setContext] = useState<StationContext | null>(null);
  const metric = CONTEXT_METRIC[selectedMetric];

  useEffect(() => {
    if (!stationId) { setContext(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      api.stations.context(stationId, selectedDay, selectedTime, metric)
        .then(c => { if (!cancelled) setContext(c); })
        .catch(console.error);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [stationId, selectedDay, selectedTime, metric]);

  // Drop a previous station's data the moment the selection changes.
  return context && context.station_id === stationId ? context : null;
}
