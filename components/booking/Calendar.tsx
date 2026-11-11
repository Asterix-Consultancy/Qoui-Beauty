"use client";

import { useEffect, useRef, useState } from "react";
import { addMonths, dayLabel, mondayOffset, monthLabel, type Day } from "./api";

const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const BOOKABLE = new Set(["available", "limited"]);

function describe(d: Day) {
  switch (d.status) {
    case "available": return `${d.free} times free`;
    case "limited": return `only ${d.free} ${d.free === 1 ? "time" : "times"} left`;
    case "full": return "fully booked";
    case "closed": return "studio closed";
    case "blocked": return "Betty is away";
    case "past": return "past";
    case "too_far": return "not open for booking yet";
  }
}

type Props = {
  month: string;
  days: Day[] | null;
  loading: boolean;
  selected: string | null;
  minMonth: string;
  maxMonth: string;
  today: string;
  onMonth: (m: string) => void;
  onSelect: (date: string) => void;
};

// Month calendar: swipe or arrows to change month, arrow keys to move between days,
// every day shows how booked it is. Unavailable days stay visible but can't be picked.
export default function Calendar({ month, days, loading, selected, minMonth, maxMonth, today, onMonth, onSelect }: Props) {
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [focusDate, setFocusDate] = useState<string | null>(selected);
  const grid = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const keyNav = useRef(false);
  const canPrev = month > minMonth;
  const canNext = month < maxMonth;

  const go = (n: number) => {
    const m = addMonths(month, n);
    if (m < minMonth || m > maxMonth) return;
    setDir(n > 0 ? "next" : "prev");
    onMonth(m);
  };

  // keep keyboard focus on the moved-to day after re-render
  useEffect(() => {
    if (!keyNav.current || !focusDate) return;
    const btn = grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`);
    if (btn) { btn.focus(); keyNav.current = false; }
  }, [focusDate, days]);

  const onKey = (e: React.KeyboardEvent, date: string) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    keyNav.current = true;
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
    if (next.slice(0, 7) !== month) go(next.slice(0, 7) > month ? 1 : -1);
    setFocusDate(next);
  };

  const offset = mondayOffset(month);
  const counts = days?.reduce((a, d) => ({ ...a, [d.status]: (a[d.status] || 0) + 1 }), {} as Record<string, number>);

  return (
    <div className="cal">
      <div className="cal__head">
        <button type="button" className="cal__nav" onClick={() => go(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
        <h3 className="cal__month" aria-live="polite">{monthLabel(month)}</h3>
        <button type="button" className="cal__nav" onClick={() => go(1)} disabled={!canNext} aria-label="Next month">›</button>
      </div>

      <div className="cal__week" aria-hidden="true">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>

      <div
        ref={grid}
        key={month}
        className={`cal__grid cal__grid--${dir}${loading ? " is-loading" : ""}`}
        role="grid"
        aria-label={`Days in ${monthLabel(month)}`}
        onPointerDown={(e) => { if (e.pointerType !== "mouse") startX.current = e.clientX; }}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {Array.from({ length: offset }).map((_, i) => <span key={`pad${i}`} className="cal__pad" />)}
        {(days ?? []).map((d) => {
          const n = Number(d.date.slice(8));
          const bookable = BOOKABLE.has(d.status);
          const isSel = selected === d.date;
          const tabbable = (focusDate ?? selected ?? today) === d.date || (!focusDate && !selected && n === 1 && today.slice(0, 7) !== month);
          const dots = d.status === "available" ? (d.free > 8 ? 3 : 2) : d.status === "limited" ? 1 : 0;
          return (
            <button
              key={d.date}
              type="button"
              data-date={d.date}
              className={`day day--${d.status}${isSel ? " is-selected" : ""}${d.date === today ? " is-today" : ""}`}
              aria-disabled={!bookable}
              aria-pressed={isSel}
              aria-label={`${dayLabel(d.date)}, ${describe(d)}`}
              tabIndex={tabbable ? 0 : -1}
              onKeyDown={(e) => onKey(e, d.date)}
              onFocus={() => setFocusDate(d.date)}
              onClick={() => { if (bookable) onSelect(d.date); }}
            >
              <span className="day__n">{n}</span>
              {dots > 0 && <span className="day__dots" aria-hidden="true">{Array.from({ length: dots }).map((_, i) => <i key={i} />)}</span>}
              {d.status === "full" && <span className="day__tag">Full</span>}
              {(d.status === "closed" || d.status === "blocked") && <span className="day__tag">Off</span>}
            </button>
          );
        })}
        {!days && Array.from({ length: 30 }).map((_, i) => <span key={`sk${i}`} className="day day--skeleton" />)}
      </div>

      <div className="cal__legend" aria-hidden="true">
        <span><i className="lg lg--free" />Free{counts?.available ? ` · ${counts.available}` : ""}</span>
        <span><i className="lg lg--few" />Few left{counts?.limited ? ` · ${counts.limited}` : ""}</span>
        <span><i className="lg lg--full" />Full</span>
        <span><i className="lg lg--off" />Closed / away</span>
      </div>
    </div>
  );
}
