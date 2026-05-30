import type {
  AdminCoverageSlot,
  AdminPoll,
  AdminSummary,
  BulkMapData,
  CommuteResult,
  DayOfWeek,
  Metric,
  Recommendation,
  Station,
  StationDetail,
  StationProbability,
} from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  stations: {
    list: () => get<Station[]>('/api/stations'),
    get: (id: string) => get<Station>(`/api/stations/${id}`),
    detail: (id: string, day: DayOfWeek, time: number) =>
      get<StationDetail>(`/api/stations/${id}/detail`, { day, time }),
  },

  map: {
    snapshot: (day: DayOfWeek, time: number, metric: Metric) =>
      get<StationProbability[]>('/api/map', { day, time, metric }),
    bulk: (day: DayOfWeek, metric: Metric) =>
      get<BulkMapData>('/api/map/bulk', { day, metric }),
  },

  commute: {
    success: (origin: string, destination: string, day: DayOfWeek, departure_time: number) =>
      get<CommuteResult>('/api/commute/success', { origin, destination, day, departure_time }),
    recommendations: (origin: string, destination: string, day: DayOfWeek, departure_time: number) =>
      get<Recommendation[]>('/api/commute/recommendations', { origin, destination, day, departure_time }),
  },

  admin: {
    summary: () => get<AdminSummary>('/api/admin/summary'),
    polls: (limit = 100) => get<AdminPoll[]>('/api/admin/polls', { limit }),
    coverage: () => get<AdminCoverageSlot[]>('/api/admin/coverage'),
  },
};
