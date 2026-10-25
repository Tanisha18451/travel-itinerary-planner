"""Itinerary generation: LLM via an OpenAI-compatible API, with a built-in demo planner as fallback."""
import copy
import json
import logging
import random
import re
import time
from datetime import timedelta

import httpx

from . import config
from .schemas import TripRequest

log = logging.getLogger("planner.ai")

ITEM_TYPES = {"attraction", "dining", "accommodation", "transport"}

SYSTEM_PROMPT = """You are an expert travel planner. Reply with ONE valid JSON object and nothing else (no markdown, no commentary).
Schema:
{"title": string, "summary": string,
 "days": [{"day": int, "date": "YYYY-MM-DD", "title": string, "summary": string,
   "items": [{"time": "HH:MM", "type": "attraction"|"dining"|"accommodation"|"transport",
              "title": string, "description": string, "location": string,
              "cost": number, "duration_min": int}]}],
 "tips": [string]}
Rules: costs are the TOTAL for the whole group in the requested currency; keep the sum of all costs within the budget;
every day needs breakfast, lunch and dinner (type "dining"), attractions that match the interests, and transport between distant stops;
include an overnight stay (type "accommodation") for every night; group nearby places together to minimise travel time;
respect the pace (relaxed = 2 activities/day, moderate = 3, fast = 4) and travel style."""


def _request_summary(req: TripRequest) -> str:
    return (
        f"Destination: {req.destination}\nDates: {req.start_date} to {req.end_date} ({req.num_days} days)\n"
        f"Total budget: {req.budget:g} {req.currency}\nGroup size: {req.group_size}\n"
        f"Travel style: {req.travel_style}\nPace: {req.pace}\n"
        f"Interests: {', '.join(req.interests) or 'general sightseeing and food'}\nNotes: {req.notes or 'none'}"
    )


# ---------------------------------------------------------------- LLM plumbing
def tokens_for(num_days: int) -> int:
    """Room for a full itinerary: roughly 800 tokens per day, between 4096 and 8000."""
    return max(4096, min(8000, 800 * num_days + 1200))


