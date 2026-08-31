/* ===================================================================
   bookmarks.js
   Controls the /bookmarks.html page body only (header/nav-panel is
   handled by nav-panel.js / search.js, same as every other page).

   Data model lives in bookmark-store.js (localStorage). This file
   enriches the raw slug list with title/cover from /data/series.json
   + /data/search-index.json. Chapter TOTAL is not stored in
   series.json — it's fetched live, per bookmarked slug, from
   meta/<slug>.json (same pattern as series-render.js / popular.js /
   trending-now.js), so it's always accurate without any build step.
=================================================================== */

(function () {
  var SERIES_URL = "/data/series.json";
  var SEARCH_URL = "/data/search-index.json";
  var META_DIR = "/meta/";

  var catalog = {};   // slug -> { title, cover, total, type, badge }
  var allItems = [];  // enriched bookmark objects, newest bookmarked first
  var currentSearch = "";
  var currentStatus = "all";
  var currentSlug = null;

  var els = {};

  document.addEventListener("DOMContentLoaded", function () {
    if (typeof AIPBookmarks === "undefined") return;

    cacheEls();
    wireControls();
    wireModal();
    loadCatalogAndRender();
  });

  function cacheEls() {
    els.countBadge   = document.getElementById("bmCount");
    els.searchInput  = document.getElementById("bmSearchInput");
    els.filtersBtn   = document.getElementById("bmFiltersBtn");
    els.filtersPanel = document.getElementById("bmFiltersPanel");
    els.chipsWrap    = document.getElementById("bmStatusChips");
    els.grid         = document.getElementById("bmGrid");
    els.emptyState   = document.getElementById("bmEmpty");
    els.noResults    = document.getElementById("bmNoResults");

    els.overlay      = document.getElementById("bmModalOverlay");
    els.modal        = document.getElementById("bmModal");
    els.modalClose   = document.getElementById("bmModalClose");
    els.modalCover   = document.getElementById("bmModalCover");
    els.modalTitle   = document.getElementById("bmModalTitle");
    els.modalDate    = document.getElementById("bmModalDate");
    els.modalType    = document.getElementById("bmModalType");

    els.stepMinus    = document.getElementById("bmStepMinus");
    els.stepPlus     = document.getElementById("bmStepPlus");
    els.chapterNow   = document.getElementById("bmChapterNow");
    els.chapterTotal = document.getElementById("bmChapterTotal");

    els.setLastBtn   = document.getElementById("bmSetLast");
    els.setLastNum   = document.getElementById("bmSetLastNum");

    els.progressTrack = document.getElementById("bmProgressTrack");
    els.progressFill  = document.getElementById("bmProgressFill");
    els.progressThumb = document.getElementById("bmProgressThumb");
    els.progressLeft  = document.getElementById("bmProgressLeft");
    els.progressRight = document.getElementById("bmProgressRight");

    els.statusSelect = document.getElementById("bmStatusSelect");
    els.statusBtn    = document.getElementById("bmStatusBtn");
    els.statusDot    = document.getElementById("bmStatusDot");
    els.statusLabel  = document.getElementById("bmStatusLabel");
    els.statusMenu   = document.getElementById("bmStatusMenu");

    els.continueBtn   = document.getElementById("bmContinueBtn");
    els.continueLabel = document.getElementById("bmContinueLabel");
    els.infoBtn       = document.getElementById("bmInfoBtn");
    els.deleteBtn      = document.getElementById("bmDeleteBtn");

    els.exportBtn    = document.getElementById("bmExportBtn");
    els.importBtn    = document.getElementById("bmImportBtn");
    els.importFile   = document.getElementById("bmImportFile");
    els.deleteAllBtn = document.getElementById("bmDeleteAllBtn");
    els.ioActions    = document.querySelector(".bm-io-actions");
  }

  /* ---------------- Helpers ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function slugFromUrl(url) {
    var m = /^\/series\/([^\/]+)\/?$/.exec(url || "");
    return m ? m[1] : null;
  }

  /* ---------------- Catalog (title/cover/type) ---------------- */
  function buildCatalog(seriesData, searchData) {
    var map = {};
    (seriesData.series || []).forEach(function (item) {
      map[item.slug] = {
        title: item.title,
        cover: item.cover,
        total: null,
        badge: item.badge
      };
    });
    (searchData.series || []).forEach(function (item) {
      var slug = slugFromUrl(item.url);
      if (!slug) return;
      if (!map[slug]) map[slug] = {};
      map[slug].type = item.type;
      if (!map[slug].title) map[slug].title = item.title;
      if (!map[slug].cover) map[slug].cover = item.img;
    });
    return map;
  }

  // Fetches meta/<slug>.json (the chapter list) for one bookmarked
  // slug and patches catalog[slug].total with its length. Leaves the
  // entry's total as null (renders as "?") if the fetch fails.
  function liveRefreshTotal(slug) {
    return fetch(META_DIR + slug + ".json")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (chapters) {
        if (Array.isArray(chapters)) {
          if (!catalog[slug]) catalog[slug] = {};
          catalog[slug].total = chapters.length;
        }
      })
      .catch(function () {});
  }

  function buildBookmarkItems() {
    return AIPBookmarks.getAll().map(function (slug) {
      var entry = AIPBookmarks.getEntry(slug) || { chapter: 0, status: "reading", addedAt: null };
      var cat = catalog[slug] || {};
      return {
        slug: slug,
        title: cat.title || slug,
        cover: cat.cover || "",
        total: cat.total != null ? cat.total : null,
        type: cat.type || (cat.badge === "novel" ? "Novel" : "Manga"),
        chapter: entry.chapter || 0,
        status: entry.status || "reading",
        addedAt: entry.addedAt || null
      };
    }).sort(function (a, b) {
      return (b.addedAt || "").localeCompare(a.addedAt || "");
    });
  }

  function findItem(slug) {
    for (var i = 0; i < allItems.length; i++) {
      if (allItems[i].slug === slug) return allItems[i];
    }
    return null;
  }

  /* ---------------- Loading ---------------- */
  function loadCatalogAndRender() {
    Promise.all([
      fetch(SERIES_URL).then(function (r) { return r.json(); }).catch(function () { return { series: [] }; }),
      fetch(SEARCH_URL).then(function (r) { return r.json(); }).catch(function () { return { series: [] }; })
    ])
      .then(function (results) {
        catalog = buildCatalog(results[0] || {}, results[1] || {});

        // Only fetch chapter totals for slugs actually bookmarked —
        // no need to touch all 66 series' meta files here.
        var slugs = (typeof AIPBookmarks !== "undefined") ? AIPBookmarks.getAll() : [];
        return Promise.all(slugs.map(liveRefreshTotal));
      })
      .then(function () {
        refreshAll();
      })
      .catch(function (err) {
        console.error("[bookmarks] failed to load catalog", err);
        allItems = buildBookmarkItems();
        refreshAll();
      });
  }

  /* ---------------- Rendering: grid ---------------- */
  function statusPillHtml(item) {
    var meta = AIPBookmarks.statusMeta(item.status);
    return (
      '<span class="bm-status-pill"><span class="bm-status-dot" style="background:' +
      meta.color + '"></span>' + meta.label + "</span>"
    );
  }

  function progressPillHtml(item) {
    var total = item.total != null ? item.total : "?";
    return '<span class="bm-progress-pill">' + item.chapter + "/" + total + "</span>";
  }

  function cardHtml(item) {
    return (
      '<button type="button" class="bm-card" data-slug="' + item.slug + '">' +
        '<div class="bm-card-inner">' +
          '<div class="bm-cover">' +
            statusPillHtml(item) +
            progressPillHtml(item) +
            '<img src="' + item.cover + '" alt="' + escapeHtml(item.title) + '" loading="lazy">' +
          "</div>" +
          '<div class="bm-card-info"><span class="bm-card-title">' + escapeHtml(item.title) + "</span></div>" +
        "</div>" +
      "</button>"
    );
  }

  function renderGrid(list) {
    if (!els.grid) return;

    if (!list.length) {
      els.grid.hidden = true;
      els.grid.innerHTML = "";
      if (allItems.length === 0) {
        els.emptyState.hidden = false;
        els.noResults.hidden = true;
      } else {
        els.emptyState.hidden = true;
        els.noResults.hidden = false;
      }
      return;
    }

    els.emptyState.hidden = true;
    els.noResults.hidden = true;
    els.grid.hidden = false;
    els.grid.innerHTML = list.map(cardHtml).join("");
  }

  function applyFilters() {
    var list = allItems;
    if (currentStatus !== "all") {
      list = list.filter(function (i) { return i.status === currentStatus; });
    }
    if (currentSearch) {
      var q = currentSearch.toLowerCase();
      list = list.filter(function (i) { return i.title.toLowerCase().indexOf(q) !== -1; });
    }
    renderGrid(list);
  }

  function refreshAll() {
    allItems = buildBookmarkItems();
    if (els.countBadge) els.countBadge.textContent = allItems.length;
    applyFilters();
    if (currentSlug) {
      if (findItem(currentSlug)) refreshModal();
      else closeModal();
    }
  }

  /* ---------------- Controls: search / filters ---------------- */
  function wireControls() {
    if (els.searchInput) {
      els.searchInput.addEventListener("input", function (e) {
        currentSearch = e.target.value.trim();
        applyFilters();
      });
    }

    if (els.filtersBtn && els.filtersPanel) {
      els.filtersBtn.addEventListener("click", function () {
        var willShow = els.filtersPanel.hidden;
        els.filtersPanel.hidden = !willShow;
        els.filtersBtn.classList.toggle("open", willShow);
      });
    }

    if (els.chipsWrap) {
      els.chipsWrap.addEventListener("click", function (e) {
        var chip = e.target.closest(".bm-chip");
        if (!chip) return;
        currentStatus = chip.dataset.status;
        var chips = els.chipsWrap.querySelectorAll(".bm-chip");
        for (var i = 0; i < chips.length; i++) {
          chips[i].classList.toggle("active", chips[i] === chip);
        }
        applyFilters();
      });
    }

    if (els.grid) {
      els.grid.addEventListener("click", function (e) {
        var card = e.target.closest(".bm-card");
        if (!card) return;
        openModal(card.dataset.slug);
      });
    }

    wireImportExport();
  }

  /* ---------------- Header: export / import / delete-all ----------------
     Delegated on the shared .bm-io-actions container (rather than three
     separate per-button listeners) so the wiring can't silently miss a
     button if the DOM shifts, and so all three share one code path. */
  function wireImportExport() {
    if (els.ioActions) {
      els.ioActions.addEventListener("click", function (e) {
        var btn = e.target.closest("button");
        if (!btn) return;

        if (btn.id === "bmExportBtn") {
          doExport();
        } else if (btn.id === "bmImportBtn") {
          if (els.importFile) {
            els.importFile.value = "";
            els.importFile.click();
          }
        } else if (btn.id === "bmDeleteAllBtn") {
          doDeleteAll();
        }
      });
    } else {
      console.warn("[bookmarks] .bm-io-actions not found — export/import/delete-all buttons won't work. Check bookmarks.html was deployed with the latest markup.");
    }

    if (els.importFile) {
      els.importFile.addEventListener("change", function () {
        var file = els.importFile.files && els.importFile.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function () {
          var data;
          try {
            data = JSON.parse(reader.result);
          } catch (e) {
            window.alert("That file isn't valid JSON.");
            return;
          }

          var proceed = window.confirm(
            "Import bookmarks from this file? Entries in the file will be added to (or updated in) your current bookmarks."
          );
          if (!proceed) return;

          var ok = AIPBookmarks.importData(data, { mode: "merge" });
          if (ok) {
            refreshAll();
            window.alert("Bookmarks imported.");
          } else {
            window.alert("That file doesn't look like an AnimeInPost bookmarks export.");
          }
        };
        reader.readAsText(file);
      });
    }
  }

  function doExport() {
    var data = AIPBookmarks.exportData();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().slice(0, 10);
    var a = document.createElement("a");
    a.href = url;
    a.download = "animeinpost-bookmarks-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function doDeleteAll() {
    var count = AIPBookmarks.getAll().length;
    if (!count) {
      window.alert("You don't have any bookmarks yet.");
      return;
    }
    var ok = window.confirm(
      "Delete all " + count + " bookmark" + (count === 1 ? "" : "s") + "? This can't be undone."
    );
    if (!ok) return;
    AIPBookmarks.clearAll();
    closeModal();
    refreshAll();
  }

  /* ---------------- Modal ---------------- */
  function renderStatusMenu(activeStatus) {
    if (!els.statusMenu) return;
    els.statusMenu.innerHTML = AIPBookmarks.STATUSES.map(function (s) {
      return (
        '<button type="button" class="bm-status-option" data-status="' + s.value + '">' +
          '<span class="bm-status-dot" style="background:' + s.color + '"></span>' + s.label +
        "</button>"
      );
    }).join("");
  }

  function closeStatusMenu() {
    if (els.statusSelect) els.statusSelect.classList.remove("open");
  }

  function refreshModal() {
    var item = findItem(currentSlug);
    if (!item) { closeModal(); return; }

    if (els.modalCover) { els.modalCover.src = item.cover; els.modalCover.alt = item.title; }
    if (els.modalTitle) els.modalTitle.textContent = item.title;
    if (els.modalDate) {
      var dateLabel = formatDate(item.addedAt);
      els.modalDate.textContent = dateLabel ? "Bookmarked " + dateLabel : "";
    }
    if (els.modalType) els.modalType.textContent = item.type;

    var total = item.total;
    if (els.chapterNow) els.chapterNow.textContent = item.chapter;
    if (els.chapterTotal) els.chapterTotal.textContent = total != null ? total : "?";

    if (els.setLastBtn) els.setLastBtn.disabled = total == null || item.chapter >= total;
    if (els.setLastNum) els.setLastNum.textContent = total != null ? total : "?";

    var pct = total ? Math.min(100, Math.round((item.chapter / total) * 100)) : 0;
    if (els.progressFill) els.progressFill.style.width = pct + "%";
    if (els.progressThumb) els.progressThumb.style.left = pct + "%";
    if (els.progressTrack) els.progressTrack.classList.toggle("disabled", total == null);
    if (els.progressLeft) els.progressLeft.textContent = "Chapter " + item.chapter;
    if (els.progressRight) {
      els.progressRight.textContent =
        total == null ? "—" : item.chapter >= total ? "Completed" : (total - item.chapter) + " behind";
    }

    if (els.stepMinus) els.stepMinus.disabled = item.chapter <= 0;
    if (els.stepPlus) els.stepPlus.disabled = total != null && item.chapter >= total;

    var meta = AIPBookmarks.statusMeta(item.status);
    if (els.statusDot) els.statusDot.style.background = meta.color;
    if (els.statusLabel) els.statusLabel.textContent = meta.label;
    renderStatusMenu(item.status);

    var nextIndex = total != null ? Math.min(item.chapter + 1, Math.max(total, 1)) : item.chapter + 1;
    if (nextIndex < 1) nextIndex = 1;
    if (els.continueLabel) els.continueLabel.textContent = "Chapter " + nextIndex;
    if (els.continueBtn) els.continueBtn.href = "/series/" + item.slug + "/read/chapter-" + nextIndex;
    if (els.infoBtn) els.infoBtn.href = "/series/" + item.slug + "/";
  }

  function openModal(slug) {
    currentSlug = slug;
    refreshModal();
    if (els.overlay) els.overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (els.overlay) els.overlay.classList.remove("open");
    document.body.style.overflow = "";
    closeStatusMenu();
    currentSlug = null;
  }

  function wireModal() {
    if (els.modalClose) els.modalClose.addEventListener("click", closeModal);
    if (els.overlay) {
      els.overlay.addEventListener("click", function (e) {
        if (e.target === els.overlay) closeModal();
      });
      els.overlay.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    if (els.stepMinus) {
      els.stepMinus.addEventListener("click", function () {
        var item = findItem(currentSlug);
        if (!item) return;
        AIPBookmarks.setChapter(currentSlug, Math.max(0, item.chapter - 1));
        refreshAll();
      });
    }
    if (els.stepPlus) {
      els.stepPlus.addEventListener("click", function () {
        var item = findItem(currentSlug);
        if (!item) return;
        var max = item.total != null ? item.total : item.chapter + 1;
        AIPBookmarks.setChapter(currentSlug, Math.min(max, item.chapter + 1));
        refreshAll();
      });
    }
    if (els.setLastBtn) {
      els.setLastBtn.addEventListener("click", function () {
        var item = findItem(currentSlug);
        if (!item || item.total == null) return;
        AIPBookmarks.setChapter(currentSlug, item.total);
        refreshAll();
      });
    }

    if (els.statusBtn && els.statusSelect) {
      els.statusBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        els.statusSelect.classList.toggle("open");
      });
      document.addEventListener("click", function (e) {
        if (!els.statusSelect.contains(e.target)) closeStatusMenu();
      });
    }
    if (els.statusMenu) {
      els.statusMenu.addEventListener("click", function (e) {
        var opt = e.target.closest(".bm-status-option");
        if (!opt || !currentSlug) return;
        AIPBookmarks.setStatus(currentSlug, opt.dataset.status);
        refreshAll();
        closeStatusMenu();
      });
    }

    if (els.deleteBtn) {
      els.deleteBtn.addEventListener("click", function () {
        var item = findItem(currentSlug);
        if (!item) return;
        var ok = window.confirm('Remove "' + item.title + '" from your bookmarks?');
        if (!ok) return;
        AIPBookmarks.remove(currentSlug);
        closeModal();
        refreshAll();
      });
    }

    wireProgressSlider();
  }

  /* ---------------- Modal: draggable chapter slider ----------------
     Lets the user drag the thumb to any chapter instead of tapping
     "Set to Chapter N" and waiting for the +/- stepper. The chapter
     number updates live while dragging; the store is only written
     once, on release, to avoid spamming localStorage. */
  function wireProgressSlider() {
    if (!els.progressTrack) return;
    var dragging = false;
    var pendingChapter = null;

    function chapterFromClientX(clientX) {
      var item = findItem(currentSlug);
      if (!item || item.total == null) return null;
      var rect = els.progressTrack.getBoundingClientRect();
      var ratio = rect.width ? (clientX - rect.left) / rect.width : 0;
      ratio = Math.max(0, Math.min(1, ratio));
      return Math.round(ratio * item.total);
    }

    function paint(chapter, total) {
      var pct = total ? Math.min(100, Math.max(0, Math.round((chapter / total) * 100))) : 0;
      if (els.progressFill) els.progressFill.style.width = pct + "%";
      if (els.progressThumb) els.progressThumb.style.left = pct + "%";
      if (els.chapterNow) els.chapterNow.textContent = chapter;
      if (els.progressLeft) els.progressLeft.textContent = "Chapter " + chapter;
      if (els.progressRight) {
        els.progressRight.textContent =
          total == null ? "—" : chapter >= total ? "Completed" : (total - chapter) + " behind";
      }
    }

    function onMove(e) {
      if (!dragging || !currentSlug) return;
      var item = findItem(currentSlug);
      if (!item || item.total == null) return;
      var chapter = chapterFromClientX(e.clientX);
      if (chapter == null) return;
      pendingChapter = chapter;
      paint(chapter, item.total);
    }

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      els.progressTrack.classList.remove("dragging");
      try { els.progressTrack.releasePointerCapture(e.pointerId); } catch (err) {}
      if (pendingChapter != null && currentSlug) {
        AIPBookmarks.setChapter(currentSlug, pendingChapter);
        pendingChapter = null;
        refreshAll();
      }
    }

    function startDrag(e) {
      var item = findItem(currentSlug);
      if (!item || item.total == null) return;
      dragging = true;
      els.progressTrack.classList.add("dragging");
      try { els.progressTrack.setPointerCapture(e.pointerId); } catch (err) {}
      onMove(e);
      e.preventDefault();
    }

    els.progressTrack.addEventListener("pointerdown", startDrag);
    els.progressTrack.addEventListener("pointermove", onMove);
    els.progressTrack.addEventListener("pointerup", endDrag);
    els.progressTrack.addEventListener("pointercancel", endDrag);
  }
})();
