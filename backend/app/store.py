"""Persistence. SupabaseStore talks to PostgREST with the user's JWT so Row Level Security applies.
LocalStore keeps trips in a JSON file so the app runs without any setup."""
import json
import threading
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from . import config
from .auth import User


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LocalStore:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()

    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text() or "[]")

    def _save(self, rows: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(rows, indent=2))

    def list(self, user: User) -> list[dict]:
        rows = [r for r in self._load() if r["user_id"] == user.id]
        return sorted(rows, key=lambda r: r["created_at"], reverse=True)

    def get(self, user: User, trip_id: str) -> Optional[dict]:
        return next((r for r in self._load() if r["id"] == trip_id and r["user_id"] == user.id), None)

    def get_by_token(self, token: str) -> Optional[dict]:
        return next((r for r in self._load() if r.get("share_token") and r["share_token"] == token), None)

    def create(self, user: User, data: dict) -> dict:
        with self.lock:
            rows = self._load()
            row = {"id": str(uuid.uuid4()), "user_id": user.id, "created_at": _now(), "updated_at": _now(), **data}
            rows.append(row)
            self._save(rows)
            return row

    def update(self, user: User, trip_id: str, patch: dict) -> Optional[dict]:
        with self.lock:
            rows = self._load()
            for row in rows:
                if row["id"] == trip_id and row["user_id"] == user.id:
                    row.update(patch, updated_at=_now())
                    self._save(rows)
                    return row
        return None

    def delete(self, user: User, trip_id: str) -> bool:
        with self.lock:
            rows = self._load()
            kept = [r for r in rows if not (r["id"] == trip_id and r["user_id"] == user.id)]
            if len(kept) == len(rows):
                return False
            self._save(kept)
            return True


class SupabaseStore:
    TABLE = "itineraries"

    def _url(self) -> str:
        return f"{config.SUPABASE_URL}/rest/v1/{self.TABLE}"

    def _headers(self, user: User) -> dict:
        return {
            "apikey": config.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {user.token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def list(self, user: User) -> list[dict]:
        r = httpx.get(self._url(), headers=self._headers(user), params={"select": "*", "order": "created_at.desc"}, timeout=15)
        r.raise_for_status()
        return r.json()

    def get(self, user: User, trip_id: str) -> Optional[dict]:
        r = httpx.get(self._url(), headers=self._headers(user), params={"select": "*", "id": f"eq.{trip_id}"}, timeout=15)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def get_by_token(self, token: str) -> Optional[dict]:
        # Anonymous read goes through a SECURITY DEFINER function (see supabase/schema.sql)
        r = httpx.post(
            f"{config.SUPABASE_URL}/rest/v1/rpc/get_shared_trip",
            headers={"apikey": config.SUPABASE_ANON_KEY, "Authorization": f"Bearer {config.SUPABASE_ANON_KEY}", "Content-Type": "application/json"},
            json={"p_token": token},
            timeout=15,
        )
        r.raise_for_status()
        return r.json() or None

    def create(self, user: User, data: dict) -> dict:
        r = httpx.post(self._url(), headers=self._headers(user), json={"user_id": user.id, **data}, timeout=15)
        r.raise_for_status()
        return r.json()[0]

    def update(self, user: User, trip_id: str, patch: dict) -> Optional[dict]:
        r = httpx.patch(self._url(), headers=self._headers(user), params={"id": f"eq.{trip_id}"},
                        json={**patch, "updated_at": _now()}, timeout=15)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def delete(self, user: User, trip_id: str) -> bool:
        r = httpx.delete(self._url(), headers=self._headers(user), params={"id": f"eq.{trip_id}"}, timeout=15)
        r.raise_for_status()
        return bool(r.json())


def get_store():
    return SupabaseStore() if config.supabase_enabled() else LocalStore(config.LOCAL_DATA_FILE)
