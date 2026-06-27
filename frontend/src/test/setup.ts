import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import { mockSetData, mockSetPaintProperty, mockSetLayoutProperty, mockAddSource, mockAddLayer, mockGetCanvas, mockFlyTo, mockRemove, mockOn, mockOff, mockGetSource, resetMapHandlers } from './mocks/mapboxgl';

vi.mock('mapbox-gl', () => {
  const MapboxMock = {
    // Must use a regular function (not arrow) so `new mapboxgl.Map()` works
    Map: vi.fn(function MapMock() {
      return {
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
        isStyleLoaded: vi.fn(() => true),
      };
    }),
    accessToken: '',
    LngLatBounds: vi.fn(function LngLatBoundsMock() {}),
    Popup: vi.fn(function PopupMock() {
      return {
        setLngLat: vi.fn().mockReturnThis(),
        setHTML: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
      };
    }),
  };
  return { default: MapboxMock };
});

beforeEach(() => {
  mockSetData.mockClear();
  mockSetPaintProperty.mockClear();
  mockSetLayoutProperty.mockClear();
  mockAddSource.mockClear();
  mockAddLayer.mockClear();
  mockGetCanvas.mockClear();
  mockFlyTo.mockClear();
  mockRemove.mockClear();
  mockOn.mockClear();
  mockOff.mockClear();
  mockGetSource.mockClear();
  resetMapHandlers();
});
