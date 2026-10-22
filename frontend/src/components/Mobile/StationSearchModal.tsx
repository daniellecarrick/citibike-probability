import { useEffect, useRef, useState } from 'react';
import { filterStations } from '../../utils/stationSearch';
import type { Station } from '../../types';

export function MapPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="8" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Full-screen station search for phones: the input sits at the top so the
 * results list gets all the space above the keyboard. position:fixed, so it
 * can be rendered from anywhere.
 */
export function StationSearchModal({
  stations,
  selectedId,
  onSelect,
  onClose,
  placeholder = 'Search by station, neighborhood, or borough…',
  dotColor,
  onChooseOnMap,
}: {
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  placeholder?: string;
  dotColor?: string;
  /** Shows a "Choose on map" row above the results. */
  onChooseOnMap?: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Delay focus so the modal finishes its mount transition first
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = filterStations(stations, query, 60);

  return (
    <div className="mobile-selector-modal" role="dialog" aria-modal="true" aria-label={placeholder}>
      <div className="mobile-selector-search-bar">
        <div className="mobile-selector-input-wrap">
          {dotColor && <span className="mobile-selector-dot" style={{ background: dotColor }} aria-hidden="true" />}
          <input
            ref={inputRef}
            className="mobile-selector-input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={placeholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <button className="mobile-selector-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="mobile-selector-list">
        {onChooseOnMap && (
          <button className="mobile-selector-item mobile-selector-map-row" onClick={() => { onClose(); onChooseOnMap(); }}>
            <MapPinIcon />
            <span className="mobile-selector-item-name">Choose on map</span>
          </button>
        )}
        {filtered.map(s => (
          <button
            key={s.station_id}
            className={`mobile-selector-item${s.station_id === selectedId ? ' active' : ''}`}
            onClick={() => { onSelect(s.station_id); onClose(); }}
          >
            <div className="mobile-selector-item-name">{s.station_name}</div>
            {s.neighborhood && (
              <div className="mobile-selector-item-hood">{s.neighborhood}</div>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="mobile-selector-empty">No stations match "{query}"</div>
        )}
      </div>
    </div>
  );
}
