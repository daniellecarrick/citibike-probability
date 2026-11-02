import { useMemo } from 'react';
import { useStore, METRIC_LABEL, METRIC_TO_API } from '../store';

export interface StationDaySeries {
  /** 288 five-minute values (0–1) for the map's selected day and metric; null where there's no data. */
  series: (number | null)[];
  isFullness: boolean;
  /** "E-Bike availability", "Fullness", … */
  metricPhrase: string;
  /** Formats one value the way this metric reads: "72% full" or "92% chance". */
  formatValue: (v: number | null | undefined) => string;
}

const EMPTY: (number | null)[] = Array.from({ length: 288 }, () => null);

/**
 * A station's whole day, for the map's selected day and metric, read from
 * the bulk cache the map has already loaded. Shared by the map's hover
 * tooltip and the station side panel so the two always show the same line.
 */
export function useStationDaySeries(stationId: string | null, capacityHint?: number | null): StationDaySeries {
  const { bulkCache, selectedDay, selectedMetric, currentMapData } = useStore();
  const cached = bulkCache[`${selectedDay}_${METRIC_TO_API[selectedMetric]}`];
  const isFullness = selectedMetric === 'fullness';
  // % Full is average bikes ÷ docks, the same value the map colors the dot by.
  const capacity = isFullness && stationId
    ? currentMapData.find(s => s.station_id === stationId)?.capacity ?? capacityHint ?? null
    : null;

  // Bulk data is columnar (station_ids + parallel per-slot arrays): look the
  // station up by index once rather than by equality search on every slot.
  const series = useMemo<(number | null)[]>(() => {
    const idx = stationId ? cached?.station_ids.indexOf(stationId) ?? -1 : -1;
    if (!cached || idx === -1) return EMPTY;
    // % Full borrows the bike metric's bulk data, so its `probability` field is
    // "chance of 2+ bikes", not fullness. Use bikes ÷ docks instead.
    if (isFullness) {
      if (!capacity) return EMPTY;
      return Array.from({ length: 288 }, (_, slot) => {
        const bikes = cached.slots[String(slot)]?.mean_inventory[idx];
        return bikes == null ? null : Math.min(1, bikes / capacity);
      });
    }
    return Array.from({ length: 288 }, (_, slot) => cached.slots[String(slot)]?.probability[idx] ?? null);
  }, [cached, stationId, isFullness, capacity]);

  return {
    series,
    isFullness,
    metricPhrase: isFullness ? 'Fullness' : `${METRIC_LABEL[selectedMetric]} availability`,
    formatValue: v => (v === null || v === undefined
      ? 'no data'
      : isFullness ? `${Math.round(v * 100)}% full` : `${Math.round(v * 100)}% chance`),
  };
}
