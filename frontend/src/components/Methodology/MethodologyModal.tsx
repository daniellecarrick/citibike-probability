interface Props {
  onClose: () => void;
}

export function MethodologyModal({ onClose }: Props) {
  return (
    <div className="methodology-backdrop" onClick={onClose}>
      <div className="methodology-modal" onClick={e => e.stopPropagation()}>
        <div className="methodology-header">
          <h2 className="methodology-title">How probability is calculated</h2>
          <button className="methodology-close" onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="methodology-body">
          <section className="methodology-section">
            <h3>The core formula</h3>
            <p>
              For a station, day of week, and time of day, we look at every historical
              snapshot recorded in that same window and compute:
            </p>
            <pre className="methodology-formula">probability = (snapshots with ≥1 available) / (total snapshots in that window)</pre>
            <p>
              This is a plain empirical frequency — not a Wilson score or Bayesian
              estimate — so a probability backed by only a handful of samples can be
              noisy. Each result also reports a <code>sample_count</code> so you can
              judge how much history it's based on.
            </p>
          </section>

          <section className="methodology-section">
            <h3>Time windows</h3>
            <p>
              Snapshots are matched by <strong>day of week</strong> and a{' '}
              <strong>±15-minute window</strong> around the selected time — e.g. "Tuesday
              8:00 AM" pools every Tuesday snapshot recorded between 7:45–8:15 AM. This
              smooths out noise while still capturing how availability shifts through the
              day.
            </p>
          </section>

          <section className="methodology-section">
            <h3>Data collection</h3>
            <p>
              Live station status is polled from Citi Bike's public GBFS feed every{' '}
              <strong>5 minutes</strong>, so the freshest an underlying data point can be
              is a few minutes old. Station metadata (location, capacity) refreshes
              hourly.
            </p>
          </section>

          <section className="methodology-section">
            <h3>90-day rolling history</h3>
            <p>
              Only snapshots from the last <strong>90 days</strong> count toward a
              probability. Before real collection had 90 days of history, the app
              backfilled realistic synthetic demand curves so the map wasn't empty on
              day one — that seeded data ages out automatically as real data
              accumulates and is never mixed with real data beyond the 90-day window.
            </p>
          </section>

          <section className="methodology-section">
            <h3>Bikes vs. e-bikes vs. docks</h3>
            <p>
              Classic bikes, e-bikes, and open docks are tracked as separate counts and
              produce separate probabilities — switching the metric changes which
              column is checked for "≥1 available," not just how the map is colored.
            </p>
          </section>

          <section className="methodology-section">
            <h3>Missing data</h3>
            <p>
              A station with no snapshots in the selected window (e.g. it was offline,
              or is too new) shows as having no probability rather than 0% — there's a
              difference between "usually empty" and "we don't know."
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
