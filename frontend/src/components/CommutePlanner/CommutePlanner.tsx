import { useState, useRef, useEffect } from 'react';
import { useCommute } from '../../hooks/useCommute';
import { useStore } from '../../store';
import { probabilityToColor, fmtPct } from '../../utils/colorScale';
import { RecommendationList } from './RecommendationList';
import { useSavedCommutes } from '../../hooks/useSavedCommutes';
import type { SavedCommute } from '../../hooks/useSavedCommutes';
import type { Station } from '../../types';

type SavedItem = SavedCommute & { kind: 'starred' | 'recent' };

const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAYS_PILLS = [
  { letter: 'M', value: 0 },
  { letter: 'T', value: 1 },
  { letter: 'W', value: 2 },
  { letter: 'T', value: 3 },
  { letter: 'F', value: 4 },
  { letter: 'S', value: 5 },
  { letter: 'S', value: 6 },
] as const;

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
  const { recent, starred, addRecent, toggleStar, isStarred, removeRecent } = useSavedCommutes();

  const [originId, setOriginId] = useState(commute?.originId ?? '');
  const [destId,   setDestId]   = useState(commute?.destId   ?? '');
  const [bikeType, setBikeType] = useState<'any' | 'classic' | 'ebike'>('any');
  const [savedOpen, setSavedOpen] = useState(false);

  const savedWrapRef = useRef<HTMLDivElement>(null);

  // Sync if commute changes externally (e.g. from station panel)
  useEffect(() => {
    if (commute) {
      setOriginId(commute.originId);
      setDestId(commute.destId);
    }
  }, [commute]);

  useEffect(() => {
    if (!savedOpen) return;
    function onOutside(e: MouseEvent) {
      if (savedWrapRef.current && !savedWrapRef.current.contains(e.target as Node)) {
        setSavedOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [savedOpen]);

  const starredItems: SavedItem[] = starred.map(c => ({ ...c, kind: 'starred' as const }));
  const recentItems: SavedItem[]  = recent
    .filter(c => !isStarred(c.originId, c.destId))
    .map(c => ({ ...c, kind: 'recent' as const }));
  const allSaved: SavedItem[] = [...starredItems, ...recentItems].slice(0, 5);

  function makeSaved() {
    const o = stations.find(s => s.station_id === originId);
    const d = stations.find(s => s.station_id === destId);
    if (!o || !d) return null;
    return { originId, originName: o.station_name, destId, destName: d.station_name, bikeType, savedAt: Date.now() };
  }

  function handleCalc() {
    if (!originId || !destId) return;
    setCommute({ originId, destId, bikeType });
    const saved = makeSaved();
    if (saved) addRecent(saved);
  }

  function handleStar() {
    const saved = makeSaved();
    if (saved) toggleStar(saved);
  }

  function handleLoadSaved(c: { originId: string; destId: string; bikeType: 'any' | 'classic' | 'ebike' }) {
    setOriginId(c.originId);
    setDestId(c.destId);
    setBikeType(c.bikeType);
    setCommute({ originId: c.originId, destId: c.destId, bikeType: c.bikeType });
  }

  function handleRemoveSaved(c: SavedItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (c.kind === 'starred') toggleStar(c);
    else removeRecent(c.originId, c.destId);
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
      {/* Quick-access: starred + recent commutes */}
      {allSaved.length > 0 && (
        <div className="saved-commutes-section" ref={savedWrapRef}>
          {allSaved.length <= 2 ? (
            allSaved.map((c, i) => (
              <div key={i} className="saved-commute-row">
                <button className="saved-commute-load" onClick={() => handleLoadSaved(c)}>
                  <span className={c.kind === 'starred' ? 'saved-commute-star' : 'saved-commute-clock'}>
                    {c.kind === 'starred' ? '★' : '↺'}
                  </span>
                  <span className="saved-commute-route">{c.originName} → {c.destName}</span>
                </button>
                <button className="saved-commute-remove" onClick={e => handleRemoveSaved(c, e)} aria-label="Remove">×</button>
              </div>
            ))
          ) : (
            <div className="saved-dropdown">
              <button className="saved-dropdown-trigger" onClick={() => setSavedOpen(o => !o)}>
                <span>Saved routes · {allSaved.length}</span>
                <span className={`saved-dropdown-chevron${savedOpen ? ' open' : ''}`}>▾</span>
              </button>
              {savedOpen && (
                <div className="saved-dropdown-panel">
                  {allSaved.map((c, i) => (
                    <div key={i} className="saved-commute-row">
                      <button className="saved-commute-load" onClick={() => { handleLoadSaved(c); setSavedOpen(false); }}>
                        <span className={c.kind === 'starred' ? 'saved-commute-star' : 'saved-commute-clock'}>
                          {c.kind === 'starred' ? '★' : '↺'}
                        </span>
                        <span className="saved-commute-route">{c.originName} → {c.destName}</span>
                      </button>
                      <button className="saved-commute-remove" onClick={e => handleRemoveSaved(c, e)} aria-label="Remove">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Planner card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span className="card-title" style={{ marginBottom: 0 }}>Plan your commute</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {originId && destId && (
              <button
                className={`swap-btn${isStarred(originId, destId) ? ' starred' : ''}`}
                onClick={handleStar}
                title={isStarred(originId, destId) ? 'Remove from starred' : 'Star this commute'}
              >
                {isStarred(originId, destId) ? '★' : '☆'}
              </button>
            )}
            <button className="swap-btn" onClick={handleSwap} title="Swap origin and destination">⇅</button>
          </div>
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
            <div className="day-pills-track">
              {DAYS_PILLS.map(d => (
                <button
                  key={d.value}
                  className={`day-pill${selectedDay === d.value ? ' active' : ''}`}
                  title={DAYS_FULL[d.value]}
                  onClick={() => setDay(d.value)}
                >
                  {d.letter}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="field-label">Departure time</span>
            <select
              className="field-select"
              value={selectedTime}
              onChange={e => setTime(Number(e.target.value))}
            >
              {Array.from({ length: 288 }, (_, i) => i * 5).map(m => (
                <option key={m} value={m}>{formatTime(m)}</option>
              ))}
            </select>
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
