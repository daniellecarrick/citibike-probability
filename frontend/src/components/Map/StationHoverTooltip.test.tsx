import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { StationHoverTooltip } from './StationHoverTooltip';
import { useStore } from '../../store';
import type { BulkMapData, StationProbability } from '../../types';

// One station, 25 docks. Every slot: 18 bikes on average, and a 100% chance of 2+ bikes.
// The two numbers disagree on purpose: % Full must use bikes ÷ docks (72%), not the chance.
const bulk: BulkMapData = {
  station_ids: ['S1'],
  slots: Object.fromEntries(Array.from({ length: 288 }, (_, slot) => [
    String(slot), { probability: [1], mean_inventory: [18], sample_count: [10] },
  ])),
};

beforeEach(() => {
  useStore.setState({
    selectedDay: 5,
    selectedTime: 600,
    bulkCache: { '5_bikes': bulk },
    currentMapData: [{ station_id: 'S1', station_name: 'President St & Henry St', capacity: 25 } as StationProbability],
  });
});

function renderTooltip() {
  render(<StationHoverTooltip station={{ id: 'S1', name: 'President St & Henry St' }} tooltipRef={createRef()} />);
}

describe('StationHoverTooltip', () => {
  it('shows fullness as average bikes ÷ docks under % Full', () => {
    useStore.setState({ selectedMetric: 'fullness' });
    renderTooltip();
    expect(screen.getByText('72% full')).toBeInTheDocument();
  });

  it('shows the chance of a bike under the Bike metric', () => {
    useStore.setState({ selectedMetric: 'bike' });
    renderTooltip();
    expect(screen.getByText('100% chance')).toBeInTheDocument();
  });
});
