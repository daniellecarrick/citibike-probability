import { formatTime } from '../../utils/time';

const DAY_MINUTES = 24 * 60;

interface Props {
  minutes: number; // minutes since midnight, 0–1439
  onChange: (minutes: number) => void;
  /** Minutes between choices. Data exists only for 5-minute slots, so that's the default. */
  step?: number;
}

/**
 * ‹ prev / next › stepper around a dropdown of every `step`-minute time of
 * day. A dropdown rather than a free-form time input, because the data only
 * exists on the 5-minute grid: 1:20 and 1:25 have values, 1:23 doesn't.
 */
export function TimeStepper({ minutes, onChange, step = 5 }: Props) {
  // Snap to the grid so an off-grid value from elsewhere still shows a valid option.
  const current = (Math.round(minutes / step) * step) % DAY_MINUTES;
  const options = Array.from({ length: DAY_MINUTES / step }, (_, i) => i * step);

  function stepBy(delta: number) {
    onChange((current + delta + DAY_MINUTES) % DAY_MINUTES);
  }

  return (
    <div className="time-stepper">
      <button className="stepper-btn" aria-label={`${step} minutes earlier`} onClick={() => stepBy(-step)}>‹</button>
      <select
        className="stepper-input"
        aria-label="Select time"
        value={current}
        onChange={e => onChange(Number(e.target.value))}
      >
        {options.map(m => (
          <option key={m} value={m}>{formatTime(m)}</option>
        ))}
      </select>
      <button className="stepper-btn" aria-label={`${step} minutes later`} onClick={() => stepBy(step)}>›</button>
    </div>
  );
}
