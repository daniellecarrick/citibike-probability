import { useEffect, useRef, useState } from 'react';
import { StationDetailPanel } from '../StationDetail/StationDetailPanel';
import { useStore } from '../../store';

type Snap = 'peek' | 'half' | 'full';

/** Visible sheet height for each snap point, in px, for the current viewport. */
function snapHeights(): Record<Snap, number> {
  const vh = window.visualViewport?.height ?? window.innerHeight;
  return {
    peek: Math.min(260, Math.round(vh * 0.34)),
    half: Math.round(vh * 0.58),
    // Leave the header and a sliver of map visible so it still reads as a sheet.
    full: Math.round(vh - 64),
  };
}

const SNAPS: Snap[] = ['peek', 'half', 'full'];

/**
 * Station details as a draggable bottom sheet. Opens at half height when a
 * station is tapped; drag the handle between peek / half / full, or below
 * peek to dismiss. The map stays interactive at peek and half so tapping
 * another station just swaps the sheet's contents.
 */
export function MobileBottomSheet() {
  const { selectedStationId, selectStation } = useStore();
  const [snap, setSnap] = useState<Snap | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number; active: boolean } | null>(null);
  const [heights, setHeights] = useState(snapHeights);

  useEffect(() => {
    const onResize = () => setHeights(snapHeights());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Open when a station is tapped on the map (or picked from search).
  useEffect(() => {
    if (selectedStationId) setSnap(s => s ?? 'half');
    else setSnap(null);
  }, [selectedStationId]);

  const open = snap !== null;

  function close() {
    setSnap(null);
    selectStation(null);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!snap) return;
    if ((e.target as HTMLElement).closest('.mobile-sheet-close')) return;
    drag.current = { startY: e.clientY, startH: heights[snap], lastY: e.clientY, lastT: e.timeStamp, v: 0, active: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    // Don't treat it as a drag until it moves, so a tap on the handle still clicks.
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < 6) return;
      d.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (e.clientY - d.lastY) / dt; // px/ms, positive = downward
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragHeight(Math.max(80, Math.min(heights.full, d.startH - (e.clientY - d.startY))));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.active || dragHeight === null) { setDragHeight(null); return; }
    const h = dragHeight;
    setDragHeight(null);

    // A quick flick moves one snap in that direction; otherwise snap to nearest.
    const idx = snap ? SNAPS.indexOf(snap) : 0;
    if (Math.abs(d.v) > 0.5) {
      if (d.v > 0) { if (idx === 0) close(); else setSnap(SNAPS[idx - 1]); }
      else setSnap(SNAPS[Math.min(SNAPS.length - 1, idx + 1)]);
      return;
    }
    if (h < heights.peek * 0.6) { close(); return; }
    const nearest = SNAPS.reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a));
    setSnap(nearest);
  }

  function cycleSnap() {
    if (!snap) return;
    setSnap(snap === 'full' ? 'half' : 'full');
  }

  const height = dragHeight ?? (snap ? heights[snap] : heights.half);

  return (
    <>
      {/* Only dim the map when the sheet covers it */}
      {snap === 'full' && (
        <div className="mobile-sheet-backdrop" onClick={() => setSnap('half')} />
      )}

      <div
        className={`mobile-sheet${open ? ' open' : ''}${dragHeight !== null ? ' dragging' : ''}`}
        style={{ height }}
        aria-hidden={!open}
      >
        <div
          className="mobile-sheet-header"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <button
            className="mobile-handle-bar"
            onClick={cycleSnap}
            aria-label={snap === 'full' ? 'Collapse station details' : 'Expand station details'}
          >
            <span className="mobile-sheet-handle" />
          </button>
          <button className="mobile-sheet-close" onClick={close} aria-label="Close station details">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mobile-sheet-body">
          <StationDetailPanel />
        </div>
      </div>
    </>
  );
}
