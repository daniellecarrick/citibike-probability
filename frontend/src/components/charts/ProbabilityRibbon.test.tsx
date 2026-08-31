import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProbabilityRibbon } from './ProbabilityRibbon';

function series(fn: (i: number) => number | null): (number | null)[] {
  return Array.from({ length: 288 }, (_, i) => fn(i));
}

describe('ProbabilityRibbon', () => {
  it('renders a segment per non-null slot for each row', () => {
    const bike = series(i => (i >= 100 && i < 110 ? null : 0.5));
    const dock = series(() => 0.8);
    const { container } = render(
      <ProbabilityRibbon rows={[{ label: 'BIKE', values: bike }, { label: 'DOCK', values: dock }]} />,
    );
    const rects = container.querySelectorAll('rect.ribbon-segment');
    expect(rects.length).toBe((288 - 10) + 288);
  });

  it('leaves a gap (no rect) for null slots', () => {
    const bike = series(i => (i === 50 ? null : 0.5));
    const { container } = render(
      <ProbabilityRibbon rows={[{ label: 'BIKE', values: bike }]} />,
    );
    const rects = container.querySelectorAll('rect.ribbon-segment');
    expect(rects.length).toBe(287);
  });
});
