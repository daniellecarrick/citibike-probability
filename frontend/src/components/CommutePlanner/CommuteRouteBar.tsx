import { useStore } from '../../store';
import type { Station } from '../../types';

interface Props {
  stations: Station[];
}

export function CommuteRouteBar({ stations }: Props) {
  const { commute, setCommute } = useStore();
  if (!commute) return null;

  const origin = stations.find(s => s.station_id === commute.originId);
  const dest = stations.find(s => s.station_id === commute.destId);

  return (
    <div className="route-bar">
      <div className="route-bar-route">
        <span className="route-bar-dot route-bar-dot-origin" />
        <span className="route-bar-station">{origin?.station_name ?? 'Origin'}</span>
        <span className="route-bar-sep" aria-hidden="true">→</span>
        <span className="route-bar-dot route-bar-dot-dest" />
        <span className="route-bar-station">{dest?.station_name ?? 'Destination'}</span>
      </div>
      <button className="route-bar-edit" onClick={() => setCommute(null)}>Edit</button>
    </div>
  );
}
