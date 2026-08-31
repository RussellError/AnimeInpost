/* ============================================================
   SEARCH ENGINE — JSON-driven series search
   ------------------------------------------------------------
   Reads an index file (data/search-index.json) shaped as:

   {
     "series": [ { "title": "...", "type": "Manhwa", "img": "...", "url": "..." }, ... ]
   }

   (a plain array of series objects also works)

   You only ever add/edit title, type, img, url here — nothing else.
   In the background, this file also fetches each series'
   /meta/<slug>_meta.json (slug taken from its "url") and pulls in
   "altTitles" so alternate/romanized/native names are searchable
   too. Results still always display the series' main title/img/url —
   the alt name is only used for matching, never shown.

   Renders a search box with a clear (X) button, a result list of
   matching series, and a "See all results" link at the bottom.

   Usage:
     <div class="search-box">
       <svg>...</svg>
       <input id="mySearchInput" placeholder="Search">
       <button class="search-clear-btn" type="button" hidden>&times;</button>
     </div>
     <div id="mySearchResults" class="search-results-panel"></div>

     <script src="assets/js/search.js"></script>
     <script>
       initSearch({
         inputSelector: "#mySearchInput",
         resultsSelector: "#mySearchResults",
         dataUrl: "data/search-index.json",
         seeAllUrl: "/series/"       // optional, defaults to "/series/"
       });
     </script>
   ============================================================ */

