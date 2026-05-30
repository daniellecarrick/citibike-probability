import { useStore } from '../../store';
import type { DayOfWeek } from '../../types';

const DAYS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 0, label: 'Monday', short: 'Mon' },
  { value: 1, label: 'Tuesday', short: 'Tue' },
  { value: 2, label: 'Wednesday', short: 'Wed' },
  { value: 3, label: 'Thursday', short: 'Thu' },
  { value: 4, label: 'Friday', short: 'Fri' },
  { value: 5, label: 'Saturday', short: 'Sat' },
  { value: 6, label: 'Sunday', short: 'Sun' },
];

export function DaySelector() {
  const { selectedDay, setDay } = useStore();

  return (
    <div className="day-selector">
      <label className="control-label">Day</label>
      <div className="button-group">
        {DAYS.map((d) => (
          <button
            key={d.value}
            className={`btn btn-day ${selectedDay === d.value ? 'btn-active' : ''}`}
            title={d.label}
            onClick={() => setDay(d.value)}
          >
            {d.short}
          </button>
        ))}
      </div>
    </div>
  );
}
