import { useState, useRef, useEffect } from 'react';
import { useCommute } from '../../hooks/useCommute';
import { useStore } from '../../store';
import { probabilityToColor, fmtPct } from '../../utils/colorScale';
import { RecommendationList } from './RecommendationList';
import type { Station } from '../../types';

const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function reliabilityLabel(p: number | null): string {
  if (p === null) return '';
  if (p >= 0.85) return 'High reliability';
  if (p >= 0.65) return 'Moderate reliability';
  return 'Low reliability';
}

function forecastSentence(p: number | null): string {
  if (p === null) return 'Not enough data to forecast.';
  if (p >= 0.85) return 'You can count on this commute most days.';
  if (p >= 0.65) return 'Usually works out, but have a backup plan.';
  if (p >= 0.40) return 'Roughly a coin flip — consider leaving a bit earlier.';
  return 'Risky. Bikes or docks are often unavailable at this time.';
}

/** Searchable station dropdown */
function StationCombo({
  stations,
  value,
  onChange,
  dotColor,
  placeholder,
}: {
  stations: Station[];
  value: string;
  onChange: (id: string) => void;
  dotColor: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = stations.find(s => s.station_id === value);

  const filtered = query
    ? stations.filter(s => s.station_name.toLowerCase().includes(query.toLowerCase())).slice(0, 40)
    : stations.slice(0, 40);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        className={`station-combo${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <div className="station-combo-dot" style={{ background: dotColor }} />
        <div className="station-combo-text">
          {selected ? (
            <>
              <div className="station-combo-name">{selected.station_name}</div>
            </>
          ) : (
            <div className="station-combo-placeholder">{placeholder}</div>
          )}
        </div>
      </div>
      {open && (
        <div className="station-dropdown">
          <div className="station-dropdown-search">
            <input
              autoFocus
              placeholder="Search stations…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          {filtered.map(s => (
            <div
              key={s.station_id}
              className="station-dropdown-item"
              onClick={() => { onChange(s.station_id); setOpen(false); setQuery(''); }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
              {s.station_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  stations: Station[];
}

export function CommutePlanner({ stations }: Props) {
  const { commute, setCommute, selectedDay, selectedTime, setDay, setTime, setMapMode } = useStore();
  const { result, recommendations, loading } = useCommute();

  const [originId, setOriginId] = useState(commute?.originId ?? '');
  const [destId,   setDestId]   = useState(commute?.destId   ?? '');
  const [bikeType, setBikeType] = useState<'any' | 'classic' | 'ebike'>('any');

  // Sync if commute changes externally (e.g. from station panel)
  useEffect(() => {
    if (commute) {
      setOriginId(commute.originId);
      setDestId(commute.destId);
    }
  }, [commute]);

  function handleCalc() {
    if (originId && destId) setCommute({ originId, destId, bikeType });
  }

  function handleSwap() {
    setOriginId(destId);
    setDestId(originId);
    if (commute) setCommute({ originId: destId, destId: originId, bikeType });
  }

  function handleSample() {
    setMapMode('stations');
    setDay(1); // Tuesday
    setTime(510); // 8:30 AM
    // Pick first two stations as sample
    if (stations.length >= 2) {
      setCommute({ originId: stations[0].station_id, destId: stations[1].station_id, bikeType: 'any' });
      setOriginId(stations[0].station_id);
      setDestId(stations[1].station_id);
    }
  }

  const hasCommute = result !== null;
  const p = result?.success_probability ?? null;
  const pColor = probabilityToColor(p);

  return (
    <>
      {/* Planner card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span className="card-title" style={{ marginBottom: 0 }}>Plan your commute</span>
          <button className="swap-btn" onClick={handleSwap} title="Swap origin and destination">⇅</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StationCombo
            stations={stations}
            value={originId}
            onChange={setOriginId}
            dotColor="#16181d"
            placeholder="Choose origin station…"
          />
          <StationCombo
            stations={stations}
            value={destId}
            onChange={setDestId}
            dotColor={probabilityToColor(0.95)}
            placeholder="Choose destination…"
          />

          <div>
            <span className="field-label">Day</span>
            <select
              className="field-select"
              value={selectedDay}
              onChange={e => setDay(Number(e.target.value) as 0|1|2|3|4|5|6)}
            >
              {DAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>

          <div>
            <span className="field-label">Departure time</span>
            <div className="time-stepper">
              <button className="stepper-btn" onClick={() => setTime((selectedTime - 30 + 1440) % 1440)}>−</button>
              <span className="stepper-value">{formatTime(selectedTime)}</span>
              <button className="stepper-btn" onClick={() => setTime((selectedTime + 30) % 1440)}>+</button>
            </div>
          </div>

          <div>
            <span className="field-label">Bike type</span>
            <div className="segmented">
              {(['any', 'classic', 'ebike'] as const).map(t => (
                <button
                  key={t}
                  className={`segmented-btn${bikeType === t ? ' active' : ''}`}
                  onClick={() => setBikeType(t)}
                >
                  {t === 'any' ? 'Any Bike' : t === 'classic' ? 'Classic' : 'E-Bike'}
                </button>
              ))}
            </div>
          </div>

          <button
            className="cta-btn"
            style={{ width: '100%', textAlign: 'center', marginBottom: 0 }}
            disabled={!originId || !destId}
            onClick={handleCalc}
          >
            Get forecast
          </button>
        </div>
      </div>

      {/* Empty state / result */}
      {!hasCommute && !loading && (
        <div className="card">
          <div className="empty-eyebrow">The Forecast</div>
          <div className="empty-headline">Can you rely on Citi Bike for this trip?</div>
          <div className="empty-body">
            We analyzed millions of station observations to predict where bikes and docks are likely
            to be available throughout the week.
            <br /><br />
            Pick an origin and destination above to get your commute forecast — or scrub through the
            day and watch the city breathe.
          </div>
          <button className="cta-btn" onClick={handleSample}>
            Try a sample commute →
          </button>
          <div className="scale-hint">
            {[0, 0.5, 1].map(v => (
              <div key={v} style={{ width: 10, height: 10, borderRadius: '50%', background: probabilityToColor(v) }} />
            ))}
            <span>Pink means scarce, blue means plentiful</span>
          </div>
        </div>
      )}

      {loading && <div className="loading">Calculating forecast…</div>}

      {hasCommute && result && (
        <>
          {/* Forecast card */}
          <div className="card forecast-card">
            <div className="forecast-header">
              <div className="forecast-eyebrow">
                {DAYS_FULL[selectedDay]} · {formatTime(selectedTime)}
              </div>
              <div className="forecast-title">Your commute forecast</div>
            </div>

            <div className="forecast-hero">
              <div className="big-stat-row">
                <span className="big-stat-number" style={{ color: pColor }}>
                  {p !== null ? Math.round(p * 100) : '—'}
                </span>
                <span className="big-stat-pct" style={{ color: pColor }}>%</span>
              </div>
              <div
                className="reliability-badge"
                style={{ background: `${pColor}20`, color: pColor, marginBottom: 8 }}
              >
                {reliabilityLabel(p)}
              </div>
              <div className="forecast-sentence">{forecastSentence(p)}</div>
            </div>

            <div className="substat-strip">
              <div className="substat">
                <div className="substat-value" style={{ color: probabilityToColor(result.bike_probability) }}>
                  {fmtPct(result.bike_probability)}
                </div>
                <div className="substat-label">Bike avail.</div>
              </div>
              <div className="substat">
                <div className="substat-value" style={{ color: probabilityToColor(result.dock_probability) }}>
                  {fmtPct(result.dock_probability)}
                </div>
                <div className="substat-label">Dock avail.</div>
              </div>
              <div className="substat">
                <div className="substat-value" style={{ color: '#16181d' }}>
                  {result.travel_minutes}
                </div>
                <div className="substat-label">min ride</div>
              </div>
            </div>

            <div className="tip-row">
              💡 Departs {result.departure_time} · arrives ~{result.arrival_time}
            </div>
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <RecommendationList recommendations={recommendations} currentTime={selectedTime} />
          )}
        </>
      )}
    </>
  );
}
