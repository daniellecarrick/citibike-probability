import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import type { Station } from '../../types';
import { nearestPoints } from '../../utils/geo';

const runtimeConfig = (globalThis as typeof globalThis & { __APP_CONFIG__?: { MAPBOX_TOKEN?: string } }).__APP_CONFIG__ ?? {};
mapboxgl.accessToken = runtimeConfig.MAPBOX_TOKEN ?? import.meta.env.VITE_MAPBOX_TOKEN ?? '';

const SOURCE_ID = 'nearby-stations';
const CIRCLE_LAYER = 'nearby-station-circles';
const NEAREST_COUNT = 5;

interface Props {
  label: string;
  dotColor: string;
  station: Station | undefined;
  stations: Station[];
}

export function CommuteMiniMap({ label, dotColor, station, stations }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current || !station) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [station.lng, station.lat],
      zoom: 15,
      interactive: false,
      attributionControl: false,
    });

    map.current.on('load', () => {
      const m = map.current!;

      try {
        m.setPaintProperty('water', 'fill-color', '#e9eef3');
        m.setPaintProperty('land', 'background-color', '#fbfcfd');
      } catch { /* layers may not exist in this style */ }

      m.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      m.addLayer({
        id: CIRCLE_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': ['case', ['get', 'isCenter'], 8, 6],
          'circle-color': ['case', ['get', 'isCenter'], dotColor, '#8a94a6'],
          'circle-opacity': 0.9,
          'circle-stroke-width': ['case', ['get', 'isCenter'], 2, 1],
          'circle-stroke-color': '#ffffff',
        },
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !station) return;

    const nearest = nearestPoints(station, stations, NEAREST_COUNT);

    const setData = () => {
      const source = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: 'FeatureCollection',
        features: [station, ...nearest].map(s => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
          properties: {
            station_id: s.station_id,
            station_name: s.station_name,
            isCenter: s.station_id === station.station_id,
          },
        })),
      });

      const bounds = new mapboxgl.LngLatBounds();
      [station, ...nearest].forEach(s => bounds.extend([s.lng, s.lat]));
      m.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 });
    };

    if (m.isStyleLoaded()) setData();
    else m.once('load', setData);
  }, [station, stations]);

  if (!station) return null;

  return (
    <div className="commute-minimap-card">
      <div className="commute-minimap-label">
        <span className="commute-minimap-dot" style={{ background: dotColor }} />
        {label}
      </div>
      <div ref={mapContainer} className="commute-minimap-canvas" />
    </div>
  );
}
