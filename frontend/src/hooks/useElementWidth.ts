import { useEffect, useState } from 'react';

/**
 * Measured content width of an element, for SVG charts that size their
 * viewBox to real pixels (1 unit = 1px) so axis text stays legible instead
 * of shrinking with the container. Returns a callback ref (works even when
 * the element mounts after a loading state) and the width, which is
 * `fallback` until first measured (and in test environments without layout).
 */
export function useElementWidth<T extends Element = HTMLDivElement>(fallback: number): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}
