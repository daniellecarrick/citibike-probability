/** Tiny 48×20 inline sparkline used in the map tooltip. */
interface Props {
  values: number[];
  currentSlot?: number;
  width?: number;
  height?: number;
}

export function Sparkline({ values, currentSlot, width = 48, height = 20 }: Props) {
  if (!values.length) return null;
  const max = Math.max(...values, 0.01);
  const pts = values.map((v, i) =>
    `${((i / (values.length - 1)) * width).toFixed(1)},${((1 - v / max) * height).toFixed(1)}`
  );
  const polyline = pts.join(' ');

  const nowX = currentSlot !== undefined
    ? (currentSlot / (values.length - 1)) * width
    : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      <polyline points={polyline} fill="none" stroke="#8b3df5" strokeWidth={1.5} strokeLinejoin="round" />
      {nowX !== null && (
        <line x1={nowX} x2={nowX} y1={0} y2={height} stroke="#16181d" strokeWidth={1} opacity={0.4} />
      )}
    </svg>
  );
}
