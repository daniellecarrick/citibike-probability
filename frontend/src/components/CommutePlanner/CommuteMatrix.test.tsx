import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CommuteMatrix } from './CommuteMatrix';
import { useStore } from '../../store';
import type { CommuteMatrixResponse } from '../../types';

function makeMatrix(): CommuteMatrixResponse {
  return {
    origin: { id: 'S1', name: 'Park Ave' },
    destination: { id: 'S2', name: 'Grand St' },
    travel_minutes: 10,
    bucket_minutes: 30,
    days: Array.from({ length: 7 }, (_, day) => ({
      day_of_week: day as CommuteMatrixResponse['days'][number]['day_of_week'],
      buckets: Array.from({ length: 48 }, (_, i) => ({
        departure_minute: i * 30,
        departure_time: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`,
        success_probability: 0.5,
        bike_probability: 0.7,
        dock_probability: 0.7,
        sample_count: 10,
      })),
    })),
  };
}

beforeEach(() => {
  useStore.setState({ selectedDay: 0, selectedTime: 0 });
});

describe('CommuteMatrix', () => {
  it('renders a cell for every day × bucket', () => {
    const { container } = render(<CommuteMatrix matrix={makeMatrix()} />);
    expect(container.querySelectorAll('rect').length).toBe(7 * 48);
  });

  it('clicking a cell sets the global day and time to that bucket', () => {
    const { container } = render(<CommuteMatrix matrix={makeMatrix()} />);
    const rects = container.querySelectorAll('rect');
    // Wednesday (day_of_week=2) is the 3rd row (index 2); bucket 16 → 08:00 (16 * 30 = 480)
    const wednesdayRow = 2;
    const bucketIdx = 16;
    const target = rects[wednesdayRow * 48 + bucketIdx];
    fireEvent.click(target);

    expect(useStore.getState().selectedDay).toBe(2);
    expect(useStore.getState().selectedTime).toBe(480);
  });
});
