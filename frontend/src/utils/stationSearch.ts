import type { Station } from '../types';

/**
 * Matches a station if every whitespace-separated word in the query is a
 * substring of at least one of name/borough/neighborhood — so "brooklyn
 * henry" matches a station named "...Henry St" whose borough is "Brooklyn",
 * even though neither field alone contains both words.
 */
export function filterStations(stations: Station[], query: string, limit: number): Station[] {
  const trimmed = query.trim();
  if (!trimmed) return stations.slice(0, limit);

  const tokens = trimmed.toLowerCase().split(/\s+/);
  return stations
    .filter(s => {
      const haystacks = [s.station_name, s.borough, s.neighborhood]
        .filter((v): v is string => !!v)
        .map(v => v.toLowerCase());
      return tokens.every(tok => haystacks.some(h => h.includes(tok)));
    })
    .slice(0, limit);
}
