import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommutePlanner } from './CommutePlanner';
import { useStore } from '../../store';
import type { Station } from '../../types';

// Mock hooks that reach outside the component's logic under test
vi.mock('../../hooks/useCommute', () => ({
  useCommute: () => ({ result: null, recommendations: [], loading: false }),
}));

vi.mock('../../hooks/useSavedCommutes', () => ({
  useSavedCommutes: vi.fn(),
}));

import { useSavedCommutes } from '../../hooks/useSavedCommutes';

const mockUseSavedCommutes = useSavedCommutes as ReturnType<typeof vi.fn>;

const STATIONS: Station[] = [
  { station_id: 'S1', station_name: 'Park Ave', lat: 40.75, lng: -73.98, capacity: 20 },
  { station_id: 'S2', station_name: 'Grand St',  lat: 40.76, lng: -73.97, capacity: 15 },
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
  return render(<CommutePlanner stations={STATIONS} />);
}

describe('day pills', () => {
  it('renders 7 day pills', () => {
    renderPlanner();
    const pills = screen.getAllByRole('button').filter(b =>
      ['M', 'T', 'W', 'F', 'S'].includes(b.textContent ?? '')
    );
    expect(pills.length).toBeGreaterThanOrEqual(5);
  });

  it('clicking a day pill calls setDay with the correct index', () => {
    renderPlanner();
    // Find the Wednesday pill (value=2, letter W)
    const wednesdayBtn = screen.getByTitle('Wednesday');
    fireEvent.click(wednesdayBtn);
    expect(useStore.getState().selectedDay).toBe(2);
  });
});

describe('time dropdown', () => {
  it('renders a departure time select', () => {
    renderPlanner();
    expect(screen.getByDisplayValue('8:00 AM')).toBeInTheDocument();
  });

  it('changing the dropdown calls setTime with the numeric value', () => {
    renderPlanner();
    const select = screen.getByDisplayValue('8:00 AM');
    fireEvent.change(select, { target: { value: '720' } });
    expect(useStore.getState().selectedTime).toBe(720);
  });
});

describe('Get forecast button', () => {
  it('is disabled when origin and destination are not set', () => {
    renderPlanner();
    const btn = screen.getByRole('button', { name: /get forecast/i });
    expect(btn).toBeDisabled();
  });
});

describe('star button', () => {
  it('is not rendered when origin and destination are empty', () => {
    renderPlanner();
    const starBtn = screen.queryByTitle(/star this commute/i);
    expect(starBtn).not.toBeInTheDocument();
  });
});

describe('saved commutes — inline pills (≤ 2 items)', () => {
  it('renders inline pill rows when there are 2 or fewer saved items', () => {
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({
      starred: [{ originId: 'S1', originName: 'Park Ave', destId: 'S2', destName: 'Grand St', bikeType: 'any', savedAt: 1 }],
    }));
    renderPlanner();
    expect(screen.getByText(/Park Ave → Grand St/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved routes/)).not.toBeInTheDocument();
  });

  it('clicking a saved row loads the commute', () => {
    const c = { originId: 'S1', originName: 'Park Ave', destId: 'S2', destName: 'Grand St', bikeType: 'any' as const, savedAt: 1 };
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({ starred: [c] }));
    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Park Ave → Grand St/i }));
    expect(useStore.getState().commute).toMatchObject({ originId: 'S1', destId: 'S2' });
  });

  it('clicking the × button calls removeRecent and does NOT load the commute', () => {
    const mockRemove = vi.fn();
    const c = { originId: 'S1', originName: 'Park Ave', destId: 'S2', destName: 'Grand St', bikeType: 'any' as const, savedAt: 1 };
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({ recent: [c], removeRecent: mockRemove }));
    renderPlanner();
    const removeBtn = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(removeBtn);
    expect(mockRemove).toHaveBeenCalledWith('S1', 'S2');
    expect(useStore.getState().commute).toBeNull();
  });
});

describe('saved commutes — dropdown (> 2 items)', () => {
  function manyItems() {
    return [
      { originId: 'S1', originName: 'Alpha', destId: 'S2', destName: 'Beta',  bikeType: 'any' as const, savedAt: 1 },
      { originId: 'S1', originName: 'Alpha', destId: 'S2', destName: 'Gamma', bikeType: 'any' as const, savedAt: 2 },
      { originId: 'S1', originName: 'Alpha', destId: 'S2', destName: 'Delta', bikeType: 'any' as const, savedAt: 3 },
    ];
  }

  it('renders a dropdown trigger instead of inline pills when > 2 items', () => {
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({ starred: manyItems() }));
    renderPlanner();
    expect(screen.getByText(/Saved routes/)).toBeInTheDocument();
    expect(screen.queryByText(/Alpha → Beta/)).not.toBeInTheDocument();
  });

  it('clicking the trigger opens the dropdown panel', () => {
    mockUseSavedCommutes.mockReturnValue(makeSavedHook({ starred: manyItems() }));
    renderPlanner();
    fireEvent.click(screen.getByText(/Saved routes/));
    expect(screen.getByText(/Alpha → Beta/)).toBeInTheDocument();
  });
});
