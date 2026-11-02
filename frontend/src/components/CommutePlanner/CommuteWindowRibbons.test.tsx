import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommuteWindowRibbons } from './CommuteWindowRibbons';
import type { CommuteMatrixResponse } from '../../types';

// 5-minute matrix. Weekdays: bike 0.8, dock 0.6 everywhere. Weekend: 0 for both,
// which must not drag the Mon–Fri average down.
function makeMatrix(): CommuteMatrixResponse {
  return {
    origin: { id: 'A', name: 'Park Ave' },
    destination: { id: 'B', name: 'Grand St' },
    travel_minutes: 10,
    bucket_minutes: 5,
    days: Array.from({ length: 7 }, (_, d) => ({
      day_of_week: d as CommuteMatrixResponse['days'][number]['day_of_week'],
      buckets: Array.from({ length: 288 }, (_, i) => ({
        departure_minute: i * 5,
        departure_time: '',
        success_probability: null,
        bike_probability: d > 4 ? 0 : 0.8,
        dock_probability: d > 4 ? 0 : 0.6,
        sample_count: 10,
      })),
    })),
    data_warning: null,
  };
}

describe('CommuteWindowRibbons', () => {
  it('shows the AM and PM windows with Mon–Fri averages for bike at start and dock at end', () => {
    const { container } = render(
      <CommuteWindowRibbons matrix={makeMatrix()} originName="Park Ave" destName="Grand St" bikeNoun="e-bike" />,
    );
    expect(screen.getByText('AM commute')).toBeInTheDocument();
    expect(screen.getByText('PM commute')).toBeInTheDocument();
    expect(screen.getAllByText('80% chance of an e-bike, 60% chance of a dock.').length).toBe(2);
    // Two rows (BIKE, DOCK) × 48 five-minute slots × two windows
    expect(container.querySelectorAll('rect.ribbon-segment').length).toBe(2 * 48 * 2);
  });
});
