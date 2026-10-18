/**
 * Orientation map for the commute results: just the origin and destination
 * stations, joined by a straight line, each labeled with the typical bike
 * (origin) or open-dock (destination) count at the selected time.
 */
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import type { Station } from '../../types';
import { formatTime } from '../../utils/time';
import { isTouchDevice } from '../../utils/device';

const runtimeConfig = (globalThis as typeof globalThis & { __APP_CONFIG__?: { MAPBOX_TOKEN?: string } }).__APP_CONFIG__ ?? {};
mapboxgl.accessToken = runtimeConfig.MAPBOX_TOKEN ?? import.meta.env.VITE_MAPBOX_TOKEN ?? '';

export const ROUTE_ORIGIN_COLOR = '#1fa2ff';
export const ROUTE_DEST_COLOR = '#16181d';

const LINE_SOURCE = 'commute-route-line';
const LINE_LAYER = 'commute-route-line';

interface Props {
  origin: Station | undefined;
  dest: Station | undefined;
  /** Typical bikes at the origin at departure time; null when unknown. */
  originBikes: number | null;
  /** Typical open docks at the destination at arrival time; null when unknown. */
  destDocks: number | null;
  /** Departure time, minutes since midnight. */
  departMinute: number;
  /** Arrival time, minutes since midnight; may exceed 1440 for overnight trips. */
  arriveMinute: number;
  /** [singular, plural], e.g. ['e-bike', 'e-bikes']. */
  bikeNoun: [string, string];
}

function formatCount(n: number | null, minute: number, [one, many]: [string, string]): string {
  const time = formatTime(minute % (24 * 60));
  if (n === null) return `No data for ${time}`;
  const rounded = Math.round(n);
  return `At ${time} there are usually ${rounded} ${rounded === 1 ? one : many}`;
}

function markerEl(color: string, name: string, stat: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'route-map-marker';
  const dot = document.createElement('span');
  dot.className = 'route-map-marker-dot';
  dot.style.background = color;
  const label = document.createElement('div');
  label.className = 'route-map-marker-label';
  const nameEl = document.createElement('div');
  nameEl.className = 'route-map-marker-name';
  nameEl.textContent = name;
  const statEl = document.createElement('div');
  statEl.className = 'route-map-marker-stat';
  statEl.style.color = color;
  statEl.textContent = stat;
  label.append(nameEl, statEl);
  el.append(dot, label);
  return el;
}

export function CommuteRouteMap({ origin, dest, originBikes, destDocks, departMinute, arriveMinute, bikeNoun }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const touch = isTouchDevice();
    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-73.97, 40.73],
      zoom: 11,
      attributionControl: false,
      // Leave the wheel for page scrolling; zoom via the +/- control.
      scrollZoom: false,
      // On touch, one finger scrolls the page; two fingers move the map.
      cooperativeGestures: touch,
    });
    // Pinch already zooms on touch, and the buttons would cover the labels.
    if (!touch) m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.current = m;

    m.on('load', () => {
      try {
        m.setPaintProperty('water', 'fill-color', '#e9eef3');
        m.setPaintProperty('land', 'background-color', '#fbfcfd');
      } catch { /* layers may not exist in this style */ }

      m.addSource(LINE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: LINE_SOURCE,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': '#16181d',
          'line-width': 2.5,
          'line-opacity': 0.7,
          'line-dasharray': [1.5, 1.5],
        },
      });
    });

    return () => {
      markers.current.forEach(mk => mk.remove());
      markers.current = [];
      m.remove();
      map.current = null;
    };
  }, []);

  // Line + framing only depend on the station pair.
  useEffect(() => {
    const m = map.current;
    if (!m || !origin || !dest) return;

    const apply = () => {
      const source = m.getSource(LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      source?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [dest.lng, dest.lat]] },
        properties: {},
      });
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([origin.lng, origin.lat]);
      bounds.extend([dest.lng, dest.lat]);
      // Side padding leaves room for the on-map labels on wide screens; on a
      // phone the labels move below the map, so a little breathing room is enough.
      const narrow = (mapContainer.current?.clientWidth ?? 1000) < 500;
      const padding = narrow
        ? { top: 36, bottom: 36, left: 36, right: 36 }
        : { top: 70, bottom: 70, left: 120, right: 120 };
      m.fitBounds(bounds, { padding, maxZoom: 14, duration: 0 });
    };

    if (m.isStyleLoaded()) apply();
    else m.once('load', apply);
  }, [origin, dest]);

  // Markers are rebuilt whenever the counts change (day/time/bike type).
  useEffect(() => {
    const m = map.current;
    if (!m || !origin || !dest) return;

    markers.current.forEach(mk => mk.remove());
    markers.current = [
      new mapboxgl.Marker({ element: markerEl(ROUTE_DEST_COLOR, dest.station_name, formatCount(destDocks, arriveMinute, ['open dock', 'open docks'])) })
        .setLngLat([dest.lng, dest.lat])
        .addTo(m),
      new mapboxgl.Marker({ element: markerEl(ROUTE_ORIGIN_COLOR, origin.station_name, formatCount(originBikes, departMinute, bikeNoun)) })
        .setLngLat([origin.lng, origin.lat])
        .addTo(m),
    ];
  }, [origin, dest, originBikes, destDocks, departMinute, arriveMinute, bikeNoun[0], bikeNoun[1]]);

  if (!origin || !dest) return null;

  return (
    <div className="card route-map-card">
      <div ref={mapContainer} className="route-map-canvas" />
      {/* Phone layout: the marker labels don't fit on a narrow map, so the same facts list here. */}
      <ul className="route-map-legend">
        <li>
          <span className="route-map-legend-dot" style={{ background: ROUTE_ORIGIN_COLOR }} />
          <span>
            <span className="route-map-legend-name">{origin.station_name}</span>
            <span className="route-map-legend-stat">{formatCount(originBikes, departMinute, bikeNoun)}</span>
          </span>
        </li>
        <li>
          <span className="route-map-legend-dot" style={{ background: ROUTE_DEST_COLOR }} />
          <span>
            <span className="route-map-legend-name">{dest.station_name}</span>
            <span className="route-map-legend-stat">{formatCount(destDocks, arriveMinute, ['open dock', 'open docks'])}</span>
          </span>
        </li>
      </ul>
      <div className="route-map-footnote">
        Typical counts for the selected day and time: bikes when you leave, open docks when you arrive.
      </div>
    </div>
  );
}
