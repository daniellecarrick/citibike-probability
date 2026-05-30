import type { AdminPoll } from '../../types';

interface Props {
  polls: AdminPoll[];
}

export function PollLog({ polls }: Props) {
  return (
    <div className="poll-log">
      <table className="poll-table">
        <thead>
          <tr>
            <th>Time (local)</th>
            <th>Stations</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {polls.map(p => (
            <tr key={p.timestamp}>
              <td className="poll-time">{p.datetime_local}</td>
              <td>{p.station_count.toLocaleString()}</td>
              <td>
                <span className={`poll-badge ${p.complete ? 'badge-ok' : 'badge-warn'}`}>
                  {p.complete ? 'Complete' : 'Partial'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
