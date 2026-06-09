import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { api } from './api/client';
import { AdminPage } from './components/Admin/AdminPage';
import { CommutePlanner } from './components/CommutePlanner/CommutePlanner';
import { Header } from './components/Layout/Header';
import { MobileBottomSheet } from './components/Mobile/MobileBottomSheet';
import { MobileFilterMenu } from './components/Mobile/MobileFilterMenu';
import { StationMap } from './components/Map/StationMap';
import { StationDetailPanel } from './components/StationDetail/StationDetailPanel';
import { useIsMobile } from './hooks/useIsMobile';
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

function MobileMapView({ stations }: { stations: Station[] }) {
  const { currentMapData } = useStore();

  useMapData();

  return (
    <div className="mobile-app-body">
      <StationMap data={currentMapData} />
      <MobileFilterMenu />
      <MobileBottomSheet stations={stations} />
    </div>
  );
}

function App() {
  const isMobile = useIsMobile();
  const [stations, setStations] = useState<Station[]>([]);
  const [retryAt, setRetryAt] = useState(0);

  useEffect(() => {
    const handler = () => setRetryAt(Date.now());
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);

  useEffect(() => {
    if (stations.length > 0) return;
    api.stations.list().then(setStations).catch(console.error);
  }, [retryAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      {!isMobile && <Header />}

      <Routes>
        <Route
          path="/"
          element={
            isMobile
              ? <MobileMapView stations={stations} />
              : <MapView stations={stations} />
          }
        />
        <Route
          path="/admin"
          element={<div className="admin-container"><AdminPage /></div>}
        />
      </Routes>
    </div>
  );
}

export default App;
