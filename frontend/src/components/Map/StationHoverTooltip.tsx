import { useMemo } from 'react';
import { useStore, METRIC_TO_API } from '../../store';

interface HoveredStation {
  id: string;
  name: string;
}

interface Props {
  station: HoveredStation | null;
  tooltipRef: React.RefObject<HTMLDivElement>;
}

export function StationHoverTooltip({ station, tooltipRef }: Props) {
  const { bulkCache, selectedDay, selectedMetric, selectedTime } = useStore();
  const cacheKey = `${selectedDay}_${METRIC_TO_API[selectedMetric]}`;
  const cached = bulkCache[cacheKey];
  const stationId = station?.id ?? null;

  // Build 24h probability series for hovered station from bulk cache.
  // Runs only when cache or hovered station changes — not on every mousemove.
  const series = useMemo<(number | null)[]>(() => {
    if (!cached || !stationId) return Array.from({ length: 288 }, () => null);
    return Array.from({ length: 288 }, (_, slot) =>
      cached[String(slot)]?.find(s => s.station_id === stationId)?.probability ?? null
    );
  }, [cached, stationId]);

  // Always render so tooltipRef is attached; hide via display:none when no station.
  if (!station) return <div ref={tooltipRef} style={{ display: 'none' }} />;

  // SVG chart: viewBox 0 0 287 56, x=slot index, y=probability (4=100%, 52=0%)
  const toY = (p: number | null) => (p === null ? 52 : Math.round(4 + (1 - p) * 48));

  // Line path — gaps where data is null
  let linePath = '';
  let gap = true;
  for (let i = 0; i < 288; i++) {
    const p = series[i];
    if (p === null) { gap = true; continue; }
    linePath += gap ? `M ${i} ${toY(p)} ` : `L ${i} ${toY(p)} `;
    gap = false;
  }

  // Area fill — null treated as baseline (looks better than jagged dips)
  const areaD =
    'M 0,56 ' +
    series.map((p, i) => `L ${i},${toY(p)}`).join(' ') +
    ' L 287,56 Z';

  const currentX = Math.floor(selectedTime / 5);

  return (
    <div ref={tooltipRef} className="station-hover-tooltip">
      <div className="hover-tooltip-name">{station.name}</div>
      <svg
        className="hover-tooltip-chart"
        viewBox="0 0 287 56"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sht-line" x1="0" y1="4" x2="0" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#1fa2ff" />
            <stop offset="50%"  stopColor="#8b3df5" />
            <stop offset="100%" stopColor="#ff2d78" />
          </linearGradient>
          <linearGradient id="sht-fill" x1="0" y1="4" x2="0" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#1fa2ff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ff2d78" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#sht-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#sht-line)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Current time marker */}
        <line
          x1={currentX} y1={0}
          x2={currentX} y2={56}
          stroke="#16181d"
          strokeWidth="1.5"
          strokeOpacity="0.35"
          strokeDasharray="3,2"
        />
      </svg>
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
