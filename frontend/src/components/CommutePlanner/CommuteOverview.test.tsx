import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommuteOverview } from './CommuteOverview';
import { CommuteDayLines } from './CommuteDayLines';
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
        success_probability: 0.5 + (i % 10) / 20,
        bike_probability: 0.7,
        dock_probability: 0.7,
        sample_count: 10,
      })),
    })),
    data_warning: null,
  };
}

beforeEach(() => {
  useStore.setState({ selectedDay: 0, selectedTime: 0 });
});

describe('CommuteOverview', () => {
  it('shows the heatmap and the day-by-day lines as two separate cards', () => {
    const { container } = render(<CommuteOverview matrix={makeMatrix()} />);
    const cards = container.querySelectorAll('.card.commute-overview');
    expect(cards.length).toBe(2);
    expect(cards[0].querySelectorAll('rect.matrix-cell').length).toBe(7 * 48);
    expect(cards[1].querySelector('.commute-day-lines')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Lines' })).toBeNull();
  });
});

describe('CommuteDayLines', () => {
  it('draws one line per day', () => {
    const { container } = render(<CommuteDayLines matrix={makeMatrix()} />);
    const lines = container.querySelectorAll('path[stroke^="url(#day-line-"]');
    expect(lines.length).toBe(7);
  });

  it('is read-only: clicking a line leaves the day and time alone', () => {
    const { container } = render(<CommuteDayLines matrix={makeMatrix()} />);
    const svg = container.querySelector('svg')!;
    // Layout at the 900px fallback width: 48px labels, 846px plot, 44px rows + 6px gaps + 20px axis = 370px.
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 900, height: 370, right: 900, bottom: 370, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    // Wednesday is row 2 (y 100–144); 8:00 AM is 480 / 1410 of the plot width.
    const clientX = 48 + (480 / 1410) * 846;
    fireEvent.pointerDown(svg, { pointerType: 'mouse', button: 0, clientX, clientY: 120 });

    expect(useStore.getState().selectedDay).toBe(0);
    expect(useStore.getState().selectedTime).toBe(0);
  });
});
