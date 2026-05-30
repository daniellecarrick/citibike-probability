import { computeIDW, type GridSpec, type StationPoint } from '../utils/idw';

self.onmessage = (e: MessageEvent<{ stations: StationPoint[]; grid: GridSpec }>) => {
  const { stations, grid } = e.data;
  const pixels = computeIDW(stations, grid, 2);
  self.postMessage(pixels, { transfer: [pixels.buffer as ArrayBuffer] });
};
