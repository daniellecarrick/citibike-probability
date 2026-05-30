import { probabilityToColor } from '../../utils/colorScale';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface Props {
  values: number[];      // length 7, index 0=Mon
  currentDay: number;   // 0=Mon
}

export function WeekBars({ values, currentDay }: Props) {
  const max = Math.max(...values, 0.01);

  return (
    <div className="week-bars">
      {values.map((v, i) => (
        <div key={i} className={`week-bar-col${i === currentDay ? ' current' : ''}`}>
          <div
            className="week-bar"
            style={{
              height: `${Math.round((v / max) * 40)}px`,
              background: probabilityToColor(v),
            }}
          />
          <span className="week-bar-day">{DAY_LETTERS[i]}</span>
        </div>
      ))}
    </div>
  );
}
