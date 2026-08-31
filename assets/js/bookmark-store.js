/* ===================================================================
   bookmark-store.js
   Single source of truth for bookmarks, backed by localStorage.
   Loaded before any script that reads/writes bookmarks:
     series-info.js   (bookmark button on a series page)
     series-render.js (bookmark button on browse-series cards)
     bookmarks.js      (the /bookmarks.html page itself)

   Storage:
     aip_bookmarks      -> JSON array of slugs, e.g. ["lookism","orv"]
                            (kept for backwards compatibility — this is
                            the array series-info.js already wrote to)
     aip_bookmark_meta   -> JSON object of slug -> {
                              chapter:  number   (last chapter read, 0 = none)
                              status:   string   (see STATUSES below)
                              addedAt:  ISO date string
                            }
=================================================================== */

(function (global) {
  var LIST_KEY = "aip_bookmarks";
  var META_KEY = "aip_bookmark_meta";

  var STATUSES = [
    { value: "reading",   label: "Reading",       color: "#3b82f6" },
    { value: "planning",  label: "Plan to Read",  color: "#a78bfa" },
    { value: "completed", label: "Completed",     color: "#2ecc71" },
    { value: "onhold",    label: "On Hold",       color: "#ffd23f" },
    { value: "dropped",   label: "Dropped",       color: "#ef4444" }
  ];

  function statusMeta(value) {
    for (var i = 0; i < STATUSES.length; i++) {
      if (STATUSES[i].value === value) return STATUSES[i];
    }
    return STATUSES[0];
  }

  function readList() {
    try {
      var raw = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function writeList(list) {
    try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function readMeta() {
    try {
      var raw = JSON.parse(localStorage.getItem(META_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function writeMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
  }

  function defaultEntry() {
    return { chapter: 0, status: "reading", addedAt: new Date().toISOString() };
  }

  function isBookmarked(slug) {
    return readList().indexOf(slug) !== -1;
  }

  function getAll() {
    return readList();
  }

  function getEntry(slug) {
    var meta = readMeta();
    return meta[slug] || null;
  }

  function ensureEntry(meta, slug) {
    if (!meta[slug]) meta[slug] = defaultEntry();
    return meta[slug];
  }

  function add(slug) {
    var list = readList();
    if (list.indexOf(slug) === -1) {
      list.push(slug);
      writeList(list);
    }
    var meta = readMeta();
    ensureEntry(meta, slug);
    writeMeta(meta);
    notify();
  }

  function remove(slug) {
    var list = readList().filter(function (s) { return s !== slug; });
    writeList(list);
    var meta = readMeta();
    delete meta[slug];
    writeMeta(meta);
    notify();
  }

  function toggle(slug) {
    if (isBookmarked(slug)) {
      remove(slug);
      return false;
    }
    add(slug);
    return true;
  }

  function setChapter(slug, chapter) {
    var meta = readMeta();
    var entry = ensureEntry(meta, slug);
    entry.chapter = Math.max(0, chapter | 0);
    writeMeta(meta);
    notify();
  }

  function setStatus(slug, status) {
    var meta = readMeta();
    var entry = ensureEntry(meta, slug);
    entry.status = status;
    writeMeta(meta);
    notify();
  }

  function clearAll() {
    writeList([]);
    writeMeta({});
    notify();
  }

  var listeners = [];
  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }
  function notify() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
  }

  /* ---------------- Export / Import ----------------
     Export produces a portable JSON snapshot of both storage keys.
     Import accepts that same shape and merges (default) or replaces
     the current data. Merge: incoming slugs are added/overwritten;
     everything already saved locally that isn't in the file is kept. */
  function exportData() {
    return {
      app: "AnimeInPost",
      type: "bookmarks-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      bookmarks: readList(),
      meta: readMeta()
    };
  }

  function importData(data, opts) {
    opts = opts || {};
    var mode = opts.mode === "replace" ? "replace" : "merge";

    if (!data || typeof data !== "object" || !Array.isArray(data.bookmarks) || typeof data.meta !== "object") {
      return false;
    }

    var incomingList = data.bookmarks;
    var incomingMeta = data.meta || {};

    if (mode === "replace") {
      writeList(incomingList.slice());
      writeMeta(JSON.parse(JSON.stringify(incomingMeta)));
    } else {
      var list = readList();
      var meta = readMeta();

      incomingList.forEach(function (slug) {
        if (typeof slug === "string" && list.indexOf(slug) === -1) list.push(slug);
      });
      Object.keys(incomingMeta).forEach(function (slug) {
        meta[slug] = incomingMeta[slug];
        if (list.indexOf(slug) === -1) list.push(slug);
      });

      writeList(list);
      writeMeta(meta);
    }

    notify();
    return true;
  }

  global.AIPBookmarks = {
    STATUSES: STATUSES,
    statusMeta: statusMeta,
    isBookmarked: isBookmarked,
    getAll: getAll,
    getEntry: getEntry,
    add: add,
    remove: remove,
    toggle: toggle,
    setChapter: setChapter,
    setStatus: setStatus,
    clearAll: clearAll,
    onChange: onChange,
    exportData: exportData,
    importData: importData
  };
})(window);
