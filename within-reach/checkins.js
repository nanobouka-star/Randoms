/* Khalid's check-ins: when he should message the traveller, and what he says.
   Pure function of the trip, shared by the page (preview / live) and, later,
   a server job that sends the same messages over WhatsApp.
   trip = { name, arr: Date, dep: Date, rows: [{ start: Date, title: string, short: string, slot: string }] }  (booked rows only)
   Returns [{ id, at: Date, text, chips: [string] }] sorted by time. Max one evening message per day. */
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes());
  const dayKey = (d) => d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  const at = (d, h, m) => { const t = new Date(d); t.setHours(h, m, 0, 0); return t; };
  const list = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

  function checkins(trip) {
    const first = trip.name ? trip.name.split(" ")[0] : "";
    const hi = first ? ", " + first : "";
    const rows = trip.rows.slice().sort((a, b) => a.start - b.start);
    const out = [];
    const transfer = new Date(trip.dep.getTime() - 3 * 3600e3);

    // 1. Landing
    const landed = new Date(trip.arr.getTime() + 60 * 60e3);
    const next = rows.find((r) => r.start > landed);
    out.push({
      id: "landed", at: landed,
      text: "Did you land okay" + hi + "? Take your time getting to the hotel." +
        (next ? " First up is " + next.title + " at " + hm(next.start) + (dayKey(next.start) === dayKey(landed) ? " today." : " tomorrow.") : " Your plan is open, so rest up."),
      chips: ["Landed, all good", "My flight is delayed"],
    });

    // 2. Each evening before another full day: how was today, anything to change tomorrow
    for (let d = at(trip.arr, 0, 0); ; d.setDate(d.getDate() + 1)) {
      const evening = at(d, 21, 30);
      const tomorrowStart = at(d, 24, 0);
      if (tomorrowStart >= transfer) break;
      if (evening < new Date(trip.arr.getTime() + 4 * 3600e3)) continue;
      const today = rows.filter((r) => dayKey(r.start) === dayKey(d)).map((r) => r.short || r.title);
      const tmr = rows.filter((r) => dayKey(r.start) === dayKey(tomorrowStart));
      let text = today.length ? (today.length > 1 ? "How were " : "How was ") + list(today) + " today" + hi + "?" : "Hope today was easy" + hi + ".";
      if (tmr.length) {
        text += " Tomorrow: " + tmr.map((r) => r.title + " at " + hm(r.start)).join(", then ") + ".";
        const early = tmr.find((r) => r.start.getHours() < 7);
        if (early) text += " That's an early start, so set an alarm for " + hm(new Date(early.start.getTime() - 45 * 60e3)) + ".";
      } else text += " Tomorrow is open so far.";
      text += " Want to change anything?";
      out.push({ id: "eve-" + dayKey(d), at: evening, text, chips: ["Loved today", "Change tomorrow", "Make tomorrow easier"] });
    }

    // 3. Last day
    const last = new Date(trip.dep.getTime() - 7 * 3600e3);
    if (last > new Date(trip.arr.getTime() + 12 * 3600e3)) {
      out.push({
        id: "last", at: last,
        text: "Last day" + hi + ". Your airport transfer leaves at " + hm(transfer) + ". Anything you'd like to fit in before then?",
        chips: ["All good, thanks", "Help me fill the time"],
      });
    }
    return out.sort((a, b) => a.at - b.at);
  }
  root.KhalidCheckins = { checkins };
})(typeof globalThis !== "undefined" ? globalThis : this);
