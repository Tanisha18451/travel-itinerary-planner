# Personalized Travel Itinerary Planner

A full-stack, AI-powered web app that turns a destination, dates, budget and interests into an editable day-by-day itinerary (attractions, dining, stays and transport).

- **Frontend:** React (Vite)
- **Backend:** FastAPI (Python)
- **Database and auth:** Supabase (Postgres with Row Level Security)
- **AI:** any OpenAI-compatible LLM API (default: Llama-3 on Groq) with prompt engineering and a built-in demo planner fallback

## Features

- Smart trip builder: destination, dates, total budget, currency, group size, travel style, pace, interests, notes
- AI-generated itinerary with per-item costs, a running budget bar and over-budget warning
- Edit any stop (time, title, description, type, cost), add or remove stops
- Regenerate a single day (with an optional instruction such as "more street food") or the whole trip
- Save, reopen and delete trips; sign-up and login through Supabase
- **Ask the AI to change your plan** in plain words ("make it cheaper", "add a sunset spot on day 2")
- **Share link**: a read-only public page for any trip (`/s/<token>`), which you can turn off at any time
- **Packing list** matched to the trip, with a progress checklist that saves
- **Add to calendar** (.ics file for Google or Apple Calendar), **Open in Maps** links, print or save as PDF
- **Analytics dashboard**: next-trip countdown, spend vs budget, spending by category, trips by month, interests, recent activity, search, filter and sort
- **Weather forecast** for the destination (free Open-Meteo data, no key needed) and **Duplicate trip**
- Dark mode, per-user hourly AI limit (protects your API key on a public link)
- Works with zero setup in **demo mode** (no keys needed), so you can run it immediately

## Project structure

```
travel-itinerary-planner/
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI routes
│   │   ├── ai.py          # prompts, LLM call, JSON parsing, demo planner
│   │   ├── store.py       # Supabase and local JSON storage
│   │   ├── auth.py        # Supabase token verification
│   │   ├── schemas.py     # request validation
│   │   └── config.py      # environment settings
│   ├── tests/test_api.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/ (App.jsx, api.js, components/, styles.css)
│   ├── package.json
│   └── .env.example
├── supabase/schema.sql
├── Dockerfile, render.yaml, .dockerignore   # one-link deployment
└── README.md
```

## Run it locally

Requirements: Python 3.10+, Node.js 18+.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Check http://localhost:8000/api/health. It shows whether AI, auth and storage are in demo or real mode. API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run dev
```

Open http://localhost:5173.

At this point the app already works in **demo mode**: no login, trips saved to `backend/data/itineraries.json`, itineraries from the built-in planner.

### 3. Turn on real AI (recommended for the demo video)

1. Create a free API key at https://console.groq.com
2. In `backend/.env` set `LLM_API_KEY=your_key`
3. Restart the backend. `/api/health` should now say `"ai": "llm"`.

Other providers work too: change `LLM_BASE_URL` and `LLM_MODEL` (OpenAI, OpenRouter, Together and others use the same format). If the AI call fails, the app falls back to the demo planner, and the trip card shows a "Demo plan" badge so you can tell.

### 4. Turn on Supabase (login and cloud storage)

1. Create a project at https://supabase.com
2. SQL Editor: paste and run `supabase/schema.sql`
3. Project Settings > API: copy the Project URL and the `anon` public key
4. Put them in `backend/.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) and `frontend/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
5. For easy demos, Authentication > Providers > Email: turn off "Confirm email"
6. Restart both servers. You will now see a sign-in page.

Never commit `.env` files. They are already in `.gitignore`. The `anon` key is safe in the frontend because Row Level Security limits each user to their own trips.

## Tests

```bash
cd backend
pytest
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Mode and status |
| POST | `/api/itineraries/generate` | Generate and save a trip |
| GET | `/api/itineraries` | List your trips |
| GET | `/api/itineraries/{id}` | Get one trip |
| PUT | `/api/itineraries/{id}` | Save edits (title, itinerary) |
| POST | `/api/itineraries/{id}/regenerate` | Regenerate the whole trip |
| POST | `/api/itineraries/{id}/regenerate-day` | Regenerate one day |
| POST | `/api/itineraries/{id}/refine` | Change the plan with a text instruction |
| POST | `/api/itineraries/{id}/packing` | Generate a packing list |
| POST / DELETE | `/api/itineraries/{id}/share` | Create or remove the public link |
| GET | `/api/shared/{token}` | Public read-only trip (no login) |
| DELETE | `/api/itineraries/{id}` | Delete a trip |

