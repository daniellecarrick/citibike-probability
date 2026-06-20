import { useEffect, useMemo, useRef, useState } from 'react';
import { BarHistogram } from '../charts/BarHistogram';
import { HourLineChart } from '../charts/HourLineChart';
import { WeekBars } from '../charts/WeekBars';
import { useStationDetail } from '../../hooks/useStationDetail';
import { useStore, METRIC_TO_API } from '../../store';
import { probabilityToColor, fmtPct } from '../../utils/colorScale';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SCALE_DOTS = [0, 0.5, 1].map(v => probabilityToColor(v));

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
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
    selectedStationId, selectStation, setCommute, setRailTab,
    selectedTime, selectedDay, selectedMetric, focusStress, setFocusStress,
    bulkCache,
  } = useStore();

  const cacheKey = `${selectedDay}_${METRIC_TO_API[selectedMetric]}`;
  const hourValues = useMemo<number[]>(() => {
    const cached = bulkCache[cacheKey];
    if (!cached || !selectedStationId) return Array(288).fill(0);
    return Array.from({ length: 288 }, (_, slot) =>
      cached[String(slot)]?.find(s => s.station_id === selectedStationId)?.probability ?? 0
    );
  }, [bulkCache, cacheKey, selectedStationId]);
  const { detail, loading } = useStationDetail();
  const stressRef = useRef<HTMLDivElement>(null);
  const [panelMode, setPanelMode] = useState<'pickup' | 'dropoff'>('pickup');

  useEffect(() => { setPanelMode('pickup'); }, [selectedStationId]);

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
          Click any station on the map to see its forecast, reliability, hourly pattern, and stress profile.
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading">Loading station data…</div>;
  if (!detail) return <div className="loading">Station not found.</div>;

  const bikeProb   = detail.probabilities.bikes.probability;
  const dockProb   = detail.probabilities.docks.probability;
  const bikeStress = detail.stress_scores.bikes.stress_score;

  const isDropoff  = panelMode === 'dropoff';
  const activeProb = isDropoff ? dockProb : bikeProb;
  const status     = statusLabel(activeProb);

  const stressHigh  = bikeStress !== null && bikeStress >= 42;
  const stressColor = probabilityToColor(bikeStress !== null ? 1 - bikeStress / 100 : null);
  const dockColor   = probabilityToColor(dockProb);

  const activeDist = isDropoff ? detail.distributions.docks : detail.distributions.bikes;
  const weekValues = new Array(7).fill(bikeProb ?? 0);

  function handleSetOrigin() {
    setPanelMode('pickup');
    setCommute(null);
    setRailTab('commute');
  }

  function handleSetDest() {
    setPanelMode('dropoff');
    setRailTab('commute');
  }

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

        <div className="station-time-line">
          {formatTime(selectedTime)} · {DAY_NAMES[selectedDay]}
          {isDropoff && <span className="station-mode-tag"> · docking</span>}
        </div>

        <div className="station-actions">
          <button className={isDropoff ? 'btn-dest' : 'btn-origin'} onClick={handleSetOrigin}>
            Set as origin
          </button>
          <button className={isDropoff ? 'btn-origin' : 'btn-dest'} onClick={handleSetDest}>
            Set as destination
          </button>
        </div>
      </div>

      {/* 1. Forecast / stress section — adapts to pickup vs dropoff */}
      <div className="detail-section" ref={stressRef}>
        <div className="detail-section-title">
          {isDropoff ? 'Chance of docking' : 'Chance of a bike'}
        </div>
        <div
          className={`stress-section${focusStress ? ' focus-stress' : ''}`}
          style={{
            background: !isDropoff && stressHigh ? `${stressColor}12` : '#fafbfc',
            borderColor: !isDropoff && stressHigh ? stressColor : 'transparent',
            color: isDropoff ? dockColor : stressColor,
          }}
        >
          <div className="stress-headline">
            {isDropoff
              ? (dockProb !== null
                  ? `${Math.round(dockProb * 100)}% chance of a free dock`
                  : '—')
              : (bikeProb !== null
                  ? `${Math.round(bikeProb * 100)}% chance of a bike`
                  : '—')
            }
            {!isDropoff && bikeProb !== null && bikeProb > 0.5 &&
             detail.distributions.bikes.median !== null && detail.distributions.bikes.median < 3
              ? ` — but typically only ${detail.distributions.bikes.median.toFixed(1)} on hand`
              : ''}
          </div>

          <div className="pct-band">
            <div
              className="pct-band-fill"
              style={{
                left:  `${(activeDist.p25 ?? 0) / (detail.capacity ?? 20) * 100}%`,
                width: `${((activeDist.p75 ?? 0) - (activeDist.p25 ?? 0)) / (detail.capacity ?? 20) * 100}%`,
                background: isDropoff ? dockColor : stressColor,
                opacity: 0.4,
              }}
            />
          </div>
          <div className="pct-band-labels">
            <span>Quietest</span>
            <span>{isDropoff ? 'Typical docks' : 'Typical now'}</span>
            <span>Fullest</span>
          </div>
          <div className="stress-body" style={{ marginTop: 8, color: '#6c727e' }}>
            {isDropoff
              ? (dockProb !== null && dockProb >= 0.5
                  ? "Docks are usually available here at this time."
                  : "Docks can fill up at this hour — consider a nearby station as a backup.")
              : (bikeProb === null || bikeProb < 0.2
                  ? "Bikes are rarely available at this time."
                  : stressHigh
                    ? "There's almost always a bike here — but inventory runs thin, frequently just 1–2 when you arrive."
                    : "Inventory here is comfortably deep. You're unlikely to be the last one.")}
          </div>
        </div>
      </div>

      {/* 2. Probability by hour */}
      <div className="detail-section">
        <div className="detail-section-title">Probability by hour</div>
        <HourLineChart
          values={hourValues}
          currentSlot={Math.floor(selectedTime / 5)}
          width={340}
        />
      </div>

      {/* 3. Historical availability histogram */}
      <div className="detail-section">
        <div className="detail-section-title">Historical availability</div>
        <BarHistogram histogram={activeDist.histogram} />
      </div>

      {/* 4. Probability by day of week */}
      <div className="detail-section">
        <div className="detail-section-title">By day of week</div>
        <WeekBars values={weekValues} currentDay={selectedDay} />
      </div>

      {/* 5. Nearby stations */}
      <div className="detail-section">
        <div className="detail-section-title">Nearby alternatives</div>
        {detail.nearby_stations.map(s => {
          const dist = Math.round(Math.sqrt(s.dist_sq) * 111000);
          return (
            <div key={s.station_id} className="nearby-row" onClick={() => selectStation(s.station_id)}>
              <div className="nearby-dot" style={{ background: probabilityToColor(activeProb) }} />
              <span className="nearby-name">{s.station_name}</span>
              <span className="nearby-dist">{dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`}</span>
              <span className="nearby-pct" style={{ color: probabilityToColor(activeProb) }}>{fmtPct(activeProb)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
