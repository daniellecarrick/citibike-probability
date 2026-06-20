import { useState } from 'react';
import type { BikeType } from '../store';

export interface SavedCommute {
  originId: string;
  originName: string;
  destId: string;
  destName: string;
  bikeType: BikeType;
  savedAt: number;
}

const RECENT_KEY = 'citibike_recent_commutes';
const STARRED_KEY = 'citibike_starred_commutes';
const MAX_RECENT = 5;

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage quota or incognito */ }
}

function commuteKey(originId: string, destId: string) {
  return `${originId}|${destId}`;
}

export function useSavedCommutes() {
  const [recent,  setRecent]  = useState<SavedCommute[]>(() => readLS(RECENT_KEY,  []));
  const [starred, setStarred] = useState<SavedCommute[]>(() => readLS(STARRED_KEY, []));

  function addRecent(commute: SavedCommute) {
    setRecent(prev => {
      const key = commuteKey(commute.originId, commute.destId);
      const deduped = prev.filter(c => commuteKey(c.originId, c.destId) !== key);
      const updated = [commute, ...deduped].slice(0, MAX_RECENT);
      writeLS(RECENT_KEY, updated);
      return updated;
    });
  }

  function toggleStar(commute: SavedCommute) {
    setStarred(prev => {
      const key = commuteKey(commute.originId, commute.destId);
      const alreadyStarred = prev.some(c => commuteKey(c.originId, c.destId) === key);
      const updated = alreadyStarred
        ? prev.filter(c => commuteKey(c.originId, c.destId) !== key)
        : [{ ...commute, savedAt: Date.now() }, ...prev];
      writeLS(STARRED_KEY, updated);
      return updated;
    });
  }

  function isStarred(originId: string, destId: string): boolean {
    return starred.some(c => commuteKey(c.originId, c.destId) === commuteKey(originId, destId));
  }

  return { recent, starred, addRecent, toggleStar, isStarred };
}
