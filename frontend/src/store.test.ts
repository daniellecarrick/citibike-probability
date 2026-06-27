import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';

beforeEach(() => {
  // Reset to known baseline state before each test
  const s = useStore.getState();
  s.setDay(1);
  s.setTime(480);
  s.setMetric('ebike');
  s.selectStation(null);
  s.setCommute(null);
  s.setRailTab('commute');
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

  it('switches railTab to station when an id is set', () => {
    useStore.getState().setRailTab('commute');
    useStore.getState().selectStation('xyz');
    expect(useStore.getState().railTab).toBe('station');
  });

  it('clears selectedStationId when called with null', () => {
    useStore.getState().selectStation('abc');
    useStore.getState().selectStation(null);
    expect(useStore.getState().selectedStationId).toBeNull();
  });

  it('does NOT change railTab when id is null', () => {
    useStore.getState().setRailTab('commute');
    useStore.getState().selectStation(null);
    expect(useStore.getState().railTab).toBe('commute');
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

  it('switches railTab to commute when a plan is set', () => {
    useStore.getState().setRailTab('station');
    useStore.getState().setCommute({ originId: 'A', destId: 'B', bikeType: 'any' });
    expect(useStore.getState().railTab).toBe('commute');
  });
});

describe('setBulkCache', () => {
  it('stores bulk data under the given key', () => {
    const data = { '0': [], '1': [] } as ReturnType<typeof useStore.getState>['bulkCache'][string];
    useStore.getState().setBulkCache('0_bikes', data!);
    expect(useStore.getState().bulkCache['0_bikes']).toBe(data);
  });

  it('does not overwrite other keys', () => {
    useStore.getState().setBulkCache('0_bikes', { '0': [] });
    useStore.getState().setBulkCache('1_bikes', { '0': [] });
    expect(useStore.getState().bulkCache['0_bikes']).toBeDefined();
    expect(useStore.getState().bulkCache['1_bikes']).toBeDefined();
  });
});
