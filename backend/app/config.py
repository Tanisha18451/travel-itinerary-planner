import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile").strip()
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))

AI_RATE_LIMIT_PER_HOUR = int(os.getenv("AI_RATE_LIMIT_PER_HOUR", "30"))

LOCAL_DATA_FILE = Path(os.getenv("LOCAL_DATA_FILE", Path(__file__).resolve().parent.parent / "data" / "itineraries.json"))


def supabase_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_ANON_KEY)


def ai_enabled() -> bool:
    return bool(LLM_API_KEY)
