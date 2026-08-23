import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCommute } from '../../hooks/useCommute';
import { useCommuteMatrix } from '../../hooks/useCommuteMatrix';
import { useCommuteAvailabilitySeries } from '../../hooks/useCommuteAvailabilitySeries';
import { useStore } from '../../store';
import { probabilityToColor, fmtPct } from '../../utils/colorScale';
import { filterStations } from '../../utils/stationSearch';
import { DAYS_FULL, formatTime } from '../../utils/time';
import { AvailabilityChart } from './AvailabilityChart';
import { CommuteMatrix } from './CommuteMatrix';
import { RecommendationList } from './RecommendationList';
import { useSavedCommutes } from '../../hooks/useSavedCommutes';
import type { SavedCommute } from '../../hooks/useSavedCommutes';
import type { Station } from '../../types';

type SavedItem = SavedCommute & { kind: 'starred' | 'recent' };

const SAMPLE_COMMUTES = [
  {
    label: 'Park Slope to Midtown East',
    originId: '8066575c-f8e9-4e14-95ea-8d25ceeae2ca',
    originName: '1 St & 6 Ave',
    destId: '2af3ecc3-4f43-468a-a7cc-bb4804ee3e7a',
    destName: 'E 43 St & Madison Ave',
  },
  {
    label: 'Upper East Side to Financial District',
    originId: '66dd427e-0aca-11e7-82f6-3863bb44ef7c',
    originName: '1 Ave & E 78 St',
    destId: '3e9e50cc-f336-439f-bd0b-dec5499c038d',
    destName: 'Albany St & Greenwich St',
  },
] as const;

// Static placeholder data for the Patterns teaser cards — not real analytics.
const PATTERN_BAR_HEIGHTS = [40, 65, 30, 80, 55, 90, 45, 70, 60, 35, 85, 50];
const PATTERN_GRID_VALUES = [
  0.2, 0.4, 0.9, 0.6, 0.3, 0.8, 0.5, 0.7, 0.9, 0.4, 0.2, 0.6,
  0.5, 0.8, 0.3, 0.9, 0.6, 0.4, 0.7, 0.5, 0.2, 0.8, 0.6, 0.9,
  0.3, 0.6, 0.5, 0.2, 0.8, 0.4, 0.7, 0.9, 0.5, 0.3, 0.6, 0.8,
];

