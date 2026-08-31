/* ===================================================================
   series-info.js
   AnimeInPost - Series Information Page

   Handles:
   - Series metadata
   - Cover / backdrop
   - Genres
   - Rating / bookmarks / status / type
   - Chapter list
   - Chapter search
   - Chapter sorting
   - Chapter relative time
   - Bookmark button
   - Series information modal

   Config comes from:
     data-meta
     data-chapters
     data-slug

   Example:

   <script
     id="series-info-script"
     data-slug="30-years-since-the-prologue"
     data-meta="../../meta/30-years-since-the-prologue_meta.json"
     data-chapters="../../meta/30-years-since-the-prologue.json"
     src="../../assets/js/series-info.js">
   </script>

   No separate series-time.js is required.
=================================================================== */

(function () {
  "use strict";

  /* ================================================================
     SCRIPT CONFIG
  ================================================================ */

  const scriptTag = document.getElementById("series-info-script");

  if (!scriptTag) {
    console.error("series-info: #series-info-script not found");
    return;
  }

  const META_URL = scriptTag.dataset.meta;
  const CHAPTERS_URL = scriptTag.dataset.chapters;
  const SLUG = scriptTag.dataset.slug;

  let chapters = [];
  let sortNewestFirst = true;


  /* ================================================================
     INITIALIZE
  ================================================================ */

  document.addEventListener("DOMContentLoaded", () => {
    loadMeta();
    loadChapters();
    wireBookmark();
    wireSort();
    wireSearch();
    wireModal();
  });


  /* ================================================================
     META
  ================================================================ */

  function loadMeta() {
    if (!META_URL) {
      console.error("series-info: meta URL is missing");
      return;
    }

    fetch(META_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        return res.json();
      })
      .then((meta) => {
        renderMeta(meta);
      })
      .catch((err) => {
        console.error(
          "series-info: failed to load meta",
          err
        );
      });
  }


  function formatCount(n) {
    if (n == null || isNaN(n)) {
      return "—";
    }

    if (n >= 1000000) {
      return (
        (n / 1000000)
          .toFixed(1)
          .replace(/\.0$/, "") +
        "M"
      );
    }

    if (n >= 1000) {
      return (
        (n / 1000)
          .toFixed(1)
          .replace(/\.0$/, "") +
        "K"
      );
    }

    return String(n);
  }


  function renderMeta(meta) {
    if (!meta) return;

    /* Backdrop */

    const backdrop = meta.backdrop || meta.cover || "";

    if (backdrop) {
      document.documentElement.style.setProperty(
        "--si-backdrop-url",
        `url("${backdrop}")`
      );
    }


    /* Cover */

    const cover = document.getElementById("si-cover-img");

    if (cover && meta.cover) {
      cover.src = meta.cover;
      cover.alt = `${meta.title || "Series"} cover`;
    }


    /* Basic information */

    setText(
      "si-title",
      meta.title || ""
    );

    setText(
      "si-alt-titles",
      (meta.altTitles || []).join(" • ")
    );

    setText(
      "si-modal-alt-titles",
      (meta.altTitles || []).join(" • ")
    );

    setText(
      "si-modal-author",
      meta.author || "—"
    );


    /* Genres */

    const chipHTML = (meta.genres || [])
      .map(
        (genre) =>
          `<span class="si-genre-chip">${escapeHTML(genre)}</span>`
      )
      .join("");

    const genreWrap =
      document.getElementById("si-genres");

    if (genreWrap) {
      genreWrap.innerHTML = chipHTML;
    }

    const modalGenreWrap =
      document.getElementById("si-modal-genres");

    if (modalGenreWrap) {
      modalGenreWrap.innerHTML = chipHTML;
    }


    /* Description */

    setText(
      "si-modal-desc",
      meta.description || ""
    );


    /* Rating */

    setText(
      "si-rating",
      meta.rating != null
        ? Number(meta.rating).toFixed(1)
        : "—"
    );

    setText(
      "si-modal-rating",
      meta.rating != null
        ? Number(meta.rating).toFixed(1)
        : "—"
    );


    /* Bookmarks */

    setText(
      "si-bookmarks",
      meta.bookmarks != null
        ? formatCount(meta.bookmarks)
        : "—"
    );

    setText(
      "si-modal-bookmarks",
      meta.bookmarks != null
        ? formatCount(meta.bookmarks)
        : "—"
    );


    /* Status */

    setText(
      "si-status",
      meta.status || "—"
    );


    /* Type */

    setText(
      "si-type",
      (meta.type || "—").toUpperCase()
    );


    /* Page title */

    if (meta.title) {
      document.title =
        `${meta.title} | AnimeInPost`;
    }
  }


  function setText(id, value) {
    const el = document.getElementById(id);

    if (el != null && value != null) {
      el.textContent = value;
    }
  }


  /* ================================================================
     CHAPTERS
  ================================================================ */

  function loadChapters() {
    if (!CHAPTERS_URL) {
      console.error("series-info: chapters URL is missing");
      return;
    }

    fetch(CHAPTERS_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        return res.json();
      })
      .then((data) => {
        chapters = Array.isArray(data)
          ? data
          : [];

        setText(
          "si-chapter-count",
          `${chapters.length} Chapters`
        );

        setText(
          "si-stat-chapters",
          chapters.length
        );

        setText(
          "si-modal-chapters",
          chapters.length
        );

        renderChapters(
          orderedChapters()
        );
      })
      .catch((err) => {
        console.error(
          "series-info: failed to load chapters",
          err
        );
      });
  }


  /* ================================================================
     CHAPTER TITLE
  ================================================================ */

  function displayTitle(ch) {
    const n =
      ch.index != null
        ? ch.index
        : "";

    if (ch.title) {
      return ch.title.replace(
        /^chapter:?\s*/i,
        "Chapter "
      );
    }

    return `Chapter ${n}`;
  }


  /* ================================================================
     CHAPTER TIME SYSTEM
     ---------------------------------------------------------------
     This is completely self-contained.

     Examples:

       30 seconds ago
       5 minutes ago
       8 hours ago
       yesterday
       6 days ago
       last week
       2 weeks ago
       3 weeks ago
       Jul 13, 2026

     Older than 30 days:
       Absolute date

     Automatically refreshed every 60 seconds.
  ================================================================ */

  const MINUTE =
    60 * 1000;

  const HOUR =
    60 * MINUTE;

  const DAY =
    24 * HOUR;

  const WEEK =
    7 * DAY;

  const MONTH =
    30 * DAY;


  function chapterDateLabel(timestamp) {
    if (!timestamp) {
      return "";
    }

    const date =
      new Date(timestamp);

    if (isNaN(date.getTime())) {
      return "";
    }

    let difference =
      Date.now() - date.getTime();


    /*
     * Future timestamp protection.
     */

    if (difference < 0) {
      difference = 0;
    }


    /*
     * Less than 1 minute
     */

    if (difference < MINUTE) {
      return "just now";
    }


    /*
     * Minutes
     */

    if (difference < HOUR) {
      const minutes =
        Math.floor(
          difference / MINUTE
        );

      return (
        `${minutes} minute` +
        (minutes !== 1 ? "s" : "") +
        " ago"
      );
    }


    /*
     * Hours
     */

    if (difference < DAY) {
      const hours =
        Math.floor(
          difference / HOUR
        );

      return (
        `${hours} hour` +
        (hours !== 1 ? "s" : "") +
        " ago"
      );
    }


    /*
     * Days
     */

    if (difference < WEEK) {
      const days =
        Math.floor(
          difference / DAY
        );

      if (days === 1) {
        return "yesterday";
      }

      return `${days} days ago`;
    }


    /*
     * 1 week
     */

    if (difference < WEEK * 2) {
      return "last week";
    }


    /*
     * 2–4 weeks
     */

    if (difference < MONTH) {
      const weeks =
        Math.floor(
          difference / WEEK
        );

      return `${weeks} weeks ago`;
    }


    /*
     * Older than 30 days
     *
     * Example:
     * Jul 13, 2026
     */

    return date.toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric"
      }
    );
  }


  /* ================================================================
     UPDATE ALL CHAPTER TIMES
  ================================================================ */

  function updateChapterTimes() {
    const elements =
      document.querySelectorAll(
        "#si-chapter-list [data-chapter-ts]"
      );

    elements.forEach((element) => {
      const timestamp =
        element.getAttribute(
          "data-chapter-ts"
        );

      if (!timestamp) {
        return;
      }

      const formatted =
        chapterDateLabel(timestamp);

      if (formatted) {
        element.textContent =
          formatted;
      }
    });
  }


  /* ================================================================
     CHAPTER TIME AUTO REFRESH
     ---------------------------------------------------------------
     Updates every 60 seconds.

     Example:

       59 minutes ago
             ↓
       1 hour ago

       23 hours ago
             ↓
       yesterday / 1 day ago

       6 days ago
             ↓
       last week
  ================================================================ */

  setInterval(
    updateChapterTimes,
    60 * 1000
  );


  /* ================================================================
     ORDER CHAPTERS
  ================================================================ */

  function orderedChapters() {
    const list =
      [...chapters].sort(
        (a, b) =>
          Number(a.index) -
          Number(b.index)
      );

    return sortNewestFirst
      ? list.reverse()
      : list;
  }


  /* ================================================================
     RENDER CHAPTERS
  ================================================================ */

  function renderChapters(list) {
    const container =
      document.getElementById(
        "si-chapter-list"
      );

    if (!container) {
      return;
    }


    if (!list.length) {
      container.innerHTML =
        `<div class="si-chapter-empty">
          No chapters found
        </div>`;

      return;
    }


    container.innerHTML =
      list
        .map((ch) => {

          const title =
            escapeHTML(
              displayTitle(ch)
            );

          const chapterIndex =
            encodeURIComponent(
              ch.index
            );

          let dateHTML = "";

          if (ch.date) {
            dateHTML =
              `<span
                class="si-chapter-date"
                data-chapter-ts="${escapeAttribute(ch.date)}">
              </span>`;
          }

          return `
            <a
              class="si-chapter-row"
              href="./read/chapter-${chapterIndex}">
              <span class="si-chapter-name">
                ${title}
              </span>
              ${dateHTML}
            </a>
          `;
        })
        .join("");


    /*
     * The HTML is now inserted.
     * Update the timestamps immediately.
     */

    updateChapterTimes();
  }


  /* ================================================================
     CHAPTER SEARCH
  ================================================================ */

  function wireSearch() {
    const input =
      document.getElementById(
        "si-chapter-search-input"
      );

    if (!input) {
      return;
    }


    input.addEventListener(
      "input",
      () => {

        const q =
          input.value
            .trim()
            .toLowerCase();

        const base =
          orderedChapters();


        if (!q) {
          renderChapters(base);
          return;
        }


        renderChapters(
          base.filter((ch) =>
            displayTitle(ch)
              .toLowerCase()
              .includes(q)
          )
        );
      }
    );
  }


  /* ================================================================
     CHAPTER SORT
  ================================================================ */

  function wireSort() {
    const btn =
      document.getElementById(
        "si-sort-btn"
      );

    if (!btn) {
      return;
    }


    btn.addEventListener(
      "click",
      () => {

        sortNewestFirst =
          !sortNewestFirst;


        setText(
          "si-sort-label",
          sortNewestFirst
            ? "Newest"
            : "Oldest"
        );


        const searchInput =
          document.getElementById(
            "si-chapter-search-input"
          );

        const q =
          searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";


        const base =
          orderedChapters();


        if (!q) {
          renderChapters(base);
          return;
        }


        renderChapters(
          base.filter((ch) =>
            displayTitle(ch)
              .toLowerCase()
              .includes(q)
          )
        );
      }
    );
  }


  /* ================================================================
     BOOKMARK
     ================================================================ */

  function wireBookmark() {
    const btn =
      document.getElementById(
        "si-bookmark-btn"
      );

    if (
      !btn ||
      !SLUG ||
      typeof AIPBookmarks === "undefined"
    ) {
      return;
    }


    const label =
      btn.querySelector("span");


    function paint() {
      const on =
        AIPBookmarks.isBookmarked(
          SLUG
        );

      btn.classList.toggle(
        "active",
        on
      );

      if (label) {
        label.textContent =
          on
            ? "Bookmarked"
            : "Bookmark";
      }
    }


    btn.addEventListener(
      "click",
      () => {

        AIPBookmarks.toggle(
          SLUG
        );

        paint();
      }
    );


    paint();
  }


  /* ================================================================
     SERIES INFORMATION MODAL
  ================================================================ */

  function wireModal() {
    const openBtn =
      document.getElementById(
        "si-info-open"
      );

    const overlay =
      document.getElementById(
        "si-modal-overlay"
      );

    const closeBtn =
      document.getElementById(
        "si-modal-close"
      );


    if (
      !openBtn ||
      !overlay ||
      !closeBtn
    ) {
      return;
    }


    const lockBody = () => {
      document.body.style.overflow =
        "hidden";
    };


    const unlockBody = () => {
      document.body.style.overflow =
        "";
    };


    openBtn.addEventListener(
      "click",
      () => {

        overlay.classList.add(
          "open"
        );

        lockBody();
      }
    );


    closeBtn.addEventListener(
      "click",
      () => {

        overlay.classList.remove(
          "open"
        );

        unlockBody();
      }
    );


    overlay.addEventListener(
      "click",
      (event) => {

        if (
          event.target === overlay
        ) {

          overlay.classList.remove(
            "open"
          );

          unlockBody();
        }
      }
    );
  }


  /* ================================================================
     HTML SAFETY HELPERS
  ================================================================ */

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function escapeAttribute(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

})();