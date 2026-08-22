import { describe, it, expect } from 'vitest';
import { filterStations } from './stationSearch';
import type { Station } from '../types';

const STATIONS: Station[] = [
  { station_id: 'A', station_name: 'Chauncey St & Stuyvesant Ave', lat: 0, lng: 0, capacity: 10, borough: 'Brooklyn', neighborhood: 'Stuyvesant Heights' },
  { station_id: 'B', station_name: 'W 20 St & 7 Ave', lat: 0, lng: 0, capacity: 10, borough: 'Manhattan', neighborhood: 'Chelsea' },
  { station_id: 'C', station_name: 'Union St', lat: 0, lng: 0, capacity: 10, borough: 'Jersey City', neighborhood: null },
  { station_id: 'D', station_name: 'Rutgers St & Henry St', lat: 0, lng: 0, capacity: 10, borough: 'Manhattan', neighborhood: 'Lower East Side' },
  { station_id: 'E', station_name: 'Henry St & Amity St', lat: 0, lng: 0, capacity: 10, borough: 'Brooklyn', neighborhood: 'Cobble Hill' },
];

describe('filterStations', () => {
  it('returns all stations (up to limit) when query is empty', () => {
    expect(filterStations(STATIONS, '', 2)).toHaveLength(2);
  });

  it('matches on station name', () => {
    const result = filterStations(STATIONS, 'chauncey', 40);
    expect(result.map(s => s.station_id)).toEqual(['A']);
  });

  it('matches on borough', () => {
    const result = filterStations(STATIONS, 'brooklyn', 40);
    expect(result.map(s => s.station_id).sort()).toEqual(['A', 'E']);
  });

  it('matches on neighborhood', () => {
    const result = filterStations(STATIONS, 'chelsea', 40);
    expect(result.map(s => s.station_id)).toEqual(['B']);
  });

  it('is case-insensitive', () => {
    const result = filterStations(STATIONS, 'BROOKLYN', 40);
    expect(result.map(s => s.station_id).sort()).toEqual(['A', 'E']);
  });

  it('does not error on a station with a null neighborhood', () => {
    const result = filterStations(STATIONS, 'jersey', 40);
    expect(result.map(s => s.station_id)).toEqual(['C']);
  });

  it('respects the limit', () => {
    expect(filterStations(STATIONS, '', 1)).toHaveLength(1);
  });

  it('matches a multi-word query across different fields (borough + name)', () => {
    // "Henry" appears in two stations' names, but only one is in Brooklyn.
    const result = filterStations(STATIONS, 'brooklyn henry', 40);
    expect(result.map(s => s.station_id)).toEqual(['E']);
  });

  it('matches a multi-word query entirely within one field', () => {
    const result = filterStations(STATIONS, 'stuyvesant heights', 40);
    expect(result.map(s => s.station_id)).toEqual(['A']);
  });

  it('requires every word to match something (AND, not OR)', () => {
    const result = filterStations(STATIONS, 'manhattan henry', 40);
    expect(result.map(s => s.station_id)).toEqual(['D']);
  });

  it('returns nothing when one word matches no field at all', () => {
    const result = filterStations(STATIONS, 'brooklyn nonexistentword', 40);
    expect(result).toHaveLength(0);
  });

  it('ignores extra whitespace between words', () => {
    const result = filterStations(STATIONS, '  brooklyn   henry  ', 40);
    expect(result.map(s => s.station_id)).toEqual(['E']);
  });
});
