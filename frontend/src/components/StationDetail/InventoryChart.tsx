/**
 * D3 horizontal bar chart showing inventory distribution histogram.
 */
import * as d3 from 'd3';
import { useEffect, useRef } from 'react';
import type { HistogramBucket } from '../../types';

interface Props {
  histogram: HistogramBucket[];
  color?: string;
}

export function InventoryChart({ histogram, color = '#0057B8' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || histogram.length === 0) return;

    const margin = { top: 8, right: 12, bottom: 20, left: 42 };
    const width = 240 - margin.left - margin.right;
    const height = 120 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const maxCount = d3.max(histogram, (d) => d.count) ?? 1;

    const x = d3.scaleLinear().domain([0, maxCount]).range([0, width]);
    const y = d3
      .scaleBand()
      .domain(histogram.map((d) => d.label))
      .range([0, height])
      .padding(0.2);

    // Bars
    g.selectAll('rect')
      .data(histogram)
      .join('rect')
      .attr('y', (d) => y(d.label) ?? 0)
      .attr('x', 0)
      .attr('height', y.bandwidth())
      .attr('width', (d) => x(d.count))
      .attr('fill', color)
      .attr('rx', 2);

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).tickSize(0))
      .select('.domain')
      .remove();

    g.selectAll('.tick text').style('fill', '#aaa').style('font-size', '10px');

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(4).tickSize(2))
      .select('.domain')
      .remove();

    g.selectAll('.tick line').style('stroke', '#444');
    g.selectAll('.tick text').style('fill', '#aaa').style('font-size', '10px');
  }, [histogram, color]);

  return <svg ref={svgRef} />;
}
