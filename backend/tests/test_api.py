import os
import tempfile
from pathlib import Path

# Force demo mode before the app is imported
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_ANON_KEY"] = ""
os.environ["LLM_API_KEY"] = ""
os.environ["AI_RATE_LIMIT_PER_HOUR"] = "1000"
os.environ["LOCAL_DATA_FILE"] = str(Path(tempfile.mkdtemp()) / "trips.json")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
PAYLOAD = {
    "destination": "Jaipur", "start_date": "2026-12-04", "end_date": "2026-12-06", "budget": 30000,
    "currency": "INR", "group_size": 2, "travel_style": "balanced", "pace": "moderate",
    "interests": ["food", "history"], "notes": "",
}


def test_health():
    assert client.get("/api/health").json()["status"] == "ok"


def test_full_flow():
    r = client.post("/api/itineraries/generate", json=PAYLOAD)
    assert r.status_code == 201
    trip = r.json()
    assert len(trip["itinerary"]["days"]) == 3
    assert trip["source"] == "demo"

    assert any(t["id"] == trip["id"] for t in client.get("/api/itineraries").json())

    it = trip["itinerary"]
    it["days"][0]["items"][0]["cost"] = 999
    r = client.put(f"/api/itineraries/{trip['id']}", json={"itinerary": it, "title": "My Jaipur"})
    assert r.json()["title"] == "My Jaipur"
    assert r.json()["itinerary"]["days"][0]["items"][0]["cost"] == 999

    r = client.post(f"/api/itineraries/{trip['id']}/regenerate-day", json={"day": 2, "instruction": "more food"})
    assert r.status_code == 200 and r.json()["itinerary"]["days"][1]["day"] == 2

    it["notes"] = "Book the fort tickets online"
    client.put(f"/api/itineraries/{trip['id']}", json={"itinerary": it})
    r = client.post(f"/api/itineraries/{trip['id']}/regenerate")
    assert r.status_code == 200 and r.json()["itinerary"]["notes"] == "Book the fort tickets online"

    r = client.post(f"/api/itineraries/{trip['id']}/duplicate")
    assert r.status_code == 201 and r.json()["title"].endswith("(copy)") and r.json()["id"] != trip["id"]
    assert client.delete(f"/api/itineraries/{trip['id']}").status_code == 204
    assert client.get(f"/api/itineraries/{trip['id']}").status_code == 404


def test_validation():
    bad = {**PAYLOAD, "end_date": "2026-11-01"}
    assert client.post("/api/itineraries/generate", json=bad).status_code == 422


def test_share_and_packing():
    trip = client.post("/api/itineraries/generate", json=PAYLOAD).json()
    tid = trip["id"]

    token = client.post(f"/api/itineraries/{tid}/share").json()["share_token"]
    pub = client.get(f"/api/shared/{token}")
    assert pub.status_code == 200
    assert "user_id" not in pub.json() and "share_token" not in pub.json()

    packed = client.post(f"/api/itineraries/{tid}/packing").json()
    assert len(packed["itinerary"]["packing"]) >= 10

    assert client.delete(f"/api/itineraries/{tid}/share").status_code == 200
    assert client.get(f"/api/shared/{token}").status_code == 404
    assert client.get("/api/shared/short").status_code == 404
