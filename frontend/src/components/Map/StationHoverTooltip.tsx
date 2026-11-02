import { useStore } from '../../store';
import { useStationDaySeries } from '../../hooks/useStationDaySeries';
import { StationDayChart } from '../charts/StationDayChart';
import { formatTime } from '../../utils/time';

interface HoveredStation {
  id: string;
  name: string;
}

interface Props {
  station: HoveredStation | null;
  tooltipRef: React.RefObject<HTMLDivElement>;
}

export function StationHoverTooltip({ station, tooltipRef }: Props) {
  const { selectedTime } = useStore();
  const { series, metricPhrase, formatValue } = useStationDaySeries(station?.id ?? null);

  // Always render so tooltipRef is attached; hide via display:none when no station.
  if (!station) return <div ref={tooltipRef} style={{ display: 'none' }} />;

  // The value at the selected time, matching the dot's color on the map.
  const current = series[Math.floor(selectedTime / 5)];

  return (
    <div ref={tooltipRef} className="station-hover-tooltip">
      <div className="hover-tooltip-name">{station.name}</div>
      <div className="hover-tooltip-metric">{metricPhrase}</div>
      <div className="hover-tooltip-value">
        <strong>{formatValue(current)}</strong> at {formatTime(selectedTime)}
      </div>
      <StationDayChart series={series} selectedTime={selectedTime} />
      <div className="hover-tooltip-ticks">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </div>
  );
}