def call_llm(messages: list[dict], *, max_tokens: int = 4096, json_mode: bool = False, temperature: float = 0.7) -> str:
    payload = {"model": config.LLM_MODEL, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    resp = None
    for attempt in range(3):
        resp = httpx.post(
            f"{config.LLM_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
            json=payload,
            timeout=config.LLM_TIMEOUT,
        )
        if resp.status_code == 429 and attempt < 2:  # rate limit: wait briefly, then try again
            try:
                wait = min(float(resp.headers.get("retry-after", 4)), 10.0)
            except ValueError:
                wait = 4.0
            time.sleep(wait)
            continue
        if resp.status_code == 400 and "response_format" in payload and "response_format" in resp.text:
            payload.pop("response_format")  # this provider has no JSON mode: retry without it
            continue
        break
    resp.raise_for_status()
    choice = resp.json()["choices"][0]
    if choice.get("finish_reason") == "length":
        raise ValueError("The AI's answer was cut off")
    return choice["message"]["content"]


def extract_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model output")
    return json.loads(text[start : end + 1])


# ---------------------------------------------------------------- normalisation
def _num(value, default=0.0) -> float:
    try:
        return max(0.0, round(float(value), 2))
    except (TypeError, ValueError):
        return default


def normalize_day(raw: dict, req: TripRequest, day_number: int) -> dict:
    items = []
    for it in raw.get("items") or []:
        if not isinstance(it, dict):
            continue
        kind = str(it.get("type", "attraction")).lower()
        items.append(
            {
                "time": str(it.get("time", ""))[:5],
                "type": kind if kind in ITEM_TYPES else "attraction",
                "title": str(it.get("title", "Untitled")).strip()[:140],
                "description": str(it.get("description", "")).strip()[:500],
                "location": str(it.get("location", "")).strip()[:140],
                "cost": _num(it.get("cost")),
                "duration_min": int(_num(it.get("duration_min"), 60)),
            }
        )
    items.sort(key=lambda i: i["time"] or "99:99")
    day_date = req.start_date + timedelta(days=day_number - 1)
    return {
        "day": day_number,
        "date": day_date.isoformat(),
        "title": str(raw.get("title") or f"Day {day_number}").strip()[:120],
        "summary": str(raw.get("summary", "")).strip()[:400],
        "items": items,
        "estimated_cost": round(sum(i["cost"] for i in items), 2),
    }


def normalize_itinerary(raw: dict, req: TripRequest) -> dict:
    raw_days = raw.get("days") or []
    if not raw_days:
        raise ValueError("Model returned no days")
    days = [normalize_day(raw_days[i] if i < len(raw_days) else {}, req, i + 1) for i in range(req.num_days)]
    return {
        "title": str(raw.get("title") or f"{req.destination} trip").strip()[:160],
        "summary": str(raw.get("summary", "")).strip()[:600],
        "days": days,
        "tips": [str(t)[:240] for t in (raw.get("tips") or [])][:8],
        "total_cost": round(sum(d["estimated_cost"] for d in days), 2),
        "currency": req.currency,
    }


def recompute_totals(itinerary: dict) -> dict:
    """Recalculate day and trip totals after the user edits items."""
    for d in itinerary.get("days", []):
        d["estimated_cost"] = round(sum(_num(i.get("cost")) for i in d.get("items", [])), 2)
    itinerary["total_cost"] = round(sum(d["estimated_cost"] for d in itinerary.get("days", [])), 2)
    return itinerary


# ---------------------------------------------------------------- public API
def generate_itinerary(req: TripRequest) -> tuple[dict, str]:
    """Returns (itinerary, source) where source is 'ai' or 'demo'."""
    if config.ai_enabled():
        try:
            text = call_llm(
                [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": "Plan this trip:\n" + _request_summary(req)},
                ],
                max_tokens=tokens_for(req.num_days),
                json_mode=True,
            )
            return normalize_itinerary(extract_json(text), req), "ai"
        except Exception as exc:  # network, rate-limit, bad JSON ... fall back so the app keeps working
            log.warning("LLM generation failed (%s); using demo planner", exc)
    return fallback_itinerary(req), "demo"


def regenerate_day(req: TripRequest, itinerary: dict, day_number: int, instruction: str = "") -> tuple[dict, str]:
    """Returns (new_day, source)."""
    other_titles = [i["title"] for d in itinerary["days"] if d["day"] != day_number for i in d["items"]]
    if config.ai_enabled():
        try:
            prompt = (
                "Re-plan ONLY one day of this trip.\n" + _request_summary(req)
                + f"\nDay to re-plan: {day_number} ({(req.start_date + timedelta(days=day_number - 1)).isoformat()})"
                + f"\nAvoid repeating these places already used on other days: {'; '.join(other_titles[:40])}"
                + (f"\nUser instruction: {instruction}" if instruction else "")
                + '\nReply with one JSON object: {"title","summary","items":[...]} using the same item schema.'
            )
            text = call_llm([{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}])
            return normalize_day(extract_json(text), req, day_number), "ai"
        except Exception as exc:
            log.warning("LLM day regeneration failed (%s); using demo planner", exc)
    seed = f"{req.destination}-regen-{day_number}-{random.random()}"
    return _fallback_day(req, day_number, random.Random(seed), shift=random.randint(1, 5)), "demo"


# ---------------------------------------------------------------- demo planner (no API key needed)
POOLS = {
    "food": [
        ("Street-food crawl in {d}", "Sample regional specialities at three or four well-rated stalls.", 0.5),
        ("Market tour and cooking class", "Pick ingredients at a local market, then cook a regional dish.", 1.4),
        ("Dessert and tea trail", "Visit a few famous sweet shops and tea houses.", 0.6),
    ],
    "sightseeing": [
        ("Old town walking tour of {d}", "Landmarks, lanes and viewpoints in the historic centre.", 0.6),
        ("Top viewpoint at golden hour", "The best panoramic view over {d}, timed for sunset.", 0.4),
        ("Guided city highlights tour", "A guided loop through the must-see spots of {d}.", 1.0),
    ],
    "culture": [
        ("City museum visit", "The main museum covering the history and art of {d}.", 0.7),
        ("Traditional performance evening", "Live music or dance rooted in local tradition.", 1.1),
        ("Craft workshop and artisan quarter", "Meet local makers and try a craft yourself.", 0.9),
    ],
    "history": [
        ("Heritage fort or palace visit", "Explore the best-preserved historic site near {d}.", 0.8),
        ("Historic district walk", "Monuments and stories from the area's past.", 0.5),
        ("Archaeological or memorial site", "A short guided visit with context on local history.", 0.7),
    ],
    "adventure": [
        ("Guided outdoor adventure", "Trekking, rafting or cycling, depending on the season near {d}.", 1.8),
        ("Zip-line or climbing session", "A half-day activity with certified guides.", 1.5),
        ("Sunrise hike", "An early walk to a scenic ridge, back by brunch.", 0.4),
    ],
    "nature": [
        ("Lake or riverside walk", "A slow walk along the water around {d}.", 0.2),
        ("National park or botanical garden", "Spot wildlife and landscapes close to {d}.", 0.7),
        ("Scenic day trip", "A short drive to a nearby waterfall or hill view.", 1.2),
    ],
    "shopping": [
        ("Main bazaar browse", "Textiles, spices and souvenirs. Bargaining is expected.", 0.8),
        ("Local designers' boutiques", "Independent shops with locally made goods.", 1.0),
        ("Night market", "Food stalls and crafts after dark.", 0.6),
    ],
    "nightlife": [
        ("Rooftop sundowner", "Drinks with a view over {d}.", 1.2),
        ("Live music venue", "A well-reviewed local venue with evening sets.", 1.0),
        ("Late-night food walk", "Where locals eat after hours.", 0.5),
    ],
    "relaxation": [
        ("Spa or wellness session", "A massage or yoga class to unwind.", 1.6),
        ("Slow café afternoon", "A quiet café with a book and a view.", 0.3),
        ("Garden picnic", "Pack local snacks and relax in a park.", 0.3),
    ],
}
STAY = {"budget": "a clean budget guesthouse", "balanced": "a comfortable 3-star hotel", "luxury": "a boutique luxury hotel"}
SLOTS = {"relaxed": ["10:30", "16:00"], "moderate": ["10:00", "14:30", "17:30"], "fast": ["09:30", "12:00", "14:30", "17:00"]}


def _fallback_day(req: TripRequest, n: int, rng: random.Random, shift: int = 0) -> dict:
    d, days = req.destination, req.num_days
    interests = [i.lower() for i in req.interests if i.lower() in POOLS] or ["sightseeing", "food"]
    stay_budget, food_budget, act_budget, transport_budget = (req.budget * s for s in (0.35, 0.25, 0.25, 0.15))
    nights = max(days - 1, 1)
    food_day = food_budget / days
    slots = SLOTS[req.pace]
    act_unit = act_budget / days / max(len(slots), 1)
    items = [
        {"time": "08:30", "type": "dining", "title": f"Breakfast at a popular café in {d}",
         "description": "Start with a local breakfast.", "location": d, "cost": round(food_day * 0.2, 2), "duration_min": 45},
        {"time": "09:30", "type": "transport", "title": "Local transport between stops",
         "description": "Taxi, ride-share or metro, depending on distance.", "location": d,
         "cost": round(transport_budget / days, 2), "duration_min": 30},
        {"time": "13:00", "type": "dining", "title": "Lunch at a well-rated local restaurant",
         "description": "Regional specialities near your morning stop.", "location": d, "cost": round(food_day * 0.3, 2), "duration_min": 60},
        {"time": "19:30", "type": "dining", "title": "Dinner at a recommended restaurant",
         "description": "Try a signature local dish.", "location": d, "cost": round(food_day * 0.5, 2), "duration_min": 90},
    ]
    for k, slot in enumerate(slots):
        interest = interests[(n + k + shift) % len(interests)]
        pool = POOLS[interest]
        title, desc, factor = pool[(n + k + shift) % len(pool)]
        items.append({"time": slot, "type": "attraction", "title": title.format(d=d), "description": desc.format(d=d),
                      "location": d, "cost": round(act_unit * factor, 2), "duration_min": 120})
    if n < days or days == 1:
        label = f"Check in at {STAY[req.travel_style]}" if n == 1 else f"Overnight stay at {STAY[req.travel_style]}"
        items.append({"time": "21:30" if n > 1 else "12:00", "type": "accommodation", "title": label,
                      "description": "Accommodation for the night.", "location": d,
                      "cost": round(stay_budget / nights, 2), "duration_min": 0})
    if n == days and days > 1:
        items.append({"time": "11:30", "type": "transport", "title": "Check out and onward travel",
                      "description": "Leave time for luggage and traffic.", "location": d, "cost": 0, "duration_min": 60})
    items.sort(key=lambda i: i["time"])
    return normalize_day({"title": f"Day {n}: {interests[(n + shift) % len(interests)].title()} in {d}",
                          "summary": f"A {req.pace} day focused on {', '.join(interests[:3])}.", "items": items}, req, n)


def fallback_itinerary(req: TripRequest) -> dict:
    rng = random.Random(f"{req.destination}-{req.start_date}")
    days = [_fallback_day(req, n, rng) for n in range(1, req.num_days + 1)]
    return {
        "title": f"{req.num_days}-day {req.destination} trip",
        "summary": f"A {req.pace}, {req.travel_style} plan for {req.group_size} traveller(s) built around "
                   f"{', '.join(req.interests) or 'sightseeing and food'}. Generated by the built-in demo planner.",
        "days": days,
        "tips": ["Book popular attractions ahead of time.", "Keep small cash for local transport and markets.",
                 "Check opening hours the day before; many sites close one day a week."],
        "total_cost": round(sum(d["estimated_cost"] for d in days), 2),
        "currency": req.currency,
    }


# ---------------------------------------------------------------- advanced features
class AIUnavailable(Exception):
    """Raised when a feature needs the LLM and it isn't configured or failed."""


# ---------------------------------------------------------------- refine: change the plan from a message
def _trip_cost(it: dict) -> float:
    return round(sum(float(i.get("cost") or 0) for d in it["days"] for i in d["items"]), 2)


def _avg_cost(it: dict, kind: str, fallback: float) -> float:
    costs = [float(i.get("cost") or 0) for d in it["days"] for i in d["items"] if i.get("type") == kind and i.get("cost")]
    return sum(costs) / len(costs) if costs else fallback


def _has(text: str, words: tuple) -> bool:
    """True if any keyword starts a word in the text ('rain' matches 'rainy', but not 'train')."""
    return any(re.search(r"\b" + re.escape(w), text) for w in words)


def refine_by_rules(req: TripRequest, itinerary: dict, instruction: str) -> tuple[dict, list[str]]:
    """Applies common requests directly (no AI needed) and describes exactly what changed."""
    it = copy.deepcopy(itinerary)
    days, text, notes = it["days"], instruction.lower(), []
    cur = req.currency
    m = re.search(r"\bday\s*(\d+)\b", text)
    explicit = int(m.group(1)) if m and 1 <= int(m.group(1)) <= len(days) else None
    targets = [explicit] if explicit else list(range(1, len(days) + 1))
    where = f"day {explicit}" if explicit else "all days"

    def add(day: int, item: dict) -> None:
        days[day - 1]["items"].append(item)
        days[day - 1]["items"].sort(key=lambda i: i.get("time") or "99:99")

    # 1) cheaper
    if _has(text, ("cheap", "budget", "save", "afford", "less expensive", "lower cost", "reduce cost", "cut cost", "economical")):
        factors = {"attraction": 0.75, "dining": 0.8, "accommodation": 0.85, "transport": 0.9}
        before = after = 0.0
        for n in targets:
            for i in days[n - 1]["items"]:
                before += float(i.get("cost") or 0)
                i["cost"] = round(float(i.get("cost") or 0) * factors.get(i.get("type"), 1), 2)
                after += i["cost"]
        notes.append(f"Lowered costs on {where}: {cur} {before:,.0f} to {cur} {after:,.0f} (about {round((1 - after / before) * 100) if before else 0}% less).")

    # 2) more food
    if _has(text, ("food", "eat", "restaurant", "street", "cafe", "dining", "meal", "snack", "sweet")):
        names = ["Local street-food tasting walk", "Famous sweet shop and chai stop", "Regional specialty at a popular eatery", "Evening food-market stroll"]
        price = round(_avg_cost(it, "dining", req.budget * 0.01) * 0.6, 2)
        for k, n in enumerate(targets):
            add(n, {"time": "16:30", "type": "dining", "title": names[(n + k) % len(names)], "description": "An extra tasting stop to try more local food.",
                    "location": req.destination, "cost": price, "duration_min": 45})
        notes.append(f"Added a food stop to {where} (about {cur} {price:,.0f} each).")

    # 3) slower pace
    if _has(text, ("relax", "slow", "fewer", "less busy", "less packed", "calm", "chill", "unhurried", "easier")):
        removed = 0
        for n in targets:
            acts = [i for i in days[n - 1]["items"] if i.get("type") == "attraction"]
            if len(acts) >= 2:
                days[n - 1]["items"].remove(acts[-1])
                removed += 1
        notes.append(f"Slowed the pace: removed the last activity from {removed} day(s)." if removed else "Your days already have few activities, so nothing was removed.")

    # 3b) busier pace
    if _has(text, ("packed", "busier", "more activities", "more things", "faster", "more to do")):
        price = round(_avg_cost(it, "attraction", req.budget * 0.02) * 0.7, 2)
        for n in targets:
            add(n, {"time": "17:30", "type": "attraction", "title": f"Hidden gems walk in {req.destination}", "description": "An extra stop for travellers who want to see more.",
                    "location": req.destination, "cost": price, "duration_min": 75})
        notes.append(f"Added an extra activity to {where}.")

    # 4) rainy-day backup
    if _has(text, ("rain", "indoor", "monsoon", "wet weather", "bad weather")):
        price = round(_avg_cost(it, "attraction", req.budget * 0.02) * 0.5, 2)
        for n in targets:
            add(n, {"time": "15:00", "type": "attraction", "title": "Rainy-day backup: museum, gallery or covered market",
                    "description": "If it rains, swap this in for your outdoor stop.", "location": req.destination, "cost": price, "duration_min": 90})
        notes.append(f"Added a rainy-day backup to {where}.")

    # 5) sunset / sunrise
    if _has(text, ("sunset", "sunrise", "viewpoint")):
        day_no = explicit or 1
        sunrise = "sunrise" in text and "sunset" not in text
        price = round(_avg_cost(it, "attraction", req.budget * 0.02) * 0.3, 2)
        add(day_no, {"time": "05:45" if sunrise else "17:45", "type": "attraction", "title": f"{'Sunrise' if sunrise else 'Sunset'} viewpoint in {req.destination}",
                     "description": "A scenic spot to watch the light change.", "location": req.destination, "cost": price, "duration_min": 60})
        notes.append(f"Added a {'sunrise' if sunrise else 'sunset'} viewpoint on day {day_no}.")

    # 6) swap X for Y
    sw = re.search(r"(?:swap|replace|change)\s+(?:the\s+)?([a-z]+?)s?\s+(?:for|with|to)\s+([a-z]+?)s?\b", text)
    if sw:
        old, new, count = sw.group(1), sw.group(2), 0
        for n in targets:
            for i in days[n - 1]["items"]:
                if re.search(old, i["title"], re.I):
                    i["title"] = re.sub(old, new, i["title"], flags=re.I)
                    i["description"] = re.sub(old, new, i.get("description", ""), flags=re.I)
                    count += 1
        notes.append(f'Swapped "{old}" for "{new}" in {count} stop(s).' if count else f'No stops mentioned "{old}", so nothing was swapped.')

    if not notes:  # nothing matched: keep the request as a visible note instead of failing
        it.setdefault("tips", []).append(f"Your note: {instruction.strip()}")
        notes.append("I couldn't turn that into an automatic change, so I saved it under \"Good to know\". Try wording like: make it cheaper, add more food stops, slower pace, add a rainy-day option, add a sunset spot on day 2, or swap museums for markets.")

    recompute_totals(it)
    before_total, after_total = _trip_cost(itinerary), _trip_cost(it)
    only_cost_note = len(notes) == 1 and notes[0].startswith("Lowered costs") and not explicit
    if round(before_total) != round(after_total) and not only_cost_note:
        notes.append(f"Estimated total: {cur} {before_total:,.0f} to {cur} {after_total:,.0f}.")
    return it, notes


def _describe_diff(req: TripRequest, old: dict, new: dict) -> list[str]:
    notes = ["The AI updated your plan using your request."]
    sb, sa = sum(len(d["items"]) for d in old["days"]), sum(len(d["items"]) for d in new["days"])
    if sa != sb:
        notes.append(f"Stops: {sb} to {sa}.")
    b, a = _trip_cost(old), _trip_cost(new)
    if round(a) != round(b):
        notes.append(f"Estimated total: {req.currency} {b:,.0f} to {req.currency} {a:,.0f}.")
    changed = sum(1 for o, n in zip(old["days"], new["days"]) if [i["title"] for i in o["items"]] != [i["title"] for i in n["items"]])
    notes.append(f"{changed} of {len(new['days'])} days changed.")
    return notes


def _refine_with_llm(req: TripRequest, itinerary: dict, instruction: str) -> dict:
    slim = {k: itinerary[k] for k in ("title", "summary", "days", "tips") if k in itinerary}
    prompt = (
        "Current itinerary (JSON):\n" + json.dumps(slim, separators=(",", ":"))
        + "\n\nTrip details:\n" + _request_summary(req)
        + f"\n\nUser request: {instruction}\n\n"
        "Apply the request and return the COMPLETE updated itinerary as one JSON object with the same schema and the same number of days. "
        "Keep everything the user did not ask to change. Keep the total cost within the budget unless the user asks otherwise."
    )
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}]
    limit = tokens_for(len(slim.get("days", [])) or req.num_days)
    last: Exception = RuntimeError("no attempt made")
    for attempt in range(2):
        try:
            text = call_llm(messages, max_tokens=limit, json_mode=True, temperature=0.3 if attempt else 0.6)
            return normalize_itinerary(extract_json(text), req)
        except (ValueError, KeyError) as exc:  # bad or cut-off JSON: one more try
            last = exc
        except Exception as exc:  # network, key, rate limit: retrying won't help
            last = exc
            break
    raise last


