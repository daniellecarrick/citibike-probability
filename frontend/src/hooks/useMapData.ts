import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useStore, METRIC_TO_API } from '../store';
import type { DayOfWeek, Station, StationProbability } from '../types';

export function useMapData(stations: Station[] = []) {
  const {
    selectedDay,
    selectedTime,
    selectedMetric,
    bulkCache,
    setBulkCache,
    setCurrentMapData,
    setMapDataLoading,
  } = useStore();

  const apiMetric = METRIC_TO_API[selectedMetric] as 'bikes' | 'ebikes' | 'docks';
  const cacheKey = `${selectedDay}_${apiMetric}`;
  const isFetchingBulk = useRef(false);
  const selectedTimeRef = useRef(selectedTime);
  selectedTimeRef.current = selectedTime;

  // The bulk endpoint returns slim entries (station_id + numbers only) to
  // avoid repeating static station fields across all 288 slots — join them
  // back against the already-fetched stations list here.
  const stationById = useMemo(
    () => new Map(stations.map(s => [s.station_id, s])),
    [stations],
  );

  // Increments when the browser comes back online, triggering failed fetches to retry.
  const [retryAt, setRetryAt] = useState(0);
  useEffect(() => {
    const handler = () => setRetryAt(Date.now());
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);

  // Serve from bulk cache when available
  useEffect(() => {
    const cached = bulkCache[cacheKey];
    if (cached) {
      const slot = Math.floor(selectedTime / 5);
      const slotData = cached[String(slot)];
      if (slotData && stationById.size > 0) {
        const merged: StationProbability[] = [];
        for (const sp of slotData) {
          const station = stationById.get(sp.station_id);
          if (station) merged.push({ ...station, ...sp });
        }
        setCurrentMapData(merged);
      }
    }
  }, [selectedTime, bulkCache, cacheKey, stationById, setCurrentMapData]);

  // Pre-fetch bulk data
  useEffect(() => {
    if (bulkCache[cacheKey]) { setMapDataLoading(false); return; }
    if (isFetchingBulk.current) return;
    isFetchingBulk.current = true;
    setMapDataLoading(true);
    api.map
      .bulk(selectedDay as DayOfWeek, apiMetric)
      .then(data => setBulkCache(cacheKey, data))
      .catch(console.error)
      .finally(() => { isFetchingBulk.current = false; setMapDataLoading(false); });
  // retryAt is intentionally included so a network recovery re-triggers this
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, apiMetric, cacheKey, bulkCache, setBulkCache, setMapDataLoading, retryAt]);

  // Fallback single snapshot — fires once per (day, metric) change, not on every time scrub,
  // so the bulk fetch and snapshot don't compete with a flood of per-slot requests.
  useEffect(() => {
    if (bulkCache[cacheKey]) return;
    api.map
      .snapshot(selectedDay as DayOfWeek, selectedTimeRef.current, apiMetric)
      .then(setCurrentMapData)
      .catch(console.error);
  // selectedTimeRef.current is intentionally read inside without being a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, apiMetric, cacheKey, retryAt]);
}
