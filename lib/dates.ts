// Dates, always in India time and built by hand, so the server and the browser produce exactly the same text.
// (The browser's own date formatting can differ from the server's: "pm" vs "PM", odd spaces, another time zone,
// which makes React report a hydration error.)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function parts(iso: string) {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS); // read the UTC fields of this shifted date = India time
  const h = d.getUTCHours();
  return {
    day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(),
    time: `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`,
  };
}

/** 7 Nov 2026, 1:18 pm */
export const fmtDateTime = (iso: string) => { const p = parts(iso); return `${p.day} ${p.month} ${p.year}, ${p.time}`; };
/** 7 Nov 2026 */
export const fmtDay = (iso: string) => { const p = parts(iso); return `${p.day} ${p.month} ${p.year}`; };
/** 7 Nov, 1:18 pm */
export const fmtShortDateTime = (iso: string) => { const p = parts(iso); return `${p.day} ${p.month}, ${p.time}`; };
