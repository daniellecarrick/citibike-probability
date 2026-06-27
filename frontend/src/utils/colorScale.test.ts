import { describe, it, expect } from 'vitest';
import { probabilityToColor, fmtPct, mapboxColorExpression } from './colorScale';

describe('probabilityToColor', () => {
  it('returns grey for null', () => {
    expect(probabilityToColor(null)).toMatch(/rgba\(154,161,173/);
  });

  it('returns red-ish at 0', () => {
    const color = probabilityToColor(0);
    // vivid scale: s0 = [255,45,120] → high red, low green
    expect(color).toMatch(/rgba\(255,45,120/);
  });

  it('returns blue-ish at 1', () => {
    const color = probabilityToColor(1);
    // vivid scale: s2 = [31,162,255] → low red, high blue
    expect(color).toMatch(/rgba\(31,162,255/);
  });

  it('returns purple-ish at 0.5', () => {
    const color = probabilityToColor(0.5);
    // vivid scale midpoint: s1 = [139,61,245]
    expect(color).toMatch(/rgba\(139,61,245/);
  });

  it('clamps values below 0 to red', () => {
    expect(probabilityToColor(-1)).toBe(probabilityToColor(0));
  });

  it('clamps values above 1 to blue', () => {
    expect(probabilityToColor(2)).toBe(probabilityToColor(1));
  });

  it('accepts an alpha value', () => {
    expect(probabilityToColor(1, 0.5)).toMatch(/rgba\(31,162,255,0\.5\)/);
  });

  it('accepts alternate scale names', () => {
    const vivid = probabilityToColor(0, 1, 'vivid');
    const soft  = probabilityToColor(0, 1, 'soft');
    expect(vivid).not.toBe(soft);
  });

  it('falls back to vivid for unknown scale names', () => {
    expect(probabilityToColor(0, 1, 'nonexistent')).toBe(probabilityToColor(0, 1, 'vivid'));
  });
});

describe('fmtPct', () => {
  it('formats a probability as a rounded percentage', () => {
    expect(fmtPct(0.754)).toBe('75%');
  });

  it('rounds 0.755 up to 76%', () => {
    expect(fmtPct(0.755)).toBe('76%');
  });

  it('returns em dash for null', () => {
    expect(fmtPct(null)).toBe('—');
  });

  it('handles 0 and 1 correctly', () => {
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(1)).toBe('100%');
  });
});

describe('mapboxColorExpression', () => {
  it('starts with interpolate and linear', () => {
    const expr = mapboxColorExpression();
    expect(expr[0]).toBe('interpolate');
    expect(expr[1]).toEqual(['linear']);
  });

  it('uses probability property by default', () => {
    const expr = mapboxColorExpression();
    expect(JSON.stringify(expr)).toContain('"probability"');
  });

  it('uses the given valueProperty when specified', () => {
    const expr = mapboxColorExpression('vivid', 'fullness');
    expect(JSON.stringify(expr)).toContain('"fullness"');
    expect(JSON.stringify(expr)).not.toContain('"probability"');
  });

  it('includes a no-data stop at -1', () => {
    const expr = mapboxColorExpression();
    expect(expr).toContain(-1);
  });
});
