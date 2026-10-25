import { useEffect, useState } from "react";
import { fmtDay, weatherLabel } from "../utils";
import Icon from "./Icons.jsx";

// Free forecast from Open-Meteo (no API key needed).
export default function Weather({ destination, startDate, endDate }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setState({ status: "loading" });
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1`, { signal: ctrl.signal })).json();
        const place = g.results?.[0];
        if (!place) throw new Error("Destination not found");
        const w = await (await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`,
          { signal: ctrl.signal }
        )).json();
        const all = w.daily.time.map((date, i) => ({
          date,
          code: w.daily.weathercode[i],
          max: Math.round(w.daily.temperature_2m_max[i]),
          min: Math.round(w.daily.temperature_2m_min[i]),
          rain: w.daily.precipitation_probability_max[i],
        }));
        const inTrip = all.filter((d) => d.date >= startDate && d.date <= endDate);
        setState({
          status: "ok",
          place: [place.name, place.country].filter(Boolean).join(", "),
          days: inTrip.length ? inTrip : all.slice(0, 7),
          note: inTrip.length ? "Forecast for your trip dates" : "Your dates are beyond the 16-day forecast, so this shows the next 7 days at the destination",
        });
      } catch (e) {
        if (e.name !== "AbortError") setState({ status: "error" });
      }
    })();
    return () => ctrl.abort();
  }, [destination, startDate, endDate]);

  return (
    <section className="panel weather" aria-label="Weather">
      <div className="weather-head">
        <h2 className="panel-title">Weather{state.place ? ` in ${state.place}` : ""}</h2>
        {state.note && <span className="muted small">{state.note}</span>}
      </div>
      {state.status === "loading" && <p className="muted">Loading forecast…</p>}
      {state.status === "error" && <p className="muted">Weather isn't available for this destination right now.</p>}
      {state.status === "ok" && (
        <div className="weather-grid">
          {state.days.map((d) => {
            const [label, icon] = weatherLabel(d.code);
            return (
              <div key={d.date} className="weather-day">
                <span className="small muted">{fmtDay(d.date)}</span>
                <Icon name={icon} size={24} />
                <strong>{d.max}° <span className="muted">/ {d.min}°</span></strong>
                <span className="small muted">{label}</span>
                <span className="small rain">{d.rain ?? 0}% rain</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
