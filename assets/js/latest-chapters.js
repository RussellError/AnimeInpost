/* ============================================================
LATEST CHAPTERS ENGINE
Fetches series + chapter data from latest-chapters.json and
renders the dark row-list cards (image 1 style):
- full, non-truncated series title
- 3 chapters per series
- live "time ago" text per chapter, powered by time-ago.js
- NEW badge on the newest chapter (only if it's less than a week old)

Chapter timestamps are NOT stored in latest-chapters.json anymore.
That file only carries the series/chapter identity (title, url,
chapter number). The actual date per chapter is fetched live from
each series' own /meta/<slug>.json (same file series-render.js /
bookmarks.js / popular.js already use for chapter lists), matching
on the "index" field. This keeps a single source of truth for
chapter dates instead of duplicating them by hand in two files.

Also handles client-side pagination:
- data is fetched once, then sliced per page in JS
- the URL is kept in sync via ?page=N (shareable, back/forward
button support) but no extra network request is made
- pagination controls render as numbered pills: < 1 2 3 4 5 >

Requires time-ago.js to be loaded before this file.
============================================================ */

(function () {
  const DATA_URL = "./data/latest-chapters.json";
  const META_DIR = "/meta/";
  const PAGE_SIZE = 20;
  const READ_KEY = "aip_read_chapters";
  const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

  let fullData = [];
  let currentPage = 1;
  let container, pagination;

  function getReadChapters() {
    try {
      return JSON.parse(localStorage.getItem(READ_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function isChapterRead(url) {
    return !!getReadChapters()[url];
  }

  function markChapterRead(url) {
    const read = getReadChapters();
    read[url] = true;
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(read));
    } catch (e) {}
  }

  // Returns true if the timestamp is less than NEW_WINDOW_MS old.
  // Handles ISO strings, epoch ms, and epoch seconds.
  function isWithinNewWindow(timestamp) {
    if (timestamp == null) return false;
    let t = timestamp;
    if (typeof t === "number" && t < 1e12) {
      // looks like epoch seconds, not ms — convert
      t = t * 1000;
    }
    const chTime = new Date(t).getTime();
    if (isNaN(chTime)) return false;
    return Date.now() - chTime < NEW_WINDOW_MS;
  }

  // Extracts the series slug from a "/series/<slug>/" style url,
  // same pattern used by bookmarks.js / series-render.js.
  function slugFromUrl(url) {
    const m = /^\/series\/([^/]+)\/?$/.exec(url || "");
    return m ? m[1] : null;
  }

  // Fetches /meta/<slug>.json (the chapter/volume list) for every
  // unique series slug in the given list, in parallel, and returns
  // a promise resolving to { slug: { <index>: <date> } }. A slug
  // whose meta file is missing/unreachable just resolves to an
  // empty map so rendering can still proceed without its dates.
  function fetchChapterDates(seriesList) {
    const slugs = [];
    seriesList.forEach((s) => {
      s._slug = slugFromUrl(s.url);
      if (s._slug && slugs.indexOf(s._slug) === -1) slugs.push(s._slug);
    });

    return Promise.all(
      slugs.map((slug) =>
        fetch(META_DIR + slug + ".json")
          .then((res) => (res.ok ? res.json() : []))
          .then((chapters) => {
            const map = {};
            if (Array.isArray(chapters)) {
              chapters.forEach((ch) => {
                if (ch && ch.index != null) map[ch.index] = ch.date;
              });
            }
            return [slug, map];
          })
          .catch(() => [slug, {}])
      )
    ).then((entries) => Object.fromEntries(entries));
  }

  // Patches each series' chapters with a "timestamp" pulled from
  // its /meta/<slug>.json date map, matched by chapter number.
  // Chapters with no match (meta file missing, or the chapter isn't
  // in it yet) are left with timestamp = null and render without a
  // "time ago" label or NEW badge instead of a bogus date.
  function applyChapterDates(seriesList, datesBySlug) {
    seriesList.forEach((s) => {
      const map = datesBySlug[s._slug] || {};
      (s.chapters || []).forEach((ch) => {
        ch.timestamp = map[ch.number] != null ? map[ch.number] : null;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    container = document.getElementById("latestChapters");
    pagination = document.getElementById("latestChaptersPagination");
    if (!container) return;

    fetch(DATA_URL)
      .then((res) => res.json())
      .then((series) => {
        fullData = series;
        return fetchChapterDates(series).then((datesBySlug) => {
          applyChapterDates(fullData, datesBySlug);
          currentPage = getPageFromUrl();
          renderPage(currentPage);
        });
      })
      .catch((err) => console.error("Failed to load latest chapters:", err));

    // support browser back/forward
    window.addEventListener("popstate", () => {
      currentPage = getPageFromUrl();
      renderPage(currentPage, /*updateUrl=*/ false);
    });
  });

  function getPageFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const p = parseInt(params.get("page"), 10);
    return p && p > 0 ? p : 1;
  }

  function setPageInUrl(page) {
    const url = new URL(window.location.href);
    if (page <= 1) {
      url.searchParams.delete("page");
    } else {
      url.searchParams.set("page", page);
    }
    history.pushState({ page }, "", url);
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(fullData.length / PAGE_SIZE));
  }

  function renderPage(page, updateUrl) {
    const totalPages = getTotalPages();
    currentPage = Math.min(Math.max(1, page), totalPages);

    if (updateUrl !== false) setPageInUrl(currentPage);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = fullData.slice(start, start + PAGE_SIZE);

    renderLatestChapters(container, pageItems);
    renderPagination();

    // scroll the section into view on page change (not on first load)
    if (updateUrl !== false && container.dataset.rendered === "1") {
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    container.dataset.rendered = "1";
  }

  function renderLatestChapters(container, seriesList) {
    container.innerHTML = "";

    seriesList.forEach((series) => {
      const row = document.createElement("div");
      row.className = "lc-row";

      const cover = document.createElement("a");
      cover.className = "lc-cover";
      cover.href = series.url;
      cover.innerHTML = `<img src="${series.img}" alt="${series.title}" loading="lazy">`;

      const body = document.createElement("div");
      body.className = "lc-body";

      const title = document.createElement("a");
      title.className = "lc-title";
      title.href = series.url;
      title.textContent = series.title; // truncated with ellipsis via CSS if too long

      body.appendChild(title);

      series.chapters.slice(0, 3).forEach((ch, i) => {
        const hasTimestamp = ch.timestamp != null;
        const isNew = hasTimestamp && isWithinNewWindow(ch.timestamp);

        const chRow = document.createElement("a");
        chRow.className =
          "lc-chapter-row" +
          (isNew ? " is-new" : "") +
          (isChapterRead(ch.url) ? " is-read" : "");
        chRow.href = ch.url;
        chRow.addEventListener("click", () => {
          markChapterRead(ch.url);
          chRow.classList.add("is-read");
        });

        const left = document.createElement("span");
        left.className = "lc-chapter-left";

        const name = document.createElement("span");
        name.className = "lc-chapter-name";
        const label = (ch.type || "chapter").toLowerCase();

        if (label === "volume" || label === "vol") {
          name.textContent = `Volume ${ch.number}`;
        } else {
          name.textContent = `Chapter ${ch.number}`;
        }
        left.appendChild(name);

        if (isNew) {
          const badge = document.createElement("span");
          badge.className = "lc-new-badge";
          badge.textContent = "NEW";
          left.appendChild(badge);
        }

        const time = document.createElement("span");
        time.className = "lc-chapter-time";
        if (hasTimestamp) {
          time.setAttribute("data-timestamp", ch.timestamp);
          time.textContent = timeAgo(ch.timestamp); // initial render
        }

        chRow.appendChild(left);
        chRow.appendChild(time);
        body.appendChild(chRow);
      });

      row.appendChild(cover);
      row.appendChild(body);
      container.appendChild(row);
    });

    // keep all the "time ago" labels live-updating
    if (typeof autoRefreshTimeAgo === "function") {
      autoRefreshTimeAgo(60000);
    }
  }

  /* ---- pagination controls: < 1 2 3 4 5 > ---- */
  function renderPagination() {
    if (!pagination) return;
    const totalPages = getTotalPages();
    pagination.innerHTML = "";

    if (totalPages <= 1) return;

    pagination.appendChild(
      makePageBtn("‹", currentPage - 1, currentPage === 1, "lc-page-arrow")
    );

    getPageNumbersToShow(currentPage, totalPages).forEach((p) => {
      if (p === "…") {
        const span = document.createElement("span");
        span.className = "lc-page-ellipsis";
        span.textContent = "…";
        pagination.appendChild(span);
      } else {
        pagination.appendChild(
          makePageBtn(
            String(p),
            p,
            false,
            p === currentPage ? "lc-page-num active" : "lc-page-num"
          )
        );
      }
    });

    pagination.appendChild(
      makePageBtn("›", currentPage + 1, currentPage === totalPages, "lc-page-arrow")
    );
  }

  function makePageBtn(label, targetPage, disabled, className) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    btn.disabled = !!disabled;
    btn.addEventListener("click", () => renderPage(targetPage));
    return btn;
  }

  // shows up to 5 numbered pills with ellipsis for overflow, e.g. 1 2 3 4 5 … 12
  function getPageNumbersToShow(current, total) {
    const maxVisible = 5;
    let start = Math.max(1, current - 2);
    let end = start + maxVisible - 1;
    if (end > total) {
      end = total;
      start = Math.max(1, end - maxVisible + 1);
    }
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }
})();
