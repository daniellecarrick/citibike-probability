/**
 * Day / time / bike-type controls shared by the forecast headline and the
 * sticky route bar (which shows them once the headline scrolls away).
 */
import { DAYS_FULL, formatTime } from '../../utils/time';

export const DAY_OPTIONS = DAYS_FULL.map((full, i) => ({ value: String(i), label: full }));
export const DAY_OPTIONS_SHORT = DAYS_FULL.map((full, i) => ({ value: String(i), label: full.slice(0, 3) }));

// Every 15 minutes across the day, matching the old time stepper's granularity.
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const minutes = i * 15;
  return { value: String(minutes), label: formatTime(minutes) };
});

/** The 15-minute options, plus the selected time if a chart set it off the grid (e.g. 8:35). */
export function timeOptionsFor(selectedTime: number): { value: string; label: string }[] {
  return TIME_OPTIONS.some(o => o.value === String(selectedTime))
    ? TIME_OPTIONS
    : [...TIME_OPTIONS, { value: String(selectedTime), label: formatTime(selectedTime) }]
      .sort((a, b) => Number(a.value) - Number(b.value));
}

export function LightningBoltIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

/** Pill-shaped native dropdown; iOS opens its wheel picker. */
export function ChipSelect({
  value, options, onChange, ariaLabel, size = 'md',
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span className={`chip-select-wrap chip-select-${size}`}>
      <select
        className="chip-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg className="chip-select-caret" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
        <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** E-bikes / all-bikes segmented toggle. `compact` uses shorter labels for the route bar. */
export function BikeTypeToggle({
  value, onChange, compact = false,
}: {
  value: 'any' | 'classic' | 'ebike';
  onChange: (next: 'any' | 'ebike') => void;
  compact?: boolean;
}) {
  return (
    <div className={`bike-type-toggle mode-toggle-track${compact ? ' bike-type-toggle-compact' : ''}`} role="group" aria-label="Bike type">
      <button
        className={`mode-toggle-btn${value === 'ebike' ? ' active' : ''}`}
        aria-pressed={value === 'ebike'}
        onClick={() => onChange('ebike')}
      >
        <LightningBoltIcon /> E-bikes
      </button>
      <button
        className={`mode-toggle-btn${value !== 'ebike' ? ' active' : ''}`}
        aria-pressed={value !== 'ebike'}
        onClick={() => onChange('any')}
      >
        {compact ? 'All bikes' : 'All bike types'}
      </button>
    </div>
  );
}
