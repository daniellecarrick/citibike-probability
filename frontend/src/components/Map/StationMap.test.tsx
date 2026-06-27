import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { StationMap } from './StationMap';
import { useStore } from '../../store';
import { mockSetData, mockSetPaintProperty, mockOn, triggerMapEvent } from '../../test/mocks/mapboxgl';
import type { StationProbability } from '../../types';

// mapbox-gl is mocked globally via src/test/setup.ts

const STATIONS: StationProbability[] = [
  { station_id: 'A', station_name: 'Alpha', lat: 40.75, lng: -73.98, capacity: 20, probability: 0.8, mean_inventory: 8, sample_count: 100, stress_score: null },
  { station_id: 'B', station_name: 'Beta',  lat: 40.76, lng: -73.97, capacity: 15, probability: 0.3, mean_inventory: 3, sample_count: 80,  stress_score: null },
];

beforeEach(() => {
  useStore.setState({
    selectedStationId: null,
    commute: null,
    selectedMetric: 'ebike',
    mapMode: 'stations',
    currentMapData: [],
    bulkCache: {},
  });
});

async function renderMap(data = STATIONS) {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<StationMap data={data} />);
  });
  // Fire the 'load' event inside act() so React processes the setMapLoaded(true) state update
  await act(async () => {
    triggerMapEvent('load');
  });
  return utils;
}

describe('GeoJSON data layer', () => {
  it('calls setData with a FeatureCollection when data prop is provided', async () => {
    await renderMap();
    await waitFor(() => {
      const featureCollections = mockSetData.mock.calls.filter(([arg]) => arg?.type === 'FeatureCollection');
      expect(featureCollections.length).toBeGreaterThan(0);
    });
  });

  it('includes required feature properties', async () => {
    await renderMap();
    await waitFor(() => {
      const stationCall = mockSetData.mock.calls.find(([arg]) =>
        arg?.features?.length > 0 && arg.features[0]?.properties?.station_id
      );
      expect(stationCall).toBeDefined();
      const feature = stationCall![0].features[0];
      expect(feature.properties).toMatchObject({
        station_id:     'A',
        probability:    0.8,
        mean_inventory: 8,
        capacity:       20,
      });
      expect(feature.properties.fullness).toBeCloseTo(0.4);
    });
  });

  it('sets fullness to null when capacity is null', async () => {
    const data = [{ ...STATIONS[0], capacity: null }];
    await renderMap(data);
    await waitFor(() => {
      const stationCall = mockSetData.mock.calls.find(([arg]) =>
        arg?.features?.some((f: { properties: { station_id: string } }) => f.properties.station_id === 'A')
      );
      expect(stationCall).toBeDefined();
      const feature = stationCall![0].features[0];
      expect(feature.properties.fullness).toBeNull();
    });
  });
});

describe('metric paint expression', () => {
  it('calls setPaintProperty with probability expression for ebike metric', async () => {
    useStore.setState({ selectedMetric: 'ebike' });
    await renderMap();
    await waitFor(() => {
      const colorCalls = mockSetPaintProperty.mock.calls.filter(([, prop]) => prop === 'circle-color');
      const expressionStrings = colorCalls.map(([,, expr]) => JSON.stringify(expr));
      expect(expressionStrings.some(s => s.includes('probability'))).toBe(true);
    });
  });

  it('calls setPaintProperty with fullness expression when metric is fullness', async () => {
    useStore.setState({ selectedMetric: 'fullness' });
    await renderMap();
    await waitFor(() => {
      const colorCalls = mockSetPaintProperty.mock.calls.filter(([, prop]) => prop === 'circle-color');
      const expressionStrings = colorCalls.map(([,, expr]) => JSON.stringify(expr));
      expect(expressionStrings.some(s => s.includes('fullness'))).toBe(true);
    });
  });
});

describe('stroke on selected station', () => {
  it('resets stroke to 1.5 when no station is selected', async () => {
    useStore.setState({ selectedStationId: null, commute: null });
    await renderMap();
    await waitFor(() => {
      const strokeCalls = mockSetPaintProperty.mock.calls.filter(([, prop]) => prop === 'circle-stroke-width');
      expect(strokeCalls.some(([,, val]) => val === 1.5)).toBe(true);
    });
  });

  it('sets stroke to a case expression when a station is selected', async () => {
    useStore.setState({ selectedStationId: 'A', commute: null });
    await renderMap();
    await waitFor(() => {
      const strokeCalls = mockSetPaintProperty.mock.calls.filter(([, prop]) => prop === 'circle-stroke-width');
      const caseCall = strokeCalls.find(([,, expr]) => Array.isArray(expr) && expr[0] === 'case');
      expect(caseCall).toBeDefined();
      expect(JSON.stringify(caseCall![2])).toContain('"A"');
    });
  });

  it('includes all commute IDs in the stroke expression', async () => {
    useStore.setState({
      selectedStationId: 'A',
      commute: { originId: 'A', destId: 'B', bikeType: 'any' },
    });
    await renderMap();
    await waitFor(() => {
      const strokeCalls = mockSetPaintProperty.mock.calls.filter(([, prop]) => prop === 'circle-stroke-width');
      const caseCall = strokeCalls.find(([,, expr]) => Array.isArray(expr) && expr[0] === 'case');
      const exprStr = JSON.stringify(caseCall![2]);
      expect(exprStr).toContain('"A"');
      expect(exprStr).toContain('"B"');
    });
  });
});

describe('station click', () => {
  it('calls selectStation with the clicked feature station_id', async () => {
    await renderMap();
    await act(async () => {
      triggerMapEvent('click', 'station-circles', {
        features: [{ properties: { station_id: 'A' } }],
      });
    });
    expect(useStore.getState().selectedStationId).toBe('A');
  });

  it('registers click handlers for both circle and hit layers', async () => {
    await renderMap();
    const clickLayers = mockOn.mock.calls
      .filter(([event]) => event === 'click')
      .map(([, layer]) => layer);
    expect(clickLayers).toContain('station-circles');
    expect(clickLayers).toContain('station-hits');
  });
});
