"""
Tests for StaleWhileRevalidateCache — the Python analog of Rails'
race_condition_ttl: reads never block on recomputation except the very
first time a key is seen, and a background refresh() never blocks readers.
"""
import threading
import time

from analytics.stale_cache import StaleWhileRevalidateCache


def test_first_read_computes_and_caches():
    cache = StaleWhileRevalidateCache(ttl_seconds=60)
    calls = []

    def compute():
        calls.append(1)
        return "value"

    assert cache.get_or_compute("k", compute) == "value"
    assert cache.get_or_compute("k", compute) == "value"
    assert len(calls) == 1, "second read should hit the cache, not recompute"


def test_is_stale_reflects_ttl():
    cache = StaleWhileRevalidateCache(ttl_seconds=0.05)
    assert cache.is_stale("k") is True  # never populated
    cache.get_or_compute("k", lambda: "v")
    assert cache.is_stale("k") is False
    time.sleep(0.1)
    assert cache.is_stale("k") is True


def test_stale_value_still_served_until_refresh_completes():
    """The core stale-while-revalidate property: once a key has a value,
    get_or_compute NEVER blocks on recomputation, no matter how stale —
    only refresh() (the scheduler's job) replaces it, and only readers that
    call get_or_compute *after* refresh() returns see the new value."""
    cache = StaleWhileRevalidateCache(ttl_seconds=0.01)
    cache.get_or_compute("k", lambda: "old")
    time.sleep(0.05)  # now well past TTL
    assert cache.is_stale("k") is True

    refresh_started = threading.Event()
    release_refresh = threading.Event()

    def slow_compute():
        refresh_started.set()
        release_refresh.wait(timeout=5)
        return "new"

    refresh_thread = threading.Thread(target=cache.refresh, args=("k", slow_compute))
    refresh_thread.start()
    refresh_started.wait(timeout=5)

    # Refresh is still running (blocked on release_refresh) — reads must
    # still return the old value instantly, not block or recompute.
    t0 = time.time()
    assert cache.get_or_compute("k", lambda: "should-not-run") == "old"
    assert time.time() - t0 < 0.1

    release_refresh.set()
    refresh_thread.join(timeout=5)
    assert cache.get_or_compute("k", lambda: "should-not-run-either") == "new"


def test_concurrent_first_reads_compute_only_once():
    """Multiple threads racing to read a never-seen key should only trigger
    one compute — everyone else waits for that one result instead of each
    doing redundant work (or worse, returning inconsistent values)."""
    cache = StaleWhileRevalidateCache(ttl_seconds=60)
    call_count = [0]

    def compute():
        call_count[0] += 1
        time.sleep(0.05)
        return "value"

    results = []

    def reader():
        results.append(cache.get_or_compute("k", compute))

    threads = [threading.Thread(target=reader) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert call_count[0] == 1
    assert results == ["value"] * 5
