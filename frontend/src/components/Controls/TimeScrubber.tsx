import { useEffect, useRef } from 'react';
import { useStore } from '../../store';

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const SPEEDS = [1, 2, 4, 8];
// At 60fps each slot is 5 minutes. Speed 1 = 1 slot/frame skip, 4x = 4 slots/frame
// We use requestAnimationFrame and throttle by frameskip count.
const FRAME_SKIP: Record<number, number> = { 1: 6, 2: 3, 4: 2, 8: 1 };

export function TimeScrubber() {
  const { selectedTime, animation, setTime, setPlaying, setSpeed, stepTime } = useStore();
  const rafRef = useRef<number | null>(null);
  const frameCount = useRef(0);

  useEffect(() => {
    if (!animation.playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const skip = FRAME_SKIP[animation.speedMultiplier] ?? 6;

    const tick = () => {
      frameCount.current += 1;
      if (frameCount.current >= skip) {
        frameCount.current = 0;
        stepTime();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [animation.playing, animation.speedMultiplier, stepTime]);

  const slot = Math.floor(selectedTime / 5); // 0-287

  return (
    <div className="time-scrubber">
      <div className="time-display">{formatTime(selectedTime)}</div>

      <input
        type="range"
        min={0}
        max={287}
        value={slot}
        onChange={(e) => setTime(Number(e.target.value) * 5)}
        className="time-range"
      />

      <div className="time-controls">
        <button
          className="btn btn-play"
          onClick={() => setPlaying(!animation.playing)}
        >
          {animation.playing ? '⏸' : '▶'}
        </button>

        <div className="speed-group">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`btn btn-speed ${animation.speedMultiplier === s ? 'btn-active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