## Deployment: one public link on Render

The `Dockerfile` builds the React app and serves it from FastAPI, so the whole project lives on **one link**, for example `https://wayfinder-trip-planner.onrender.com`.

Before you deploy:

1. **Supabase is required for a public link.** Without it, every visitor shares one demo user and trips are lost on restart (Render's free disk is temporary). Follow "Turn on Supabase" above, and re-run `supabase/schema.sql` if you set it up earlier (it is safe to re-run; it adds share links).
2. Get a Groq key (`LLM_API_KEY`) so real AI is used.
3. Push the project to GitHub (next section).

Deploy:

1. Go to https://render.com, sign in with GitHub, and choose **New > Blueprint**.
2. Pick your repository. Render reads `render.yaml`.
3. Fill in the secret values when asked:
   - `LLM_API_KEY`: your Groq key
   - `SUPABASE_URL` and `VITE_SUPABASE_URL`: the same Project URL
   - `SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY`: the same anon key
4. Click **Apply**. The first build takes about 5 to 8 minutes.
5. Your link is shown at the top of the service page. Check `<your-link>/api/health`.
6. In Supabase, go to **Authentication > URL Configuration** and set **Site URL** to your Render link.

To change the link name, edit `name:` in `render.yaml` before deploying (it must be unique on Render), or rename the service in the Render dashboard.

Notes:

- **Free plan sleeps** after about 15 minutes without visits, and the next visit takes 30 to 60 seconds to wake. Open your link a minute before recording or presenting.
- The `VITE_` values are built into the website. If you change them, trigger **Manual Deploy > Clear build cache & deploy**.
- Alternative split deploy: backend on Render (root `backend`) and frontend on Vercel or Netlify (root `frontend`, `VITE_API_URL` set to the backend link, and `CORS_ORIGINS` set to the frontend link).

## Push to GitHub

```bash
cd travel-itinerary-planner
git init
git add .
git commit -m "Initial commit: Personalized Travel Itinerary Planner"
git branch -M main
git remote add origin https://github.com/<your-username>/travel-itinerary-planner.git
git push -u origin main
```

Create the empty repository on GitHub first (no README or .gitignore, since this project has them). Check `git status` shows no `.env` file before you commit.

## Demo video checklist

1. Show `/api/health` with `"ai": "llm"` (and Supabase if enabled)
2. Sign up or sign in
3. Plan a trip, for example a 3-day weekend in Jaipur with food and history interests
4. Walk through the itinerary: day tabs, costs, budget bar
5. Edit a stop and save; regenerate one day with an instruction
6. Go back to My trips, then open the trip again to show it was saved
7. Briefly show the GitHub repo and README

## Mapping to project epics

| Epic | Where |
| --- | --- |
| Environment setup | This README, `requirements.txt`, `package.json` |
| Supabase setup | `supabase/schema.sql`, `backend/app/store.py`, `backend/app/auth.py` |
| Preference collection | `frontend/src/components/TripBuilder.jsx`, `backend/app/schemas.py` |
| Itinerary generation | `backend/app/ai.py` |
| Customization | `frontend/src/components/ItineraryView.jsx`, regenerate endpoints |
| Deployment | Deployment section above |
| Testing and documentation | `backend/tests/`, this README |
