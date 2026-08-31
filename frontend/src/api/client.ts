import type {
  AdminCoverageSlot,
  AdminPoll,
  AdminSummary,
  BulkMapData,
  CommuteAvailabilitySeries,
  CommuteMatrixResponse,
  CommuteResult,
  DayOfWeek,
  Metric,
  Recommendation,
  Station,
  StationProbability,
} from '../types';

const runtimeConfig = (globalThis as typeof globalThis & { __APP_CONFIG__?: { API_URL?: string } }).__APP_CONFIG__ ?? {};
const BASE = runtimeConfig.API_URL ?? import.meta.env.VITE_API_URL ?? '';

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
    matrix: (origin: string, destination: string, bucketMinutes = 30) =>
      get<CommuteMatrixResponse>('/api/commute/matrix', { origin, destination, bucket_minutes: bucketMinutes }),
    availabilitySeries: (origin: string, destination: string, day: DayOfWeek) =>
      get<CommuteAvailabilitySeries>('/api/commute/availability-series', { origin, destination, day }),
  },

  admin: {
    summary: () => get<AdminSummary>('/api/admin/summary'),
    polls: (limit = 100) => get<AdminPoll[]>('/api/admin/polls', { limit }),
    coverage: () => get<AdminCoverageSlot[]>('/api/admin/coverage'),
  },
};
