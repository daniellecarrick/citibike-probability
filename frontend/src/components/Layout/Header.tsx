import { useLocation, useNavigate } from 'react-router-dom';
import { MetricChips } from '../Map/MetricChips';
import logoSrc from '../../images/logo.png';

// TODO (revisit ~2025-06-27): surface map hidden while performance is improved.
// To re-enable: restore the Stations/Surface toggle here and in MobileFilterMenu.
export function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const view = pathname === '/admin' ? 'admin' : 'map';

  return (
    <header className="header">
      {/* Logo */}
      <div className="logo-mark" aria-hidden>
        <img src={logoSrc} alt="" width="34" height="34" style={{ display: 'block', borderRadius: 10, objectFit: 'cover' }} />
      </div>

      <div className="logo-wordmark">
        <span className="logo-title">Will There Be A Bike?</span>
      </div>

      {view === 'map' && (
        <div className="header-controls">
          <MetricChips />
          <div className="metric-group header-legend-group">
            <span className="day-pills-label">Scale</span>
            <div className="header-legend">
              <span className="header-legend-label">Low</span>
              <div className="scrubber-gradient-bar header-legend-bar" />
              <span className="header-legend-label">High</span>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="header-nav" style={{ marginLeft: view === 'admin' ? 'auto' : 0 }}>
        <button className={`nav-btn${view === 'map' ? ' active' : ''}`} onClick={() => navigate('/')}>Map</button>
        <button className={`nav-btn${view === 'admin' ? ' active' : ''}`} onClick={() => navigate('/admin')}>Admin</button>
      </div>
    </header>
  );
}
