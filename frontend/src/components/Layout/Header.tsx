import { useStore } from '../../store';
import type { DayOfWeek } from '../../types';

const DAYS: { letter: string; full: string; value: DayOfWeek }[] = [
  { letter: 'S', full: 'Sunday',    value: 6 },
  { letter: 'M', full: 'Monday',    value: 0 },
  { letter: 'T', full: 'Tuesday',   value: 1 },
  { letter: 'W', full: 'Wednesday', value: 2 },
  { letter: 'T', full: 'Thursday',  value: 3 },
  { letter: 'F', full: 'Friday',    value: 4 },
  { letter: 'S', full: 'Saturday',  value: 5 },
];

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface Props {
  view: 'map' | 'admin';
  onViewChange: (v: 'map' | 'admin') => void;
}

export function Header({ view, onViewChange }: Props) {
  const { selectedDay, selectedTime, mapMode, setDay, setMapMode } = useStore();

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
        <span className="logo-eyebrow">Citi Bike Commute Forecast · Predictive Model</span>
      </div>

      {view === 'map' && (
        <div className="header-controls">
          {/* Day pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="day-pills-label">Day</span>
            <div className="day-pills-track">
              {DAYS.map(d => (
                <button
                  key={d.value}
                  className={`day-pill${selectedDay === d.value ? ' active' : ''}`}
                  title={d.full}
                  onClick={() => setDay(d.value)}
                >
                  {d.letter}
                </button>
              ))}
            </div>
          </div>

          {/* Time readout */}
          <div className="time-readout">
            <span className="time-readout-eyebrow">Time</span>
            <span className="time-readout-value">{formatTime(selectedTime)}</span>
          </div>

          {/* Map mode toggle */}
          <div className="mode-toggle-track">
            <button
              className={`mode-toggle-btn${mapMode === 'stations' ? ' active' : ''}`}
              onClick={() => setMapMode('stations')}
            >
              Stations
            </button>
            <button
              className={`mode-toggle-btn${mapMode === 'surface' ? ' active' : ''}`}
              onClick={() => setMapMode('surface')}
            >
              Surface
            </button>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className={`header-nav${view === 'map' ? '' : ' '}`} style={{ marginLeft: view === 'admin' ? 'auto' : 0 }}>
        <button className={`nav-btn${view === 'map' ? ' active' : ''}`} onClick={() => onViewChange('map')}>Map</button>
        <button className={`nav-btn${view === 'admin' ? ' active' : ''}`} onClick={() => onViewChange('admin')}>Admin</button>
      </div>
    </header>
  );
}
