import { useMemo, useState } from "react";
import { money } from "../api";
import { CATEGORY, daysUntil, fmtDate, timeAgo } from "../utils";
import Cover from "./Cover.jsx";
import Icon from "./Icons.jsx";
import Welcome from "./Welcome.jsx";
import { Donut, HBars, MonthBars } from "./Charts.jsx";

const cost = (t) => t.itinerary.total_cost || 0;
const nDays = (t) => t.itinerary.days.length;

export default function Dashboard({ trips, loading, onOpen, onDelete, onDuplicate, onNew }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [filter, setFilter] = useState("all");

  const data = useMemo(() => {
    const counts = {};
    trips.forEach((t) => (counts[t.request.currency] = (counts[t.request.currency] || 0) + 1));
    const currency = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "INR";
    const sel = trips.filter((t) => t.request.currency === currency);

    const spend = sel.reduce((s, t) => s + cost(t), 0);
    const budget = sel.reduce((s, t) => s + t.request.budget, 0);
    const personDays = sel.reduce((s, t) => s + t.request.group_size * nDays(t), 0);

    const cats = { accommodation: 0, dining: 0, attraction: 0, transport: 0 };
    sel.forEach((t) => t.itinerary.days.forEach((d) => d.items.forEach((i) => { cats[i.type] = (cats[i.type] || 0) + (Number(i.cost) || 0); })));

    const interests = {};
    trips.forEach((t) => (t.request.interests || []).forEach((i) => (interests[i] = (interests[i] || 0) + 1)));
    const topInterests = Object.entries(interests).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short" }), count: 0 };
    });
    trips.forEach((t) => { const m = months.find((x) => x.key === t.request.start_date.slice(0, 7)); if (m) m.count += 1; });

    const next = [...trips]
      .filter((t) => daysUntil(t.request.end_date) >= 0)
      .sort((a, b) => a.request.start_date.localeCompare(b.request.start_date))[0];

    const recent = [...trips].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 5);

    return { currency, spend, budget, personDays, cats, topInterests, months, next, recent, mixed: Object.keys(counts).length > 1 };
  }, [trips]);

  const shown = useMemo(() => {
    let list = trips.filter((t) => t.request.destination.toLowerCase().includes(q.trim().toLowerCase()));
    if (filter === "upcoming") list = list.filter((t) => daysUntil(t.request.end_date) >= 0);
    if (filter === "past") list = list.filter((t) => daysUntil(t.request.end_date) < 0);
    const by = {
      newest: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
      soonest: (a, b) => a.request.start_date.localeCompare(b.request.start_date),
      cost: (a, b) => cost(b) - cost(a),
    }[sort];
    return [...list].sort(by);
  }, [trips, q, sort, filter]);

  const { currency, spend, budget, personDays, next } = data;
  const catData = Object.entries(CATEGORY).map(([k, c]) => ({ label: c.label, color: c.color, value: data.cats[k] }));
  const nextDays = next ? daysUntil(next.request.start_date) : null;
  const list = next?.itinerary.checklist;
  const packed = list ? list.filter((x) => x.done).length : 0;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Where to next?</h1>
          <p className="muted">Your trips, spending and plans at a glance.</p>
        </div>
        <button className="btn primary" onClick={onNew}><Icon name="plus" /> Plan a trip</button>
      </header>

      {loading && trips.length === 0 && <div className="trip-grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>}

      {!loading && trips.length === 0 && (
        <Welcome onNew={onNew} />
      )}

      {trips.length > 0 && (
        <>
          {next ? (
            <Cover name={next.request.destination} className="next-hero">
              <span className="badge on-dark">{nextDays <= 0 ? "Happening now" : "Next trip"}</span>
              <div className="next-row">
                <div>
                  <h2>{next.request.destination}</h2>
                  <p className="hero-meta">
                    <span><Icon name="calendar" size={15} /> {fmtDate(next.request.start_date)} to {fmtDate(next.request.end_date)}</span>
                    <span><Icon name="users" size={15} /> {next.request.group_size} traveller{next.request.group_size > 1 ? "s" : ""}</span>
                    <span><Icon name="wallet" size={15} /> {money(cost(next), next.request.currency)} of {money(next.request.budget, next.request.currency)}</span>
                    {list && <span><Icon name="list" size={15} /> Packed {packed} of {list.length}</span>}
                  </p>
                  <button className="btn light sm" onClick={() => onOpen(next)}>Open itinerary</button>
                </div>
                <div className="countdown">
                  <strong>{nextDays <= 0 ? "Now" : nextDays}</strong>
                  <span>{nextDays <= 0 ? "on your trip" : nextDays === 1 ? "day to go" : "days to go"}</span>
                </div>
              </div>
            </Cover>
          ) : (
            <section className="panel cta">
              <div><h2>Nothing coming up</h2><p className="muted">All your trips are in the past. Plan the next one?</p></div>
              <button className="btn primary" onClick={onNew}><Icon name="sparkles" /> Plan a trip</button>
            </section>
          )}

          <section className="stats five" aria-label="Summary">
            <div className="stat"><span className="stat-label">Trips planned</span><span className="stat-value">{trips.length}</span></div>
            <div className="stat"><span className="stat-label">Days mapped out</span><span className="stat-value">{trips.reduce((s, t) => s + nDays(t), 0)}</span></div>
            <div className="stat"><span className="stat-label">Planned spend</span><span className="stat-value small">{money(spend, currency)}</span></div>
            <div className="stat"><span className="stat-label">Avg per person, per day</span><span className="stat-value small">{money(personDays ? spend / personDays : 0, currency)}</span></div>
            <div className="stat"><span className="stat-label">Budget used</span><span className="stat-value">{budget ? Math.round((spend / budget) * 100) : 0}%</span></div>
          </section>
          {data.mixed && <p className="hint">Spending figures include only trips in {currency}, your most-used currency.</p>}

          <div className="insights">
            <section className="panel">
              <h2 className="panel-title">Where the money goes</h2>
              <div className="donut-wrap">
                <Donut data={catData} centerTop={money(spend, currency)} centerBottom="planned" />
                <ul className="legend vertical">
                  {catData.map((c) => (
                    <li key={c.label}><span className="dot" style={{ background: c.color }} /> {c.label} <strong>{spend ? Math.round((c.value / spend) * 100) : 0}%</strong></li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">Spend vs budget</h2>
              <HBars
                rows={trips.filter((t) => t.request.currency === currency).slice(0, 6).map((t) => ({
                  label: t.request.destination,
                  valueText: `${money(cost(t), currency)} / ${money(t.request.budget, currency)}`,
                  pct: (cost(t) / t.request.budget) * 100,
                  over: cost(t) > t.request.budget,
                }))}
              />
            </section>

            <section className="panel">
              <h2 className="panel-title">Trips over the next 12 months</h2>
              <MonthBars months={data.months} />
            </section>

            <section className="panel">
              <h2 className="panel-title">Your interests</h2>
              {data.topInterests.length === 0 ? <p className="muted">No interests selected yet.</p> : (
                <HBars rows={data.topInterests.map(([name, n]) => ({ label: name[0].toUpperCase() + name.slice(1), valueText: `${n} trip${n > 1 ? "s" : ""}`, pct: (n / trips.length) * 100 }))} />
              )}
            </section>
          </div>

          <section className="panel recent">
            <h2 className="panel-title">Recent activity</h2>
            <ul className="activity">
              {data.recent.map((t) => (
                <li key={t.id}>
                  <button className="activity-row" onClick={() => onOpen(t)}>
                    <span className="activity-icon"><Icon name="pencil" size={14} /></span>
                    <span><strong>{t.request.destination}</strong> <span className="muted">updated</span></span>
                    <span className="muted small">{timeAgo(t.updated_at || t.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="list-head">
            <h2>All trips</h2>
            <div className="toolbar">
              <label className="search">
                <Icon name="search" size={16} />
                <input aria-label="Search trips" placeholder="Search by destination" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <div className="segmented mini" role="radiogroup" aria-label="Filter">
                {[["all", "All"], ["upcoming", "Upcoming"], ["past", "Past"]].map(([v, t]) => (
                  <button key={v} role="radio" aria-checked={filter === v} className={filter === v ? "on" : ""} onClick={() => setFilter(v)}>{t}</button>
                ))}
              </div>
              <select aria-label="Sort trips" className="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="soonest">Soonest trip</option>
                <option value="cost">Highest cost</option>
              </select>
            </div>
          </div>

          {shown.length === 0 && <p className="muted">No trips match your search or filter.</p>}

          <div className="trip-grid">
            {shown.map((t) => {
              const r = t.request;
              const days = nDays(t);
              const pct = Math.min(100, (cost(t) / r.budget) * 100);
              const over = cost(t) > r.budget;
              return (
                <article key={t.id} className="trip-card">
                  <button className="card-hit" onClick={() => onOpen(t)} aria-label={`Open ${r.destination} trip`}>
                    <Cover name={r.destination} className="card-cover">
                      <span className={`badge on-dark ${t.source}`}>{t.source === "ai" ? "AI plan" : "Demo plan"}</span>
                      <h3>{r.destination}</h3>
                    </Cover>
                  </button>
                  <div className="card-body">
                    <p className="card-meta"><Icon name="calendar" size={15} /> {fmtDate(r.start_date)} to {fmtDate(r.end_date)}</p>
                    <p className="card-meta"><Icon name="users" size={15} /> {days} day{days > 1 ? "s" : ""} · {r.group_size} traveller{r.group_size > 1 ? "s" : ""}</p>
                    <div className="card-cost">
                      <strong>{money(cost(t), r.currency)}</strong>
                      <span className="muted small">of {money(r.budget, r.currency)}</span>
                    </div>
                    <div className="mini-bar"><div className={over ? "fill over" : "fill"} style={{ width: `${pct}%` }} /></div>
                    <div className="card-actions">
                      <button className="btn secondary sm" onClick={() => onOpen(t)}>Open itinerary</button>
                      <span>
                        <button className="btn icon" onClick={() => onDuplicate(t.id)} aria-label={`Duplicate ${r.destination} trip`} title="Duplicate"><Icon name="copy" size={16} /></button>
                        <button className="btn icon danger-ghost" onClick={() => onDelete(t.id)} aria-label={`Delete ${r.destination} trip`} title="Delete"><Icon name="trash" size={16} /></button>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
