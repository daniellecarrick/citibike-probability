import { useEffect, useState } from 'react';
import { api } from './api/client';
import { AdminPage } from './components/Admin/AdminPage';
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
type AppView = 'map' | 'admin';

function MapView({ stations }: { stations: Station[] }) {
  const { currentMapData, selectedStationId } = useStore();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('detail');

  useMapData();

  useEffect(() => {
    if (selectedStationId) setSidebarTab('detail');
  }, [selectedStationId]);

  return (
    <>
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
      <footer className="bottom-bar">
        <TimeScrubber />
      </footer>
    </>
  );
}

function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [view, setView] = useState<AppView>('map');

  useEffect(() => {
    api.stations.list().then(setStations).catch(console.error);
  }, []);

  return (
    <div className={`app ${view === 'admin' ? 'app-admin' : ''}`}>
      <header className="topbar">
        <div className="app-title">Citi Bike Probability Explorer</div>
        {view === 'map' && (
          <>
            <ModeSelector />
            <DaySelector />
          </>
        )}
        <nav className="topbar-nav">
          <button
            className={`nav-btn ${view === 'map' ? 'nav-btn-active' : ''}`}
            onClick={() => setView('map')}
          >
            Map
          </button>
          <button
            className={`nav-btn ${view === 'admin' ? 'nav-btn-active' : ''}`}
            onClick={() => setView('admin')}
          >
            Admin
          </button>
        </nav>
      </header>

      {view === 'map' ? (
        <MapView stations={stations} />
      ) : (
        <div className="admin-container">
          <AdminPage />
        </div>
      )}
    </div>
  );
}

export default App;
