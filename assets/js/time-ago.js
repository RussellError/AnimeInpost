/* ============================================================
   TIME AGO ENGINE
   Converts an ISO timestamp into a relative "time ago" string,
   e.g. "15 hours ago", "last week", "2 weeks ago".

   Usage:
     timeAgo("2026-08-04T18:00:00Z")  ->  "15 hours ago"

   Also exposes autoRefreshTimeAgo() which finds every element
   with [data-timestamp] and keeps its text updated live, so
   "3 minutes ago" naturally becomes "4 minutes ago" etc.
   without a page reload.
   ============================================================ */

function timeAgo(timestamp) {
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  let diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 0) diffSec = 0;

  const MIN = 60;
  const HOUR = MIN * 60;
  const DAY = HOUR * 24;
  const WEEK = DAY * 7;
  const MONTH = DAY * 30;
  const YEAR = DAY * 365;

  if (diffSec < MIN) {
    return "just now";
  }
  if (diffSec < HOUR) {
    const m = Math.floor(diffSec / MIN);
    return `${m} minute${m !== 1 ? "s" : ""} ago`;
  }
  if (diffSec < DAY) {
    const h = Math.floor(diffSec / HOUR);
    return `${h} hour${h !== 1 ? "s" : ""} ago`;
  }
  if (diffSec < WEEK) {
    const d = Math.floor(diffSec / DAY);
    return d === 1 ? "yesterday" : `${d} days ago`;
  }
  if (diffSec < WEEK * 2) {
    return "last week";
  }
  if (diffSec < MONTH) {
    const w = Math.floor(diffSec / WEEK);
    return `${w} weeks ago`;
  }
  if (diffSec < MONTH * 2) {
    return "last month";
  }
  if (diffSec < YEAR) {
    const mo = Math.floor(diffSec / MONTH);
    return `${mo} months ago`;
  }
  const y = Math.floor(diffSec / YEAR);
  return y === 1 ? "last year" : `${y} years ago`;
}

/* Keeps all [data-timestamp] elements on the page updated live. */
function autoRefreshTimeAgo(intervalMs) {
  function update() {
    document.querySelectorAll("[data-timestamp]").forEach((el) => {
      const ts = el.getAttribute("data-timestamp");
      if (ts) el.textContent = timeAgo(ts);
    });
  }
  update();
  setInterval(update, intervalMs || 60000); // refresh every 60s by default
}
