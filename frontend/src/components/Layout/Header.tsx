import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MethodologyModal } from '../Methodology/MethodologyModal';

const TABS = [
  { path: '/commute', label: 'Commute' },
  { path: '/map',     label: 'Map' },
  // { path: '/patterns', label: 'Patterns' }, // hidden until we have patterns to show
];

export function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = pathname === '/admin';
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  return (
    <header className="header">
      {/* Logo */}
      {/* <div className="logo-mark" aria-hidden>
        <img src={logoSrc} alt="" width="34" height="34" style={{ display: 'block', borderRadius: 10, objectFit: 'cover' }} />
      </div>

      <div className="logo-wordmark">
        <span className="logo-title">How Reliable is CitiBike?</span>
      </div> */}

      {/* Tabs */}
      <nav className="header-tabs" aria-label="Sections">
        {TABS.map(t => (
          <button
            key={t.path}
            className={`header-tab${pathname === t.path ? ' active' : ''}`}
            aria-current={pathname === t.path ? 'page' : undefined}
            onClick={() => navigate(t.path)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Nav */}
      <div className="header-nav">
        <button className="nav-btn nav-btn-methodology" onClick={() => setMethodologyOpen(true)} aria-label="Methodology">
          <span className="nav-btn-label">Methodology</span>
          <svg className="nav-btn-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 9v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <circle cx="10" cy="6.25" r="1.1" fill="currentColor" />
          </svg>
        </button>
        <button className={`nav-btn nav-btn-admin${isAdmin ? ' active' : ''}`} onClick={() => navigate('/admin')}>Admin</button>
      </div>

      {methodologyOpen && <MethodologyModal onClose={() => setMethodologyOpen(false)} />}
    </header>
  );
}
