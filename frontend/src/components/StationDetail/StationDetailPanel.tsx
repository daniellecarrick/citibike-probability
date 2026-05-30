import { useEffect, useRef } from 'react';
import { BarHistogram } from '../charts/BarHistogram';
import { HourLineChart } from '../charts/HourLineChart';
import { Ring } from '../charts/Ring';
import { WeekBars } from '../charts/WeekBars';
import { useStationDetail } from '../../hooks/useStationDetail';
import { useStore } from '../../store';
import { probabilityToColor, fmtPct } from '../../utils/colorScale';

const SCALE_DOTS = [0, 0.5, 1].map(v => probabilityToColor(v));

/** Placeholder hourly curve until a per-slot endpoint is added. */
function placeholderHourSlots(): number[] {
  return new Array(288).fill(0);
}

export function StationDetailPanel() {
  const { selectedStationId, selectStation, setCommute, setRailTab, selectedTime, focusStress, setFocusStress, selectedDay } = useStore();
  const { detail, loading } = useStationDetail();
  const stressRef = useRef<HTMLDivElement>(null);

  // Scroll to stress section when focusStress triggers
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

  // Reliability = weighted combo
  const reliability = bikeProb !== null && dockProb !== null && bikeStress !== null
    ? 0.46 * bikeProb + 0.30 * dockProb + 0.24 * (1 - bikeStress / 100)
    : null;

  const stressHigh = bikeStress !== null && bikeStress >= 42;
  const stressColor = probabilityToColor(bikeStress !== null ? 1 - bikeStress / 100 : null);

  const weekValues = new Array(7).fill(detail.probabilities.bikes.probability ?? 0);

  function handleSetOrigin() {
    setCommute(null);
    // Pre-fill origin then switch to commute tab
    setRailTab('commute');
    // Store will be updated via CommutePlanner's own state
  }

  function handleSetDest() {
    setRailTab('commute');
  }

  return (
    <div style={{ animation: 'slideIn .32s cubic-bezier(.22,1,.36,1)' }}>
      {/* Sticky header */}
      <div className="station-sticky-header">
        <div className="station-hood-eyebrow">
          Capacity: {detail.capacity ?? '—'} · {detail.distributions.bikes.sample_count} observations
        </div>
        <div className="station-name">{detail.station_name}</div>
        <div className="station-actions">
          <button className="btn-origin" onClick={handleSetOrigin}>Set as origin</button>
          <button className="btn-dest"   onClick={handleSetDest}>Set as destination</button>
        </div>
      </div>

      {/* 1. Current forecast rings */}
      <div className="detail-section">
        <div className="detail-section-title">Current forecast</div>
        <div className="rings-row">
          <div className="ring-tile">
            <Ring value={bikeProb} />
            <span className="ring-label">Bike</span>
          </div>
          <div className="ring-tile">
            <Ring value={dockProb} />
            <span className="ring-label">Dock</span>
          </div>
          <div className="ring-tile">
            <Ring value={reliability} />
            <span className="ring-label">Reliability</span>
          </div>
        </div>
      </div>

      {/* 2. Stress score */}
      <div className="detail-section" ref={stressRef}>
        <div className="detail-section-title">Stress score</div>
        <div
          className={`stress-section${focusStress ? ' focus-stress' : ''}`}
          style={{
            background: stressHigh ? `${stressColor}12` : '#fafbfc',
            borderColor: stressHigh ? stressColor : 'transparent',
            color: stressColor,
          }}
        >
          <div className="stress-headline">
            {bikeProb !== null ? `${Math.round(bikeProb * 100)}% chance of a bike` : '—'}
            {detail.distributions.bikes.median !== null
              ? ` — yet typically only ${detail.distributions.bikes.median.toFixed(1)} on hand`
              : ''}
          </div>
          {/* Percentile band */}
          <div className="pct-band">
            <div
              className="pct-band-fill"
              style={{
                left: `${(detail.distributions.bikes.p25 ?? 0) / (detail.capacity ?? 20) * 100}%`,
                width: `${((detail.distributions.bikes.p75 ?? 0) - (detail.distributions.bikes.p25 ?? 0)) / (detail.capacity ?? 20) * 100}%`,
                background: stressColor,
                opacity: 0.4,
              }}
            />
          </div>
          <div className="pct-band-labels">
            <span>Quietest</span>
            <span>Typical now</span>
            <span>Fullest</span>
          </div>
          <div className="stress-body" style={{ marginTop: 8, color: '#6c727e' }}>
            {stressHigh
              ? "There's almost always a bike here — but inventory runs thin, frequently just 1–2 when you arrive."
              : "Inventory here is comfortably deep. You're unlikely to be the last one."}
          </div>
        </div>
      </div>

      {/* 3. Probability by hour */}
      <div className="detail-section">
        <div className="detail-section-title">Probability by hour</div>
        <HourLineChart
          values={placeholderHourSlots()}
          currentSlot={Math.floor(selectedTime / 5)}
          width={340}
        />
      </div>

      {/* 4. Historical availability histogram */}
      <div className="detail-section">
        <div className="detail-section-title">Historical availability</div>
        <BarHistogram histogram={detail.distributions.bikes.histogram} />
      </div>

      {/* 5. Probability by day of week */}
      <div className="detail-section">
        <div className="detail-section-title">By day of week</div>
        <WeekBars values={weekValues} currentDay={selectedDay} />
      </div>

      {/* 6. Nearby stations */}
      <div className="detail-section">
        <div className="detail-section-title">Nearby alternatives</div>
        {detail.nearby_stations.map(s => {
          const dist = Math.round(
            Math.sqrt(s.dist_sq) * 111000 // rough degrees→meters
          );
          return (
            <div key={s.station_id} className="nearby-row" onClick={() => selectStation(s.station_id)}>
              <div className="nearby-dot" style={{ background: probabilityToColor(bikeProb) }} />
              <span className="nearby-name">{s.station_name}</span>
              <span className="nearby-dist">{dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`}</span>
              <span className="nearby-pct" style={{ color: probabilityToColor(bikeProb) }}>{fmtPct(bikeProb)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
