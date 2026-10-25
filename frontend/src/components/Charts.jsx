export function Donut({ data, centerTop, centerBottom }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 44;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label="Spending by category">
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--glass)" strokeWidth="16" />
      {total > 0 &&
        data.map((d) => {
          const len = (d.value / total) * C;
          const el = (
            <circle key={d.label} cx="60" cy="60" r={R} fill="none" stroke={d.color} strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
          );
          offset += len;
          return el;
        })}
      <text x="60" y="58" textAnchor="middle" className="donut-top">{centerTop}</text>
      <text x="60" y="72" textAnchor="middle" className="donut-bottom">{centerBottom}</text>
    </svg>
  );
}

export function HBars({ rows }) {
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="hbar-head"><span className="hbar-label">{r.label}</span><span className="hbar-value">{r.valueText}</span></div>
          <div className="bar"><div className={r.over ? "fill over" : "fill"} style={{ width: `${Math.min(100, r.pct)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function MonthBars({ months }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  return (
    <div className="months" role="img" aria-label="Trips by month">
      {months.map((m) => (
        <div key={m.key} className="month">
          <span className="month-count">{m.count || ""}</span>
          <div className="month-bar"><div style={{ height: `${(m.count / max) * 100}%` }} className={m.count ? "month-fill" : ""} /></div>
          <span className="month-label">{m.label}</span>
        </div>
      ))}
    </div>
  );
}
