import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StationAvailabilityPair } from './StationAvailabilityPair';
import { useStore } from '../../store';
import type { CommuteAvailabilitySeries } from '../../types';

function makeSeries(): CommuteAvailabilitySeries {
  return {
    origin: { id: 'S1', name: 'Park Ave' },
    destination: { id: 'S2', name: 'Grand St' },
    day_of_week: 1,
    // Bikes count up with the hour; docks are a flat 12 except 1 at 9:00 AM.
    slots: Array.from({ length: 288 }, (_, i) => ({
      minute: i * 5,
      bikes_available: Math.floor((i * 5) / 60),
      docks_available: i * 5 === 540 ? 1 : 12,
    })),
    data_warning: null,
  };
}

beforeEach(() => {
  useStore.setState({ selectedDay: 1, selectedTime: 480 });
});

describe('StationAvailabilityPair', () => {
  it('shows bikes at departure on the left and docks at arrival on the right', () => {
    render(<StationAvailabilityPair series={makeSeries()} departMinute={480} travelMinutes={60} bikeNoun={['e-bike', 'e-bikes']} />);
    expect(screen.getByText('Park Ave')).toBeInTheDocument();
    expect(screen.getByText('Grand St')).toBeInTheDocument();
    // 8:00 AM → 8 bikes; arriving 9:00 AM → 1 dock, flagged as scarce
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/e-bikes usually there at 8:00 AM/)).toBeInTheDocument();
    const docks = screen.getByText('1');
    expect(docks).toHaveClass('scarce');
    expect(screen.getByText(/open dock usually there at 9:00 AM/)).toBeInTheDocument();
  });

  it('says so when the arrival falls after midnight', () => {
    render(<StationAvailabilityPair series={makeSeries()} departMinute={1430} travelMinutes={30} bikeNoun={['bike', 'bikes']} />);
    expect(screen.getByText(/arrival is after midnight/)).toBeInTheDocument();
  });

  it('is read-only: clicking a chart leaves the departure time alone', () => {
    const { container } = render(
      <StationAvailabilityPair series={makeSeries()} departMinute={480} travelMinutes={30} bikeNoun={['bike', 'bikes']} />,
    );
    const destSvg = container.querySelector('.pair-panel-destination svg')!;
    // Fallback width 440: plot runs from x=28 to x=432 over minutes 0–1435.
    vi.spyOn(destSvg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 150, right: 440, bottom: 150, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const clientX = 28 + (600 / 1435) * 404; // 10:00 AM arrival
    fireEvent.pointerDown(destSvg, { pointerType: 'mouse', button: 0, clientX, clientY: 60 });
    expect(useStore.getState().selectedTime).toBe(480);
  });
});
