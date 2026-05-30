import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AdminCoverageSlot, AdminPoll, AdminSummary } from '../../types';
import { CoverageHeatmap } from './CoverageHeatmap';
import { PollLog } from './PollLog';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function AdminPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [polls, setPolls] = useState<AdminPoll[]>([]);
  const [coverage, setCoverage] = useState<AdminCoverageSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.admin.summary(),
      api.admin.polls(200),
      api.admin.coverage(),
    ])
      .then(([s, p, c]) => {
        setSummary(s);
        setPolls(p);
        setCoverage(c);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const maxPollCount = coverage.length > 0 ? Math.max(...coverage.map(c => c.poll_count)) : 0;
  const minPollCount = coverage.length > 0 ? Math.min(...coverage.map(c => c.poll_count)) : 0;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1 className="admin-title">Data Collection Status</h1>
        {summary && (
          <div className="admin-subtitle">
            Last poll: {formatDate(summary.last_poll)}
          </div>
        )}
      </div>

      {loading && <div className="panel-loading">Loading...</div>}

      {summary && (
        <>
          <section className="admin-section">
            <div className="stat-cards">
              <StatCard
                label="Total snapshots"
                value={summary.total_rows.toLocaleString()}
                sub={`${summary.station_count.toLocaleString()} stations`}
              />
              <StatCard
                label="Total polls"
                value={summary.total_polls.toLocaleString()}
                sub={`${summary.span_days}d of data`}
              />
              <StatCard
                label="Polls (last 24h)"
                value={summary.polls_last_24h}
                sub={`of ${summary.expected_polls_per_day} expected`}
              />
              <StatCard
                label="Coverage depth"
                value={`${minPollCount}–${maxPollCount}`}
                sub="polls per 5-min window"
              />
              <StatCard
                label="Data started"
                value={formatDate(summary.first_poll)}
              />
            </div>
          </section>

          <section className="admin-section">
            <h2 className="admin-section-title">Weekly Coverage Heatmap</h2>
            <p className="admin-section-desc">
              Each cell is a 5-minute window in the week. <strong>Coverage</strong> shows how many
              times that window has been observed — 1 = one week of data, 2 = two weeks, etc.
              Switch to probability views to see average availability across all stations.
            </p>
            <CoverageHeatmap data={coverage} />
          </section>

          <section className="admin-section">
            <h2 className="admin-section-title">Recent Polls</h2>
            <p className="admin-section-desc">
              One row per 5-minute collection cycle. A complete poll captures all {summary.station_count.toLocaleString()} stations.
            </p>
            <PollLog polls={polls} />
          </section>
        </>
      )}
    </div>
  );
}
