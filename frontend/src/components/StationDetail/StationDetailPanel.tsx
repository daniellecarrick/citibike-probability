import { useEffect, useMemo, useRef } from 'react';
import { HourLineChart } from '../charts/HourLineChart';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { useStationDetail } from '../../hooks/useStationDetail';
import { useStore, METRIC_TO_API } from '../../store';
import { probabilityToColor } from '../../utils/colorScale';
import { api } from '../../api/client';
import type { BulkMapData } from '../../types';

const SCALE_DOTS = [0, 0.5, 1].map(v => probabilityToColor(v));

// /api/map/bulk is columnar (station_ids + parallel per-slot arrays, see
// types.ts) rather than one record per station per slot — look a station's
// value up by index instead of by equality search on every slot.
function bulkSeries(
  cached: BulkMapData | undefined,
  stationId: string | null,
  field: 'probability' | 'mean_inventory',
): number[] {
  const idx = stationId ? cached?.station_ids.indexOf(stationId) ?? -1 : -1;
  if (!cached || idx === -1) return Array(288).fill(0);
  return Array.from({ length: 288 }, (_, slot) => cached.slots[String(slot)]?.[field][idx] ?? 0);
}

function statusLabel(prob: number | null): { label: string; color: string } {
  const color = probabilityToColor(prob);
  if (prob === null) return { label: '—', color: '#bbb' };
  if (prob < 0.2)  return { label: 'Unlikely', color };
  if (prob < 0.45) return { label: 'Maybe',    color };
  if (prob < 0.7)  return { label: 'Good',     color };
  return              { label: 'Great',    color };
}

export function StationDetailPanel() {
  const {
    selectedStationId,
    selectedTime, selectedDay, selectedMetric, focusStress, setFocusStress,
    bulkCache, setBulkCache,
  } = useStore();

  const cacheKey = `${selectedDay}_${METRIC_TO_API[selectedMetric]}`;
  const hourValues = useMemo<number[]>(
    () => bulkSeries(bulkCache[cacheKey], selectedStationId, 'probability'),
    [bulkCache, cacheKey, selectedStationId],
  );

  // Dock availability is fetched independently of the map's selected metric,
  // since a visitor viewing "bike" chances still wants to see dock chances.
  const dockCacheKey = `${selectedDay}_docks`;
  useEffect(() => {
    if (bulkCache[dockCacheKey]) return;
    api.map.bulk(selectedDay, 'docks')
      .then(data => setBulkCache(dockCacheKey, data))
      .catch(console.error);
  }, [dockCacheKey, selectedDay, bulkCache, setBulkCache]);

  const dockHourValues = useMemo<number[]>(
    () => bulkSeries(bulkCache[dockCacheKey], selectedStationId, 'probability'),
    [bulkCache, dockCacheKey, selectedStationId],
  );

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

  const classicCountValues = useMemo<number[]>(
    () => bulkSeries(bulkCache[classicCacheKey], selectedStationId, 'mean_inventory'),
    [bulkCache, classicCacheKey, selectedStationId],
  );

  const ebikeCountValues = useMemo<number[]>(
    () => bulkSeries(bulkCache[ebikeCacheKey], selectedStationId, 'mean_inventory'),
    [bulkCache, ebikeCacheKey, selectedStationId],
  );

  // Dock counts reuse the bulk data already fetched for the dock probability chart above.
  const dockCountValues = useMemo<number[]>(
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

  const { detail, loading } = useStationDetail();
  const stressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusStress && stressRef.current) {
      stressRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => setFocusStress(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [focusStress, setFocusStress]);

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
          Click any station on the map to see its details.
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading">Loading station data…</div>;
  if (!detail) return <div className="loading">Station not found.</div>;

  const bikeProb   = detail.probabilities.bikes.probability;
  const bikeStress = detail.stress_scores.bikes.stress_score;

  const activeProb = bikeProb;
  const status     = statusLabel(activeProb);

  const stressHigh  = bikeStress !== null && bikeStress >= 42;

  return (
    <div style={{ animation: 'slideIn .32s cubic-bezier(.22,1,.36,1)' }}>
      {/* Sticky header */}
      <div className="station-sticky-header">
        <div className="station-hood-eyebrow">
          Capacity: {detail.capacity ?? '—'} · {detail.distributions.bikes.sample_count} observations
        </div>

        <div className="station-header-row">
          <div className="station-name">{detail.station_name}</div>
          <div
            className="station-status-badge"
            style={{
              color: status.color,
              background: `${status.color}18`,
              border: `1px solid ${status.color}44`,
            }}
          >
            {status.label}
          </div>
        </div>

        {/* <div className="station-time-line">
          {formatTime(selectedTime)} · {DAY_NAMES[selectedDay]}
        </div> */}
      </div>

      {/* 1. Forecast / stress section */}
      <div className="detail-section" ref={stressRef}>
        <div
          className={`stress-section${focusStress ? ' focus-stress' : ''}`}
        >
          <div className="stress-headline">
            {bikeProb !== null ? `${Math.round(bikeProb * 100)}% chance of a bike` : '—'}
            {bikeProb !== null && bikeProb > 0.5 &&
             detail.distributions.bikes.median !== null && detail.distributions.bikes.median < 3
              ? ` — but typically only ${detail.distributions.bikes.median.toFixed(1)} on hand`
              : ''}
          </div>
          <div className="stress-body" style={{ marginTop: 8, color: '#6c727e' }}>
            {bikeProb === null || bikeProb < 0.2
              ? "Bikes are rarely available at this time."
              : stressHigh
                ? "There's almost always a bike here — but inventory runs thin, frequently just 1–2 when you arrive."
                : "Inventory here is comfortably deep. You're unlikely to be the last one."}
          </div>
        </div>
      </div>

      {/* 2. Probability by hour */}
      <div className="detail-section">
        <div className="detail-section-title">Probability of an available bike</div>
        <HourLineChart
          values={hourValues}
          currentSlot={Math.floor(selectedTime / 5)}
          width={340}
        />
      </div>

      {/* 3. Probability of finding a dock by hour */}
      <div className="detail-section">
        <div className="detail-section-title">Probability of an available dock</div>
        <HourLineChart
          values={dockHourValues}
          currentSlot={Math.floor(selectedTime / 5)}
          width={340}
          gradientId="hlc-grad-dock"
        />
      </div>

      {/* 4. Share of bikes vs. docks by hour, stacked by type */}
      <div className="detail-section">
        <div className="detail-section-title">Bikes &amp; docks by hour</div>
        <StackedAreaChart
          layers={[
            { label: 'Classic', color: '#1fa2ff', values: classicSharePct },
            { label: 'E-bike', color: '#2d5aff', values: ebikeSharePct },
            { label: 'Docks', color: '#aaaaaa', values: dockSharePct },
          ]}
          currentSlot={Math.floor(selectedTime / 5)}
          width={340}
          percentMode
        />
      </div>

      {/* 5. Historical availability histogram */}
      {/* <div className="detail-section">
        <div className="detail-section-title">Historical availability</div>
        <BarHistogram histogram={activeDist.histogram} />
      </div> */}
    </div>
  );
}
