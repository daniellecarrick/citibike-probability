/**
 * Choose the start and end stations by tapping them on a map. The first tap
 * sets whichever leg is active (start by default), then the active leg moves
 * on to the end station; the card at the bottom shows both picks and lets
 * you switch which leg the next tap sets. Neutral grey dots: this is for
 * finding the right corner, the forecast comes after.
 */
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import type { Station } from '../../types';
import { ROUTE_DEST_COLOR, ROUTE_ORIGIN_COLOR } from './CommuteRouteMap';

const runtimeConfig = (globalThis as typeof globalThis & { __APP_CONFIG__?: { MAPBOX_TOKEN?: string } }).__APP_CONFIG__ ?? {};
mapboxgl.accessToken = runtimeConfig.MAPBOX_TOKEN ?? import.meta.env.VITE_MAPBOX_TOKEN ?? '';

const SOURCE = 'picker-stations';
const DOTS = 'picker-dots';
const HITS = 'picker-hits';

export type PickerLeg = 'origin' | 'dest';

interface Props {
  stations: Station[];
  originId: string;
  destId: string;
  /** Which leg the first tap sets. */
  initialLeg?: PickerLeg;
  onDone: (originId: string, destId: string) => void;
  onClose: () => void;
}

export function StationPickerMap({ stations, originId, destId, initialLeg = 'origin', onDone, onClose }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [origin, setOrigin] = useState(originId);
  const [dest, setDest] = useState(destId);
  const [leg, setLeg] = useState<PickerLeg>(initialLeg);
  // The click handler is registered once; read the active leg through a ref.
  const legRef = useRef(leg);
  legRef.current = leg;
  const picks = useRef({ origin, dest });
  picks.current = { origin, dest };

  const originStation = stations.find(s => s.station_id === origin);
  const destStation = stations.find(s => s.station_id === dest);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!container.current || map.current) return;
    // Start where the user already is in the flow: around a picked station, else Midtown.
    const start = stations.find(s => s.station_id === (initialLeg === 'dest' ? destId || originId : originId || destId));
    const m = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: start ? [start.lng, start.lat] : [-73.98, 40.75],
      zoom: start ? 14 : 12.5,
      attributionControl: false,
    });
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
    m.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');
    map.current = m;

    m.on('load', () => {
      try {
        m.setPaintProperty('water', 'fill-color', '#e9eef3');
        m.setPaintProperty('land', 'background-color', '#fbfcfd');
      } catch { /* layers may not exist in this style */ }

      m.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: DOTS,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 14, 6, 16, 8],
          'circle-color': '#9aa1ad',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });
      // Invisible, finger-sized hit targets around each dot.
      m.addLayer({
        id: HITS,
        type: 'circle',
        source: SOURCE,
        paint: { 'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)', 'circle-opacity': 0 },
      });

      m.on('click', HITS, e => {
        const id = e.features?.[0]?.properties?.station_id as string | undefined;
        if (!id) return;
        // A station can't be both ends of the trip.
        const other = legRef.current === 'origin' ? picks.current.dest : picks.current.origin;
        if (id === other) return;
        if (legRef.current === 'origin') {
          setOrigin(id);
          setLeg('dest');
        } else {
          setDest(id);
        }
      });
      m.on('mouseenter', HITS, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', HITS, () => { m.getCanvas().style.cursor = ''; });
      setLoaded(true);
    });

    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Station data, with the two picks marked so they draw in route colors.
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    const source = m.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData({
      type: 'FeatureCollection',
      features: stations.map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: {
          station_id: s.station_id,
          role: s.station_id === origin ? 'origin' : s.station_id === dest ? 'dest' : 'none',
        },
      })),
    });
    m.setPaintProperty(DOTS, 'circle-color',
      ['match', ['get', 'role'], 'origin', ROUTE_ORIGIN_COLOR, 'dest', ROUTE_DEST_COLOR, '#9aa1ad']);
    // Zoom must be the outermost expression, so the role check goes inside each stop.
    const picked = ['!=', ['get', 'role'], 'none'];
    m.setPaintProperty(DOTS, 'circle-radius',
      ['interpolate', ['linear'], ['zoom'],
        11, ['case', picked, 7, 3],
        14, ['case', picked, 10, 6],
        16, ['case', picked, 12, 8]]);
    m.setPaintProperty(DOTS, 'circle-stroke-width', ['case', ['==', ['get', 'role'], 'none'], 1.5, 3]);
  }, [stations, origin, dest, loaded]);

  const prompt = leg === 'origin' ? 'Tap your start station' : 'Tap your end station';

  return (
    <div className="picker-modal" role="dialog" aria-modal="true" aria-label="Choose stations on the map">
      <div className="picker-panel">
        <div className="picker-head">
          <span className="picker-title">{prompt}</span>
          <button className="picker-cancel" onClick={onClose}>Cancel</button>
        </div>

        <div className="picker-map" ref={container} />

        <div className="picker-card">
          {([
            ['origin', 'Start', originStation, ROUTE_ORIGIN_COLOR],
            ['dest', 'End', destStation, ROUTE_DEST_COLOR],
          ] as const).map(([key, label, station, color]) => (
            <button
              key={key}
              className={`picker-leg${leg === key ? ' active' : ''}`}
              onClick={() => setLeg(key)}
              aria-pressed={leg === key}
            >
              <span className="picker-leg-dot" style={{ background: color }} />
              <span className="picker-leg-text">
                <span className="picker-leg-label">{label}</span>
                <span className={`picker-leg-name${station ? '' : ' empty'}`}>
                  {station?.station_name ?? (leg === key ? 'Tap a station on the map' : 'Not chosen yet')}
                </span>
              </span>
            </button>
          ))}
          <button
            className="cta-btn picker-done"
            disabled={!origin || !dest}
            onClick={() => onDone(origin, dest)}
          >
            Use these stations
          </button>
        </div>
      </div>
    </div>
  );
}
