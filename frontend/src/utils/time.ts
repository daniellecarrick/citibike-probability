export const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Morning/evening peak windows, shared by the station-detail commute
 * summary and the probability ribbon chart so both stay in sync. */
export interface CommuteWindow {
  key: 'am' | 'pm';
  label: string;
  startSlot: number; // inclusive, 5-min slot index (0-287)
  endSlot: number;   // exclusive
}

export const COMMUTE_WINDOWS: CommuteWindow[] = [
  { key: 'am', label: 'AM commute', startSlot: 7 * 12, endSlot: 9 * 12 },   // 7am–9am
  { key: 'pm', label: 'PM commute', startSlot: 17 * 12, endSlot: 19 * 12 }, // 5pm–7pm
];

/** Mean of the non-null values in a 5-min-slot series over a commute window. */
export function averageInWindow(values: (number | null)[], window: CommuteWindow): number | null {
  let sum = 0;
  let count = 0;
  for (let i = window.startSlot; i < window.endSlot; i++) {
    const v = values[i];
    if (v !== null && v !== undefined) { sum += v; count++; }
  }
  return count > 0 ? sum / count : null;
}
