import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { supabase } from "./supabaseClient";
import AuthPage from "./components/AuthPage.jsx";
import Dashboard from "./components/Dashboard.jsx";
import TripBuilder from "./components/TripBuilder.jsx";
import ItineraryView from "./components/ItineraryView.jsx";
import Icon from "./components/Icons.jsx";
import SideExtras from "./components/SideExtras.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!supabase);
  const [view, setView] = useState("trips"); // trips | new | trip
  const [trips, setTrips] = useState([]);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [prefill, setPrefill] = useState("");
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || "light");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  };

  const notify = useCallback((message, kind = "ok") => setToast({ message, kind, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.title = "Wayfinder | Trip planner";
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const signedIn = !supabase || !!session;

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTrips(await api.list());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn) loadTrips();
  }, [signedIn, loadTrips]);

  const upsert = (trip) => {
    setTrips((prev) => (prev.some((t) => t.id === trip.id) ? prev.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...prev]));
    setCurrent(trip);
  };

  const openTrip = (trip) => {
    setCurrent(trip);
    setView("trip");
    window.scrollTo({ top: 0 });
  };

  const duplicateTrip = async (id) => {
    try {
      const copy = await api.duplicate(id);
      setTrips((prev) => [copy, ...prev]);
      notify("Trip duplicated");
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteTrip = async (id) => {
    if (!window.confirm("Delete this trip? This can't be undone.")) return;
    try {
      await api.remove(id);
      setTrips((prev) => prev.filter((t) => t.id !== id));
      if (current?.id === id) setView("trips");
      notify("Trip deleted");
    } catch (e) {
      setError(e.message);
    }
  };

  if (!ready) return null;
  if (!signedIn) return <AuthPage />;

  const go = (v) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  // Opens the trip builder; a destination card on the dashboard can pre-fill the destination
  const startNew = (dest) => {
    setPrefill(typeof dest === "string" ? dest : "");
    go("new");
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="compass" size={18} /></span>
          Wayfinder
        </div>
        <nav className="nav-list" aria-label="Main">
          <button className={view === "trips" || view === "trip" ? "nav active" : "nav"} onClick={() => go("trips")}>
            <Icon name="grid" /> My trips {trips.length > 0 && <span className="nav-count">{trips.length}</span>}
          </button>
          <button className={view === "new" ? "nav active" : "nav"} onClick={() => startNew()}>
            <Icon name="sparkles" /> Plan a trip
          </button>
        </nav>
        <SideExtras trips={trips} onOpen={openTrip} onNew={startNew} />
        <div className="sidebar-foot">
          <div className="profile">
            <span className="avatar">{(supabase ? session?.user?.email?.[0] : "T")?.toUpperCase()}</span>
            <span className="profile-text">
              <strong>{supabase ? session?.user?.email?.split("@")[0] : "Traveller"}</strong>
              <span>{supabase ? "Signed in" : "Ready to plan"}</span>
            </span>
          </div>
          <button className="nav" onClick={toggleTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} /> {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          {supabase && (
            <>
              <button className="nav" onClick={() => supabase.auth.signOut()}><Icon name="log-out" /> Sign out</button>
            </>
          )}
        </div>
      </aside>

      <main className="content">
        {error && (
          <div className="banner error" role="alert">
            <Icon name="alert" /> <span>{error}</span>
            <button className="link" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {view === "trips" && <Dashboard trips={trips} loading={loading} onOpen={openTrip} onDelete={deleteTrip} onDuplicate={duplicateTrip} onNew={startNew} />}
        {view === "new" && (
          <TripBuilder
            initialDestination={prefill}
            onCreated={(trip) => {
              upsert(trip);
              setView("trip");
              window.scrollTo({ top: 0 });
              notify("Your itinerary is ready");
            }}
          />
        )}
        {view === "trip" && current && (
          <ItineraryView trip={current} onUpdate={upsert} onBack={() => go("trips")} onDelete={() => deleteTrip(current.id)} notify={notify} />
        )}
      </main>

      {toast && (
        <div key={toast.id} className={`toast ${toast.kind}`} role="status">
          <Icon name={toast.kind === "error" ? "alert" : "check"} size={16} /> {toast.message}
        </div>
      )}
    </div>
  );
}
