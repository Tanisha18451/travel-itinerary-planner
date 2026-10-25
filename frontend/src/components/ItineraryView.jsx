import { useEffect, useMemo, useRef, useState } from "react";
import { api, money } from "../api";
import { CATEGORY, downloadFile, fmtDate, fmtDay, mapsUrl, toIcs } from "../utils";
import Cover from "./Cover.jsx";
import Icon from "./Icons.jsx";
import Weather from "./Weather.jsx";

function withTotals(it) {
  const days = it.days.map((d) => ({ ...d, estimated_cost: d.items.reduce((s, i) => s + (Number(i.cost) || 0), 0) }));
  return { ...it, days, total_cost: days.reduce((s, d) => s + d.estimated_cost, 0) };
}

function toText(trip, it) {
  const r = trip.request;
  const lines = [it.title, `${r.destination} · ${fmtDate(r.start_date)} to ${fmtDate(r.end_date)}`, ""];
  it.days.forEach((d) => {
    lines.push(`Day ${d.day} (${fmtDay(d.date)}): ${d.title}`);
    d.items.forEach((i) => lines.push(`  ${i.time}  ${i.title}${i.cost ? ` (${money(i.cost, r.currency)})` : ""}`));
    lines.push("");
  });
  lines.push(`Estimated total: ${money(it.total_cost, r.currency)}`);
  return lines.join("\n");
}