function initSearch(options) {
  const opts = Object.assign(
    {
      inputSelector: "#searchInput",
      resultsSelector: "#searchResults",
      dataUrl: "/data/search-index.json",
      seeAllUrl: "/series/",
      minChars: 3,
      maxSeriesShown: 6,
      maxUsersShown: 6,
      loadingDelay: 450, // ms — simulated delay so results feel like a real lookup
      emptyStateHtml: null, // shown while query.length < minChars, if provided
    },
    options || {}
  );

  const input = document.querySelector(opts.inputSelector);
  const resultsBox = document.querySelector(opts.resultsSelector);
  if (!input || !resultsBox) {
    console.warn("initSearch: input or results container not found.");
    return;
  }

  // Clear (X) button sits next to the input, either provided in markup
  // (a sibling with .search-clear-btn) or created here on the fly.
  let clearBtn = input.parentElement
    ? input.parentElement.querySelector(".search-clear-btn")
    : null;
  if (!clearBtn) {
    clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "search-clear-btn";
    clearBtn.setAttribute("aria-label", "Clear search");
    clearBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';
    input.insertAdjacentElement("afterend", clearBtn);
  }
  clearBtn.hidden = true;

  let seriesData = [];
  let usersData = [];

  // Derives a series' slug from its "url" (e.g. "/series/one-piece/" -> "one-piece"),
  // used to find its matching /meta/<slug>_meta.json file.
  function slugFromUrl(url) {
    return String(url || "")
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .pop();
  }

  fetch(opts.dataUrl)
    .then((res) => res.json())
    .then((json) => {
      seriesData = Array.isArray(json) ? json : json.series || [];

      // For each series, fetch its meta file in the background and
      // attach altTitles for matching. Runs once in parallel on load;
      // a missing/broken meta file for a series just leaves it
      // matchable by its main title only.
      seriesData.forEach((s) => {
        const slug = slugFromUrl(s.url);
        if (!slug) return;
        fetch(`/meta/${slug}_meta.json`)
          .then((res) => (res.ok ? res.json() : null))
          .then((meta) => {
            if (meta && Array.isArray(meta.altTitles)) {
              s.altTitles = meta.altTitles;
            }
          })
          .catch(() => {
            /* no meta file for this series — main title still matches */
          });
      });
    })
    .catch((err) => console.error("Failed to load search data:", err));

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showLoading() {
    const skeletons = Array(3)
      .fill(0)
      .map(
        () => `
        <div class="search-result-item search-skeleton">
          <div class="skeleton-thumb"></div>
          <span class="search-result-text">
            <span class="skeleton-line skeleton-title"></span>
            <span class="skeleton-line skeleton-sub"></span>
          </span>
        </div>`
      )
      .join("");

    resultsBox.innerHTML = `<div class="search-result-list">${skeletons}</div>`;
    resultsBox.classList.add("active");
  }

  function seriesMatchesQuery(s, query) {
    if (s.title.toLowerCase().includes(query)) return true;
    if (Array.isArray(s.altTitles)) {
      return s.altTitles.some((alt) =>
        String(alt).toLowerCase().includes(query)
      );
    }
    return false;
  }

  function render(query) {
    // Matches on the main title AND any altTitles fetched live from
    // each series' /meta/<slug>_meta.json, but the result card always
    // shows the main title/img/url — never the alt name that matched.
    const seriesMatches = seriesData.filter((s) =>
      seriesMatchesQuery(s, query)
    );

    if (seriesMatches.length === 0) {
      resultsBox.innerHTML = `<div class="search-empty">No results found</div>`;
      resultsBox.classList.add("active");
      return;
    }

    const listHtml = seriesMatches
      .slice(0, opts.maxSeriesShown)
      .map(
        (s) => `
        <a class="search-result-item series-item" href="${s.url}">
          <img src="${s.img}" alt="${escapeHtml(s.title)}">
          <span class="search-result-text">
            <span class="search-result-title">${escapeHtml(s.title)}</span>
            <span class="search-result-sub">${escapeHtml(s.type || "")}</span>
          </span>
        </a>`
      )
      .join("");

    const seeAllHref =
      opts.seeAllUrl +
      (opts.seeAllUrl.indexOf("?") === -1 ? "?" : "&") +
      "search=" +
      encodeURIComponent(input.value.trim());

    resultsBox.innerHTML = `
      <div class="search-result-list">
        ${listHtml}
      </div>
      <a class="search-see-all" href="${seeAllHref}">See all results</a>
    `;
    resultsBox.classList.add("active");

    // Close the results panel the moment any result (or "See all") is
    // clicked, so it doesn't stay open behind the page it navigates to.
    resultsBox.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        resultsBox.classList.remove("active");
        resultsBox.innerHTML = "";
        clearBtn.hidden = true;
      });
    });
  }

  let searchTimer = null;

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    clearBtn.hidden = query.length === 0;
    clearTimeout(searchTimer);

    if (query.length < opts.minChars) {
      if (opts.emptyStateHtml) {
        resultsBox.innerHTML = opts.emptyStateHtml;
        resultsBox.classList.add("active");
      } else {
        resultsBox.innerHTML = "";
        resultsBox.classList.remove("active");
      }
      return;
    }

    // Show a brief loading state immediately, then swap in real results.
    // Debounced so rapid typing doesn't stack up renders.
    showLoading();
    searchTimer = setTimeout(() => render(query), opts.loadingDelay);
  });

  clearBtn.addEventListener("click", () => {
    clearTimeout(searchTimer);
    input.value = "";
    clearBtn.hidden = true;
    if (opts.emptyStateHtml) {
      resultsBox.innerHTML = opts.emptyStateHtml;
      resultsBox.classList.add("active");
    } else {
      resultsBox.innerHTML = "";
      resultsBox.classList.remove("active");
    }
    input.focus();
  });

  // close results when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !input.contains(e.target) &&
      !resultsBox.contains(e.target) &&
      !clearBtn.contains(e.target)
    ) {
      resultsBox.classList.remove("active");
    }
  });

  // Public API — lets callers (e.g. a modal that opens/closes) reset the
  // input and panel back to the initial empty-state on each open.
  return {
    reset() {
      clearTimeout(searchTimer);
      input.value = "";
      clearBtn.hidden = true;
      if (opts.emptyStateHtml) {
        resultsBox.innerHTML = opts.emptyStateHtml;
        resultsBox.classList.add("active");
      } else {
        resultsBox.innerHTML = "";
        resultsBox.classList.remove("active");
      }
    },
    focus() {
      input.focus();
    },
  };
}
