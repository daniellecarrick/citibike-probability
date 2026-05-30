import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { mapboxColorExpression, mapboxRadiusExpression } from '../../utils/colorScale';
import type { StationProbability } from '../../types';
import { HeatSurface } from './HeatSurface';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

const SOURCE_ID = 'stations';
const LAYER_ID = 'station-circles';

interface Props {
  data: StationProbability[];
}

export function StationMap({ data }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const { mapMode, selectStation } = useStore();

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-73.98, 40.75],
      zoom: 12,
    });

    map.current.on('load', () => {
      const m = map.current!;

      m.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      m.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': mapboxRadiusExpression(),
          'circle-color': mapboxColorExpression(),
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
        },
      });

      // Click handler
      m.on('click', LAYER_ID, (e) => {
        const features = e.features;
        if (!features || features.length === 0) return;
        const id = features[0].properties?.station_id as string;
        selectStation(id);
      });

      m.on('mouseenter', LAYER_ID, () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', LAYER_ID, () => {
        m.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [selectStation]);

  // Update GeoJSON data when prop changes
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    const source = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: data.map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: {
          station_id: s.station_id,
          station_name: s.station_name,
          probability: s.probability,
          stress_score: s.stress_score,
          sample_count: s.sample_count,
        },
      })),
    };

    source.setData(geojson);

    // Toggle circle layer visibility based on mapMode
    m.setLayoutProperty(LAYER_ID, 'visibility', mapMode === 'stations' ? 'visible' : 'none');
  }, [data, mapMode]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {mapMode === 'heat' && map.current && (
        <HeatSurface map={map.current} data={data} />
      )}
    </div>
  );
}
