import { useEffect, useRef, useState } from 'react';
import { CommutePlanner } from '../CommutePlanner/CommutePlanner';
import { StationDetailPanel } from '../StationDetail/StationDetailPanel';
import { useStore } from '../../store';
import type { Station } from '../../types';

function StationSelectorModal({
  stations,
  selectedId,
  onSelect,
  onClose,
}: {
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Delay focus so the modal finishes its mount transition first
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const filtered = query
    ? stations.filter(s => s.station_name.toLowerCase().includes(query.toLowerCase())).slice(0, 60)
    : stations.slice(0, 60);

  return (
    <div className="mobile-selector-modal">
      <div className="mobile-selector-search-bar">
        <input
          ref={inputRef}
          className="mobile-selector-input"
          placeholder="Search stations…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button className="mobile-selector-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="mobile-selector-list">
        {filtered.map(s => (
          <div
            key={s.station_id}
            className={`mobile-selector-item${s.station_id === selectedId ? ' active' : ''}`}
            onClick={() => { onSelect(s.station_id); onClose(); }}
          >
            {s.station_name}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="mobile-selector-empty">No stations match "{query}"</div>
        )}
      </div>
    </div>
  );
}

interface Props {
  stations: Station[];
}

export function MobileBottomSheet({ stations }: Props) {
  const { selectedStationId, selectStation, railTab, setRailTab } = useStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const selectedStation = stations.find(s => s.station_id === selectedStationId);

  // Auto-open sheet when a station is tapped on the map
  useEffect(() => {
    if (selectedStationId) {
      setRailTab('station');
      setSheetOpen(true);
    }
  }, [selectedStationId, setRailTab]);

  function closeSheet() {
    setSheetOpen(false);
    selectStation(null);
  }

  function openCommute() {
    setRailTab('commute');
    setSheetOpen(true);
  }

  return (
    <>
      {/* Station search modal — position:fixed, full-screen */}
      {selectorOpen && (
        <StationSelectorModal
          stations={stations}
          selectedId={selectedStationId}
          onSelect={id => selectStation(id)}
          onClose={() => setSelectorOpen(false)}
        />
      )}

      {/* Backdrop */}
      {sheetOpen && (
        <div className="mobile-sheet-backdrop" onClick={closeSheet} />
      )}

      {/* Bottom sheet */}
      <div className={`mobile-sheet${sheetOpen ? ' open' : ''}`}>
        {/* Handle + tabs + close */}
        <div className="mobile-sheet-header">
          <div className="mobile-handle-bar">
            <div className="mobile-sheet-handle" />
          </div>
          <div className="mobile-sheet-tabs">
            <button
              className={`rail-tab${railTab === 'station' ? ' active' : ''}`}
              onClick={() => setRailTab('station')}
            >
              Station Details
            </button>
            <button
              className={`rail-tab${railTab === 'commute' ? ' active' : ''}`}
              onClick={() => setRailTab('commute')}
            >
              Commute
            </button>
          </div>
          <button className="mobile-sheet-close" onClick={closeSheet} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Station selector row — only shown on station tab */}
        {railTab === 'station' && (
          <button
            className="mobile-station-selector-row"
            onClick={() => setSelectorOpen(true)}
          >
            <span className="mobile-station-selector-value">
              {selectedStation?.station_name ?? 'Select a station…'}
            </span>
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
              <path d="M1 1l5 5 5-5" stroke="#9aa1ad" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        )}

        {/* Scrollable content */}
        <div className="mobile-sheet-body">
          {railTab === 'station' ? (
            <StationDetailPanel />
          ) : (
            <CommutePlanner stations={stations} />
          )}
        </div>
      </div>

      {/* Floating commute button — only visible when sheet is closed */}
      {!sheetOpen && (
        <button className="mobile-commute-fab" onClick={openCommute}>
          Plan commute
        </button>
      )}
    </>
  );
}
