import { useEffect, useState } from 'react';
import { api } from './api/client';
import { AdminPage } from './components/Admin/AdminPage';
import { CommutePlanner } from './components/CommutePlanner/CommutePlanner';
import { Header } from './components/Layout/Header';
import { StationMap } from './components/Map/StationMap';
import { StationDetailPanel } from './components/StationDetail/StationDetailPanel';
import { useMapData } from './hooks/useMapData';
import { useStore } from './store';
import type { Station } from './types';
import './styles.css';

function MapView({ stations }: { stations: Station[] }) {
  const { currentMapData, railTab, setRailTab } = useStore();

  useMapData();

  return (
    <div className="app-body">
      {/* Left rail */}
      <div className="left-rail">
        <div className="rail-tabs">
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

        <div className="rail-content">
          {railTab === 'station' ? (
            <StationDetailPanel />
          ) : (
            <CommutePlanner stations={stations} />
          )}
        </div>
      </div>

      {/* Map */}
      <div className="map-region">
        <StationMap data={currentMapData} />
      </div>
    </div>
  );
}

function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [view, setView] = useState<'map' | 'admin'>('map');

  useEffect(() => {
    api.stations.list().then(setStations).catch(console.error);
  }, []);

  return (
    <div className="app">
      <Header view={view} onViewChange={setView} />

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
