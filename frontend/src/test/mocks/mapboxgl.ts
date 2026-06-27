import { vi } from 'vitest';

export const mockSetData = vi.fn();
export const mockSetPaintProperty = vi.fn();
export const mockSetLayoutProperty = vi.fn();
export const mockAddSource = vi.fn();
export const mockAddLayer = vi.fn();
export const mockGetCanvas = vi.fn(() => ({ style: { cursor: '' } }));
export const mockFlyTo = vi.fn();
export const mockRemove = vi.fn();
export const mockIsStyleLoaded = vi.fn(() => true);

const eventHandlers: Record<string, Array<(e?: unknown) => void>> = {};

export const mockOn = vi.fn((event: string, layerOrHandler: unknown, handler?: (e?: unknown) => void) => {
  const key = handler ? `${event}:${layerOrHandler}` : event;
  const fn  = handler ?? (layerOrHandler as (e?: unknown) => void);
  eventHandlers[key] = eventHandlers[key] ?? [];
  eventHandlers[key].push(fn);
});

export const mockOff = vi.fn();

export function triggerMapEvent(event: string, layer?: string, eventData?: unknown) {
  const key = layer ? `${event}:${layer}` : event;
  (eventHandlers[key] ?? []).forEach(fn => fn(eventData));
}

export function resetMapHandlers() {
  Object.keys(eventHandlers).forEach(k => delete eventHandlers[k]);
}

export const mockGetSource = vi.fn(() => ({ setData: mockSetData }));

export const mockMapInstance = {
  on: mockOn,
  off: mockOff,
  addSource: mockAddSource,
  addLayer: mockAddLayer,
  getSource: mockGetSource,
  setPaintProperty: mockSetPaintProperty,
  setLayoutProperty: mockSetLayoutProperty,
  getCanvas: mockGetCanvas,
  flyTo: mockFlyTo,
  remove: mockRemove,
  isStyleLoaded: mockIsStyleLoaded,
};

const MapboxMock = {
  Map: vi.fn(() => mockMapInstance),
  accessToken: '',
  LngLatBounds: vi.fn(),
  Popup: vi.fn(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    setHTML: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  })),
};

export default MapboxMock;
