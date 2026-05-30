/**
 * Inverse Distance Weighting (IDW) interpolation for the heat surface.
 * Called from a Web Worker so it doesn't block the main thread.
 *
 * Given N station points with probabilities, computes a WxH grid
 * of RGBA values for rendering onto an offscreen canvas.
 */

import { probabilityToRGB } from './colorScale';

export interface StationPoint {
  lat: number;
  lng: number;
  probability: number;
}

export interface GridSpec {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  width: number;   // pixel columns
  height: number;  // pixel rows
}

export function computeIDW(
  stations: StationPoint[],
  grid: GridSpec,
  power = 2,
): Uint8ClampedArray {
  const { minLat, maxLat, minLng, maxLng, width, height } = grid;
  const pixels = new Uint8ClampedArray(width * height * 4);

  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const lat = maxLat - (row / height) * latRange;
      const lng = minLng + (col / width) * lngRange;

      let weightedSum = 0;
      let totalWeight = 0;
      let exactMatch: number | null = null;

      for (const s of stations) {
        const dlat = s.lat - lat;
        const dlng = s.lng - lng;
        const dist2 = dlat * dlat + dlng * dlng;

        if (dist2 === 0) {
          exactMatch = s.probability;
          break;
        }

        const w = 1 / Math.pow(dist2, power / 2);
        weightedSum += w * s.probability;
        totalWeight += w;
      }

      const p = exactMatch !== null ? exactMatch : (totalWeight > 0 ? weightedSum / totalWeight : 0);
      const [r, g, b] = probabilityToRGB(p);
      const idx = (row * width + col) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 180; // semi-transparent
    }
  }

  return pixels;
}
