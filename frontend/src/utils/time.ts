export const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Morning/evening peak windows — the single source of truth for every
 * commute-window visual on the site (station-detail summary + ribbon on the
 * map page, and the matrix/window-bar charts on the commute planner page).
 * Mirrors MORNING_COMMUTE_WINDOW / EVENING_COMMUTE_WINDOW in
 * backend/analytics/commute.py — keep both in sync if either changes. */
export interface CommuteWindow {
  key: 'am' | 'pm';
  label: string;
  startSlot: number; // inclusive, 5-min slot index (0-287)
  endSlot: number;   // exclusive
}

export const COMMUTE_WINDOWS: CommuteWindow[] = [
  { key: 'am', label: 'AM commute', startSlot: 6 * 12, endSlot: 10 * 12 },  // 6am–10am
  { key: 'pm', label: 'PM commute', startSlot: 16 * 12, endSlot: 20 * 12 }, // 4pm–8pm
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
