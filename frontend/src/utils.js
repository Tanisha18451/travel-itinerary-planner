export const fmtDate = (d, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", opts);

export const fmtDay = (d) => fmtDate(d, { weekday: "short", day: "numeric", month: "short" });

export const daysUntil = (d) => Math.ceil((new Date(d + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);

export const CATEGORY = {
  attraction: { label: "Activities", icon: "compass", color: "var(--act)" },
  dining: { label: "Food", icon: "utensils", color: "var(--food)" },
  accommodation: { label: "Stays", icon: "bed", color: "var(--stay)" },
  transport: { label: "Transport", icon: "car", color: "var(--move)" },
};

export const mapsUrl = (item, destination) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.title} ${item.location || destination}`)}`;

export function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Calendar file (.ics) so the plan can be imported into Google or Apple Calendar
export function toIcs(trip, it) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wayfinder//Trip Planner//EN", "CALSCALE:GREGORIAN"];
  it.days.forEach((d) =>
    d.items.forEach((i, n) => {
      const [h, m] = (i.time || "09:00").split(":").map(Number);
      const start = new Date(`${d.date}T00:00:00`);
      start.setHours(h || 0, m || 0);
      const end = new Date(start.getTime() + (i.duration_min > 0 ? i.duration_min : 30) * 60000);
      lines.push(
        "BEGIN:VEVENT", `UID:${trip.id}-${d.day}-${n}@wayfinder`, `DTSTAMP:${stamp}`,
        `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${esc(i.title)}`,
        `DESCRIPTION:${esc(i.description)}`, `LOCATION:${esc(i.location)}`, "END:VEVENT"
      );
    })
  );
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export const timeAgo = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

// ---- weather ----
export function weatherLabel(code) {
  if (code === 0) return ["Clear", "sun"];
  if (code <= 3) return ["Partly cloudy", "cloud"];
  if (code === 45 || code === 48) return ["Fog", "cloud"];
  if (code >= 51 && code <= 67) return ["Rain", "rain"];
  if (code >= 71 && code <= 77) return ["Snow", "cloud"];
  if (code >= 80 && code <= 82) return ["Showers", "rain"];
  if (code >= 95) return ["Thunderstorm", "rain"];
  return ["Mixed", "cloud"];
}
