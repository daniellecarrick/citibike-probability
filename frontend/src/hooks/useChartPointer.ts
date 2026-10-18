import { useRef } from 'react';

interface Options {
  /** Pointer is over (mouse) or pressed on and dragging across (touch/pen) the chart. */
  onHover: (clientX: number, clientY: number) => void;
  onLeave: () => void;
  /** Mouse: fires on press. Touch: fires on release, at the last dragged position. */
  onPick?: (clientX: number, clientY: number) => void;
  /** Touch: keep the tooltip up after the finger lifts (for read-only charts with no pick). */
  persistOnTouch?: boolean;
}

/**
 * Pointer handlers for scrubbable charts that behave on both mouse and touch.
 *
 * Mouse keeps the hover-then-click model. Touch has no hover, so a press
 * shows the tooltip, a horizontal drag scrubs it, and lifting the finger
 * commits the pick. Pair with `touch-action: pan-y` on the element: a
 * vertical swipe then scrolls the page, which cancels the pointer and
 * skips the pick, so scrolling past a chart never changes the selection.
 */
export function useChartPointer({ onHover, onLeave, onPick, persistOnTouch = false }: Options) {
  const pressed = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) onPick?.(e.clientX, e.clientY);
        return;
      }
      pressed.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      onHover(e.clientX, e.clientY);
    },
    onPointerMove(e: React.PointerEvent) {
      if (e.pointerType === 'mouse') { onHover(e.clientX, e.clientY); return; }
      if (!pressed.current) return;
      last.current = { x: e.clientX, y: e.clientY };
      onHover(e.clientX, e.clientY);
    },
    onPointerUp(e: React.PointerEvent) {
      if (e.pointerType === 'mouse') return;
      if (pressed.current && last.current) onPick?.(last.current.x, last.current.y);
      pressed.current = false;
      if (!persistOnTouch) onLeave();
    },
    onPointerCancel() {
      pressed.current = false;
      onLeave();
    },
    onPointerLeave(e: React.PointerEvent) {
      if (e.pointerType === 'mouse') onLeave();
    },
  };
}

/**
 * Keeps a fixed-position tooltip on screen: flips it to the left of the
 * pointer near the right edge, and lifts it above a finger on touch.
 */
export function tooltipPosition(x: number, y: number, width = 170, height = 80): { left: number; top: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const left = x + 14 + width > vw - 8 ? Math.max(8, x - 14 - width) : x + 14;
  const top = Math.max(8, y - height - 12);
  return { left, top };
}
