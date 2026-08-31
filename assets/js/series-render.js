/**
 * series-render.js
 * -----------------
 * Controls the "Browse Series" grid from /data/series.json (slug,
 * title, cover, badge — content that rarely changes).
 *
 * Rating, chapter/volume count, type, status, and genres are NOT
 * stored in series.json at all — they're LIVE only. Right after the
 * cached list loads, this file fetches each series' own
 * meta/<slug>_meta.json (rating, type, status, genres) and
 * meta/<slug>.json (chapter count) directly and fills in those
 * fields before re-rendering. Cards show a placeholder ("–" / just
 * "Chapters" / blank type-status pills) for the split second before
 * that finishes. Editing /meta is enough — nothing to keep in sync
 * in series.json.
 */

(function () {
  var DATA_URL = "../data/series.json";
  var META_DIR = "../meta/";
  var MOBILE_PAGE_SIZE = 20;
  var DESKTOP_PAGE_SIZE = 21;
  // Matches the min-width:769px breakpoint in desktop-layout.css —
  // the point where the site switches into its desktop nav/header,
  // which is what actually reads as "desktop" to a person using it
  // (the grid itself may still show 2/3/4 columns depending on width,
  // but 21 divides evenly into rows of 3, so it lines up cleanly here).
  var DESKTOP_MEDIA_QUERY = "(min-width: 769px)";
  var PAGE_WINDOW = 5; // how many page-number buttons show at once, centered on the current page
  var BACKGROUND_REFRESH_CONCURRENCY = 4; // throttle for the off-screen catch-up pass

  function getPageSize() {
    return window.matchMedia && window.matchMedia(DESKTOP_MEDIA_QUERY).matches
      ? DESKTOP_PAGE_SIZE
      : MOBILE_PAGE_SIZE;
  }

  var currentPageSize = getPageSize();

  // Tracks which slugs have already had their live meta/chapters
  // fetched, so switching pages (or filters) never re-fetches a card
  // that's already up to date.
  var refreshedSlugs = {};
  var backgroundRefreshStarted = false;

  // ?page=N and ?search=... URL sync, same pattern as latest-chapters.js
  // on the home page: shareable/back-forward-friendly, no extra network
  // request. ?search= is what lets the header search's "See all
  // results" link (e.g. /series/?search=Loo) land here with the query
  // already applied instead of showing the unfiltered catalog.
  function getPageFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var p = parseInt(params.get("page"), 10);
    return p && p > 0 ? p : 1;
  }

  function getSearchFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  }

  function setPageInUrl(page, replace) {
    var url = new URL(window.location.href);
    if (page <= 1) {
      url.searchParams.delete("page");
    } else {
      url.searchParams.set("page", page);
    }
    var q = searchQuery.trim();
    if (q) {
      url.searchParams.set("search", q);
    } else {
      url.searchParams.delete("search");
    }
    if (replace) {
      history.replaceState({ page: page }, "", url);
    } else {
      history.pushState({ page: page }, "", url);
    }
  }

  // Fetches meta/<slug>_meta.json (rating/type/status/genres) and
  // patches the item in place. Split out from the chapter-count fetch
  // below so the two can be scheduled as separate waves — see
  // refreshPageItems for why. `priority` is passed straight to
  // fetch()'s Priority Hints option ("high"/"low"/"auto"); browsers
  // that don't support it just ignore the extra field.
  function fetchMeta(item, priority) {
    return fetch(META_DIR + item.slug + "_meta.json", { priority: priority || "auto" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; })
      .then(function (meta) {
        if (meta) {
          if (typeof meta.rating === "number") item.rating = meta.rating;
          if (meta.type) item.type = meta.type;
          if (meta.status) item.status = meta.status;
          if (Array.isArray(meta.genres)) item.genres = meta.genres;
          if (Array.isArray(meta.altTitles)) item.altTitles = meta.altTitles;
        }
      });
  }

  // Fetches meta/<slug>.json (the chapter/volume list) and patches
  // just the count in place.
  function fetchChapters(item, priority) {
    return fetch(META_DIR + item.slug + ".json", { priority: priority || "auto" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; })
      .then(function (chapters) {
        if (Array.isArray(chapters)) {
          if (item.badge === "volume") {
            item.volumes = chapters.length;
          } else {
            item.chapters = chapters.length;
          }
        }
      });
  }

  // Fetches both and patches the item in place. Silently leaves the
  // cached value untouched if either fetch fails (offline, 404, etc.)
  // so the card still renders something sensible. Used for the
  // low-priority background catch-up pass, where the two-phase split
  // below isn't worth the extra bookkeeping.
  function liveRefresh(item, priority) {
    return Promise.all([fetchMeta(item, priority), fetchChapters(item, priority)]);
  }

  // True whenever a page the user is actually looking at (initial
  // load, a page-number click, a filter change) has fetches in
  // flight. The background catch-up pass checks this and pauses
  // starting new requests while it's true, so the visible page
  // always gets full bandwidth instead of competing with off-screen
  // catch-up fetches.
  var foregroundRefreshActive = false;

  function waitUntilForegroundIdle() {
    if (!foregroundRefreshActive) return Promise.resolve();
    return new Promise(function (resolve) {
      (function check() {
        if (!foregroundRefreshActive) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      })();
    });
  }

  // Patches just this one card's DOM node in place once its own
  // fetch resolves — instead of waiting for the whole page's batch
  // to finish and re-rendering the grid all at once (which is what
  // caused every card to sit blank and then flash in together).
  // Cards fill in individually, as soon as their own data is ready.
  function updateCardInPlace(item) {
    if (!grid) return;
    var existing = grid.querySelector('.series-card[data-slug="' + item.slug + '"]');
    if (!existing) return; // not on the current page anymore — nothing to patch
    var temp = document.createElement("div");
    temp.innerHTML = cardTemplate(item);
    existing.replaceWith(temp.firstChild);
    markBookmarkedButtons();
  }

  // Wraps liveRefresh with the "already fetched" cache so the same
  // card is never requested twice, and never throws (liveRefresh
  // already swallows its own fetch errors, this is just a backstop).
  // Used only for the background catch-up pass — see
  // refreshPageItems for the faster two-phase path used on-screen.
  function refreshItem(item, priority) {
    if (refreshedSlugs[item.slug]) return Promise.resolve();
    return liveRefresh(item, priority)
      .then(function () {
        refreshedSlugs[item.slug] = true;
        updateCardInPlace(item);
      })
      .catch(function () {
        refreshedSlugs[item.slug] = true;
      });
  }

  // Live-refreshes only the items actually on screen, in two waves:
  // first every card's meta.json (rating/type/status — one request
  // per card instead of two), patching each card the instant its own
  // meta arrives, THEN every card's chapter count as a second wave.
  // Splitting it this way means the first, more-important wave has
  // half as many requests competing for the browser's ~6-per-host
  // connection limit, so the info you actually see shows up roughly
  // twice as fast instead of being stuck behind chapter-list fetches.
  function refreshPageItems(items, priority) {
    var todo = items.filter(function (it) { return !refreshedSlugs[it.slug]; });
    if (!todo.length) return Promise.resolve();

    var metaWave = Promise.all(todo.map(function (it) {
      return fetchMeta(it, priority).then(function () { updateCardInPlace(it); });
    }));

    return metaWave.then(function () {
      return Promise.all(todo.map(function (it) {
        return fetchChapters(it, priority).then(function () {
          refreshedSlugs[it.slug] = true;
          updateCardInPlace(it);
        });
      }));
    });
  }

  // Same as refreshPageItems, but marks the foreground-priority flag
  // for the duration so the background catch-up pass steps aside,
  // and asks the browser to prioritize these fetches over any
  // in-flight background ones. Use this for anything the user is
  // actively looking at right now (initial load, page clicks, filter
  // changes).
  function refreshPageItemsPriority(items) {
    foregroundRefreshActive = true;
    return refreshPageItems(items, "high").then(
      function () { foregroundRefreshActive = false; },
      function (err) { foregroundRefreshActive = false; throw err; }
    );
  }

  // Simple concurrency-limited queue runner for the background pass.
  // Each slot waits for the foreground to go idle before starting
  // its next fetch, so it never competes with the page the user is
  // actively on.
  function runWithConcurrency(items, limit, workFn) {
    return new Promise(function (resolve) {
      if (!items.length) {
        resolve();
        return;
      }
      var idx = 0;
      var completed = 0;
      function startNext() {
        if (idx >= items.length) return;
        var item = items[idx++];
        waitUntilForegroundIdle()
          .then(function () { return workFn(item); })
          .then(function () {
            completed++;
            if (completed === items.length) {
              resolve();
            } else {
              startNext();
            }
          });
      }
      var starters = Math.min(limit, items.length);
      for (var i = 0; i < starters; i++) startNext();
    });
  }

  // This scales fine no matter how many series get added — it never
  // touches the whole catalog for a page view. It only ever fetches
  // the ~20 cards on the page you're on (via refreshPageItemsPriority
  // above); this pass is purely a low-priority background catch-up
  // for genre chips / whole-list search, and steps aside whenever a
  // page is actively loading.
  function startBackgroundRefresh() {
    if (backgroundRefreshStarted) return;
    backgroundRefreshStarted = true;
    var schedule = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
    schedule(function () {
      var remaining = allSeries.filter(function (it) { return !refreshedSlugs[it.slug]; });
      runWithConcurrency(remaining, BACKGROUND_REFRESH_CONCURRENCY, function (item) {
        return refreshItem(item, "low");
      }).then(function () {
        buildGenreChips();
        reRenderKeepingPage();
      });
    });
  }

  var grid = document.getElementById("seriesGrid");
  var countBadge = document.getElementById("seriesCount");
  var searchInput = document.getElementById("seriesSearchInput");
  var searchClearBtn = document.getElementById("seriesSearchClearBtn");
  var emptyState = document.getElementById("seriesEmptyState");
  var pagination = document.getElementById("seriesPagination");
  var filtersBtn = document.getElementById("filtersBtn");
  var filtersPanel = document.getElementById("filtersPanel");
  var statusFilterRow = document.getElementById("statusFilterRow");
  var typeFilterRow = document.getElementById("typeFilterRow");
  var genreFilterRow = document.getElementById("genreFilterRow");

  var allSeries = [];
  var totalCount = 0;
  var activeList = [];
  var currentPage = 1;
  var searchQuery = "";
  var statusFilter = "all";
  var typeFilter = "all";
  var genreFilter = "all";
  var genreChipsBuilt = false;

  function statusClass(status) {
    var key = (status || "").toLowerCase();
    if (key === "ongoing") return "status-ongoing";
    if (key === "hiatus") return "status-hiatus";
    if (key === "axed") return "status-axed";
    if (key === "onbreak") return "status-onbreak";
    if (key === "completed") return "status-completed";
    return "status-default";
  }

  function typeClass(type) {
    var key = (type || "").toLowerCase();
    if (key === "manga") return "type-manga";
    if (key === "manhwa") return "type-manhwa";
    if (key === "manhua") return "type-manhua";
    if (key === "novel") return "type-novel";
    return "type-default";
  }

  function chapterLabel(item) {
    var count = item.badge === "volume" ? item.volumes : item.chapters;
    var noun = item.badge === "volume" ? "Volumes" : "Chapters";
    return typeof count === "number" ? count + " " + noun : noun;
  }

  function cardTemplate(item) {
    var badgeIcon =
      item.badge === "novel"
        ? '<span class="trend-badge-icon" title="Novel"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z"/><path d="M18 7v13"/></svg></span>'
        : "";

    var ratingText =
      typeof item.rating === "number" ? item.rating.toFixed(1) : "–";

    return (
      '<a class="series-card" href="/series/' +
      item.slug +
      '/" data-slug="' +
      item.slug +
      '" data-title="' +
      item.title.toLowerCase() +
      '">' +
      '<div class="series-cover">' +
      badgeIcon +
      '<span class="series-rating"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>' +
      ratingText +
      "</span>" +
      '<img src="' +
      item.cover +
      '" alt="' +
      item.title +
      '" loading="lazy">' +
      "</div>" +
      '<div class="series-info">' +
      '<span class="series-title">' +
      item.title +
      "</span>" +
      '<div class="series-meta">' +
      '<span class="series-chapters">' +
      chapterLabel(item) +
      "</span>" +
      '<div class="series-tags-row">' +
      '<span class="series-status ' +
      statusClass(item.status) +
      '">' +
      (item.status || "\u2013") +
      "</span>" +
      '<span class="series-type-badge ' +
      typeClass(item.type) +
      '">' +
      (item.type || "Manhwa") +
      "</span>" +
      "</div>" +
      "</div>" +
      '<button class="series-bookmark-btn" type="button" data-slug="' +
      item.slug +
      '"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4V3z"/></svg>Bookmark</button>' +
      "</div>" +
      "</a>"
    );
  }

  function skeletonCardTemplate() {
    return (
      '<div class="series-card series-skeleton">' +
      '<div class="series-cover skeleton-shimmer"></div>' +
      '<div class="series-info">' +
      '<span class="skeleton-line skeleton-shimmer"></span>' +
      '<div class="skeleton-meta-row">' +
      '<span class="skeleton-pill skeleton-shimmer"></span>' +
      '<span class="skeleton-pill skeleton-shimmer"></span>' +
      "</div>" +
      '<div class="skeleton-btn skeleton-shimmer"></div>' +
      "</div>" +
      "</div>"
    );
  }

  function renderSkeleton(count) {
    if (!grid) return;
    if (emptyState) emptyState.hidden = true;
    if (pagination) pagination.innerHTML = "";
    var html = "";
    for (var i = 0; i < count; i++) html += skeletonCardTemplate();
    grid.classList.add("is-loading");
    grid.innerHTML = html;
  }

  function paginate(list, page) {
    var start = (page - 1) * currentPageSize;
    return list.slice(start, start + currentPageSize);
  }

  function renderPagination(list, page) {
    if (!pagination) return;
    var totalPages = Math.ceil(list.length / currentPageSize);
    if (totalPages <= 1) {
      pagination.innerHTML = "";
      return;
    }

    // Fixed window of PAGE_WINDOW number buttons centered on the
    // current page (e.g. < 5 6 [7] 8 9 >), clamped at the ends —
    // no ellipsis, no first/last shortcuts.
    var half = Math.floor(PAGE_WINDOW / 2);
    var start = Math.max(1, page - half);
    var end = start + PAGE_WINDOW - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - PAGE_WINDOW + 1);
    }

    var html = "";
    html +=
      '<button type="button" class="series-page-nav" data-page="' +
      (page - 1) +
      '"' +
      (page === 1 ? " disabled" : "") +
      ' aria-label="Previous page">&lsaquo;</button>';

    for (var p = start; p <= end; p++) {
      html +=
        '<button type="button" class="series-page-num' +
        (p === page ? " active" : "") +
        '" data-page="' +
        p +
        '">' +
        p +
        "</button>";
    }

    html +=
      '<button type="button" class="series-page-nav" data-page="' +
      (page + 1) +
      '"' +
      (page === totalPages ? " disabled" : "") +
      ' aria-label="Next page">&rsaquo;</button>';

    pagination.innerHTML = html;
  }

  function render(list) {
    if (!grid) return;
    activeList = list;
    grid.classList.remove("is-loading");

    if (!list.length) {
      grid.innerHTML = "";
      if (emptyState) emptyState.hidden = false;
      if (pagination) pagination.innerHTML = "";
      return;
    }
    if (emptyState) emptyState.hidden = true;

    var totalPages = Math.max(1, Math.ceil(list.length / currentPageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    grid.innerHTML = paginate(list, currentPage).map(cardTemplate).join("");
    renderPagination(list, currentPage);
    markBookmarkedButtons();
  }

  // Renders whatever page is requested and, crucially, only kicks
  // off live-data fetches for that page's cards — not the whole
  // catalog — so clicking a page number loads just that page's
  // series details instead of everything at once. Each card fills
  // in on its own as soon as its own fetch resolves (see
  // updateCardInPlace) instead of the whole page flashing in together.
  function applyPage(page, updateUrl) {
    var totalPages = Math.max(1, Math.ceil(activeList.length / currentPageSize));
    currentPage = Math.min(Math.max(1, page), totalPages);
    if (updateUrl) setPageInUrl(currentPage);
    render(activeList);
    refreshPageItemsPriority(paginate(activeList, currentPage));
  }

  function goToPage(page) {
    if (page === currentPage) return;
    applyPage(page, true);
    if (grid) {
      var top = grid.getBoundingClientRect().top + window.pageYOffset - 90;
      window.scrollTo({ top: top, behavior: "smooth" });
    }
  }

  // Browser back/forward support, mirroring latest-chapters.js.
  window.addEventListener("popstate", function () {
    searchQuery = getSearchFromUrl();
    if (searchInput) searchInput.value = searchQuery;
    if (searchClearBtn) searchClearBtn.hidden = searchQuery.trim().length === 0;
    activeList = filteredSeries();
    updateCountBadge();
    applyPage(getPageFromUrl(), false);
  });

  // Same alt-title matching as the header search (see search.js's
  // seriesMatchesQuery) — matches the main title OR any alternate/
  // romanized/native name pulled from meta.altTitles, so searching a
  // different name for a series still finds it. altTitles are only
  // known once that series' meta has live-loaded (current page +
  // whatever the background catch-up has reached so far); a series
  // not yet loaded is still matchable by its main title in the
  // meantime.
  function seriesMatchesQuery(item, q) {
    if (item.title.toLowerCase().indexOf(q) !== -1) return true;
    if (Array.isArray(item.altTitles)) {
      return item.altTitles.some(function (alt) {
        return String(alt).toLowerCase().indexOf(q) !== -1;
      });
    }
    return false;
  }

  function filteredSeries() {
    var q = searchQuery.trim().toLowerCase();
    return allSeries.filter(function (item) {
      if (q && !seriesMatchesQuery(item, q)) return false;
      if (statusFilter !== "all" && (item.status || "").toLowerCase() !== statusFilter) return false;
      if (typeFilter !== "all" && (item.type || "manhwa").toLowerCase() !== typeFilter) return false;
      if (genreFilter !== "all") {
        var genres = Array.isArray(item.genres) ? item.genres : [];
        var hasGenre = genres.some(function (g) {
          return String(g).toLowerCase() === genreFilter;
        });
        if (!hasGenre) return false;
      }
      return true;
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Builds the genre chip row from whatever genres are present across
  // allSeries right now (sourced live from each series' meta.json —
  // see liveRefresh). Called once, after the first live-refresh pass,
  // since genres aren't known until then. Re-selecting "All" if the
  // currently active genre no longer exists in the list is not
  // handled here since the set only grows as more series are added.
  function buildGenreChips() {
    if (!genreFilterRow || genreChipsBuilt) return;
    var seen = {};
    var genres = [];
    allSeries.forEach(function (item) {
      (Array.isArray(item.genres) ? item.genres : []).forEach(function (g) {
        var key = String(g).toLowerCase();
        if (!seen[key]) {
          seen[key] = true;
          genres.push(g);
        }
      });
    });
    genres.sort(function (a, b) { return a.localeCompare(b); });

    var html = '<button type="button" class="filter-chip active" data-genre="all">All</button>';
    html += genres
      .map(function (g) {
        return (
          '<button type="button" class="filter-chip" data-genre="' +
          escapeHtml(String(g).toLowerCase()) +
          '">' +
          escapeHtml(g) +
          "</button>"
        );
      })
      .join("");

    genreFilterRow.innerHTML = html;
    genreChipsBuilt = true;
  }

  // Shows how many series match the active search/filters, or the
  // full catalog total when nothing is filtered.
  function updateCountBadge() {
    if (!countBadge) return;
    var anyFilterActive =
      searchQuery.trim() !== "" ||
      statusFilter !== "all" ||
      typeFilter !== "all" ||
      genreFilter !== "all";
    countBadge.textContent = anyFilterActive ? filteredSeries().length : totalCount;
  }

  function applyFilters() {
    currentPage = 1;
    setPageInUrl(1, /*replace=*/ true);
    render(filteredSeries());
    updateCountBadge();
    refreshPageItemsPriority(paginate(activeList, currentPage)).then(reRenderKeepingPage);
  }

  // Same filtering, but keeps whatever page the user is currently on
  // (used after the live rating/chapter/type/status/genre refresh
  // finishes in the background, so it doesn't yank someone back to
  // page 1).
  function reRenderKeepingPage() {
    render(filteredSeries());
    updateCountBadge();
  }

  // Alt-title matches (e.g. searching a series' Korean/romanized name)
  // depend on meta.altTitles, which isn't known until each series'
  // meta/<slug>_meta.json has loaded. If we arrive with ?search=...
  // already in the URL, the very first filteredSeries() call runs
  // before any meta has loaded, so an alt-title-only match briefly
  // (or, worse, until the slow low-priority background sweep of the
  // *entire* catalog finally reaches it) shows "No series match your
  // search." Fetching meta for the whole catalog at high priority up
  // front — only when a search is actually active on load — fixes
  // that without touching the normal per-page fetch behavior.
  function fetchAllMetaHighPriority() {
    var todo = allSeries.filter(function (it) { return !refreshedSlugs[it.slug]; });
    if (!todo.length) return Promise.resolve();
    return Promise.all(todo.map(function (it) { return fetchMeta(it, "high"); }));
  }

  function loadSeries() {
    renderSkeleton(currentPageSize);
    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load series.json");
        return res.json();
      })
      .then(function (data) {
        allSeries = data.series || [];
        totalCount = data.total != null ? data.total : allSeries.length;
        currentPage = getPageFromUrl();

        // Pick up ?search=... from the URL (e.g. arriving from the
        // header search's "See all results" link) and apply it as the
        // starting filter, with the box pre-filled to match.
        searchQuery = getSearchFromUrl();
        if (searchInput) searchInput.value = searchQuery;
        if (searchClearBtn) searchClearBtn.hidden = searchQuery.length === 0;
        updateCountBadge();

        // If we arrived with a search term already in the URL (e.g.
        // the header search's "See all results" link), don't filter
        // yet — alt-title matches (romanized/native names) depend on
        // meta.altTitles, which hasn't loaded for anything at this
        // point, so filteredSeries() would wrongly come back empty
        // and flash "No series match your search." for as long as it
        // takes the slow background sweep to reach the real match.
        // Show a loading skeleton instead and hold off rendering the
        // real (filtered) result until the meta fetch below resolves.
        var hasInitialSearch = !!searchQuery.trim();
        if (hasInitialSearch) {
          renderSkeleton(currentPageSize);
        } else {
          render(filteredSeries());
        }

        // Cached list is on screen now (fast first paint). Only fetch
        // live rating/type/status/genres/chapter data for the cards
        // actually visible on this page — not the entire catalog —
        // and patch each card in as its own fetch resolves, so cards
        // fill in one by one instead of every card sitting blank for
        // several seconds and then flashing in all together.
        //
        // Exception: with an initial search term, "the visible page"
        // can't be known until alt titles are loaded, so do a
        // high-priority meta-only pass over the whole catalog first
        // (skeleton stays up while this runs) and only then render
        // the real filtered result, before falling through to the
        // normal flow.
        var initialLoad = hasInitialSearch
          ? fetchAllMetaHighPriority().then(function () {
              render(filteredSeries());
              updateCountBadge();
            })
          : Promise.resolve();

        initialLoad
          .then(function () {
            return refreshPageItemsPriority(paginate(activeList, currentPage));
          })
          .then(function () {
            // Once the visible page is live, quietly catch the rest
            // of the catalog up in the background (throttled, and
            // paused whenever another page is actively loading) so
            // genre chips and search/filtering still cover everything.
            // This never touches the whole catalog for a page view,
            // so it stays fast no matter how many series get added.
            startBackgroundRefresh();
          })
          .catch(function (err) {
            console.error("[series-render] live refresh failed", err);
          });
      })
      .catch(function (err) {
        console.error("[series-render]", err);
        grid.classList.remove("is-loading");
        if (grid) grid.innerHTML = '<p class="series-load-error">Couldn\'t load the series list. Please refresh.</p>';
        if (pagination) pagination.innerHTML = "";
      });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      searchQuery = e.target.value;
      if (searchClearBtn) searchClearBtn.hidden = searchQuery.trim().length === 0;
      applyFilters();
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", function () {
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      searchClearBtn.hidden = true;
      applyFilters();
      if (searchInput) searchInput.focus();
    });
  }

  if (filtersBtn && filtersPanel) {
    filtersBtn.addEventListener("click", function () {
      var willOpen = !filtersPanel.classList.contains("open");
      filtersPanel.classList.toggle("open", willOpen);
      filtersBtn.classList.toggle("active", willOpen);
    });
  }

  function wireChipRow(row, onSelect) {
    if (!row) return;
    row.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-chip");
      if (!btn) return;
      var siblings = row.querySelectorAll(".filter-chip");
      for (var i = 0; i < siblings.length; i++) siblings[i].classList.remove("active");
      btn.classList.add("active");
      onSelect(btn);
    });
  }

  wireChipRow(statusFilterRow, function (btn) {
    statusFilter = btn.getAttribute("data-status");
    applyFilters();
  });

  wireChipRow(typeFilterRow, function (btn) {
    typeFilter = btn.getAttribute("data-type");
    applyFilters();
  });

  wireChipRow(genreFilterRow, function (btn) {
    genreFilter = btn.getAttribute("data-genre");
    applyFilters();
  });

  function markBookmarkedButtons() {
    if (!grid || typeof AIPBookmarks === "undefined") return;
    var btns = grid.querySelectorAll(".series-bookmark-btn");
    for (var i = 0; i < btns.length; i++) {
      var slug = btns[i].getAttribute("data-slug");
      btns[i].classList.toggle("bookmarked", AIPBookmarks.isBookmarked(slug));
    }
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var btn = e.target.closest(".series-bookmark-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof AIPBookmarks === "undefined") return;
      var slug = btn.getAttribute("data-slug");
      var nowBookmarked = AIPBookmarks.toggle(slug);
      btn.classList.toggle("bookmarked", nowBookmarked);
    });
  }

  if (pagination) {
    pagination.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-page]");
      if (!btn || btn.disabled) return;
      var page = parseInt(btn.getAttribute("data-page"), 10);
      if (!page) return;
      goToPage(page);
    });
  }

  // If the window is resized across the desktop breakpoint (browser
  // resize, tablet rotation, etc.), switch page size and re-paginate
  // from the current scroll position's page.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var newSize = getPageSize();
      if (newSize === currentPageSize) return;
      currentPageSize = newSize;
      applyPage(currentPage, false);
    }, 250);
  });

  document.addEventListener("DOMContentLoaded", loadSeries);

  var backToTopBtn = document.getElementById("backToTopBtn");
  if (backToTopBtn) {
    var toggleBackToTop = function () {
      backToTopBtn.classList.toggle("visible", window.scrollY > 400);
    };
    window.addEventListener("scroll", toggleBackToTop, { passive: true });
    toggleBackToTop();
    backToTopBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
})();
