export type Metric = 'bikes' | 'classic' | 'ebikes' | 'docks';
export type MapMode = 'stations' | 'heat';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DayType = DayOfWeek | 'weekday' | 'weekend';

export interface Station {
  station_id: string;
  station_name: string;
  lat: number;
  lng: number;
  capacity: number | null;
}

export interface StationProbability {
  station_id: string;
  station_name: string;
  lat: number;
  lng: number;
  capacity: number | null;
  probability: number | null;
  mean_inventory: number | null;
  sample_count: number;
  stress_score: number | null;
}

export interface ProbabilityResult {
  probability: number | null;
  sample_count: number;
  metric: Metric;
}

export interface StressResult {
  stress_score: number | null;
  threshold: number;
  low_count: number;
  sample_count: number;
  metric: Metric;
}

export interface HistogramBucket {
  label: string;
  count: number;
}

export interface StabilityMetrics {
  metric: Metric;
  sample_count: number;
  mean: number | null;
  median: number | null;
  std_dev: number | null;
  min: number | null;
  max: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  histogram: HistogramBucket[];
}

export interface StationDetail extends Station {
  probabilities: Record<Metric, ProbabilityResult>;
  stress_scores: Record<Metric, StressResult>;
  distributions: Record<Metric, StabilityMetrics>;
  nearby_stations: Array<Station & { dist_sq: number }>;
}

export interface CommuteResult {
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  day_of_week: number;
  departure_time: string;
  arrival_time: string;
  travel_minutes: number;
  bike_probability: number | null;
  dock_probability: number | null;
  success_probability: number | null;
  bike_sample_count: number;
  dock_sample_count: number;
}

export interface Recommendation {
  departure_minute: number;
  departure_time: string;
  arrival_time: string;
  offset_minutes: number;
  success_probability: number | null;
  bike_probability: number | null;
  dock_probability: number | null;
}

// Bulk animation data: slot_index (0-287) → station probabilities
export type BulkMapData = Record<string, StationProbability[]>;

// Admin types
export interface AdminSummary {
  // Real (live collector) data
  real_rows: number;
  real_polls: number;
  real_station_count: number;
  real_first_poll: string | null;
  real_last_poll: string | null;
  real_span_days: number;
  real_polls_last_24h: number;
  // Seeded data context
  seeded_rows: number;
  seeded_polls: number;
  // Constants
  expected_polls_per_day: number;
}

export interface AdminPoll {
  timestamp: number;
  datetime_utc: string;
  datetime_local: string;
  station_count: number;
  complete: boolean;
}

export interface AdminCoverageSlot {
  raw_slot: number;
  day_of_week: number;      // 0=Mon … 6=Sun
  day_name: string;
  time_minutes: number;
  time_label: string;
  poll_count: number;
  avg_ebike_prob: number | null;
  avg_bike_prob: number | null;
  avg_dock_prob: number | null;
  mean_ebikes: number | null;
}
