import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MethodologyModal } from '../Methodology/MethodologyModal';
import logoSrc from '../../images/logo.png';

const TABS = [
  { path: '/commute', label: 'Commute' },
  { path: '/map',     label: 'Map' },
  { path: '/trends',  label: 'Trends' },
];

export function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = pathname === '/admin';
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  return (
    <header className="header">
      {/* Logo */}
      <div className="logo-mark" aria-hidden>
        <img src={logoSrc} alt="" width="34" height="34" style={{ display: 'block', borderRadius: 10, objectFit: 'cover' }} />
      </div>

      <div className="logo-wordmark">
        <span className="logo-title">Will There Be A Bike?</span>
      </div>

      {/* Tabs */}
      <div className="header-tabs">
        {TABS.map(t => (
          <button
            key={t.path}
            className={`header-tab${pathname === t.path ? ' active' : ''}`}
            onClick={() => navigate(t.path)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Nav */}
      <div className="header-nav">
        <button className="nav-btn" onClick={() => setMethodologyOpen(true)}>Methodology</button>
        <button className={`nav-btn${isAdmin ? ' active' : ''}`} onClick={() => navigate('/admin')}>Admin</button>
      </div>

      {methodologyOpen && <MethodologyModal onClose={() => setMethodologyOpen(false)} />}
    </header>
  );
}
