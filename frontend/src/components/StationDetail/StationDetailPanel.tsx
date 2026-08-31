import { useEffect, useMemo, useRef } from 'react';
import { ProbabilityRibbon } from '../charts/ProbabilityRibbon';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { useStationInfo } from '../../hooks/useStationInfo';
import { useStore, METRIC_TO_API } from '../../store';
import { probabilityToColor, fmtPct } from '../../utils/colorScale';
import { api } from '../../api/client';
import { COMMUTE_WINDOWS, averageInWindow, formatTime } from '../../utils/time';
import type { BulkMapData, DayOfWeek } from '../../types';

const SCALE_DOTS = [0, 0.5, 1].map(v => probabilityToColor(v));
const [AM_WINDOW, PM_WINDOW] = COMMUTE_WINDOWS;

// "Probability by hour" always summarizes Mon–Fri, independent of whatever
// single day is selected in the map's day picker.
const WEEKDAYS: DayOfWeek[] = [0, 1, 2, 3, 4];

// Weighted (by sample_count) average of a station's per-slot probability
// across several day-bulk responses — pools Mon–Fri into one series instead
// of just picking a single day.
function weekdayAverageProbability(
  caches: (BulkMapData | undefined)[],
  stationId: string | null,
): (number | null)[] {
  const idxs = caches.map(c => (stationId ? c?.station_ids.indexOf(stationId) ?? -1 : -1));
  return Array.from({ length: 288 }, (_, slot) => {
    let sum = 0;
    let count = 0;
    caches.forEach((cached, i) => {
      const idx = idxs[i];
      if (!cached || idx === -1) return;
      const s = cached.slots[String(slot)];
      const c = s?.sample_count[idx] ?? 0;
      const p = s?.probability[idx];
      if (c > 0 && p !== null && p !== undefined) { sum += p * c; count += c; }
    });
    return count > 0 ? sum / count : null;
  });
}

function commuteEase(score: number | null): { label: string; color: string } {
  const color = probabilityToColor(score);
  if (score === null) return { label: 'Unknown', color: '#bbb' };
  if (score < 0.2)  return { label: 'Difficult', color };
  if (score < 0.45) return { label: 'Tough',      color };
  if (score < 0.7)  return { label: 'Doable',     color };
  return              { label: 'Easy',       color };
}

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
    selectedDay, selectedMetric, focusCommute, setFocusCommute,
    bulkCache, setBulkCache,
  } = useStore();

  // "Probability by hour" pools Mon–Fri regardless of the map's selected
  // day, so it fetches its own set of weekday bulk responses rather than
  // reusing the single-day cache entry the map itself relies on.
  const metricApi = METRIC_TO_API[selectedMetric] as 'bikes' | 'ebikes' | 'docks';
  useEffect(() => {
    for (const d of WEEKDAYS) {
      const key = `${d}_${metricApi}`;
      if (!bulkCache[key]) {
        api.map.bulk(d, metricApi).then(data => setBulkCache(key, data)).catch(console.error);
      }
      const dockKey = `${d}_docks`;
      if (!bulkCache[dockKey]) {
        api.map.bulk(d, 'docks').then(data => setBulkCache(dockKey, data)).catch(console.error);
      }
    }
  }, [metricApi, bulkCache, setBulkCache]);

  const hourValues = useMemo<(number | null)[]>(
    () => weekdayAverageProbability(WEEKDAYS.map(d => bulkCache[`${d}_${metricApi}`]), selectedStationId),
    [bulkCache, metricApi, selectedStationId],
  );

  // Dock availability is computed independently of the map's selected
  // metric, since a visitor viewing "bike" chances still wants dock chances.
  const dockHourValues = useMemo<(number | null)[]>(
    () => weekdayAverageProbability(WEEKDAYS.map(d => bulkCache[`${d}_docks`]), selectedStationId),
    [bulkCache, selectedStationId],
  );

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
  const commuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusCommute && commuteRef.current) {
      commuteRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => setFocusCommute(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [focusCommute, setFocusCommute]);

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
  if (!info) return <div className="loading">Station not found.</div>;

  const amBike = averageInWindow(hourValues, AM_WINDOW);
  const amDock = averageInWindow(dockHourValues, AM_WINDOW);
  const pmBike = averageInWindow(hourValues, PM_WINDOW);
  const pmDock = averageInWindow(dockHourValues, PM_WINDOW);

  const commuteScores = [amBike, amDock, pmBike, pmDock].filter((v): v is number => v !== null);
  const overallScore = commuteScores.length > 0
    ? commuteScores.reduce((a, b) => a + b, 0) / commuteScores.length
    : null;
  const ease = commuteEase(overallScore);

  return (
    <div style={{ animation: 'slideIn .32s cubic-bezier(.22,1,.36,1)' }}>
      {/* Sticky header */}
      <div className="station-sticky-header">
        <div className="station-hood-eyebrow">
          Capacity: {info.capacity ?? '—'}
        </div>

        <div className="station-header-row">
          <div className="station-name">{info.station_name}</div>
          <div
            className="station-status-badge"
            style={{
              color: ease.color,
              background: `${ease.color}18`,
              border: `1px solid ${ease.color}44`,
            }}
          >
            {ease.label}
          </div>
        </div>
      </div>

      {/* 1. Commute summary */}
      <div className="detail-section" ref={commuteRef}>
        <div
          className={`commute-section${focusCommute ? ' focus-commute' : ''}`}
        >
          <div className="commute-headline">
            {overallScore === null ? 'Not enough data for peak commute times' : `${ease.label} for the daily commute`}
          </div>
          <div className="commute-body" style={{ marginTop: 8, color: '#6c727e' }}>
            {AM_WINDOW.label} ({formatTime(AM_WINDOW.startSlot * 5)}–{formatTime(AM_WINDOW.endSlot * 5)}): {fmtPct(amBike)} chance of a bike, {fmtPct(amDock)} chance of a dock.
            <br />
            {PM_WINDOW.label} ({formatTime(PM_WINDOW.startSlot * 5)}–{formatTime(PM_WINDOW.endSlot * 5)}): {fmtPct(pmBike)} chance of a bike, {fmtPct(pmDock)} chance of a dock.
          </div>
        </div>
      </div>

      {/* 2. Probability of an available bike / dock by hour */}
      <div className="detail-section">
        <div className="detail-section-title">Probability by hour</div>
        <ProbabilityRibbon
          rows={[
            { label: 'BIKE', values: hourValues },
            { label: 'DOCK', values: dockHourValues },
          ]}
          width={412}
        />
      </div>

      {/* 3. Share of bikes vs. docks by hour, stacked by type */}
      <div className="detail-section">
        <div className="detail-section-title">Bikes &amp; docks by hour</div>
        <StackedAreaChart
          layers={[
            { label: 'Classic', color: '#1fa2ff', values: classicSharePct },
            { label: 'E-bike', color: '#2d5aff', values: ebikeSharePct },
            { label: 'Docks', color: '#aaaaaa', values: dockSharePct },
          ]}
          width={412}
          percentMode
        />
      </div>
    </div>
  );
}
