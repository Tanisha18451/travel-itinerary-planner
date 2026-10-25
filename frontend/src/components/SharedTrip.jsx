import { useEffect, useState } from "react";
import { api, money } from "../api";
import { CATEGORY, fmtDate, fmtDay, mapsUrl } from "../utils";
import Cover from "./Cover.jsx";
import Icon from "./Icons.jsx";

// Public, read-only view opened from a share link (/s/<token>). No login needed.
export default function SharedTrip({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [dayIdx, setDayIdx] = useState(0);

  useEffect(() => {
    api.shared(token).then(setData).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (data) document.title = `${data.title} | Wayfinder`;
  }, [data]);

  if (error)
    return (
      <div className="shared-wrap">
        <div className="empty">
          <h2>Link not available</h2>
          <p className="muted">{error}</p>
          <a className="btn primary" href="/">Plan your own trip</a>
        </div>
      </div>
    );
  if (!data) return <div className="shared-wrap"><div className="skeleton" /></div>;

  const { request: r, itinerary: it } = data;
  const day = it.days[dayIdx];
  const cur = r.currency;

  return (
    <div className="shared-wrap">
      <header className="shared-top">
        <div className="brand-dark"><span className="brand-mark"><Icon name="compass" size={18} /></span> Wayfinder</div>
        <a className="btn secondary sm" href="/">Plan your own trip</a>
      </header>

      <Cover name={r.destination} className="hero">
        <span className="badge on-dark">Shared itinerary</span>
        <div>
          <h1>{it.title}</h1>
          <p className="hero-meta">
            <span><Icon name="pin" size={15} /> {r.destination}</span>
            <span><Icon name="calendar" size={15} /> {fmtDate(r.start_date)} to {fmtDate(r.end_date)}</span>
            <span><Icon name="users" size={15} /> {r.group_size} traveller{r.group_size > 1 ? "s" : ""}</span>
          </p>
        </div>
      </Cover>

      {it.summary && <p className="summary">{it.summary}</p>}

      <section className="stats">
        <div className="stat"><span className="stat-label">Duration</span><span className="stat-value">{it.days.length} days</span></div>
        <div className="stat"><span className="stat-label">Estimated cost</span><span className="stat-value">{money(it.total_cost, cur)}</span></div>
        <div className="stat"><span className="stat-label">Budget</span><span className="stat-value">{money(r.budget, cur)}</span></div>
      </section>

      <div className="days-layout">
        <nav className="day-nav" aria-label="Days">
          {it.days.map((d, i) => (
            <button key={d.day} aria-current={i === dayIdx ? "true" : undefined} className={i === dayIdx ? "day-pill on" : "day-pill"} onClick={() => setDayIdx(i)}>
              <span className="day-pill-top">Day {d.day}</span>
              <span className="day-pill-sub">{fmtDay(d.date)}</span>
              <span className="day-pill-cost">{money(d.estimated_cost, cur)}</span>
            </button>
          ))}
        </nav>
        <section className="day panel">
          <div className="day-head">
            <div>
              <p className="eyebrow">Day {day.day} · {fmtDay(day.date)}</p>
              <h2>{day.title}</h2>
              {day.summary && <p className="muted">{day.summary}</p>}
            </div>
            <div className="day-cost"><span className="stat-label">Day total</span><strong>{money(day.estimated_cost, cur)}</strong></div>
          </div>
          <ol className="timeline">
            {day.items.map((item, i) => {
              const cat = CATEGORY[item.type] || CATEGORY.attraction;
              return (
                <li key={i} className="stop" style={{ "--c": cat.color }}>
                  <div className="stop-time">{item.time}</div>
                  <div className="rail"><span className="stop-node"><Icon name={cat.icon} size={15} /></span></div>
                  <div className="stop-card">
                    <div className="stop-top">
                      <span className="stop-title">{item.title}</span>
                      <span className="cost-chip">{item.cost ? money(item.cost, cur) : "Free"}</span>
                    </div>
                    {item.description && <p className="stop-desc">{item.description}</p>}
                    <p className="stop-meta">
                      <span className="type-tag">{cat.label}</span>
                      {item.duration_min > 0 && <span><Icon name="clock" size={13} /> {item.duration_min} min</span>}
                      <a className="map-link" href={mapsUrl(item, r.destination)} target="_blank" rel="noreferrer"><Icon name="pin" size={13} /> Open in Maps</a>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {it.tips?.length > 0 && (
        <section className="panel tips">
          <h2 className="panel-title">Good to know</h2>
          <ul>{it.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