def refine_itinerary(req: TripRequest, itinerary: dict, instruction: str) -> tuple[dict, list[str], str]:
    """Returns (updated itinerary, what changed, source). Never fails: if the AI can't help, built-in rules are used."""
    if config.ai_enabled():
        try:
            updated = _refine_with_llm(req, itinerary, instruction)
            return updated, _describe_diff(req, itinerary, updated), "ai"
        except Exception as exc:
            log.warning("AI refine failed (%r); using built-in adjustment", exc)
            updated, notes = refine_by_rules(req, itinerary, instruction)
            return updated, ["The AI was busy, so a quick built-in adjustment was applied instead."] + notes, "rules"
    updated, notes = refine_by_rules(req, itinerary, instruction)
    return updated, notes, "rules"


def _pack(items: list[tuple[str, str]]) -> list[dict]:
    return [{"category": c, "item": i, "checked": False} for c, i in items]


def fallback_packing(req: TripRequest) -> list[dict]:
    items = [
        ("Documents", "ID and booking confirmations"), ("Documents", "Printed or offline copy of this itinerary"),
        ("Essentials", "Phone, charger and power bank"), ("Essentials", "Reusable water bottle"),
        ("Essentials", "Wallet with some cash"), ("Essentials", "Basic first-aid kit and personal medicines"),
        ("Clothing", "Comfortable walking shoes"), ("Clothing", "Light layers for changing weather"),
        ("Clothing", f"{min(req.num_days + 1, 8)} sets of everyday clothes"), ("Toiletries", "Toiletry kit and sunscreen"),
    ]
    interests = {i.lower() for i in req.interests}
    if "adventure" in interests or "nature" in interests:
        items += [("Clothing", "Trekking shoes and quick-dry clothes"), ("Essentials", "Insect repellent and a small backpack")]
    if "relaxation" in interests:
        items += [("Clothing", "Swimwear"), ("Essentials", "A book or headphones")]
    if "culture" in interests or "history" in interests:
        items += [("Clothing", "Modest clothing for temples and heritage sites"), ("Essentials", "Scarf or shawl")]
    if "nightlife" in interests:
        items.append(("Clothing", "One smart outfit for the evening"))
    if "shopping" in interests:
        items.append(("Essentials", "Foldable extra bag for souvenirs"))
    if req.num_days > 4:
        items.append(("Essentials", "Small laundry bag"))
    return _pack(items)


def generate_packing(req: TripRequest, itinerary: dict) -> list[dict]:
    if config.ai_enabled():
        try:
            prompt = (
                "Make a packing checklist for this trip.\n" + _request_summary(req)
                + "\nActivities planned: " + "; ".join(i["title"] for d in itinerary["days"] for i in d["items"] if i["type"] == "attraction")[:900]
                + '\nReply with one JSON object: {"items":[{"category":"Documents|Clothing|Toiletries|Essentials|Other","item":"..."}]} with 14 to 24 practical items.'
            )
            raw = extract_json(call_llm([{"role": "system", "content": "You are a practical travel assistant. Reply with one valid JSON object only."}, {"role": "user", "content": prompt}]))
            items = [(str(x.get("category", "Other"))[:30], str(x.get("item", "")).strip()[:100]) for x in raw.get("items", []) if isinstance(x, dict) and x.get("item")]
            if items:
                return _pack(items[:30])
        except Exception as exc:
            log.warning("Packing list generation failed (%s); using default list", exc)
    return fallback_packing(req)
