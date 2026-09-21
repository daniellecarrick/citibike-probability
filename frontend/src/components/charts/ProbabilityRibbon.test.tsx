import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProbabilityRibbon } from './ProbabilityRibbon';
import { COMMUTE_WINDOWS } from '../../utils/time';

const [AM_WINDOW] = COMMUTE_WINDOWS;
const AM_SLOTS = AM_WINDOW.endSlot - AM_WINDOW.startSlot;

function series(fn: (i: number) => number | null): (number | null)[] {
  return Array.from({ length: 288 }, (_, i) => fn(i));
}

describe('ProbabilityRibbon', () => {
  it('renders a segment per non-null slot within the window for each row', () => {
    // Ten null slots inside the window; everything else (including all
    // slots outside the window) is non-null but shouldn't render.
    const bike = series(i => (i >= AM_WINDOW.startSlot && i < AM_WINDOW.startSlot + 10 ? null : 0.5));
    const dock = series(() => 0.8);
    const { container } = render(
      <ProbabilityRibbon window={AM_WINDOW} rows={[{ label: 'BIKE', values: bike }, { label: 'DOCK', values: dock }]} />,
    );
    const rects = container.querySelectorAll('rect.ribbon-segment');
    expect(rects.length).toBe((AM_SLOTS - 10) + AM_SLOTS);
  });

  it('leaves a gap (no rect) for a null slot inside the window', () => {
    const nullSlot = AM_WINDOW.startSlot + 5;
    const bike = series(i => (i === nullSlot ? null : 0.5));
    const { container } = render(
      <ProbabilityRibbon window={AM_WINDOW} rows={[{ label: 'BIKE', values: bike }]} />,
    );
    const rects = container.querySelectorAll('rect.ribbon-segment');
    expect(rects.length).toBe(AM_SLOTS - 1);
  });

  it('does not render slots outside the window', () => {
    const bike = series(() => 0.5); // every slot in the whole day has data
    const { container } = render(
      <ProbabilityRibbon window={AM_WINDOW} rows={[{ label: 'BIKE', values: bike }]} />,
    );
    const rects = container.querySelectorAll('rect.ribbon-segment');
    expect(rects.length).toBe(AM_SLOTS);
  });
});
