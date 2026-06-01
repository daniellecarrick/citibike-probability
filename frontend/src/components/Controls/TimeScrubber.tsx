import { useEffect, useRef } from 'react';
import { useStore } from '../../store';

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function periodLabel(minutes: number): string {
  if (minutes < 360) return 'Late night';
  if (minutes < 480) return 'Early morning';
  if (minutes < 600) return 'Morning commute surge';
  if (minutes < 720) return 'Mid-morning';
  if (minutes < 840) return 'Midday';
  if (minutes < 1020) return 'Afternoon';
  if (minutes < 1140) return 'Evening commute surge';
  if (minutes < 1320) return 'Evening';
  return 'Late night';
}

export function TimeScrubber() {
  const { selectedTime, animation, setTime, setPlaying, stepTime } = useStore();
  const rafRef = useRef<number | null>(null);
  const frameCount = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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

  function getTimeFromPointer(clientX: number): number {
    if (!trackRef.current) return selectedTime;
    const rect = trackRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(frac * 287) * 5;
  }

  function onTrackClick(e: React.MouseEvent) {
    setTime(getTimeFromPointer(e.clientX));
  }

  function onHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    const onMove = (me: MouseEvent) => {
      if (dragging.current) setTime(getTimeFromPointer(me.clientX));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const slot = selectedTime / 5; // 0-287
  const fillPct = (slot / 287) * 100;

  return (
    <div className="time-scrubber-overlay">
      <div className="scrubber-top-row">
        <span className="scrubber-period">{periodLabel(selectedTime)}</span>
        <div className="scrubber-legend">
          <span>Poor</span>
          <div className="scrubber-gradient-bar" />
          <span>Excellent</span>
        </div>
        <span className="scrubber-time">{formatTime(selectedTime)}</span>
      </div>

      <div className="scrubber-track-row">
        <button className="play-btn" onClick={() => setPlaying(!animation.playing)}>
          {animation.playing ? '⏸' : '▶'}
        </button>

        <div className="scrubber-track-wrap">
          <div
            className="scrubber-track"
            ref={trackRef}
            onClick={onTrackClick}
          >
            <div className="scrubber-fill" style={{ width: `${fillPct}%` }} />
            <div
              className="scrubber-handle"
              style={{ left: `${fillPct}%` }}
              onMouseDown={onHandleMouseDown}
            />
          </div>
          <div className="scrubber-ticks">
            {['12a', '6a', '12p', '6p', '12a'].map((t, i) => (
              <span key={i} className="scrubber-tick">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
