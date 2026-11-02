/**
 * Plain-language one-liners for a station's day, e.g. "Bikes are hard to
 * find in the morning", from its 288 five-minute values for the map's
 * selected day and metric.
 */
import type { Metric } from '../store';

type Period = 'morning' | 'midday' | 'evening' | 'overnight';

/** [start, end) in minutes since midnight. Overnight wraps past midnight. */
const PERIODS: { key: Period; label: string; ranges: [number, number][] }[] = [
  { key: 'morning',   label: 'the morning',  ranges: [[6 * 60, 11 * 60]] },
  { key: 'midday',    label: 'midday',       ranges: [[11 * 60, 16 * 60]] },
  { key: 'evening',   label: 'the evening',  ranges: [[16 * 60, 21 * 60]] },
  { key: 'overnight', label: 'overnight',    ranges: [[21 * 60, 24 * 60], [0, 6 * 60]] },
];

/** Below this chance, a stretch of the day counts as "hard". */
const HARD = 0.6;
/** At or above this chance in every period, the station is reliable all day. */
const RELIABLE = 0.85;

const NOUN: Partial<Record<Metric, string>> = { bike: 'Bikes', ebike: 'E-bikes', dock: 'Open docks' };

function periodAverages(series: (number | null)[]): { key: Period; label: string; avg: number }[] {
  return PERIODS.flatMap(p => {
    const values: number[] = [];
    for (const [start, end] of p.ranges) {
      for (let slot = start / 5; slot < end / 5; slot++) {
        const v = series[slot];
        if (v !== null && v !== undefined) values.push(v);
      }
    }
    return values.length ? [{ key: p.key, label: p.label, avg: values.reduce((a, b) => a + b, 0) / values.length }] : [];
  });
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** A short headline for the station's day under the given metric; null when there's no data. */
export function describeStationDay(series: (number | null)[], metric: Metric): string | null {
  const periods = periodAverages(series);
  if (periods.length === 0) return null;

  if (metric === 'fullness') {
    const full = periods.filter(p => p.avg >= 0.85).map(p => p.label);
    const empty = periods.filter(p => p.avg <= 0.15).map(p => p.label);
    if (full.length === periods.length) return 'Usually full all day';
    if (empty.length === periods.length) return 'Usually nearly empty all day';
    if (full.length) return `Usually full in ${joinLabels(full)}`;
    if (empty.length) return `Usually nearly empty in ${joinLabels(empty)}`;
    return 'Usually partly full all day';
  }

  const noun = NOUN[metric] ?? 'Bikes';
  const hard = periods.filter(p => p.avg < HARD);
  if (hard.length === periods.length) return `${noun} are hard to find most of the day`;
  if (hard.length) {
    // Name the overnight stretch last; it matters least to most riders.
    const labels = hard.sort((a, b) => (a.key === 'overnight' ? 1 : 0) - (b.key === 'overnight' ? 1 : 0)).map(p => p.label);
    return `${noun} are hard to find in ${joinLabels(labels)}`;
  }
  if (periods.every(p => p.avg >= RELIABLE)) return `Usually ${noun.toLowerCase()} available all day`;
  const tightest = periods.reduce((a, b) => (b.avg < a.avg ? b : a));
  return `${noun} usually available, tighter in ${tightest.label}`;
}
