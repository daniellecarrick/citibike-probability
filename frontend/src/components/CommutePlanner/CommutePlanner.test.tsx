import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommutePlanner } from './CommutePlanner';
import { useStore } from '../../store';
import type { Station } from '../../types';

// Mock hooks that reach outside the component's logic under test
vi.mock('../../hooks/useCommute', () => ({
  useCommute: () => ({ result: null, recommendations: [], loading: false }),
}));

vi.mock('../../hooks/useCommuteMatrix', () => ({
  useCommuteMatrix: () => ({ matrix: null, loading: false }),
}));

vi.mock('../../hooks/useSavedCommutes', () => ({
  useSavedCommutes: vi.fn(),
}));

import { useSavedCommutes } from '../../hooks/useSavedCommutes';

const mockUseSavedCommutes = useSavedCommutes as ReturnType<typeof vi.fn>;

const STATIONS: Station[] = [
  { station_id: 'S1', station_name: 'Park Ave', lat: 40.75, lng: -73.98, capacity: 20, borough: 'Manhattan', neighborhood: 'Midtown' },
  { station_id: 'S2', station_name: 'Grand St',  lat: 40.76, lng: -73.97, capacity: 15, borough: 'Brooklyn', neighborhood: 'Williamsburg' },
];

function makeSavedHook(overrides = {}) {
  return {
    recent: [],
    starred: [],
    addRecent: vi.fn(),
    toggleStar: vi.fn(),
    isStarred: vi.fn(() => false),
    removeRecent: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockUseSavedCommutes.mockReturnValue(makeSavedHook());
  useStore.setState({
    selectedDay: 1,
    selectedTime: 480,
    commute: null,
    selectedMetric: 'ebike',
  });
});

function renderPlanner() {
  return render(
    <MemoryRouter>
      <CommutePlanner stations={STATIONS} />
    </MemoryRouter>
  );
}

describe('Get forecast button', () => {
  it('is disabled when origin and destination are not set', () => {
    renderPlanner();
    const btn = screen.getByRole('button', { name: /get forecast/i });
    expect(btn).toBeDisabled();
  });
});

describe('sample commutes', () => {
  it('renders the two hardcoded sample commute cards', () => {
    renderPlanner();
    expect(screen.getByRole('button', { name: /Park Slope to Midtown East/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upper East Side to Financial District/i })).toBeInTheDocument();
  });

  it('clicking a sample commute card fills the fields without running the forecast', () => {
    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Park Slope to Midtown East/i }));
    expect(useStore.getState().commute).toBeNull();
    expect(screen.getByRole('button', { name: /get forecast/i })).toBeEnabled();
  });

  it('pressing Get forecast after selecting a sample commute sets the commute', () => {
    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Park Slope to Midtown East/i }));
    fireEvent.click(screen.getByRole('button', { name: /get forecast/i }));
    expect(useStore.getState().commute).toMatchObject({
      originId: '8066575c-f8e9-4e14-95ea-8d25ceeae2ca',
      destId: '2af3ecc3-4f43-468a-a7cc-bb4804ee3e7a',
    });
  });
});

describe('saved commutes', () => {
  it('renders a Starred badge for starred items and a Recent badge for recent items', () => {
    const starredC = { originId: 'S1', originName: 'Park Ave', destId: 'S2', destName: 'Grand St', bikeType: 'any' as const, savedAt: 1 };
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({ starred: [starredC] }));
    renderPlanner();
    expect(screen.getByText('Starred')).toBeInTheDocument();
  });

  it('clicking a saved card fills the fields without running the forecast', () => {
    const c = { originId: 'S1', originName: 'Park Ave', destId: 'S2', destName: 'Grand St', bikeType: 'any' as const, savedAt: 1 };
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({ starred: [c] }));
    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Grand St/i }));
    expect(useStore.getState().commute).toBeNull();
    expect(screen.getByRole('button', { name: /get forecast/i })).toBeEnabled();
  });

  it('does not render a remove button on saved cards', () => {
    const c = { originId: 'S1', originName: 'Park Ave', destId: 'S2', destName: 'Grand St', bikeType: 'any' as const, savedAt: 1 };
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({ recent: [c] }));
    renderPlanner();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});

describe('commute cards row cap', () => {
  function makeRecent(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      originId: `S${i}`, originName: `Origin ${i}`, destId: `S${i}`, destName: `Dest ${i}`,
      bikeType: 'any' as const, savedAt: i,
    }));
  }

  it('shows both sample cards when there are no saved commutes', () => {
    renderPlanner();
    expect(screen.getByRole('button', { name: /Park Slope to Midtown East/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upper East Side to Financial District/i })).toBeInTheDocument();
  });

  it('hides the sample cards once there are 5 or more saved commutes', () => {
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({ recent: makeRecent(5) }));
    renderPlanner();
    expect(screen.queryByText('Sample')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Park Slope to Midtown East/i })).not.toBeInTheDocument();
  });
});

describe('commute submitted', () => {
  it('hides the planner form once a commute is set', () => {
    useStore.setState({ commute: { originId: 'S1', destId: 'S2', bikeType: 'any' } });
    renderPlanner();
    expect(screen.queryByRole('button', { name: /get forecast/i })).not.toBeInTheDocument();
  });
});
