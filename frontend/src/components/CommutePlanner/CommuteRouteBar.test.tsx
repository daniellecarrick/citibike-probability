import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommuteRouteBar } from './CommuteRouteBar';
import { useStore } from '../../store';
import type { Station } from '../../types';

const stations = [
  { station_id: 'A', station_name: 'Park Ave' },
  { station_id: 'B', station_name: 'Grand St' },
] as Station[];

beforeEach(() => {
  useStore.setState({
    commute: { originId: 'A', destId: 'B', bikeType: 'ebike' },
    selectedDay: 1,
    selectedTime: 510,
    headlineControlsVisible: true,
  });
});

describe('CommuteRouteBar', () => {
  it('hides the day/time/bike controls while the headline shows them', () => {
    render(<CommuteRouteBar stations={stations} />);
    expect(screen.queryByLabelText('Day of week')).toBeNull();
  });

  it('shows working controls once the headline has scrolled away', () => {
    useStore.setState({ headlineControlsVisible: false });
    render(<CommuteRouteBar stations={stations} />);

    fireEvent.change(screen.getByLabelText('Day of week'), { target: { value: '4' } });
    expect(useStore.getState().selectedDay).toBe(4);

    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: '1020' } });
    expect(useStore.getState().selectedTime).toBe(1020);

    fireEvent.click(screen.getByRole('button', { name: 'All bikes' }));
    expect(useStore.getState().commute).toEqual({ originId: 'A', destId: 'B', bikeType: 'any' });
  });
});
