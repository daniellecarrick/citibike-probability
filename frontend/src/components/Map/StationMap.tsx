import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { mapboxColorExpression } from '../../utils/colorScale';
import type { StationProbability } from '../../types';
import { HeatSurface } from './HeatSurface';
import { MetricChips } from './MetricChips';
import { TimeScrubber } from '../Controls/TimeScrubber';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

const SOURCE_ID = 'stations';
const CIRCLE_LAYER = 'station-circles';
const HIT_LAYER = 'station-hits'; // invisible hit targets for surface mode

interface Props {
  data: StationProbability[];
}

export function StationMap({ data }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const { mapMode, selectStation } = useStore();

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

      // Restyle to match design spec
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

      // Invisible hit targets (surface mode — same size but transparent)
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

      m.on('mouseenter', CIRCLE_LAYER, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', CIRCLE_LAYER, () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseenter', HIT_LAYER,    () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', HIT_LAYER,    () => { m.getCanvas().style.cursor = ''; });

      // Apply initial visibility — the visibility effect runs before layers exist, so set it here.
      const initialMode = useStore.getState().mapMode;
      m.setLayoutProperty(CIRCLE_LAYER, 'visibility', initialMode === 'stations' ? 'visible' : 'none');
      m.setLayoutProperty(HIT_LAYER,    'visibility', initialMode === 'surface'  ? 'visible' : 'none');
    });

    return () => { map.current?.remove(); map.current = null; };
  }, [selectStation]);

  // Update GeoJSON data
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: data.map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: {
          station_id: s.station_id,
          station_name: s.station_name,
          probability: s.probability,
          stress_score: s.stress_score,
        },
      })),
    });
  }, [data]);

  // Toggle layer visibility by map mode
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    try {
      m.setLayoutProperty(CIRCLE_LAYER, 'visibility', mapMode === 'stations' ? 'visible' : 'none');
      m.setLayoutProperty(HIT_LAYER,    'visibility', mapMode === 'surface'  ? 'visible' : 'none');
    } catch { /* layers not yet added */ }
  }, [mapMode]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {mapMode === 'surface' && map.current && (
        <HeatSurface map={map.current} data={data} />
      )}

      <MetricChips />
      <TimeScrubber />
    </div>
  );
}
