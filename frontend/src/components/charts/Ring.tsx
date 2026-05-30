/**
 * Circular arc gauge. Shows a probability as a colored arc + center number.
 */
import { probabilityToColor } from '../../utils/colorScale';

interface Props {
  value: number | null;
  size?: number;
  strokeWidth?: number;
}

export function Ring({ value, size = 58, strokeWidth = 6 }: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = value !== null ? circumference * value : 0;
  const color = probabilityToColor(value);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle
        cx={center} cy={center} r={r}
        fill="none"
        stroke="#eef0f3"
        strokeWidth={strokeWidth}
      />
      {/* Filled arc */}
      <circle
        cx={center} cy={center} r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .5s cubic-bezier(.4,0,.2,1)' }}
      />
      {/* Center text */}
      <text
        x={center} y={center}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Newsreader', Georgia, serif"
        fontSize={size * 0.24}
        fontWeight={600}
        fill={color}
      >
        {value !== null ? Math.round(value * 100) : '—'}
      </text>
    </svg>
  );
}
