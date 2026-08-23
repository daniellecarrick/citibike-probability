import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api/client';
import { AdminPage } from './components/Admin/AdminPage';
import { CommutePlanner } from './components/CommutePlanner/CommutePlanner';
import { CommuteRouteBar } from './components/CommutePlanner/CommuteRouteBar';
import { Header } from './components/Layout/Header';
import { MapSidebar } from './components/Map/MapSidebar';
import { MobileBottomSheet } from './components/Mobile/MobileBottomSheet';
import { MobileFilterMenu } from './components/Mobile/MobileFilterMenu';
import { StationMap } from './components/Map/StationMap';
import { PatternsPage } from './components/Patterns/PatternsPage';
import { useIsMobile } from './hooks/useIsMobile';
import { useMapData } from './hooks/useMapData';
import { useStore } from './store';
import type { Station } from './types';
import './styles.css';

function MapView({ stations }: { stations: Station[] }) {
  const { currentMapData } = useStore();

  useMapData(stations);

  return (
    <div className="app-body">
      <MapSidebar />

      {/* Map */}
      <div className="map-region">
        <StationMap data={currentMapData} />
      </div>
    </div>
  );
}

function MobileMapView({ stations }: { stations: Station[] }) {
  const { currentMapData } = useStore();

  useMapData(stations);

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
  const { commute } = useStore();
  const location = useLocation();

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
      <Header />
      {location.pathname === '/commute' && commute && <CommuteRouteBar stations={stations} />}

      <Routes>
        <Route path="/" element={<Navigate to="/commute" replace />} />
        <Route
          path="/commute"
          element={
            <div className={`page-container${commute ? '' : ' page-container-centered'}`}>
              <CommutePlanner stations={stations} />
            </div>
          }
        />
        <Route
          path="/map"
          element={
            isMobile
              ? <MobileMapView stations={stations} />
              : <MapView stations={stations} />
          }
        />
        <Route path="/patterns" element={<div className="page-container"><PatternsPage /></div>} />
        <Route
          path="/admin"
          element={<div className="admin-container"><AdminPage /></div>}
        />
      </Routes>
    </div>
  );
}

export default App;
