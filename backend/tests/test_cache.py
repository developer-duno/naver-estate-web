"""TTL 캐시 테스트 — set/get, 만료, 삭제, max_size 강제 삭제
실행: python -m pytest tests/test_cache.py -v
"""
import time
from services.cache import TTLCache


def test_set_and_get():
    """캐시 저장 후 조회"""
    cache = TTLCache(ttl=10)
    cache.set("key1", "value1")
    assert cache.get("key1") == "value1"


def test_get_missing_key():
    """존재하지 않는 키 → None"""
    cache = TTLCache()
    assert cache.get("nonexistent") is None


def test_get_expired_returns_none():
    """TTL 만료 후 → None"""
    cache = TTLCache(ttl=1)
    cache.set("key1", "value1")
    time.sleep(1.1)
    assert cache.get("key1") is None


def test_delete_removes_entry():
    """명시적 삭제"""
    cache = TTLCache()
    cache.set("key1", "value1")
    cache.delete("key1")
    assert cache.get("key1") is None


def test_delete_nonexistent_no_error():
    """없는 키 삭제해도 에러 없음"""
    cache = TTLCache()
    cache.delete("nonexistent")  # should not raise


def test_max_size_eviction():
    """max_size 초과 시 가장 오래된 항목 삭제"""
    cache = TTLCache(ttl=60, max_size=3)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    cache.set("d", 4)  # a가 삭제되어야 함
    assert cache.get("a") is None
    assert cache.get("d") == 4


def test_max_size_keeps_recent():
    """max_size 강제 삭제 후 최근 항목 유지"""
    cache = TTLCache(ttl=60, max_size=2)
    cache.set("x", 10)
    time.sleep(0.01)
    cache.set("y", 20)
    time.sleep(0.01)
    cache.set("z", 30)
    assert cache.get("z") == 30
    assert cache.get("y") == 20


def test_overwrite_same_key():
    """같은 키 덮어쓰기"""
    cache = TTLCache()
    cache.set("key1", "old")
    cache.set("key1", "new")
    assert cache.get("key1") == "new"


def test_different_value_types():
    """다양한 값 타입 저장"""
    cache = TTLCache()
    cache.set("str", "hello")
    cache.set("list", [1, 2, 3])
    cache.set("dict", {"a": 1})
    cache.set("none", None)
    assert cache.get("str") == "hello"
    assert cache.get("list") == [1, 2, 3]
    assert cache.get("dict") == {"a": 1}
    # None 값도 저장 가능 (만료와 구별)
