import { useState, useRef, useEffect } from 'react';
import { useCommute } from '../../hooks/useCommute';
import { useCommuteMatrix } from '../../hooks/useCommuteMatrix';
import { useCommuteAvailabilitySeries } from '../../hooks/useCommuteAvailabilitySeries';
import { useStore } from '../../store';
import { probabilityToColor } from '../../utils/colorScale';
import { filterStations } from '../../utils/stationSearch';
import { DAYS_FULL, formatTime } from '../../utils/time';
import { AvailabilityChart } from './AvailabilityChart';
import { CommuteMatrix } from './CommuteMatrix';
import { CommuteMiniMap } from './CommuteMiniMap';
import { CommuteWindowBars } from './CommuteWindowBars';
import { useSavedCommutes } from '../../hooks/useSavedCommutes';
import type { SavedCommute } from '../../hooks/useSavedCommutes';
import type { DayOfWeek, Station } from '../../types';
import bridgeImg from '../../images/bridge.png';
import brownstoneImg from '../../images/brownstone.png';
import cityscapeImg from '../../images/cityscape.png';
import cityParkImg from '../../images/city_park_icon.png';
import cityBlockImg from '../../images/city_block.png';

type SavedItem = SavedCommute & { kind: 'starred' | 'recent' };

const DAY_OPTIONS = DAYS_FULL.map((full, i) => ({ value: String(i), label: full }));

// Hidden 2026-09-07: user wasn't happy with how the mini maps looked.
const SHOW_MINIMAPS = false;

// Every 15 minutes across the day, matching the old time stepper's granularity.
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const minutes = i * 15;
  return { value: String(minutes), label: formatTime(minutes) };
});

const SAMPLE_COMMUTES = [
  {
    label: 'Park Slope to Midtown East',
    originId: '8066575c-f8e9-4e14-95ea-8d25ceeae2ca',
    originName: '1 St & 6 Ave',
    originNeighborhood: 'Park Slope',
    destId: '2af3ecc3-4f43-468a-a7cc-bb4804ee3e7a',
    destName: 'E 43 St & Madison Ave',
    destNeighborhood: 'Midtown East',
  },
  {
    label: 'Upper East Side to Financial District',
    originId: '66dd427e-0aca-11e7-82f6-3863bb44ef7c',
    originName: '1 Ave & E 78 St',
    originNeighborhood: 'Upper East Side',
    destId: '3e9e50cc-f336-439f-bd0b-dec5499c038d',
    destName: 'Albany St & Greenwich St',
    destNeighborhood: 'Financial District',
  },
] as const;

// Patterns teaser is hidden until we have patterns to show; data + import kept for later.
// const PATTERN_BAR_HEIGHTS = [40, 65, 30, 80, 55, 90, 45, 70, 60, 35, 85, 50];
// const PATTERN_GRID_VALUES = [
//   0.2, 0.4, 0.9, 0.6, 0.3, 0.8, 0.5, 0.7, 0.9, 0.4, 0.2, 0.6,
//   0.5, 0.8, 0.3, 0.9, 0.6, 0.4, 0.7, 0.5, 0.2, 0.8, 0.6, 0.9,
//   0.3, 0.6, 0.5, 0.2, 0.8, 0.4, 0.7, 0.9, 0.5, 0.3, 0.6, 0.8,
// ];

/**
 * Prefers the neighborhood captured when the commute was saved (so cards
 * render correctly even before `stations` has loaded); falls back to a
 * live lookup, then a generic label — never the exact station name.
 */
function neighborhoodLabel(
  stations: Station[],
  originId: string,
  destId: string,
  savedOriginNeighborhood: string | null,
  savedDestNeighborhood: string | null,
): string {
  const origin = savedOriginNeighborhood ?? stations.find(s => s.station_id === originId)?.neighborhood ?? 'Unknown area';
  const dest = savedDestNeighborhood ?? stations.find(s => s.station_id === destId)?.neighborhood ?? 'Unknown area';
  return `${origin} to ${dest}`;
}

const BOROUGH_IMAGE: Record<string, string> = {
  Brooklyn: brownstoneImg,
  Manhattan: cityscapeImg,
  Queens: cityParkImg,
  Bronx: cityBlockImg,
};

/**
 * Picks a scene image for a sample commute card based on the boroughs it
 * connects: a river crossing into/out of Manhattan gets the bridge image,
 * a same-borough trip gets that borough's scene, and a cross-borough trip
 * that doesn't touch Manhattan (e.g. Brooklyn ↔ Queens) falls back to the
 * origin borough's scene since there's no dedicated "both" image.
 */
