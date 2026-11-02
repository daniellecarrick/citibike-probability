import { useEffect, useMemo } from 'react';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { StationDayChart } from '../charts/StationDayChart';
import { TypicalRange } from './TypicalRange';
import { useStationContext } from '../../hooks/useStationContext';
import { useStationInfo } from '../../hooks/useStationInfo';
import { useStationDaySeries } from '../../hooks/useStationDaySeries';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useStore } from '../../store';
import { probabilityToColor, SCALE_FLOOR } from '../../utils/colorScale';
import { describeStationDay } from '../../utils/stationSummary';
import { api } from '../../api/client';
import { DAYS_FULL } from '../../utils/time';
import type { BulkMapData } from '../../types';

const SCALE_DOTS = [SCALE_FLOOR, (SCALE_FLOOR + 1) / 2, 1].map(v => probabilityToColor(v));
// /api/map/bulk is columnar (station_ids + parallel per-slot arrays, see
// types.ts) rather than one record per station per slot — look a station's
// value up by index instead of by equality search on every slot.
function bulkSeries(
  cached: BulkMapData | undefined,
  stationId: string | null,
  field: 'probability' | 'mean_inventory',
): (number | null)[] {
  const idx = stationId ? cached?.station_ids.indexOf(stationId) ?? -1 : -1;
  if (!cached || idx === -1) return Array(288).fill(null);
  return Array.from({ length: 288 }, (_, slot) => cached.slots[String(slot)]?.[field][idx] ?? null);
}

export function StationDetailPanel() {
  const {
    selectedStationId,
    selectedDay, selectedMetric, selectedTime,
    bulkCache, setBulkCache,
  } = useStore();

  // The "Bikes & docks by hour" chart below still follows the map's
  // selected day, so it fetches (and reuses) that single day's dock bulk.
  const dockCacheKey = `${selectedDay}_docks`;
  useEffect(() => {
    if (bulkCache[dockCacheKey]) return;
    api.map.bulk(selectedDay, 'docks')
      .then(data => setBulkCache(dockCacheKey, data))
      .catch(console.error);
  }, [dockCacheKey, selectedDay, bulkCache, setBulkCache]);

  // Classic + e-bike mean counts, stacked, for the "number of bikes" area chart.
  const classicCacheKey = `${selectedDay}_classic`;
  const ebikeCacheKey = `${selectedDay}_ebikes`;
  useEffect(() => {
    if (!bulkCache[classicCacheKey]) {
      api.map.bulk(selectedDay, 'classic')
        .then(data => setBulkCache(classicCacheKey, data))
        .catch(console.error);
    }
    if (!bulkCache[ebikeCacheKey]) {
      api.map.bulk(selectedDay, 'ebikes')
        .then(data => setBulkCache(ebikeCacheKey, data))
        .catch(console.error);
    }
  }, [classicCacheKey, ebikeCacheKey, selectedDay, bulkCache, setBulkCache]);

  const classicCountValues = useMemo<(number | null)[]>(
    () => bulkSeries(bulkCache[classicCacheKey], selectedStationId, 'mean_inventory'),
    [bulkCache, classicCacheKey, selectedStationId],
  );

  const ebikeCountValues = useMemo<(number | null)[]>(
    () => bulkSeries(bulkCache[ebikeCacheKey], selectedStationId, 'mean_inventory'),
    [bulkCache, ebikeCacheKey, selectedStationId],
  );

  // Dock counts reuse the bulk data already fetched for the dock probability chart above.
  const dockCountValues = useMemo<(number | null)[]>(
    () => bulkSeries(bulkCache[dockCacheKey], selectedStationId, 'mean_inventory'),
    [bulkCache, dockCacheKey, selectedStationId],
  );

  // Classic/e-bike/dock mean counts don't sum to capacity (each is averaged
  // independently), which reads as a bug in a stacked chart. Normalize each
  // slot to a share of that slot's total so the stack always sums to 100%.
  const [classicSharePct, ebikeSharePct, dockSharePct] = useMemo<[number[], number[], number[]]>(() => {
    const classic: number[] = [];
    const ebike: number[] = [];
    const dock: number[] = [];
    for (let slot = 0; slot < 288; slot++) {
      const c = classicCountValues[slot] ?? 0;
      const e = ebikeCountValues[slot] ?? 0;
      const d = dockCountValues[slot] ?? 0;
      const total = c + e + d;
      classic.push(total > 0 ? (c / total) * 100 : 0);
      ebike.push(total > 0 ? (e / total) * 100 : 0);
      dock.push(total > 0 ? (d / total) * 100 : 0);
    }
    return [classic, ebike, dock];
  }, [classicCountValues, ebikeCountValues, dockCountValues]);

  const { info, loading } = useStationInfo(selectedStationId);
  // The same line as the map's hover tooltip, for the map's selected day and metric.
  const { series, metricPhrase, formatValue } = useStationDaySeries(selectedStationId, info?.capacity);
  const headline = useMemo(() => describeStationDay(series, selectedMetric), [series, selectedMetric]);
  const context = useStationContext(selectedStationId);
  // Charts render at the panel's real width (the desktop rail is 480px; the
  // mobile sheet is the phone's width), so they never clip or scale text.
  const [chartBoxRef, chartWidth] = useElementWidth(412);

  if (!selectedStationId) {
    return (
      <div className="station-empty" style={{ animation: 'fadeUp .5s ease' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          {SCALE_DOTS.map((c, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <div className="station-empty-headline">Select a station</div>
        <div className="station-empty-body">
          Tap any station on the map to see its details.
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading">Loading station data…</div>;
  if (!info) return <div className="loading">Station not found.</div>;

  return (
    <div style={{ animation: 'slideIn .32s cubic-bezier(.22,1,.36,1)' }}>
      {/* Sticky header */}
      <div className="station-sticky-header">
        <div className="station-hood-eyebrow">
          Capacity: {info.capacity ?? '—'}
        </div>

        <div className="station-header-row">
          <div className="station-name">{info.station_name}</div>
        </div>
      </div>

      {/* 1. The station's day, for the map's selected day and metric */}
      <div className="detail-section">
        <div className="station-day-headline">{headline ?? 'Not enough data yet for this day'}</div>
        <div className="station-day-sub">{DAYS_FULL[selectedDay]}s · {metricPhrase.toLowerCase()} through the day</div>
        <StationDayChart series={series} selectedTime={selectedTime} variant="full" formatValue={formatValue} />
      </div>

      {/* 2. The typical count right now, as a range on 0 → capacity */}
      <div className="detail-section">
        <div className="detail-section-title">At this time</div>
        {context ? <TypicalRange context={context} selectedTime={selectedTime} /> : <div className="typical-range-empty">Loading…</div>}
      </div>


      {/* 3. Share of bikes vs. docks by hour, stacked by type */}
      <div className="detail-section" ref={chartBoxRef}>
        <div className="detail-section-title">Bikes &amp; docks by hour</div>
        <StackedAreaChart
          layers={[
            { label: 'Classic', color: '#1fa2ff', values: classicSharePct },
            { label: 'E-bike', color: '#2d5aff', values: ebikeSharePct },
            { label: 'Docks', color: '#aaaaaa', values: dockSharePct },
          ]}
          width={chartWidth}
          percentMode
        />
      </div>
    </div>
  );
}
