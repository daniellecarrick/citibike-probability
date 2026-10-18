import { useEffect, useRef, useState } from 'react';
import { filterStations } from '../../utils/stationSearch';
import type { Station } from '../../types';

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
}: {
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  placeholder?: string;
  dotColor?: string;
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
