import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMapData } from './useMapData';
import { useStore } from '../store';

vi.mock('../api/client', () => ({
  api: {
    map: {
      bulk: vi.fn(),
      snapshot: vi.fn(),
    },
  },
}));

import { api } from '../api/client';

const mockBulk     = api.map.bulk as ReturnType<typeof vi.fn>;
const mockSnapshot = api.map.snapshot as ReturnType<typeof vi.fn>;

const FAKE_BULK: Record<string, unknown[]> = Object.fromEntries(
  Array.from({ length: 288 }, (_, i) => [String(i), []])
);
const FAKE_SNAP = [{ station_id: 'A', probability: 0.5 }];

beforeEach(() => {
  mockBulk.mockReset();
  mockSnapshot.mockReset();
  mockBulk.mockResolvedValue(FAKE_BULK);
  mockSnapshot.mockResolvedValue(FAKE_SNAP);
  useStore.setState({ bulkCache: {}, currentMapData: [], selectedDay: 1, selectedTime: 480, selectedMetric: 'ebike' });
});

describe('useMapData', () => {
  it('calls api.map.bulk on mount', async () => {
    renderHook(() => useMapData());
    await waitFor(() => expect(mockBulk).toHaveBeenCalledOnce());
    expect(mockBulk).toHaveBeenCalledWith(1, 'ebikes');
  });

  it('stores bulk data in the cache under the correct key', async () => {
    renderHook(() => useMapData());
    await waitFor(() => expect(useStore.getState().bulkCache['1_ebikes']).toBeDefined());
  });

  it('does NOT call bulk again when cache already has the key', async () => {
    useStore.setState({ bulkCache: { '1_ebikes': FAKE_BULK } });
    renderHook(() => useMapData());
    await new Promise(r => setTimeout(r, 50));
    expect(mockBulk).not.toHaveBeenCalled();
  });

  it('calls snapshot as fallback when bulk fetch fails', async () => {
    mockBulk.mockRejectedValue(new Error('network'));
    renderHook(() => useMapData());
    await waitFor(() => expect(mockSnapshot).toHaveBeenCalled());
  });

  it('does NOT call snapshot when bulk cache is populated', async () => {
    useStore.setState({ bulkCache: { '1_ebikes': FAKE_BULK } });
    renderHook(() => useMapData());
    await new Promise(r => setTimeout(r, 50));
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it('retries bulk fetch when the online event fires after a failure', async () => {
    mockBulk.mockRejectedValueOnce(new Error('offline'));
    mockBulk.mockResolvedValue(FAKE_BULK);
    renderHook(() => useMapData());
    await waitFor(() => expect(mockBulk).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(mockBulk).toHaveBeenCalledTimes(2));
  });
});
