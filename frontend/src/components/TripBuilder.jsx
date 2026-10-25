import { useEffect, useState } from "react";
import { api, money } from "../api";
import Cover from "./Cover.jsx";
import Icon from "./Icons.jsx";
import { fmtDate } from "../utils";

const INTERESTS = ["food", "sightseeing", "culture", "history", "adventure", "nature", "shopping", "nightlife", "relaxation"];
const STYLES = [["budget", "Budget"], ["balanced", "Balanced"], ["luxury", "Premium"]];
const PACES = [["relaxed", "Relaxed"], ["moderate", "Moderate"], ["fast", "Packed"]];
const SUGGESTIONS = ["Goa", "Jaipur", "Manali", "Kerala", "Bali", "Paris", "Tokyo"];
const MESSAGES = [
  "Choosing places that sit close together",
  "Balancing your budget across days",
  "Picking places to eat",
  "Writing up the day-by-day plan",
];
const today = new Date().toISOString().slice(0, 10);

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span className="label">{label}</span>
      <div className="segmented">
        {options.map(([v, text]) => (
          <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

export default function TripBuilder({ onCreated, initialDestination = "" }) {
  const [f, setF] = useState({
    destination: initialDestination, start_date: today, end_date: today, budget: 30000, currency: "INR",
    group_size: 1, travel_style: "balanced", pace: "moderate", interests: ["food", "sightseeing"], notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (i) => set("interests", f.interests.includes(i) ? f.interests.filter((x) => x !== i) : [...f.interests, i]);

  useEffect(() => {
    if (!busy) return;
    setMsgIdx(0);
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 3000);
    return () => clearInterval(t);
  }, [busy]);

  const days = Math.max(1, Math.round((new Date(f.end_date) - new Date(f.start_date)) / 86400000) + 1);
  const perPersonDay = Number(f.budget) / Math.max(1, Number(f.group_size)) / days;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const trip = await api.generate({ ...f, budget: Number(f.budget), group_size: Number(f.group_size) });
      onCreated(trip);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Plan a trip</h1>
          <p className="muted">Tell us the basics. You can edit every detail afterwards.</p>
        </div>
      </header>

      <form className="builder-layout" onSubmit={submit}>
        <div className="builder-main">
          <section className="panel">
            <h2 className="panel-title">Where and when</h2>
            <label className="field">
              <span className="label">Destination</span>
              <input required minLength={2} placeholder="e.g. Jaipur, Goa, Lisbon" value={f.destination} onChange={(e) => set("destination", e.target.value)} />
            </label>
            <div className="suggest" aria-label="Popular destinations">
              {SUGGESTIONS.map((s) => (
                <button type="button" key={s} className="suggest-pill" onClick={() => set("destination", s)}>{s}</button>
              ))}
            </div>
            <div className="grid2">
              <label className="field"><span className="label">Start date</span>
                <input type="date" required min={today} value={f.start_date} onChange={(e) => { set("start_date", e.target.value); if (e.target.value > f.end_date) set("end_date", e.target.value); }} />
              </label>
              <label className="field"><span className="label">End date</span>
                <input type="date" required min={f.start_date} value={f.end_date} onChange={(e) => set("end_date", e.target.value)} />
              </label>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Budget and group</h2>
            <div className="grid3">
              <label className="field"><span className="label">Total budget</span>
                <input type="number" required min={1} value={f.budget} onChange={(e) => set("budget", e.target.value)} />
              </label>
              <label className="field"><span className="label">Currency</span>
                <select value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                  {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="field"><span className="label">Travellers</span>
                <input type="number" required min={1} max={50} value={f.group_size} onChange={(e) => set("group_size", e.target.value)} />
              </label>
            </div>
            <p className="hint">The budget covers the whole group for the whole trip.</p>
          </section>

          <section className="panel">
            <h2 className="panel-title">Travel style</h2>
            <div className="grid2">
              <Segmented label="Comfort level" value={f.travel_style} options={STYLES} onChange={(v) => set("travel_style", v)} />
              <Segmented label="Daily pace" value={f.pace} options={PACES} onChange={(v) => set("pace", v)} />
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Interests</h2>
            <div className="chips">
              {INTERESTS.map((i) => (
                <button type="button" key={i} aria-pressed={f.interests.includes(i)} className={f.interests.includes(i) ? "chip on" : "chip"} onClick={() => toggle(i)}>
                  {f.interests.includes(i) && <Icon name="check" size={14} />} {i}
                </button>
              ))}
            </div>
            <label className="field top-gap">
              <span className="label">Anything else we should know?</span>
              <textarea rows={3} maxLength={500} placeholder="Vegetarian food, travelling with a toddler, avoid long drives…" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
            </label>
          </section>
        </div>

        <aside className="summary-panel">
          <Cover name={f.destination || "Your next trip"} className="summary-cover">
            <h3>{f.destination || "Your next trip"}</h3>
          </Cover>
          <dl className="summary-list">
            <div><dt><Icon name="calendar" size={15} /> Dates</dt><dd>{fmtDate(f.start_date)} to {fmtDate(f.end_date)}</dd></div>
            <div><dt><Icon name="clock" size={15} /> Length</dt><dd>{days} day{days > 1 ? "s" : ""}</dd></div>
            <div><dt><Icon name="users" size={15} /> Group</dt><dd>{f.group_size} traveller{Number(f.group_size) > 1 ? "s" : ""}</dd></div>
            <div><dt><Icon name="wallet" size={15} /> Budget</dt><dd>{money(Number(f.budget), f.currency)}</dd></div>
            <div><dt>Per person, per day</dt><dd>{money(perPersonDay, f.currency)}</dd></div>
          </dl>
          {error && <p className="banner error" role="alert"><Icon name="alert" /> <span>{error}</span></p>}
          <button className="btn primary block" disabled={busy}><Icon name="sparkles" /> Generate itinerary</button>
        </aside>
      </form>

      {busy && (
        <div className="overlay" role="alert" aria-live="polite">
          <div className="overlay-card">
            <div className="spinner" />
            <h2>Planning {f.destination}</h2>
            <p className="muted">{MESSAGES[msgIdx]}</p>
            <p className="small muted">With AI this usually takes 10 to 20 seconds.</p>
          </div>
        </div>
      )}
    </>
  );
}
