"""Tiny in-memory limiter so a public link can't burn through the AI key."""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException

from . import config

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def check(user_id: str) -> None:
    limit = config.AI_RATE_LIMIT_PER_HOUR
    if limit <= 0:
        return
    now = time.time()
    with _lock:
        q = _hits[user_id]
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status_code=429, detail=f"AI limit reached ({limit} requests per hour). Please try again later.")
        q.append(now)