function neighborhoodLabel(
  stations: Station[],
  originId: string,
  destId: string,
  fallbackOrigin: string,
  fallbackDest: string,
): string {
  const origin = stations.find(s => s.station_id === originId);
  const dest = stations.find(s => s.station_id === destId);
  return `${origin?.neighborhood ?? fallbackOrigin} to ${dest?.neighborhood ?? fallbackDest}`;
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

  const filtered = filterStations(stations, query, 40);

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
              {selected.neighborhood && (
                <div className="station-combo-hood">{selected.neighborhood}</div>
              )}
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
              placeholder="Search by station, neighborhood, or borough…"
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
              {s.neighborhood && <span className="hood">{s.neighborhood}</span>}
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
  const { matrix } = useCommuteMatrix();
  const { series } = useCommuteAvailabilitySeries();
  const { recent, starred, addRecent, toggleStar, isStarred, removeRecent } = useSavedCommutes();

  const [originId, setOriginId] = useState(commute?.originId ?? '');
  const [destId,   setDestId]   = useState(commute?.destId   ?? '');
  const [bikeType, setBikeType] = useState<'any' | 'classic' | 'ebike'>('any');

  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Sync if commute changes externally (e.g. from station panel)
  useEffect(() => {
    if (commute) {
      setOriginId(commute.originId);
      setDestId(commute.destId);
    }
  }, [commute]);

  const starredItems: SavedItem[] = starred.map(c => ({ ...c, kind: 'starred' as const }));
  const recentItems: SavedItem[]  = recent
    .filter(c => !isStarred(c.originId, c.destId))
    .map(c => ({ ...c, kind: 'recent' as const }));
  const allSaved: SavedItem[] = [...starredItems, ...recentItems].slice(0, 5);

  function updateCardScrollState() {
    const el = cardsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateCardScrollState();
  }, [allSaved.length]);

  function scrollCards(dir: 'left' | 'right') {
    cardsScrollRef.current?.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' });
  }

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

  function handleLoadSaved(c: { originId: string; destId: string; bikeType: 'any' | 'classic' | 'ebike' }) {
    setOriginId(c.originId);
    setDestId(c.destId);
    setBikeType(c.bikeType);
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

  function handleSample(sample: (typeof SAMPLE_COMMUTES)[number]) {
    setMapMode('stations');
    setDay(1); // Tuesday
    setTime(510); // 8:30 AM
    setOriginId(sample.originId);
    setDestId(sample.destId);
  }

  const hasCommute = result !== null;
  const p = result?.success_probability ?? null;
  const pColor = probabilityToColor(p);

  return (
    <div className="commute-planner">
    {!commute && (
    <>
    <div className="commute-hero">
    <h1>How Reliable is Your CitiBike Route?</h1>
    <p className="commute-subtitle">
      See the odds of finding a bike and an open dock before you leave — for any route, any day, any time.
    </p>
      {/* Planner card */}
      <div className="card planner-card">
        <div className="planner-input-row">
          <div className="planner-combo-wrap">
            <StationCombo
              stations={stations}
              value={originId}
              onChange={setOriginId}
              dotColor="#16181d"
              placeholder="Choose origin station…"
            />
          </div>
          <button className="planner-arrow-btn" onClick={handleSwap} title="Swap origin and destination">
            <span className="arrow-icon" aria-hidden="true">⇅</span>
          </button>
          <div className="planner-combo-wrap">
            <StationCombo
              stations={stations}
              value={destId}
              onChange={setDestId}
              dotColor={probabilityToColor(0.95)}
              placeholder="Choose destination…"
            />
          </div>
          <button
            className="cta-btn planner-cta-btn"
            disabled={!originId || !destId}
            onClick={handleCalc}
          >
            Get forecast
          </button>
        </div>
      </div>

      {/* Quick-access: starred, then recent, then sample commutes */}
      <div className="commute-cards-wrap">
        <button
          className="commute-cards-arrow"
          onClick={() => scrollCards('left')}
          disabled={!canScrollLeft}
          aria-label="Scroll left"
        >
          ‹
        </button>
        <div className="commute-cards-row" ref={cardsScrollRef} onScroll={updateCardScrollState}>
          {allSaved.map((c, i) => (
            <div key={i} className="sample-commute-card saved-quick-card">
              <span className={`commute-card-badge ${c.kind === 'starred' ? 'badge-starred' : 'badge-recent'}`}>
                {c.kind === 'starred' ? 'Starred' : 'Recent'}
              </span>
              <button className="saved-quick-load" onClick={() => handleLoadSaved(c)}>
                <div className="sample-commute-label">
                  {neighborhoodLabel(stations, c.originId, c.destId, c.originName, c.destName)}
                </div>
                <div className="sample-commute-route">
                  {c.originName} <span className="sample-commute-arrow">→</span> {c.destName}
                </div>
              </button>
              <button className="saved-quick-remove" onClick={e => handleRemoveSaved(c, e)} aria-label="Remove">×</button>
            </div>
          ))}
          {SAMPLE_COMMUTES.map(sample => (
            <button
              key={sample.label}
              className="sample-commute-card"
              onClick={() => handleSample(sample)}
            >
              <span className="commute-card-badge">Sample</span>
              <div className="sample-commute-label">{sample.label}</div>
              <div className="sample-commute-route">
                {sample.originName} <span className="sample-commute-arrow">→</span> {sample.destName}
              </div>
            </button>
          ))}
        </div>
        <button
          className="commute-cards-arrow"
          onClick={() => scrollCards('right')}
          disabled={!canScrollRight}
          aria-label="Scroll right"
        >
          ›
        </button>
      </div>
    </div>

      {/* Patterns teaser */}
      <div className="patterns-teaser">
        <div className="section-heading">
          <h2 className="section-heading-title">Explore Patterns</h2>
        </div>
        <div className="patterns-teaser-grid">
          <Link to="/patterns" className="card pattern-card">
            <div className="pattern-card-viz">
              <div className="pattern-viz-bars">
                {PATTERN_BAR_HEIGHTS.map((h, i) => (
                  <div key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="pattern-card-title">Busiest hours across the network</div>
            <span className="pattern-card-link">Go to insight →</span>
          </Link>
          <Link to="/patterns" className="card pattern-card">
            <div className="pattern-card-viz">
              <div className="pattern-viz-grid">
                {PATTERN_GRID_VALUES.map((v, i) => (
                  <div key={i} style={{ background: probabilityToColor(v) }} />
                ))}
              </div>
            </div>
            <div className="pattern-card-title">Neighborhoods trending more reliable</div>
            <span className="pattern-card-link">Go to insight →</span>
          </Link>
        </div>
      </div>
    </>
    )}

      {/* Results: forecast + day×time heatmap fill the row together */}
      {commute && (
        <div className="results-grid">
          {loading && <div className="loading">Calculating forecast…</div>}

          {hasCommute && result && (
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
          )}

          {matrix && <CommuteMatrix matrix={matrix} />}
        </div>
      )}

      {/* Absolute bike/dock availability across the day */}
      {series && <AvailabilityChart series={series} />}

      {/* Recommendations */}
      {hasCommute && result && recommendations.length > 0 && (
        <RecommendationList recommendations={recommendations} currentTime={selectedTime} />
      )}
    </div>
  );
}
