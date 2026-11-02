import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { StationPickerMap } from './StationPickerMap';
import { mockProject, triggerMapEvent } from '../../test/mocks/mapboxgl';
import type { Station } from '../../types';

const stations = [
  { station_id: 'A', station_name: 'Park Ave', lat: 40.75, lng: -73.98 },
  { station_id: 'B', station_name: 'Grand St', lat: 40.72, lng: -73.99 },
  { station_id: 'C', station_name: 'Bedford Ave', lat: 40.71, lng: -73.96 },
] as Station[];

// The map mock projects every coordinate to (0, 0), so a pointer at (0, 0) sits on the dot.
function feature(id: string, name = id, neighborhood: string | null = null) {
  return { geometry: { type: 'Point', coordinates: [0, 0] }, properties: { station_id: id, name, neighborhood } };
}

function tapStation(id: string) {
  act(() => triggerMapEvent('click', 'picker-hits', { point: { x: 0, y: 0 }, features: [feature(id)] }));
}

function hoverStation(id: string, name: string, neighborhood: string | null = null) {
  act(() => triggerMapEvent('mousemove', 'picker-hits', { point: { x: 0, y: 0 }, features: [feature(id, name, neighborhood)] }));
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

describe('StationPickerMap hover tooltip', () => {
  afterEach(() => vi.restoreAllMocks());

  function withHover(hover: boolean) {
    vi.spyOn(window, 'matchMedia').mockImplementation(q => ({
      matches: q.includes('hover: hover') ? hover : false,
      media: q, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }) as MediaQueryList);
  }

  it('shows the station name, neighborhood, and what a click will do', () => {
    withHover(true);
    setup();
    hoverStation('C', 'Bedford Ave & N 7 St', 'Williamsburg');
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Bedford Ave & N 7 St');
    expect(tip).toHaveTextContent('Williamsburg');
    expect(tip).toHaveTextContent('Click to set as start');
  });

  it('says when the hovered station is already the other end', () => {
    withHover(true);
    setup({ originId: 'A', initialLeg: 'dest' });
    hoverStation('A', 'Park Ave');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Already your start station');
  });

  it('hides when the pointer leaves the station', () => {
    withHover(true);
    setup();
    hoverStation('B', 'Grand St');
    act(() => triggerMapEvent('mouseleave', 'picker-hits'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('does not appear on touch screens', () => {
    withHover(false);
    setup();
    hoverStation('B', 'Grand St');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('clicks pick the station nearest the pointer when hit areas overlap', () => {
    const { onDone } = setup({ initialLeg: 'origin' });
    // Two overlapping hits: B is listed first but sits farther from the pointer than C.
    const far = { geometry: { type: 'Point', coordinates: [10, 10] }, properties: { station_id: 'B' } };
    const near = { geometry: { type: 'Point', coordinates: [1, 1] }, properties: { station_id: 'C' } };
    mockProject.mockImplementation(lngLat => { const [x, y] = lngLat as [number, number]; return { x, y }; });
    act(() => triggerMapEvent('click', 'picker-hits', { point: { x: 0, y: 0 }, features: [far, near] }));
    tapStation('A');
    fireEvent.click(screen.getByRole('button', { name: 'Use these stations' }));
    expect(onDone).toHaveBeenCalledWith('C', 'A');
  });
});
