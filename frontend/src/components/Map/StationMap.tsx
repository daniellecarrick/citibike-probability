import mapboxgl from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { mapboxColorExpression } from '../../utils/colorScale';
import type { StationProbability } from '../../types';
import { HeatSurface } from './HeatSurface';
import { StationHoverTooltip } from './StationHoverTooltip';

const runtimeConfig = (globalThis as typeof globalThis & { __APP_CONFIG__?: { MAPBOX_TOKEN?: string } }).__APP_CONFIG__ ?? {};
mapboxgl.accessToken = runtimeConfig.MAPBOX_TOKEN ?? import.meta.env.VITE_MAPBOX_TOKEN ?? '';

const SOURCE_ID     = 'stations';
const CIRCLE_LAYER  = 'station-circles';
const HIT_LAYER     = 'station-hits';

interface Props {
  data: StationProbability[];
}

export function StationMap({ data }: Props) {
  const mapContainer   = useRef<HTMLDivElement>(null);
  const map            = useRef<mapboxgl.Map | null>(null);
  const tooltipRef     = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredStation, setHoveredStation] = useState<{ id: string; name: string } | null>(null);
  const { mapMode, selectStation, selectedStationId, selectedMetric, commute, mapDataLoading } = useStore();

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-73.98, 40.75],
      zoom: 12,
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

      // Visible circle layer (stations mode)
      m.addLayer({
        id: CIRCLE_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 8,
          'circle-color': mapboxColorExpression(),
          'circle-opacity': 0.82,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Invisible hit targets (surface mode)
      m.addLayer({
        id: HIT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 9,
          'circle-color': 'rgba(255,255,255,0)',
          'circle-opacity': 0,
        },
      });

      m.on('click', CIRCLE_LAYER, (e) => {
        const id = e.features?.[0]?.properties?.station_id as string | undefined;
        if (id) selectStation(id);
      });
      m.on('click', HIT_LAYER, (e) => {
        const id = e.features?.[0]?.properties?.station_id as string | undefined;
        if (id) selectStation(id);
      });

      const showTooltip = (props: Record<string, unknown> | null | undefined) => {
        if (props) setHoveredStation({ id: String(props.station_id), name: String(props.station_name) });
      };
      const moveTooltip = (e: MouseEvent) => {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.left = `${e.clientX + 14}px`;
        tooltipRef.current.style.top  = `${e.clientY - 40}px`;
      };

      m.on('mouseenter', CIRCLE_LAYER, (e) => { m.getCanvas().style.cursor = 'pointer'; showTooltip(e.features?.[0]?.properties as Record<string, unknown> | null); });
      m.on('mouseleave', CIRCLE_LAYER, () =>  { m.getCanvas().style.cursor = ''; setHoveredStation(null); });
      m.on('mousemove',  CIRCLE_LAYER, (e) => moveTooltip(e.originalEvent));
      m.on('mouseenter', HIT_LAYER,    (e) => { m.getCanvas().style.cursor = 'pointer'; showTooltip(e.features?.[0]?.properties as Record<string, unknown> | null); });
      m.on('mouseleave', HIT_LAYER,    () =>  { m.getCanvas().style.cursor = ''; setHoveredStation(null); });
      m.on('mousemove',  HIT_LAYER,    (e) => moveTooltip(e.originalEvent));

      // Apply initial visibility before the visibility effect runs
      const initialMode = useStore.getState().mapMode;
      m.setLayoutProperty(CIRCLE_LAYER, 'visibility', initialMode === 'stations' ? 'visible' : 'none');
      m.setLayoutProperty(HIT_LAYER,    'visibility', initialMode === 'surface'  ? 'visible' : 'none');

      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
      setMapLoaded(false);
    };
  }, [selectStation]);

  // Auto-zoom to user location once map is ready (fires after StrictMode remount settles)
  useEffect(() => {
    if (!mapLoaded || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        const inNYC = lat >= 40.45 && lat <= 40.95 && lng >= -74.25 && lng <= -73.65;
        if (inNYC) map.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 1500 });
      },
      (err) => console.warn('[geolocation] failed:', err.code, err.message),
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, [mapLoaded]);

  // Update GeoJSON station data (includes fullness for % Full metric)
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const source = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: data.map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: {
          station_id:     s.station_id,
          station_name:   s.station_name,
          probability:    s.probability,
          stress_score:   s.stress_score,
          mean_inventory: s.mean_inventory,
          capacity:       s.capacity,
          fullness: (s.mean_inventory != null && s.capacity != null && s.capacity > 0)
            ? Math.min(1, s.mean_inventory / s.capacity)
            : null,
        },
      })),
    });
  }, [data, mapLoaded]);

  // Toggle layer visibility by map mode
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    try {
      m.setLayoutProperty(CIRCLE_LAYER, 'visibility', mapMode === 'stations' ? 'visible' : 'none');
      m.setLayoutProperty(HIT_LAYER,    'visibility', mapMode === 'surface'  ? 'visible' : 'none');
    } catch { /* layers not yet added */ }
  }, [mapMode, mapLoaded]);

  // 4px black stroke on selected station + active commute origin/destination
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;

    const ids = [...new Set([
      selectedStationId,
      commute?.originId,
      commute?.destId,
    ].filter(Boolean) as string[])];

    if (ids.length === 0) {
      m.setPaintProperty(CIRCLE_LAYER, 'circle-stroke-width', 1.5);
      m.setPaintProperty(CIRCLE_LAYER, 'circle-stroke-color', '#ffffff');
    } else {
      m.setPaintProperty(CIRCLE_LAYER, 'circle-stroke-width',
        ['case', ['in', ['get', 'station_id'], ['literal', ids]], 4, 1.5]);
      m.setPaintProperty(CIRCLE_LAYER, 'circle-stroke-color',
        ['case', ['in', ['get', 'station_id'], ['literal', ids]], '#16181d', '#ffffff']);
    }
  }, [selectedStationId, commute, mapLoaded]);

  // Circle color switches between probability and fullness by metric
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const valueProperty = selectedMetric === 'fullness' ? 'fullness' : 'probability';
    m.setPaintProperty(CIRCLE_LAYER, 'circle-color', mapboxColorExpression('vivid', valueProperty));
  }, [selectedMetric, mapLoaded]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {mapMode === 'surface' && map.current && (
        <HeatSurface map={map.current} data={data} />
      )}

      {mapDataLoading && data.length > 0 && <div className="map-loading-bar" />}
      {mapDataLoading && data.length === 0 && <div className="map-loading-spinner" />}

      <StationHoverTooltip station={hoveredStation} tooltipRef={tooltipRef} />
    </div>
  );
}
