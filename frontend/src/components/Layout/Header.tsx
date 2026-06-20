import { useLocation, useNavigate } from 'react-router-dom';
import { MetricChips } from '../Map/MetricChips';

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
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
          <circle cx="4"  cy="12" r="3" stroke="white" strokeWidth="1.5" />
          <circle cx="16" cy="12" r="3" stroke="white" strokeWidth="1.5" />
          <path d="M4 12L8 5h5l3 7" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 5h5" stroke="white" strokeWidth="1.5" />
          <circle cx="16" cy="4" r="1.5" fill="#1fa2ff" />
        </svg>
      </div>

      <div className="logo-wordmark">
        <span className="logo-title">Will There Be A Bike?</span>
      </div>

      {view === 'map' && (
        <div className="header-controls">
          <MetricChips />
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