function routeImage(stations: Station[], originId: string, destId: string): string {
  const originBorough = stations.find(s => s.station_id === originId)?.borough ?? null;
  const destBorough = stations.find(s => s.station_id === destId)?.borough ?? null;
  if (!originBorough || !destBorough) return cityscapeImg;
  if (originBorough !== destBorough && (originBorough === 'Manhattan' || destBorough === 'Manhattan')) {
    return bridgeImg;
  }
  return BOROUGH_IMAGE[originBorough] ?? cityscapeImg;
}

function LightningBoltIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

/** Plain-text-styled dropdown, for inline use inside a headline sentence. */
function InlineSelect({
  value, options, onChange, ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <span className="headline-select-wrap">
      <select
        className="headline-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="headline-select-caret" aria-hidden="true">▾</span>
    </span>
  );
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
  const { result, loading } = useCommute();
  const { matrix } = useCommuteMatrix();
  const { matrix: matrixFine } = useCommuteMatrix(5);
  const { series } = useCommuteAvailabilitySeries();
  const { recent, starred, addRecent, isStarred } = useSavedCommutes();

  const [originId, setOriginId] = useState(commute?.originId ?? '');
  const [destId,   setDestId]   = useState(commute?.destId   ?? '');
  const [bikeType, setBikeType] = useState<'any' | 'classic' | 'ebike'>('ebike');

  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Sync if commute changes externally (e.g. from station panel)
  useEffect(() => {
    if (commute) {
      setOriginId(commute.originId);
      setDestId(commute.destId);
      setBikeType(commute.bikeType);
    }
  }, [commute]);

  const starredItems: SavedItem[] = starred.map(c => ({ ...c, kind: 'starred' as const }));
  const recentItems: SavedItem[]  = recent
    .filter(c => !isStarred(c.originId, c.destId))
    .map(c => ({ ...c, kind: 'recent' as const }));
  const allSaved: SavedItem[] = [...starredItems, ...recentItems].slice(0, 5);
  // Samples fill any remaining slots up to 5 total — they disappear once
  // saved items alone fill the row.
  const sampleSlots = SAMPLE_COMMUTES.slice(0, Math.max(0, 5 - allSaved.length));

  function updateCardScrollState() {
    const el = cardsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateCardScrollState();
  }, [allSaved.length]);

  function makeSaved() {
    const o = stations.find(s => s.station_id === originId);
    const d = stations.find(s => s.station_id === destId);
    if (!o || !d) return null;
    return {
      originId, originName: o.station_name, originNeighborhood: o.neighborhood ?? null,
      destId, destName: d.station_name, destNeighborhood: d.neighborhood ?? null,
      bikeType, savedAt: Date.now(),
    };
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

  function handleSwap() {
    setOriginId(destId);
    setDestId(originId);
    if (commute) setCommute({ originId: destId, destId: originId, bikeType });
  }

  function handlePickDifferentStation() {
    setCommute(null);
    setOriginId('');
    setDestId('');
  }

  function handleBikeTypeChange(next: 'any' | 'ebike') {
    setBikeType(next);
    if (commute) setCommute({ originId, destId, bikeType: next });
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
  const bikeLabel = bikeType === 'ebike' ? 'E-bikes' : 'Bikes';
  const pColor = probabilityToColor(p);

  return (
    <div className="commute-planner">
    {!commute && (
    <>
    <div className="commute-hero">
    <h1>How reliable is your Citi Bike route?</h1>
    <p className="commute-subtitle">
      See the odds of finding a bike and an open dock before you leave — for any route, any day, any time.
    </p>
      {/* Planner card */}
      <div className="card planner-card">
        <div className="planner-input-row">
          <div className="planner-combo-wrap planner-combo-origin">
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
          <div className="planner-combo-wrap planner-combo-dest">
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
        <div className="commute-cards-track">
          <div className="commute-cards-row" ref={cardsScrollRef} onScroll={updateCardScrollState}>
            {allSaved.map((c, i) => (
              <button
                key={i}
                className="sample-commute-card saved-quick-card"
                onClick={() => handleLoadSaved(c)}
              >
                <span className={`commute-card-badge ${c.kind === 'starred' ? 'badge-starred' : 'badge-recent'}`}>
                  {c.kind === 'starred' ? 'Starred' : 'Recent'}
                </span>
                <div className="commute-card-row">
                  <img
                    className="commute-card-icon"
                    src={routeImage(stations, c.originId, c.destId)}
                    alt=""
                    aria-hidden="true"
                  />
                  <div className="commute-card-text">
                    <div className="sample-commute-label">
                      {neighborhoodLabel(stations, c.originId, c.destId, c.originNeighborhood, c.destNeighborhood)}
                    </div>
                    <div className="sample-commute-route">
                      {c.originName} <span className="sample-commute-arrow">→</span> {c.destName}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {sampleSlots.map(sample => (
              <button
                key={sample.label}
                className="sample-commute-card"
                onClick={() => handleSample(sample)}
              >
                <span className="commute-card-badge">Sample</span>
                <div className="commute-card-row">
                  <img
                    className="commute-card-icon"
                    src={routeImage(stations, sample.originId, sample.destId)}
                    alt=""
                    aria-hidden="true"
                  />
                  <div className="commute-card-text">
                    <div className="sample-commute-label">{sample.label}</div>
                    <div className="sample-commute-route">
                      {sample.originName} <span className="sample-commute-arrow">→</span> {sample.destName}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {canScrollLeft && <div className="commute-cards-fade commute-cards-fade-left" />}
          {canScrollRight && <div className="commute-cards-fade commute-cards-fade-right" />}
        </div>
      </div>
    </div>

      {/* Patterns teaser: hidden until we have patterns to show
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
      */}
    </>
    )}

      {/* Results: forecast + day×time heatmap fill the row together */}
      {commute && (
        <>
          {hasCommute && result && (
            <div className="forecast-headline">
              <div className="forecast-headline-top">
                <div className="forecast-headline-eyebrow">Your commute forecast</div>
                <div className="bike-type-toggle mode-toggle-track">
                  <button
                    className={`mode-toggle-btn${bikeType === 'ebike' ? ' active' : ''}`}
                    onClick={() => handleBikeTypeChange('ebike')}
                  >
                    <LightningBoltIcon /> E-bikes
                  </button>
                  <button
                    className={`mode-toggle-btn${bikeType !== 'ebike' ? ' active' : ''}`}
                    onClick={() => handleBikeTypeChange('any')}
                  >
                    All bike types
                  </button>
                </div>
              </div>
              <h1 className="forecast-headline-title">
                If you leave{' '}
                <InlineSelect
                  value={String(selectedDay)}
                  options={DAY_OPTIONS}
                  onChange={v => setDay(Number(v) as DayOfWeek)}
                  ariaLabel="Day of week"
                />{' '}
                at{' '}
                <span style={{ whiteSpace: 'nowrap' }}>
                  <InlineSelect
                    value={String(selectedTime)}
                    options={TIME_OPTIONS}
                    onChange={v => setTime(Number(v))}
                    ariaLabel="Time of day"
                  />,
                </span>{' '}
                your chance of a successful commute is{' '}
                <span style={{ color: pColor }}>{p !== null ? `${Math.round(p * 100)}%` : '—'}</span>.
              </h1>
              {result.data_warning && (
                <div className="data-warning-banner">
                  {result.data_warning}{' '}
                  <button className="data-warning-link" onClick={handlePickDifferentStation}>
                    Pick a different station
                  </button>
                </div>
              )}
            </div>
          )}

          {loading && <div className="loading">Calculating forecast…</div>}

          {/* TODO: mini maps hidden 2026-09-07, user wasn't happy with how they looked. Flip to re-enable. */}
          {SHOW_MINIMAPS && (
            <div className="commute-minimap-row">
              <CommuteMiniMap
                label="Near your origin"
                dotColor="#16181d"
                station={stations.find(s => s.station_id === commute.originId)}
                stations={stations}
              />
              <CommuteMiniMap
                label="Near your destination"
                dotColor={probabilityToColor(0.95)}
                station={stations.find(s => s.station_id === commute.destId)}
                stations={stations}
              />
            </div>
          )}

          {matrix && <CommuteMatrix matrix={matrix} />}

          {hasCommute && result && matrixFine && (
            <CommuteWindowBars matrix={matrixFine} bikeLabel={bikeLabel} />
          )}
        </>
      )}

      {/* Absolute bike/dock availability across the day */}
      {series && <AvailabilityChart series={series} bikeLabel={bikeLabel} />}
    </div>
  );
}
