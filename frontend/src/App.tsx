import { useEffect, useState } from 'react';
import { api } from './api/client';
import { CommutePlanner } from './components/CommutePlanner/CommutePlanner';
import { DaySelector } from './components/Controls/DaySelector';
import { ModeSelector } from './components/Controls/ModeSelector';
import { TimeScrubber } from './components/Controls/TimeScrubber';
import { StationMap } from './components/Map/StationMap';
import { StationDetailPanel } from './components/StationDetail/StationDetailPanel';
import { useMapData } from './hooks/useMapData';
import { useStore } from './store';
import type { Station } from './types';
import './styles.css';

type SidebarTab = 'detail' | 'commute';

function App() {
  const { currentMapData, selectedStationId } = useStore();
  const [stations, setStations] = useState<Station[]>([]);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('detail');

  // Drive map data fetching
  useMapData();

  useEffect(() => {
    api.stations.list().then(setStations).catch(console.error);
  }, []);

  // Auto-switch to detail tab when a station is clicked
  useEffect(() => {
    if (selectedStationId) setSidebarTab('detail');
  }, [selectedStationId]);

  return (
    <div className="app">
      {/* Top control bar */}
      <header className="topbar">
        <div className="app-title">Citi Bike Probability Explorer</div>
        <ModeSelector />
        <DaySelector />
      </header>

      {/* Main layout: map + sidebar */}
      <div className="main">
        <div className="map-container">
          <StationMap data={currentMapData} />
        </div>

        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button
              className={`tab ${sidebarTab === 'detail' ? 'tab-active' : ''}`}
              onClick={() => setSidebarTab('detail')}
            >
              Station
            </button>
            <button
              className={`tab ${sidebarTab === 'commute' ? 'tab-active' : ''}`}
              onClick={() => setSidebarTab('commute')}
            >
              Commute
            </button>
          </div>

          <div className="sidebar-content">
            {sidebarTab === 'detail' ? (
              <StationDetailPanel />
            ) : (
              <CommutePlanner stations={stations} />
            )}
          </div>
        </aside>
      </div>

      {/* Time scrubber at bottom */}
      <footer className="bottom-bar">
        <TimeScrubber />
      </footer>
    </div>
  );
}

export default App;
