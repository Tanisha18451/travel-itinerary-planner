import logging
import os
import secrets
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import ai, config, ratelimit
from .auth import User, get_user
from .schemas import RegenerateDay, TripRequest, UpdateTrip
from .store import get_store

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Personalized Travel Itinerary Planner", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(httpx.HTTPError)
async def upstream_error_handler(request, exc):
    detail = f"Upstream service error: {exc}"
    if isinstance(exc, httpx.HTTPStatusError):
        detail = f"Database error ({exc.response.status_code}): {exc.response.text[:200]}"
    return JSONResponse(status_code=502, content={"detail": detail})


@app.exception_handler(ai.AIUnavailable)
async def ai_unavailable_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


def ai_user(user: User = Depends(get_user)) -> User:
    """Authenticated user, counted against the hourly AI limit."""
    ratelimit.check(user.id)
    return user


def _trip_or_404(store, user: User, trip_id: str) -> dict:
    trip = store.get(user, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": app.version,
        "ai": "llm" if config.ai_enabled() else "demo-planner",
        "auth": "supabase" if config.supabase_enabled() else "none (demo mode)",
        "storage": "supabase" if config.supabase_enabled() else "local-json",
    }


# ------------------------------------------------------------------ trips
@app.post("/api/itineraries/generate", status_code=201)
def generate(req: TripRequest, user: User = Depends(ai_user)):
    itinerary, source = ai.generate_itinerary(req)
    return get_store().create(
        user,
        {"title": itinerary["title"], "request": req.model_dump(mode="json"), "itinerary": itinerary, "source": source},
    )


@app.get("/api/itineraries")
def list_trips(user: User = Depends(get_user)):
    return get_store().list(user)


@app.get("/api/itineraries/{trip_id}")
def get_trip(trip_id: str, user: User = Depends(get_user)):
    return _trip_or_404(get_store(), user, trip_id)


@app.put("/api/itineraries/{trip_id}")
def update_trip(trip_id: str, body: UpdateTrip, user: User = Depends(get_user)):
    store = get_store()
    _trip_or_404(store, user, trip_id)
    patch = {}
    if body.title is not None:
        patch["title"] = body.title
    if body.itinerary is not None:
        patch["itinerary"] = ai.recompute_totals(body.itinerary)
    return store.update(user, trip_id, patch)


@app.post("/api/itineraries/{trip_id}/regenerate")
def regenerate_trip(trip_id: str, user: User = Depends(ai_user)):
    store = get_store()
    trip = _trip_or_404(store, user, trip_id)
    itinerary, source = ai.generate_itinerary(TripRequest(**trip["request"]))
    for key in ("packing", "checklist", "notes"):  # user-owned extras survive a regenerate
        if key in trip["itinerary"]:
            itinerary[key] = trip["itinerary"][key]
    return store.update(user, trip_id, {"itinerary": itinerary, "title": itinerary["title"], "source": source})


@app.post("/api/itineraries/{trip_id}/regenerate-day")
def regenerate_day(trip_id: str, body: RegenerateDay, user: User = Depends(ai_user)):
    store = get_store()
    trip = _trip_or_404(store, user, trip_id)
    itinerary = trip["itinerary"]
    if body.day > len(itinerary["days"]):
        raise HTTPException(status_code=422, detail="Day is outside the trip's date range")
    new_day, source = ai.regenerate_day(TripRequest(**trip["request"]), itinerary, body.day, body.instruction)
    itinerary["days"][body.day - 1] = new_day
    ai.recompute_totals(itinerary)
    return store.update(user, trip_id, {"itinerary": itinerary, "source": source})


@app.post("/api/itineraries/{trip_id}/packing")
def packing_list(trip_id: str, user: User = Depends(ai_user)):
    store = get_store()
    trip = _trip_or_404(store, user, trip_id)
    itinerary = trip["itinerary"]
    itinerary["packing"] = ai.generate_packing(TripRequest(**trip["request"]), itinerary)
    return store.update(user, trip_id, {"itinerary": itinerary})


@app.post("/api/itineraries/{trip_id}/duplicate", status_code=201)
def duplicate_trip(trip_id: str, user: User = Depends(get_user)):
    store = get_store()
    trip = _trip_or_404(store, user, trip_id)
    title = f"{trip['title']} (copy)"[:160]
    return store.create(
        user,
        {"title": title, "request": trip["request"], "itinerary": {**trip["itinerary"], "title": title}, "source": trip["source"]},
    )


@app.delete("/api/itineraries/{trip_id}", status_code=204)
def delete_trip(trip_id: str, user: User = Depends(get_user)):
    if not get_store().delete(user, trip_id):
        raise HTTPException(status_code=404, detail="Trip not found")


# ------------------------------------------------------------------ sharing (read-only public link)
@app.post("/api/itineraries/{trip_id}/share")
def share_trip(trip_id: str, user: User = Depends(get_user)):
    store = get_store()
    trip = _trip_or_404(store, user, trip_id)
    token = trip.get("share_token") or secrets.token_urlsafe(9)
    return store.update(user, trip_id, {"share_token": token})


@app.delete("/api/itineraries/{trip_id}/share")
def unshare_trip(trip_id: str, user: User = Depends(get_user)):
    store = get_store()
    _trip_or_404(store, user, trip_id)
    return store.update(user, trip_id, {"share_token": None})


@app.get("/api/shared/{token}")
def shared_trip(token: str):
    if len(token) < 8:
        raise HTTPException(status_code=404, detail="This link isn't valid")
    trip = get_store().get_by_token(token)
    if not trip:
        raise HTTPException(status_code=404, detail="This link isn't valid or sharing was turned off")
    r = trip["request"]
    return {
        "title": trip["title"],
        "source": trip.get("source", "ai"),
        "request": {k: r.get(k) for k in ("destination", "start_date", "end_date", "budget", "currency", "group_size", "travel_style", "pace")},
        "itinerary": trip["itinerary"],
    }


# ------------------------------------------------------------------ serve the built React app (production, single link)
DIST = Path(os.getenv("FRONTEND_DIST", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"))

if (DIST / "index.html").exists():
    if (DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (DIST / full_path).resolve()
        if full_path and candidate.is_file() and DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
