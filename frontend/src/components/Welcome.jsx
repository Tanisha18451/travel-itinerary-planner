import Cover from "./Cover.jsx";
import Icon from "./Icons.jsx";

const DESTINATIONS = [
  ["Goa", "Beaches, seafood and sunset spots", "food · nightlife · relaxation"],
  ["Jaipur", "Forts, bazaars and royal food", "history · culture · food"],
  ["Manali", "Mountain views and easy treks", "adventure · nature"],
  ["Kerala", "Backwaters, tea hills and slow days", "nature · relaxation"],
  ["Bali", "Rice terraces, temples and cafes", "culture · nature"],
  ["Tokyo", "Street food, museums and neon nights", "food · culture · shopping"],
];

const STEPS = [
  ["Tell us the basics", "Destination, dates, total budget, group size and what you enjoy."],
  ["Get a full plan", "A day-by-day itinerary with stops, timings and a cost for each one."],
  ["Make it yours", "Edit stops, regenerate a day, or ask the AI to change anything in plain words."],
];

const FEATURES = [
  ["wallet", "Budget tracking", "See spending by category and a warning if you go over."],
  ["sun", "Weather forecast", "A forecast for your destination, right on the itinerary."],
  ["list", "Packing list", "A checklist matched to your trip, with progress."],
  ["calendar", "Calendar export", "Add the whole plan to Google or Apple Calendar."],
  ["link", "Share link", "Send a read-only page of your trip to friends and family."],
  ["pin", "Map links", "Open any stop in Maps with one click."],
  ["printer", "Print or save PDF", "A clean, all-days printout for the road."],
  ["copy", "Duplicate trips", "Copy a plan and tweak it for a different date or group."],
];

export default function Welcome({ onNew }) {
  return (
    <div className="welcome">
      <Cover name="Wayfinder" className="welcome-hero">
        <span className="badge on-dark">Welcome</span>
        <div className="welcome-hero-row">
          <div>
            <h2>Your first trip is a few clicks away</h2>
            <p>Tell us where and when. Get a day-by-day plan with costs, weather and a packing list.</p>
          </div>
          <button className="btn light" onClick={() => onNew()}><Icon name="sparkles" /> Plan your first trip</button>
        </div>
      </Cover>

      <section>
        <h2 className="section-title">Start with a popular destination</h2>
        <div className="dest-grid">
          {DESTINATIONS.map(([name, blurb, tags]) => (
            <button key={name} className="dest-card" onClick={() => onNew(name)} aria-label={`Plan a trip to ${name}`}>
              <Cover name={name} className="dest-cover"><h3>{name}</h3></Cover>
              <span className="dest-body">
                <span>{blurb}</span>
                <span className="small muted">{tags}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">How it works</h2>
        <ol className="steps">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="step">
              <span className="step-num">{i + 1}</span>
              <strong>{title}</strong>
              <span className="muted">{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="section-title">Everything in one place</h2>
        <div className="features">
          {FEATURES.map(([icon, title, text]) => (
            <div key={title} className="feature">
              <span className="feature-icon"><Icon name={icon} size={18} /></span>
              <strong>{title}</strong>
              <span className="muted small">{text}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="welcome-note">
        <Icon name="chart" size={16} /> Once you save a trip, this page fills up with your next-trip countdown, spending charts and recent activity.
      </p>
    </div>
  );
}
