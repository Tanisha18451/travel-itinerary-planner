from dataclasses import dataclass
from typing import Optional

import httpx
from fastapi import Header, HTTPException

from . import config


@dataclass
class User:
    id: str
    token: Optional[str] = None


DEMO_USER = User(id="demo-user")


def get_user(authorization: Optional[str] = Header(default=None)) -> User:
    """Supabase mode: validate the bearer token with Supabase Auth. Demo mode: single shared local user."""
    if not config.supabase_enabled():
        return DEMO_USER
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        resp = httpx.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={"apikey": config.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach Supabase Auth")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return User(id=resp.json()["id"], token=token)
