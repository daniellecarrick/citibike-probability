import { describe, it, expect } from 'vitest';
import { describeStationDay } from './stationSummary';

/** 288 slots; `at(minute)` gives the value for each slot's start minute. */
function day(at: (minute: number) => number | null): (number | null)[] {
  return Array.from({ length: 288 }, (_, slot) => at(slot * 5));
}
const hour = (m: number) => m / 60;

describe('describeStationDay', () => {
  it('reliable all day', () => {
    expect(describeStationDay(day(() => 0.95), 'bike')).toBe('Usually bikes available all day');
  });

  it('names the hard stretch', () => {
    const series = day(m => (hour(m) >= 6 && hour(m) < 11 ? 0.2 : 0.95));
    expect(describeStationDay(series, 'bike')).toBe('Bikes are hard to find in the morning');
  });

  it('names several hard stretches, overnight last', () => {
    const series = day(m => (hour(m) < 6 || (hour(m) >= 16 && hour(m) < 21) ? 0.3 : 0.9));
    expect(describeStationDay(series, 'ebike')).toBe('E-bikes are hard to find in the evening and overnight');
  });

  it('hard all day', () => {
    expect(describeStationDay(day(() => 0.1), 'dock')).toBe('Open docks are hard to find most of the day');
  });

  it('mostly fine but one tighter stretch', () => {
    const series = day(m => (hour(m) >= 11 && hour(m) < 16 ? 0.7 : 0.95));
    expect(describeStationDay(series, 'bike')).toBe('Bikes usually available, tighter in midday');
  });

  it('fullness reads as full / empty', () => {
    const series = day(m => (hour(m) >= 16 && hour(m) < 21 ? 0.95 : 0.5));
    expect(describeStationDay(series, 'fullness')).toBe('Usually full in the evening');
    expect(describeStationDay(day(() => 0.05), 'fullness')).toBe('Usually nearly empty all day');
  });

  it('no data', () => {
    expect(describeStationDay(day(() => null), 'bike')).toBeNull();
  });
});
