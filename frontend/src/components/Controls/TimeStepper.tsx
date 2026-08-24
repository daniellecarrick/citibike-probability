const DAY_MINUTES = 24 * 60;

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fromHHMM(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

interface Props {
  minutes: number; // minutes since midnight, 0–1439
  onChange: (minutes: number) => void;
  step?: number;
}

/**
 * ‹ prev / next › stepper whose value is a native <input type="time">, so it
 * also supports opening the browser's time picker (dropdown) and typing a
 * time directly via the keyboard — not just clicking through 5-min steps.
 */
export function TimeStepper({ minutes, onChange, step = 5 }: Props) {
  function stepBy(delta: number) {
    onChange((minutes + delta + DAY_MINUTES) % DAY_MINUTES);
  }

  return (
    <div className="time-stepper">
      <button className="stepper-btn" aria-label="Earlier" onClick={() => stepBy(-step)}>‹</button>
      <input
        type="time"
        className="stepper-input"
        aria-label="Select time"
        value={toHHMM(minutes)}
        onChange={e => {
          const next = fromHHMM(e.target.value);
          if (next !== null) onChange(next);
        }}
      />
      <button className="stepper-btn" aria-label="Later" onClick={() => stepBy(step)}>›</button>
    </div>
  );
}
