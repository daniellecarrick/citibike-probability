import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProbabilityRibbon } from './ProbabilityRibbon';
import { COMMUTE_WINDOWS } from '../../utils/time';

const TOTAL_WINDOW_SLOTS = COMMUTE_WINDOWS.reduce((sum, w) => sum + (w.endSlot - w.startSlot), 0);
const [AM_WINDOW] = COMMUTE_WINDOWS;

function series(fn: (i: number) => number | null): (number | null)[] {
  return Array.from({ length: 288 }, (_, i) => fn(i));
}

describe('ProbabilityRibbon', () => {
  it('renders a segment per non-null slot within the commute windows for each row', () => {
    // Ten null slots inside the AM window; everything else (including all
    // slots outside the commute windows) is non-null but shouldn't render.
    const bike = series(i => (i >= AM_WINDOW.startSlot && i < AM_WINDOW.startSlot + 10 ? null : 0.5));
    const dock = series(() => 0.8);
    const { container } = render(
      <ProbabilityRibbon rows={[{ label: 'BIKE', values: bike }, { label: 'DOCK', values: dock }]} />,
    );
    const rects = container.querySelectorAll('rect.ribbon-segment');
    expect(rects.length).toBe((TOTAL_WINDOW_SLOTS - 10) + TOTAL_WINDOW_SLOTS);
  });

  it('leaves a gap (no rect) for a null slot inside a commute window', () => {
    const nullSlot = AM_WINDOW.startSlot + 5;
    const bike = series(i => (i === nullSlot ? null : 0.5));
    const { container } = render(
      <ProbabilityRibbon rows={[{ label: 'BIKE', values: bike }]} />,
    );
    const rects = container.querySelectorAll('rect.ribbon-segment');
    expect(rects.length).toBe(TOTAL_WINDOW_SLOTS - 1);
  });

  it('does not render slots outside the commute windows', () => {
    const bike = series(() => 0.5); // every slot in the whole day has data
    const { container } = render(
      <ProbabilityRibbon rows={[{ label: 'BIKE', values: bike }]} />,
    );
    const rects = container.querySelectorAll('rect.ribbon-segment');
    expect(rects.length).toBe(TOTAL_WINDOW_SLOTS);
  });
});
