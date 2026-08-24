import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import type { DayOfWeek } from '../../types';
import { TimeStepper } from './TimeStepper';

const DAYS: { letter: string; full: string; value: DayOfWeek }[] = [
  { letter: 'S', full: 'Sunday', value: 6 },
  { letter: 'M', full: 'Monday', value: 0 },
  { letter: 'T', full: 'Tuesday', value: 1 },
  { letter: 'W', full: 'Wednesday', value: 2 },
  { letter: 'T', full: 'Thursday', value: 3 },
  { letter: 'F', full: 'Friday', value: 4 },
  { letter: 'S', full: 'Saturday', value: 5 },
];

export function TimeScrubber() {
  const { selectedDay, selectedTime, animation, setDay, setTime, setPlaying, stepTime } = useStore();
  const rafRef = useRef<number | null>(null);
  const frameCount = useRef(0);

  useEffect(() => {
    if (!animation.playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      frameCount.current += 1;
      if (frameCount.current >= 5) { // advance every 5 frames ≈ 12fps
        frameCount.current = 0;
        stepTime();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [animation.playing, stepTime]);

  return (
    <div className="time-scrubber-panel">
      <div className="metric-group">
        <span className="filter-label">Day</span>
        <div className="scrubber-day-controls">
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

          <TimeStepper minutes={selectedTime} onChange={setTime} />

          <button className="play-btn" onClick={() => setPlaying(!animation.playing)}>
            {animation.playing ? '⏸' : '▶'}
          </button>
        </div>
      </div>
    </div>
  );
}
