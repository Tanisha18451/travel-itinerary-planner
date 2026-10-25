import { daysUntil, fmtDate } from "../utils";
import Icon from "./Icons.jsx";

const QUICK = ["Goa", "Jaipur", "Manali", "Bali"];
const TIPS = [
  "Book popular attractions a day or two ahead.",
  "Keep about 10% of your budget free for surprises.",
  "Group nearby stops on the same day to save travel time.",
  "Check opening days. Many museums close on Mondays.",
  "Download offline maps before you leave.",
  "Not happy with a day? Regenerate just that day and add an instruction.",
];

const when = (d) => (d <= 0 ? "on now" : d === 1 ? "tomorrow" : `in ${d} days`);

export default function SideExtras({ trips, onOpen, onNew }) {
  const upcoming = trips
    .filter((t) => daysUntil(t.request.end_date) >= 0)
    .sort((a, b) => a.request.start_date.localeCompare(b.request.start_date))
    .slice(0, 3);
  const totalDays = trips.reduce((s, t) => s + t.itinerary.days.length, 0);
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);

  return (
    <div className="side-extra">
      {trips.length > 0 && (
        <div className="side-stats">
          <div><strong>{trips.length}</strong><span>trips</span></div>
          <div><strong>{totalDays}</strong><span>days planned</span></div>
        </div>
      )}

      <section>
        <h2 className="side-title">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="side-empty">Nothing scheduled yet.</p>
        ) : (
          <ul className="side-list">
            {upcoming.map((t) => (
              <li key={t.id}>
                <button className="side-trip" onClick={() => onOpen(t)}>
                  <span className="side-trip-name">{t.request.destination}</span>
                  <span className="side-trip-meta">
                    {fmtDate(t.request.start_date, { day: "numeric", month: "short" })} · {when(daysUntil(t.request.start_date))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="side-title">Quick start</h2>
        <div className="side-chips">
          {QUICK.map((d) => (
            <button key={d} className="side-chip" onClick={() => onNew(d)}>{d}</button>
          ))}
        </div>
      </section>

      <p className="side-tip"><Icon name="sparkles" size={15} /> <span>{TIPS[dayOfYear % TIPS.length]}</span></p>
    </div>
  );
}
