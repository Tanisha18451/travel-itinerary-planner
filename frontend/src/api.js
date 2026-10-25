import { supabase } from "./supabaseClient";

// Dev: backend on :8000. Production build: same origin (the backend serves the site).
const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:8000");

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Can't reach the server. Check that the backend is running on " + BASE);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = Array.isArray(body.detail) ? body.detail.map((d) => d.msg).join("; ") : body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  health: () => request("/api/health"),
  list: () => request("/api/itineraries"),
  generate: (prefs) => request("/api/itineraries/generate", { method: "POST", body: JSON.stringify(prefs) }),
  save: (id, payload) => request(`/api/itineraries/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  regenerateTrip: (id) => request(`/api/itineraries/${id}/regenerate`, { method: "POST" }),
  regenerateDay: (id, day, instruction) =>
    request(`/api/itineraries/${id}/regenerate-day`, { method: "POST", body: JSON.stringify({ day, instruction }) }),
  packing: (id) => request(`/api/itineraries/${id}/packing`, { method: "POST" }),
  share: (id) => request(`/api/itineraries/${id}/share`, { method: "POST" }),
  unshare: (id) => request(`/api/itineraries/${id}/share`, { method: "DELETE" }),
  shared: (token) => request(`/api/shared/${token}`),
  duplicate: (id) => request(`/api/itineraries/${id}/duplicate`, { method: "POST" }),
  remove: (id) => request(`/api/itineraries/${id}`, { method: "DELETE" }),
};

export const money = (n, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n || 0);
