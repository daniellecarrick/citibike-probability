/**
 * Probability color scale: pink (#ff2d78) → purple (#8b3df5) → blue (#1fa2ff)
 * Piecewise linear RGB interpolation. t = 0 (poor) … 1 (excellent).
 * Stress is pre-inverted before passing in (low stress → blue).
 */

type Stop = [number, number, number]; // [r, g, b]

const SCALES: Record<string, [Stop, Stop, Stop]> = {
  vivid:  [[255,45,120],  [139,61,245],  [31,162,255]],
  soft:   [[255,95,162],  [160,107,255], [79,208,255]],
  jewel:  [[224,17,95],   [109,40,217],  [14,165,233]],
};

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function scaleRGB(t: number, scale: [Stop, Stop, Stop]): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const [s0, s1, s2] = scale;
  if (clamped <= 0.5) {
    const u = clamped / 0.5;
    return [lerp(s0[0], s1[0], u), lerp(s0[1], s1[1], u), lerp(s0[2], s1[2], u)];
  }
  const u = (clamped - 0.5) / 0.5;
  return [lerp(s1[0], s2[0], u), lerp(s1[1], s2[1], u), lerp(s1[2], s2[2], u)];
}

export function probabilityToColor(
  p: number | null,
  alpha = 1,
  scaleName = 'vivid',
): string {
  if (p === null) return `rgba(154,161,173,${alpha})`;
  const [r, g, b] = scaleRGB(p, SCALES[scaleName] ?? SCALES.vivid);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function probabilityToRGB(
  p: number | null,
  scaleName = 'vivid',
): [number, number, number] {
  if (p === null) return [154, 161, 173];
  return scaleRGB(p, SCALES[scaleName] ?? SCALES.vivid);
}

/** Mapbox GL data-driven expression for circle color. */
export function mapboxColorExpression(scaleName = 'vivid'): mapboxgl.Expression {
  const scale = SCALES[scaleName] ?? SCALES.vivid;
  const [s0, s1, s2] = scale;
  return [
    'interpolate', ['linear'],
    ['coalesce', ['get', 'probability'], -1],
    -1,  `rgb(${[154,161,173].join(',')})`,  // no data
    0,   `rgb(${s0.join(',')})`,
    0.5, `rgb(${s1.join(',')})`,
    1,   `rgb(${s2.join(',')})`,
  ];
}

/** Mapbox GL expression for circle radius (4–13px based on probability). */
export function mapboxRadiusExpression(min = 4, max = 13): mapboxgl.Expression {
  return [
    'interpolate', ['linear'],
    ['coalesce', ['get', 'probability'], 0],
    0, min,
    1, max,
  ];
}

/** Format a probability as a percentage string. */
export function fmtPct(p: number | null): string {
  return p !== null ? `${Math.round(p * 100)}%` : '—';
}
