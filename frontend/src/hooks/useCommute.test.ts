import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCommute } from './useCommute';
import { useStore } from '../store';

vi.mock('../api/client', () => ({
  api: {
    commute: {
      success: vi.fn(),
      recommendations: vi.fn(),
    },
  },
}));

import { api } from '../api/client';

const mockSuccess = api.commute.success as ReturnType<typeof vi.fn>;
const mockRecs    = api.commute.recommendations as ReturnType<typeof vi.fn>;

const FAKE_RESULT = { success_probability: 0.8, travel_minutes: 10 };
const FAKE_RECS   = [{ departure_time: 480, success_probability: 0.85 }];

beforeEach(() => {
  mockSuccess.mockReset();
  mockRecs.mockReset();
  mockSuccess.mockResolvedValue(FAKE_RESULT);
  mockRecs.mockResolvedValue(FAKE_RECS);
  useStore.setState({ commute: null });
});

describe('useCommute', () => {
  it('does not call the API when commute is null', async () => {
    useStore.setState({ commute: null });
    renderHook(() => useCommute());
    await new Promise(r => setTimeout(r, 50));
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('does not call the API when originId is empty', async () => {
    useStore.setState({ commute: { originId: '', destId: 'dest-1', bikeType: 'any' } });
    renderHook(() => useCommute());
    await new Promise(r => setTimeout(r, 50));
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('does not call the API when destId is empty', async () => {
    useStore.setState({ commute: { originId: 'origin-1', destId: '', bikeType: 'any' } });
    renderHook(() => useCommute());
    await new Promise(r => setTimeout(r, 50));
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('fetches both success and recommendations when IDs are set', async () => {
    useStore.setState({ commute: { originId: 'A', destId: 'B', bikeType: 'any' } });
    renderHook(() => useCommute());
    await waitFor(() => expect(mockSuccess).toHaveBeenCalledOnce());
    expect(mockRecs).toHaveBeenCalledOnce();
  });

  it('sets result to the resolved value', async () => {
    useStore.setState({ commute: { originId: 'A', destId: 'B', bikeType: 'any' } });
    const { result } = renderHook(() => useCommute());
    await waitFor(() => expect(result.current.result).toEqual(FAKE_RESULT));
  });

  it('sets recommendations to the resolved list', async () => {
    useStore.setState({ commute: { originId: 'A', destId: 'B', bikeType: 'any' } });
    const { result } = renderHook(() => useCommute());
    await waitFor(() => expect(result.current.recommendations).toEqual(FAKE_RECS));
  });

  it('clears result when commute becomes null', async () => {
    useStore.setState({ commute: { originId: 'A', destId: 'B', bikeType: 'any' } });
    const { result, rerender } = renderHook(() => useCommute());
    await waitFor(() => expect(result.current.result).toBeTruthy());
    useStore.setState({ commute: null });
    rerender();
    await waitFor(() => expect(result.current.result).toBeNull());
  });

  it('starts with loading false', () => {
    const { result } = renderHook(() => useCommute());
    expect(result.current.loading).toBe(false);
  });
});
