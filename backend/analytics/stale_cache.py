"""
Stale-while-revalidate in-process cache — the Python analog of Rails'
Rails.cache.fetch(key, race_condition_ttl: ...): once a key has ever been
populated, reads always return the last computed value immediately, even
past its nominal TTL, while a single background refresh brings it current.
A request only ever blocks on a synchronous compute for a key that has
never been populated before — every other read is a plain dict lookup.

This assumes something else (a scheduler) calls refresh() periodically to
keep entries from going stale in the first place; is_stale() exists for
that caller to decide whether a refresh is actually due, not for readers.
"""
import threading
import time
from typing import Callable, Generic, TypeVar

T = TypeVar("T")


class StaleWhileRevalidateCache(Generic[T]):
    def __init__(self, ttl_seconds: float):
        self._ttl = ttl_seconds
        self._store: dict[object, tuple[float, T]] = {}
        self._locks: dict[object, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def get_or_compute(self, key: object, compute: Callable[[], T]) -> T:
        """Returns the cached value immediately if one exists, no matter how
        stale. Only ever computes synchronously for a key seen for the first
        time — concurrent first-time callers for the same key block on a
        per-key lock so only one of them actually runs `compute`."""
        entry = self._store.get(key)
        if entry is not None:
            return entry[1]

        with self._lock_for(key):
            entry = self._store.get(key)
            if entry is not None:
                return entry[1]
            value = compute()
            self._store[key] = (time.time(), value)
            return value

    def refresh(self, key: object, compute: Callable[[], T]) -> T:
        """Recomputes and replaces a key's value. Meant to be called by a
        background scheduler, not from a request path — readers keep
        serving the old value the entire time `compute` is running, and
        only see the new one once this returns."""
        value = compute()
        self._store[key] = (time.time(), value)
        return value

    def is_stale(self, key: object) -> bool:
        entry = self._store.get(key)
        return entry is None or time.time() - entry[0] > self._ttl

    def _lock_for(self, key: object) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._locks[key] = lock
            return lock
