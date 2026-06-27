import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedCommutes } from './useSavedCommutes';
import type { SavedCommute } from './useSavedCommutes';

function makeCommute(overrides?: Partial<SavedCommute>): SavedCommute {
  return {
    originId: 'origin-1',
    originName: 'Central Park',
    destId: 'dest-1',
    destName: 'Grand Central',
    bikeType: 'any',
    savedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('addRecent', () => {
  it('adds a commute to recent', () => {
    const { result } = renderHook(() => useSavedCommutes());
    act(() => result.current.addRecent(makeCommute()));
    expect(result.current.recent).toHaveLength(1);
    expect(result.current.recent[0].originId).toBe('origin-1');
  });

  it('deduplicates by originId|destId, keeping newest first', () => {
    const { result } = renderHook(() => useSavedCommutes());
    const first = makeCommute({ savedAt: 1000 });
    const second = makeCommute({ savedAt: 2000 });
    act(() => result.current.addRecent(first));
    act(() => result.current.addRecent(second));
    expect(result.current.recent).toHaveLength(1);
    expect(result.current.recent[0].savedAt).toBe(2000);
  });

  it('caps the list at 5 items', () => {
    const { result } = renderHook(() => useSavedCommutes());
    for (let i = 0; i < 6; i++) {
      act(() => result.current.addRecent(makeCommute({ originId: `o${i}`, destId: `d${i}` })));
    }
    expect(result.current.recent).toHaveLength(5);
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useSavedCommutes());
    act(() => result.current.addRecent(makeCommute()));
    const stored = JSON.parse(localStorage.getItem('citibike_recent_commutes') ?? '[]');
    expect(stored).toHaveLength(1);
  });
});

describe('toggleStar', () => {
  it('adds a commute to starred', () => {
    const { result } = renderHook(() => useSavedCommutes());
    act(() => result.current.toggleStar(makeCommute()));
    expect(result.current.starred).toHaveLength(1);
  });

  it('removes the commute when called a second time (unstar)', () => {
    const { result } = renderHook(() => useSavedCommutes());
    const c = makeCommute();
    act(() => result.current.toggleStar(c));
    act(() => result.current.toggleStar(c));
    expect(result.current.starred).toHaveLength(0);
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useSavedCommutes());
    act(() => result.current.toggleStar(makeCommute()));
    const stored = JSON.parse(localStorage.getItem('citibike_starred_commutes') ?? '[]');
    expect(stored).toHaveLength(1);
  });
});

describe('removeRecent', () => {
  it('removes the matching commute by originId and destId', () => {
    const { result } = renderHook(() => useSavedCommutes());
    act(() => result.current.addRecent(makeCommute()));
    act(() => result.current.removeRecent('origin-1', 'dest-1'));
    expect(result.current.recent).toHaveLength(0);
  });

  it('only removes the matching commute, not others', () => {
    const { result } = renderHook(() => useSavedCommutes());
    act(() => result.current.addRecent(makeCommute({ originId: 'A', destId: 'B' })));
    act(() => result.current.addRecent(makeCommute({ originId: 'C', destId: 'D' })));
    act(() => result.current.removeRecent('A', 'B'));
    expect(result.current.recent).toHaveLength(1);
    expect(result.current.recent[0].originId).toBe('C');
  });
});

describe('isStarred', () => {
  it('returns true after starring', () => {
    const { result } = renderHook(() => useSavedCommutes());
    act(() => result.current.toggleStar(makeCommute()));
    expect(result.current.isStarred('origin-1', 'dest-1')).toBe(true);
  });

  it('returns false after unstarring', () => {
    const { result } = renderHook(() => useSavedCommutes());
    const c = makeCommute();
    act(() => result.current.toggleStar(c));
    act(() => result.current.toggleStar(c));
    expect(result.current.isStarred('origin-1', 'dest-1')).toBe(false);
  });

  it('returns false for an unknown commute', () => {
    const { result } = renderHook(() => useSavedCommutes());
    expect(result.current.isStarred('unknown', 'unknown')).toBe(false);
  });
});

describe('localStorage error resilience', () => {
  it('returns empty arrays when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('incognito'); });
    const { result } = renderHook(() => useSavedCommutes());
    expect(result.current.recent).toEqual([]);
    expect(result.current.starred).toEqual([]);
    vi.restoreAllMocks();
  });
});
