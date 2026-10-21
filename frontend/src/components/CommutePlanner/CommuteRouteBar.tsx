import { useStore } from '../../store';
import type { DayOfWeek, Station } from '../../types';
import { BikeTypeToggle, ChipSelect, DAY_OPTIONS_SHORT, timeOptionsFor } from './commuteControls';

interface Props {
  stations: Station[];
}

export function CommuteRouteBar({ stations }: Props) {
  const { commute, setCommute, selectedDay, selectedTime, setDay, setTime, headlineControlsVisible } = useStore();
  if (!commute) return null;

  const origin = stations.find(s => s.station_id === commute.originId);
  const dest = stations.find(s => s.station_id === commute.destId);
  // The headline's controls have scrolled away, so the bar carries them.
  const showControls = !headlineControlsVisible;

  return (
    <div className={`route-bar${showControls ? ' route-bar-with-controls' : ''}`}>
      <div className="route-bar-route">
        <span className="route-bar-leg">
          <span className="route-bar-dot route-bar-dot-origin" />
          <span className="route-bar-station">{origin?.station_name ?? 'Origin'}</span>
        </span>
        <span className="route-bar-sep" aria-hidden="true">→</span>
        <span className="route-bar-leg">
          <span className="route-bar-dot route-bar-dot-dest" />
          <span className="route-bar-station">{dest?.station_name ?? 'Destination'}</span>
        </span>
      </div>
      {showControls && (
        <div className="route-bar-controls">
          <BikeTypeToggle
            value={commute.bikeType}
            onChange={next => setCommute({ ...commute, bikeType: next })}
            compact
          />
          <ChipSelect
            size="sm"
            value={String(selectedDay)}
            options={DAY_OPTIONS_SHORT}
            onChange={v => setDay(Number(v) as DayOfWeek)}
            ariaLabel="Day of week"
          />
          <ChipSelect
            size="sm"
            value={String(selectedTime)}
            options={timeOptionsFor(selectedTime)}
            onChange={v => setTime(Number(v))}
            ariaLabel="Time of day"
          />
        </div>
      )}
      <button
        className="route-bar-switch"
        onClick={() => setCommute({ ...commute, originId: commute.destId, destId: commute.originId })}
        aria-label="Swap origin and destination"
        title="Swap origin and destination"
      >
        <span aria-hidden="true">⇄</span>
      </button>
      <button className="route-bar-edit" onClick={() => setCommute(null)}>Edit</button>
    </div>
  );
}
