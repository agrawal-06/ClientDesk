import { useState } from "react";
import { today } from "../lib/domain.js";
import { calendarEvents, monthDays } from "../lib/planning.js";
export default function ProjectCalendar({ data }) {
  const [month, setMonth] = useState(today().slice(0, 7)),
    [selected, setSelected] = useState(""),
    [kind, setKind] = useState("All"),
    [completed, setCompleted] = useState(false);
  const events = calendarEvents(data, completed).filter(
    (e) => kind === "All" || e.type === kind,
  );
  const days = monthDays(month),
    visible = events.filter((e) =>
      selected ? e.date === selected : e.date.startsWith(month),
    );
  function move(offset) {
    const d = new Date(month + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + offset);
    setMonth(d.toISOString().slice(0, 7));
    setSelected("");
  }
  const title = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T00:00:00Z"));
  return (
    <div className="planning-calendar">
      <div className="business-actions calendar-toolbar">
        <button onClick={() => move(-1)} aria-label="Previous month">
          ←
        </button>
        <h3>{title}</h3>
        <button onClick={() => move(1)} aria-label="Next month">
          →
        </button>
        <button
          onClick={() => {
            setMonth(today().slice(0, 7));
            setSelected(today());
          }}
        >
          Today
        </button>
        <label>
          Show{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["All", "Project", "Follow-up", "Lead"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
          />{" "}
          Include completed
        </label>
      </div>
      <p className="business-footnote">
        Select a day to see its agenda. Dates follow your saved project
        deadlines and follow-ups.
      </p>
      <div className="calendar-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <strong className="calendar-weekday" key={day}>
            {day}
          </strong>
        ))}
        {days.map((day) => {
          const entries = events.filter((e) => e.date === day);
          return (
            <button
              key={day}
              className={
                "calendar-day " +
                (!day.startsWith(month) ? "outside " : "") +
                (day === today() ? "today " : "") +
                (day === selected ? "selected" : "")
              }
              aria-label={day + ", " + entries.length + " events"}
              aria-pressed={selected === day}
              onClick={() => setSelected(day)}
            >
              <strong>{Number(day.slice(-2))}</strong>
              {entries.slice(0, 2).map((e) => (
                <span
                  key={e.id}
                  className={"calendar-chip " + (e.done ? "complete" : "")}
                >
                  {e.type}: {e.title}
                </span>
              ))}
              {entries.length > 2 && <small>+{entries.length - 2} more</small>}
              <span className="calendar-count">
                {entries.length > 0 ? entries.length + " events" : ""}
              </span>
            </button>
          );
        })}
      </div>
      <div className="business-heading">
        <h3>{selected ? "Agenda · " + selected : "Agenda · " + title}</h3>
        {selected && (
          <button onClick={() => setSelected("")}>Whole month</button>
        )}
      </div>
      {!visible.length && (
        <p className="business-empty">
          Nothing scheduled {selected ? "on this day" : "this month"}.
        </p>
      )}
      {visible.map((e) => (
        <article className="business-record" key={e.id}>
          <div>
            <strong>{e.title}</strong>
            <p>{e.detail}</p>
            <small>
              {e.date} · {e.type} ·{" "}
              {e.done ? "Completed" : e.date < today() ? "Overdue" : "Upcoming"}
            </small>
          </div>
        </article>
      ))}
    </div>
  );
}
