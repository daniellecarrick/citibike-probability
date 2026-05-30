/**
 * 7-day × 288-slot heatmap showing data coverage and e-bike probability.
 * Days on the Y axis, time of day on the X axis.
 * Each cell = one 5-minute window in the week.
 */
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import type { AdminCoverageSlot } from '../../types';

type ViewMode = 'coverage' | 'ebike' | 'bike' | 'dock';

interface Props {
  data: AdminCoverageSlot[];
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL_W = 2;
const CELL_H = 18;
const MARGIN = { top: 24, right: 16, bottom: 32, left: 36 };
const WIDTH = 288 * CELL_W;
const HEIGHT = 7 * CELL_H;

const MODE_LABELS: Record<ViewMode, string> = {
  coverage: 'Poll count (observations per window)',
  ebike: 'Avg e-bike probability',
  bike: 'Avg bike probability',
  dock: 'Avg dock probability',
};

export function CoverageHeatmap({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ViewMode>('coverage');

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('width', WIDTH + MARGIN.left + MARGIN.right)
      .attr('height', HEIGHT + MARGIN.top + MARGIN.bottom)
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Color scales
    const maxPolls = d3.max(data, d => d.poll_count) ?? 1;
    const coverageScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxPolls]);
    const probScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 1]);

    function cellColor(d: AdminCoverageSlot): string {
      if (mode === 'coverage') return coverageScale(d.poll_count);
      const v = mode === 'ebike' ? d.avg_ebike_prob
              : mode === 'bike'  ? d.avg_bike_prob
              : d.avg_dock_prob;
      return v === null ? '#333' : probScale(v);
    }

    // Draw cells
    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => (d.time_minutes / 5) * CELL_W)
      .attr('y', d => d.day_of_week * CELL_H)
      .attr('width', CELL_W)
      .attr('height', CELL_H - 1)
      .attr('fill', d => cellColor(d))
      .on('mousemove', (event, d) => {
        const tip = tooltipRef.current;
        if (!tip) return;
        tip.style.display = 'block';
        tip.style.left = `${event.pageX + 12}px`;
        tip.style.top = `${event.pageY - 28}px`;
        tip.innerHTML = `
          <strong>${d.day_name} ${d.time_label}</strong><br/>
          Polls: <b>${d.poll_count}</b><br/>
          E-bike prob: <b>${d.avg_ebike_prob !== null ? (d.avg_ebike_prob * 100).toFixed(1) + '%' : '—'}</b><br/>
          Bike prob: <b>${d.avg_bike_prob !== null ? (d.avg_bike_prob * 100).toFixed(1) + '%' : '—'}</b>
        `;
      })
      .on('mouseleave', () => {
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      });

    // Y axis — day labels
    DAYS.forEach((day, i) => {
      g.append('text')
        .attr('x', -6)
        .attr('y', i * CELL_H + CELL_H / 2 + 1)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#8b8fa8')
        .attr('font-size', 11)
        .text(day);
    });

    // X axis — hour labels every 2 hours (every 24 slots)
    for (let h = 0; h <= 24; h += 2) {
      const x = (h * 12) * CELL_W;
      g.append('text')
        .attr('x', x)
        .attr('y', HEIGHT + 14)
        .attr('text-anchor', 'middle')
        .attr('fill', '#8b8fa8')
        .attr('font-size', 10)
        .text(`${String(h).padStart(2, '0')}:00`);
    }

    // Color legend
    const legendW = 120;
    const legendG = svg.append('g')
      .attr('transform', `translate(${WIDTH + MARGIN.left - legendW}, ${MARGIN.top + HEIGHT + 18})`);

    if (mode === 'coverage') {
      const defs = svg.append('defs');
      const grad = defs.append('linearGradient').attr('id', 'cov-grad');
      grad.append('stop').attr('offset', '0%').attr('stop-color', coverageScale(0));
      grad.append('stop').attr('offset', '100%').attr('stop-color', coverageScale(maxPolls));
      legendG.append('rect').attr('width', legendW).attr('height', 8).attr('fill', 'url(#cov-grad)').attr('rx', 2);
      legendG.append('text').attr('x', 0).attr('y', 18).attr('fill', '#8b8fa8').attr('font-size', 10).text('0');
      legendG.append('text').attr('x', legendW).attr('y', 18).attr('text-anchor', 'end').attr('fill', '#8b8fa8').attr('font-size', 10).text(`${maxPolls} polls`);
    } else {
      const defs = svg.append('defs');
      const grad = defs.append('linearGradient').attr('id', 'prob-grad');
      [0, 0.25, 0.5, 0.75, 1].forEach(t => {
        grad.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', probScale(t));
      });
      legendG.append('rect').attr('width', legendW).attr('height', 8).attr('fill', 'url(#prob-grad)').attr('rx', 2);
      legendG.append('text').attr('x', 0).attr('y', 18).attr('fill', '#8b8fa8').attr('font-size', 10).text('0%');
      legendG.append('text').attr('x', legendW).attr('y', 18).attr('text-anchor', 'end').attr('fill', '#8b8fa8').attr('font-size', 10).text('100%');
    }
  }, [data, mode]);

  return (
    <div className="heatmap-container">
      <div className="heatmap-controls">
        {(Object.keys(MODE_LABELS) as ViewMode[]).map(m => (
          <button
            key={m}
            className={`btn ${mode === m ? 'btn-active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'coverage' ? 'Coverage' : m === 'ebike' ? 'E-Bike %' : m === 'bike' ? 'Bike %' : 'Dock %'}
          </button>
        ))}
        <span className="heatmap-legend-label">{MODE_LABELS[mode]}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg ref={svgRef} />
      </div>
      <div ref={tooltipRef} className="heatmap-tooltip" style={{ display: 'none', position: 'fixed', pointerEvents: 'none' }} />
    </div>
  );
}
