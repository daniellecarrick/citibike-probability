/**
 * Renders an IDW heat surface as a Mapbox image source overlay.
 * Computation runs in a Web Worker to avoid blocking the main thread.
 */
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import type { StationProbability } from '../../types';

const IMAGE_SOURCE_ID = 'heat-surface';
const IMAGE_LAYER_ID = 'heat-surface-layer';
const GRID_W = 256;
const GRID_H = 256;

// NYC Citi Bike approximate bounding box
const BOUNDS: [number, number, number, number] = [-74.05, 40.65, -73.90, 40.82]; // [minLng, minLat, maxLng, maxLat]

interface Props {
  map: MapboxMap;
  data: StationProbability[];
}

export function HeatSurface({ map, data }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<OffscreenCanvas | null>(null);

  useEffect(() => {
    // Set up Web Worker
    workerRef.current = new Worker(
      new URL('../../workers/idwWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e: MessageEvent<Uint8ClampedArray>) => {
      const pixels = e.data;

      // Render to offscreen canvas
      const canvas = new OffscreenCanvas(GRID_W, GRID_H);
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(GRID_W, GRID_H);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);

      canvas.convertToBlob({ type: 'image/png' }).then((blob) => {
        const url = URL.createObjectURL(blob);

        if (!map.getSource(IMAGE_SOURCE_ID)) {
          map.addSource(IMAGE_SOURCE_ID, {
            type: 'image',
            url,
            coordinates: [
              [BOUNDS[0], BOUNDS[3]], // top-left [lng, lat]
              [BOUNDS[2], BOUNDS[3]], // top-right
              [BOUNDS[2], BOUNDS[1]], // bottom-right
              [BOUNDS[0], BOUNDS[1]], // bottom-left
            ],
          });

          map.addLayer(
            {
              id: IMAGE_LAYER_ID,
              type: 'raster',
              source: IMAGE_SOURCE_ID,
              paint: { 'raster-opacity': 0.7 },
            },
            'station-circles',
          );
        } else {
          (map.getSource(IMAGE_SOURCE_ID) as mapboxgl.ImageSource).updateImage({ url });
        }
      });
    };

    canvasRef.current = new OffscreenCanvas(GRID_W, GRID_H);

    return () => {
      workerRef.current?.terminate();
      if (map.isStyleLoaded() && map.getLayer(IMAGE_LAYER_ID)) map.removeLayer(IMAGE_LAYER_ID);
      if (map.isStyleLoaded() && map.getSource(IMAGE_SOURCE_ID)) map.removeSource(IMAGE_SOURCE_ID);
    };
  }, [map]);

  // Send new data to worker when props change
  useEffect(() => {
    if (!workerRef.current || data.length === 0) return;

    const stations = data
      .filter((s) => s.probability !== null)
      .map((s) => ({ lat: s.lat, lng: s.lng, probability: s.probability as number }));

    workerRef.current.postMessage({
      stations,
      grid: {
        minLat: BOUNDS[1],
        maxLat: BOUNDS[3],
        minLng: BOUNDS[0],
        maxLng: BOUNDS[2],
        width: GRID_W,
        height: GRID_H,
      },
    });
  }, [data]);

  return null; // All rendering is via Mapbox layers
}
