/** True on touch-first devices (phones, tablets), where there's no hover. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none), (pointer: coarse)').matches;
}

/** The verb for interaction copy: "Tap a tile" on touch, "Click a tile" with a mouse. */
export function tapOrClick(): 'Tap' | 'Click' {
  return isTouchDevice() ? 'Tap' : 'Click';
}
