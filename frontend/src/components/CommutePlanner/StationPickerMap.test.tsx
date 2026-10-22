import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { StationPickerMap } from './StationPickerMap';
import { triggerMapEvent } from '../../test/mocks/mapboxgl';
import type { Station } from '../../types';

const stations = [
  { station_id: 'A', station_name: 'Park Ave', lat: 40.75, lng: -73.98 },
  { station_id: 'B', station_name: 'Grand St', lat: 40.72, lng: -73.99 },
  { station_id: 'C', station_name: 'Bedford Ave', lat: 40.71, lng: -73.96 },
] as Station[];

function tapStation(id: string) {
  act(() => triggerMapEvent('click', 'picker-hits', { features: [{ properties: { station_id: id } }] }));
}

function setup(props: Partial<React.ComponentProps<typeof StationPickerMap>> = {}) {
  const onDone = vi.fn();
  render(<StationPickerMap stations={stations} originId="" destId="" onDone={onDone} onClose={() => {}} {...props} />);
  act(() => triggerMapEvent('load'));
  return { onDone };
}

describe('StationPickerMap', () => {
  it('first tap sets the start, second sets the end, then confirms both', () => {
    const { onDone } = setup();
    expect(screen.getByText('Tap your start station')).toBeInTheDocument();
    const done = screen.getByRole('button', { name: 'Use these stations' });
    expect(done).toBeDisabled();

    tapStation('A');
    expect(screen.getByText('Park Ave')).toBeInTheDocument();
    expect(screen.getByText('Tap your end station')).toBeInTheDocument();

    tapStation('B');
    expect(screen.getByText('Grand St')).toBeInTheDocument();
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalledWith('A', 'B');
  });

  it("won't use the same station for both ends", () => {
    setup();
    tapStation('A');
    tapStation('A');
    expect(screen.getByRole('button', { name: 'Use these stations' })).toBeDisabled();
  });

  it('can switch back to re-pick the start station', () => {
    const { onDone } = setup({ originId: 'A', destId: 'B', initialLeg: 'dest' });
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    tapStation('C');
    fireEvent.click(screen.getByRole('button', { name: 'Use these stations' }));
    expect(onDone).toHaveBeenCalledWith('C', 'B');
  });
});
