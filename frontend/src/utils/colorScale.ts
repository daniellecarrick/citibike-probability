/**
 * Maps a probability (0-1) to a CSS color string.
 * Pink (#FFB3C6) at 0 → white (#FFFFFF) at 0.5 → blue (#0057B8) at 1.
 */
export function probabilityToColor(p: number | null, alpha = 1): string {
  if (p === null) return `rgba(180,180,180,${alpha})`;

  const clamped = Math.max(0, Math.min(1, p));

  let r: number, g: number, b: number;

  if (clamped <= 0.5) {
    const t = clamped / 0.5; // 0→1 as p goes 0→0.5
    r = Math.round(255 + t * (255 - 255));   // 255→255
    g = Math.round(179 + t * (255 - 179));   // 179→255
    b = Math.round(198 + t * (255 - 198));   // 198→255
  } else {
    const t = (clamped - 0.5) / 0.5; // 0→1 as p goes 0.5→1
    r = Math.round(255 + t * (0 - 255));     // 255→0
    g = Math.round(255 + t * (87 - 255));    // 255→87
    b = Math.round(255 + t * (184 - 255));   // 255→184
  }

  return `rgba(${r},${g},${b},${alpha})`;
}

/** Returns [r,g,b] as 0-255 integers for a probability. Used for canvas rendering. */
export function probabilityToRGB(p: number | null): [number, number, number] {
  if (p === null) return [180, 180, 180];

  const clamped = Math.max(0, Math.min(1, p));

  if (clamped <= 0.5) {
    const t = clamped / 0.5;
    return [255, Math.round(179 + t * 76), Math.round(198 + t * 57)];
  } else {
    const t = (clamped - 0.5) / 0.5;
    return [Math.round(255 - t * 255), Math.round(255 - t * 168), Math.round(255 - t * 71)];
  }
}

/** Returns a Mapbox GL JS expression for data-driven circle coloring. */
export function mapboxColorExpression(): mapboxgl.Expression {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'probability'], -1],
    -1, '#B4B4B4',  // null/no data
    0,  '#FFB3C6',  // pink
    0.5,'#FFFFFF',  // white
    1,  '#0057B8',  // blue
  ];
}

/** Mapbox expression for data-driven circle radius scaled by probability. */
export function mapboxRadiusExpression(minR = 4, maxR = 14): mapboxgl.Expression {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'probability'], 0],
    0, minR,
    1, maxR,
  ];
}
