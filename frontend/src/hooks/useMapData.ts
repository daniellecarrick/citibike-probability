import { useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useStore } from '../store';

/**
 * Manages fetching and caching of map probability data.
 *
 * When animation is playing: pre-fetches the entire day's bulk data once,
 * then derives currentMapData from the cache on each time step.
 *
 * When static: fetches a single snapshot for the current day/time/metric.
 */
export function useMapData() {
  const {
    selectedDay,
    selectedTime,
    selectedMetric,
    bulkCache,
    setBulkCache,
    setCurrentMapData,
  } = useStore();


  const cacheKey = `${selectedDay}_${selectedMetric}`;
  const isFetchingBulk = useRef(false);

  // Serve from bulk cache when available
  useEffect(() => {
    const cached = bulkCache[cacheKey];
    if (cached) {
      const slot = Math.floor(selectedTime / 5);
      const slotData = cached[String(slot)];
      if (slotData) setCurrentMapData(slotData);
    }
  }, [selectedTime, bulkCache, cacheKey, setCurrentMapData]);

  // Pre-fetch bulk data when animation starts or metric/day changes
  useEffect(() => {
    if (bulkCache[cacheKey] || isFetchingBulk.current) return;

    isFetchingBulk.current = true;
    api.map
      .bulk(selectedDay, selectedMetric)
      .then((data) => {
        setBulkCache(cacheKey, data);
      })
      .catch(console.error)
      .finally(() => {
        isFetchingBulk.current = false;
      });
  }, [selectedDay, selectedMetric, cacheKey, bulkCache, setBulkCache]);

  // Fallback: fetch single snapshot if bulk cache not ready yet
  useEffect(() => {
    if (bulkCache[cacheKey]) return;

    api.map
      .snapshot(selectedDay, selectedTime, selectedMetric)
      .then(setCurrentMapData)
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, selectedTime, selectedMetric]);
}