export default function ItineraryView({ trip, onUpdate, onBack, onDelete, notify }) {
  const [it, setIt] = useState(trip.itinerary);
  const [dirty, setDirty] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [refineText, setRefineText] = useState("");
  const saveSeq = useRef(0);

  useEffect(() => {
    setIt(trip.itinerary);
    setDirty(false);
    setDayIdx((i) => Math.min(i, trip.itinerary.days.length - 1));
  }, [trip]);

  const r = trip.request;
  const currency = r.currency;
  const budget = r.budget;
  const day = it.days[dayIdx];
  const over = it.total_cost > budget;
  const perPersonDay = it.total_cost / Math.max(1, r.group_size) / Math.max(1, it.days.length);

  const totals = useMemo(() => {
    const t = { accommodation: 0, dining: 0, attraction: 0, transport: 0 };
    it.days.forEach((d) => d.items.forEach((i) => { t[i.type] = (t[i.type] || 0) + (Number(i.cost) || 0); }));
    return t;
  }, [it]);
  const scale = Math.max(it.total_cost, budget) || 1;

  const packing = it.packing || [];
  const packedCount = packing.filter((p) => p.checked).length;
  const packGroups = useMemo(() => {
    const m = new Map();
    (it.packing || []).forEach((p, i) => m.set(p.category, [...(m.get(p.category) || []), { p, i }]));
    return [...m.entries()];
  }, [it]);
  const shareUrl = trip.share_token ? `${window.location.origin}/s/${trip.share_token}` : "";

  const edit = (fn) => {
    setIt((prev) => withTotals(fn(structuredClone(prev))));
    setDirty(true);
  };
  const patchItem = (i, patch) => edit((x) => { Object.assign(x.days[dayIdx].items[i], patch); return x; });
  const removeItem = (i) => edit((x) => { x.days[dayIdx].items.splice(i, 1); return x; });
  const addItem = () =>
    edit((x) => {
      x.days[dayIdx].items.push({ time: "18:00", type: "attraction", title: "New activity", description: "", location: r.destination, cost: 0, duration_min: 60 });
      x.days[dayIdx].items.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
      return x;
    });

  const run = async (label, fn, success) => {
    setBusy(label);
    setError("");
    try {
      onUpdate(await fn());
      if (success) notify(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const save = () => run("save", () => api.save(trip.id, { itinerary: it }), "Changes saved");
  const regenDay = () =>
    run(
      "day",
      async () => {
        if (dirty) await api.save(trip.id, { itinerary: it }); // keep edits made on other days
        const updated = await api.regenerateDay(trip.id, day.day, instruction);
        setInstruction("");
        return updated;
      },
      `Day ${day.day} regenerated`
    );
  const regenAll = () => {
    if (!window.confirm("Regenerate the whole itinerary? Your edits will be replaced.")) return;
    run("all", () => api.regenerateTrip(trip.id), "Itinerary regenerated");
  };
  const flush = async () => {
    if (dirty) await api.save(trip.id, { itinerary: it }); // never lose manual edits when the AI rewrites the plan
  };
  const refine = () =>
    run("refine", async () => {
      await flush();
      const updated = await api.refine(trip.id, refineText);
      setRefineText("");
      return updated;
    }, "Itinerary updated");
  const makePacking = () => run("pack", async () => { await flush(); return api.packing(trip.id); }, "Packing list ready");
  const share = () => run("share", () => api.share(trip.id), "Share link created");
  const unshare = () => run("share", () => api.unshare(trip.id), "Sharing turned off");
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      notify("Link copied");
    } catch {
      notify("Couldn't copy the link", "error");
    }
  };
  const exportIcs = () => {
    downloadFile(`${r.destination.replace(/\s+/g, "-").toLowerCase()}-itinerary.ics`, toIcs(trip, it), "text/calendar");
    notify("Calendar file downloaded");
  };
  const togglePack = (i) => {
    const next = structuredClone(it);
    next.packing[i].checked = !next.packing[i].checked;
    setIt(next);
    const n = ++saveSeq.current;
    api.save(trip.id, { itinerary: next }).then((t) => { if (n === saveSeq.current) onUpdate(t); }).catch((e) => setError(e.message));
  };
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(toText(trip, it));
      notify("Itinerary copied to clipboard");
    } catch {
      notify("Couldn't copy. Your browser blocked clipboard access.", "error");
    }
  };

  return (
    <>
      <div className="screen-only">
        <button className="back" onClick={onBack}><Icon name="arrow-left" size={16} /> My trips</button>

        <Cover name={r.destination} className="hero">
          <span className={`badge on-dark ${trip.source}`}>{trip.source === "ai" ? "AI plan" : "Demo plan"}</span>
          <div>
            <h1>{it.title}</h1>
            <p className="hero-meta">
              <span><Icon name="pin" size={15} /> {r.destination}</span>
              <span><Icon name="calendar" size={15} /> {fmtDate(r.start_date)} to {fmtDate(r.end_date)}</span>
              <span className="cap">{r.travel_style} · {r.pace} pace</span>
            </p>
          </div>
        </Cover>

        <div className="actions-bar">
          <button className="btn secondary sm" onClick={() => window.print()}><Icon name="printer" size={16} /> Print or save PDF</button>
          <button className="btn secondary sm" onClick={copyText}><Icon name="copy" size={16} /> Copy as text</button>
          <button className="btn secondary sm" onClick={exportIcs}><Icon name="download" size={16} /> Add to calendar</button>
          <button className="btn secondary sm" onClick={regenAll} disabled={!!busy}><Icon name="refresh" size={16} /> {busy === "all" ? "Regenerating…" : "Regenerate trip"}</button>
          <span className="spacer" />
          <button className="btn danger-ghost sm" onClick={onDelete}><Icon name="trash" size={16} /> Delete</button>
        </div>

        {it.summary && <p className="summary">{it.summary}</p>}

        <section className="stats" aria-label="Trip summary">
          <div className="stat"><span className="stat-label">Duration</span><span className="stat-value">{it.days.length} days</span></div>
          <div className="stat"><span className="stat-label">Travellers</span><span className="stat-value">{r.group_size}</span></div>
          <div className="stat"><span className="stat-label">Estimated cost</span><span className="stat-value">{money(it.total_cost, currency)}</span></div>
          <div className="stat"><span className="stat-label">Per person, per day</span><span className="stat-value">{money(perPersonDay, currency)}</span></div>
        </section>

        <section className="panel budget-panel" aria-label="Budget">
          <div className="budget-head">
            <h2 className="panel-title">Budget</h2>
            <span className={over ? "budget-state over" : "budget-state"}>
              {over ? `${money(it.total_cost - budget, currency)} over` : `${money(budget - it.total_cost, currency)} left`} of {money(budget, currency)}
            </span>
          </div>
          <div className="stack" role="img" aria-label="Spending by category">
            {Object.entries(CATEGORY).map(([k, c]) => (
              <div key={k} className="seg" style={{ width: `${(totals[k] / scale) * 100}%`, background: c.color }} title={`${c.label}: ${money(totals[k], currency)}`} />
            ))}
          </div>
          <ul className="legend">
            {Object.entries(CATEGORY).map(([k, c]) => (
              <li key={k}><span className="dot" style={{ background: c.color }} /> {c.label} <strong>{money(totals[k], currency)}</strong></li>
            ))}
          </ul>
        </section>

        {error && <p className="banner error" role="alert"><Icon name="alert" /> <span>{error}</span></p>}

        <Weather destination={r.destination} startDate={r.start_date} endDate={r.end_date} />

        <div className="days-layout">
          <nav className="day-nav" aria-label="Days">
            {it.days.map((d, i) => (
              <button key={d.day} aria-current={i === dayIdx ? "true" : undefined} className={i === dayIdx ? "day-pill on" : "day-pill"} onClick={() => setDayIdx(i)}>
                <span className="day-pill-top">Day {d.day}</span>
                <span className="day-pill-sub">{fmtDay(d.date)}</span>
                <span className="day-pill-cost">{money(d.estimated_cost, currency)}</span>
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
              <div className="day-cost">
                <span className="stat-label">Day total</span>
                <strong>{money(day.estimated_cost, currency)}</strong>
              </div>
            </div>

            <ol className="timeline">
              {day.items.map((item, i) => {
                const cat = CATEGORY[item.type] || CATEGORY.attraction;
                return (
                  <li key={i} className="stop" style={{ "--c": cat.color }}>
                    <div className="stop-time">
                      {editing ? <input aria-label="Time" type="time" value={item.time} onChange={(e) => patchItem(i, { time: e.target.value })} /> : item.time}
                    </div>
                    <div className="rail"><span className="stop-node"><Icon name={cat.icon} size={15} /></span></div>
                    <div className="stop-card">
                      {editing ? (
                        <>
                          <input aria-label="Title" className="title-input" value={item.title} onChange={(e) => patchItem(i, { title: e.target.value })} />
                          <textarea aria-label="Description" rows={2} value={item.description} onChange={(e) => patchItem(i, { description: e.target.value })} />
                          <div className="edit-row">
                            <select aria-label="Type" value={item.type} onChange={(e) => patchItem(i, { type: e.target.value })}>
                              {Object.entries(CATEGORY).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                            </select>
                            <input aria-label="Cost" type="number" min={0} className="cost-input" value={item.cost} onChange={(e) => patchItem(i, { cost: e.target.value === "" ? 0 : Number(e.target.value) })} />
                            <button type="button" className="btn danger-ghost sm" onClick={() => removeItem(i)}><Icon name="trash" size={15} /> Remove</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="stop-top">
                            <span className="stop-title">{item.title}</span>
                            <span className="cost-chip">{item.cost ? money(item.cost, currency) : "Free"}</span>
                          </div>
                          {item.description && <p className="stop-desc">{item.description}</p>}
                          <p className="stop-meta">
                            <span className="type-tag">{cat.label}</span>
                            {item.location && <span><Icon name="pin" size={13} /> {item.location}</span>}
                            {item.duration_min > 0 && <span><Icon name="clock" size={13} /> {item.duration_min} min</span>}
                            <a className="map-link" href={mapsUrl(item, r.destination)} target="_blank" rel="noreferrer"><Icon name="link" size={13} /> Open in Maps</a>
                          </p>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
              {day.items.length === 0 && <li className="muted">No stops on this day yet. Add one or regenerate the day.</li>}
            </ol>

            <div className="day-actions">
              <div className="row">
                <button className="btn secondary sm" onClick={() => setEditing(!editing)}>
                  <Icon name={editing ? "check" : "pencil"} size={16} /> {editing ? "Done editing" : "Edit this day"}
                </button>
                {editing && <button className="btn secondary sm" onClick={addItem}><Icon name="plus" size={16} /> Add a stop</button>}
                <span className="spacer" />
                {dirty && <button className="btn primary sm" onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save changes"}</button>}
              </div>
              <div className="regen">
                <input aria-label="Instruction for regenerating this day" placeholder="Optional: “more street food, skip museums”" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                <button className="btn secondary" onClick={regenDay} disabled={!!busy}><Icon name="refresh" size={16} /> {busy === "day" ? "Regenerating…" : `Regenerate day ${day.day}`}</button>
              </div>
            </div>
          </section>
        </div>

        <div className="tools-grid">
          <section className="panel">
            <h2 className="panel-title"><Icon name="message" size={18} /> Ask the AI to change your plan</h2>
            <textarea aria-label="What should change?" rows={3} placeholder="e.g. Make it cheaper, add a sunset spot on day 2, swap museums for markets" value={refineText} onChange={(e) => setRefineText(e.target.value)} />
            <div className="chips top-gap">
              {["Make it cheaper", "Add more food stops", "Make the pace more relaxed", "Add a rainy-day option"].map((t) => (
                <button type="button" key={t} className="chip" onClick={() => setRefineText(t)}>{t}</button>
              ))}
            </div>
            <button className="btn primary top-gap" onClick={refine} disabled={!!busy || refineText.trim().length < 3}>
              <Icon name="sparkles" size={16} /> {busy === "refine" ? "Updating your plan…" : "Apply change"}
            </button>
          </section>

          <section className="panel">
            <h2 className="panel-title"><Icon name="bag" size={18} /> Packing list</h2>
            {packing.length === 0 ? (
              <>
                <p className="muted">Get a checklist matched to your destination, length and interests.</p>
                <button className="btn secondary top-gap" onClick={makePacking} disabled={!!busy}>{busy === "pack" ? "Building…" : "Generate packing list"}</button>
              </>
            ) : (
              <>
                <p className="small muted">{packedCount} of {packing.length} packed</p>
                <div className="mini-bar"><div className="fill" style={{ width: `${(packedCount / packing.length) * 100}%` }} /></div>
                {packGroups.map(([cat, entries]) => (
                  <div key={cat} className="pack-group">
                    <h3>{cat}</h3>
                    {entries.map(({ p, i }) => (
                      <label key={i} className="check">
                        <input type="checkbox" checked={!!p.checked} onChange={() => togglePack(i)} />
                        <span className={p.checked ? "done" : ""}>{p.item}</span>
                      </label>
                    ))}
                  </div>
                ))}
                <button className="link top-gap" onClick={makePacking} disabled={!!busy}>{busy === "pack" ? "Building…" : "Regenerate list"}</button>
              </>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title"><Icon name="link" size={18} /> Share this trip</h2>
            {trip.share_token ? (
              <>
                <p className="small muted">Anyone with this link can view, but not edit, this itinerary.</p>
                <div className="share-box">
                  <input readOnly aria-label="Share link" value={shareUrl} onFocus={(e) => e.target.select()} />
                  <button className="btn secondary sm" onClick={copyLink}><Icon name="copy" size={15} /> Copy</button>
                </div>
                <button className="link danger-link top-gap" onClick={unshare} disabled={!!busy}>Stop sharing</button>
              </>
            ) : (
              <>
                <p className="muted">Create a read-only link for friends, family or your mentor.</p>
                <button className="btn secondary top-gap" onClick={share} disabled={!!busy}><Icon name="link" size={16} /> {busy === "share" ? "Creating…" : "Create share link"}</button>
              </>
            )}
          </section>
        </div>

        {it.tips?.length > 0 && (
          <section className="panel tips">
            <h2 className="panel-title">Good to know</h2>
            <ul>{it.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </section>
        )}
      </div>

      <div className="print-only">
        <h1>{it.title}</h1>
        <p>{r.destination} · {fmtDate(r.start_date)} to {fmtDate(r.end_date)} · {r.group_size} traveller{r.group_size > 1 ? "s" : ""}</p>
        <p><strong>Estimated total: {money(it.total_cost, currency)}</strong> (budget {money(budget, currency)})</p>
        {it.days.map((d) => (
          <section key={d.day} className="print-day">
            <h2>Day {d.day} · {fmtDay(d.date)}: {d.title} <span>{money(d.estimated_cost, currency)}</span></h2>
            <table>
              <tbody>
                {d.items.map((i, n) => (
                  <tr key={n}>
                    <td className="pt">{i.time}</td>
                    <td><strong>{i.title}</strong>{i.description ? ` · ${i.description}` : ""}</td>
                    <td className="pc">{i.cost ? money(i.cost, currency) : "Free"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        {it.tips?.length > 0 && <><h2>Good to know</h2><ul>{it.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
      </div>
    </>
  );
}
