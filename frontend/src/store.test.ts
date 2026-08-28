import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';
import type { BulkMapData } from './types';

beforeEach(() => {
  // Reset to known baseline state before each test
  const s = useStore.getState();
  s.setDay(1);
  s.setTime(480);
  s.setMetric('ebike');
  s.selectStation(null);
  s.setCommute(null);
  useStore.setState({ bulkCache: {}, currentMapData: [] });
});

describe('setDay / setTime', () => {
  it('setDay updates selectedDay', () => {
    useStore.getState().setDay(3);
    expect(useStore.getState().selectedDay).toBe(3);
  });

  it('setTime updates selectedTime', () => {
    useStore.getState().setTime(720);
    expect(useStore.getState().selectedTime).toBe(720);
  });
});

describe('stepTime', () => {
  it('advances by 5 minutes', () => {
    useStore.getState().setTime(100);
    useStore.getState().stepTime();
    expect(useStore.getState().selectedTime).toBe(105);
  });

  it('wraps from 1435 back to 0', () => {
    useStore.getState().setTime(1435);
    useStore.getState().stepTime();
    expect(useStore.getState().selectedTime).toBe(0);
  });
});

describe('selectStation', () => {
  it('sets selectedStationId', () => {
    useStore.getState().selectStation('abc');
    expect(useStore.getState().selectedStationId).toBe('abc');
  });

  it('clears selectedStationId when called with null', () => {
    useStore.getState().selectStation('abc');
    useStore.getState().selectStation(null);
    expect(useStore.getState().selectedStationId).toBeNull();
  });
});

describe('setCommute', () => {
  it('stores the commute plan', () => {
    const plan = { originId: 'A', destId: 'B', bikeType: 'any' as const };
    useStore.getState().setCommute(plan);
    expect(useStore.getState().commute).toEqual(plan);
  });

  it('clears commute when called with null', () => {
    useStore.getState().setCommute({ originId: 'A', destId: 'B', bikeType: 'any' });
    useStore.getState().setCommute(null);
    expect(useStore.getState().commute).toBeNull();
  });
});

describe('setBulkCache', () => {
  const fakeBulk = (): BulkMapData => ({
    station_ids: [],
    slots: { '0': { probability: [], mean_inventory: [], sample_count: [] } },
  });

  it('stores bulk data under the given key', () => {
    const data = fakeBulk();
    useStore.getState().setBulkCache('0_bikes', data);
    expect(useStore.getState().bulkCache['0_bikes']).toBe(data);
  });

  it('does not overwrite other keys', () => {
    useStore.getState().setBulkCache('0_bikes', fakeBulk());
    useStore.getState().setBulkCache('1_bikes', fakeBulk());
    expect(useStore.getState().bulkCache['0_bikes']).toBeDefined();
    expect(useStore.getState().bulkCache['1_bikes']).toBeDefined();
  });
});
