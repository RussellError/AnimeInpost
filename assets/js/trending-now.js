(function () {
  "use strict";

  // Slug is derived from the item's own href ("/series/<slug>/"),
  // which is always the folder the meta files are named after.
  function slugFromHref(href) {
    if (!href) return null;
    return href.replace(/^\/+|\/+$/g, "").split("/").pop();
  }

  // Fetches meta/<slug>_meta.json + meta/<slug>.json and patches the
  // item's rating/chapter label in place. Leaves the cached value
  // untouched if a fetch fails, so the card still renders fine.
  function liveRefresh(metaDir, item) {
    var slug = slugFromHref(item.href);
    if (!slug) return Promise.resolve();

    var metaP = fetch(metaDir + slug + "_meta.json")
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });

    var chaptersP = fetch(metaDir + slug + ".json")
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });

    return Promise.all([metaP, chaptersP]).then(function (results) {
      var meta = results[0];
      var chapters = results[1];

      if (meta && typeof meta.rating === "number") {
        item.rating = meta.rating;
      }
      if (Array.isArray(chapters)) {
        var prefixMatch = (item.chapter || "").match(/^[A-Za-z]+/);
        var prefix = prefixMatch ? prefixMatch[0] : "Chapter";
        item.chapter = prefix + " " + chapters.length;
      }
    });
  }

  var STAR_ICON =
    '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.24 6.87.77-5.13 4.66 1.45 6.77L12 17.77 5.91 20.94l1.45-6.77-5.13-4.66 6.87-.77z"/></svg>';

  var BADGE_ICON =
    '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.24 6.87.77-5.13 4.66 1.45 6.77L12 17.77 5.91 20.94l1.45-6.77-5.13-4.66 6.87-.77z"/></svg>';

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
          c
        ] || c
      );
    });
  }

  function renderStars() {
    var out = "";
    for (var i = 0; i < 5; i++) out += STAR_ICON;
    return out;
  }

  function cardHtml(item) {
    var title = escapeHtml(item.title || "");
    var chapter = escapeHtml(item.chapter || "");
    var href = escapeHtml(item.href || "#");
    var img = escapeHtml(item.image || "");
    var rating =
      typeof item.rating === "number" ? item.rating.toFixed(1) : "";

    return (
      '<a class="tn-card" href="' +
      href +
      '">' +
      '<div class="tn-cover">' +
      '<img src="' +
      img +
      '" alt="' +
      title +
      '" loading="lazy">' +
      '<div class="tn-cover-fade"></div>' +
      '<div class="tn-cover-title">' +
      title +
      "</div>" +
      "</div>" +
      '<div class="tn-meta">' +
      '<p class="tn-chapter">' +
      chapter +
      "</p>" +
      '<div class="tn-rating">' +
      '<span class="tn-stars">' +
      renderStars() +
      "</span>" +
      '<span class="tn-rating-num">' +
      escapeHtml(rating) +
      "</span>" +
      "</div>" +
      "</div>" +
      "</a>"
    );
  }

  function render(root, data) {
    var heading = data.heading || "Trending Now";
    var ctaLabel = data.ctaLabel || "All Series";
    var ctaHref = data.ctaHref || "#";
    var items = Array.isArray(data.items) ? data.items : [];

    root.innerHTML =
      '<div class="tn-head">' +
      '<div class="tn-head-left">' +
      '<span class="tn-badge">' +
      BADGE_ICON +
      "</span>" +
      '<h2 class="tn-heading">' +
      escapeHtml(heading) +
      "</h2>" +
      "</div>" +
      '<a class="tn-cta" href="' +
      escapeHtml(ctaHref) +
      '">' +
      escapeHtml(ctaLabel) +
      "</a>" +
      "</div>" +
      '<div class="tn-scroll">' +
      items.map(cardHtml).join("") +
      "</div>";
  }

  function initTrendingNow(opts) {
    opts = opts || {};
    var rootSelector = opts.rootSelector || "#trendingNow";
    var dataUrl = opts.dataUrl || "./data/trending.json";
    var metaDir = opts.metaDir || "./meta/";
    var root = document.querySelector(rootSelector);
    if (!root) return;

    fetch(dataUrl)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load " + dataUrl);
        return res.json();
      })
      .then(function (data) {
        render(root, data);

        // Cached list is on screen now. Quietly fetch live
        // rating/chapter data per card and re-render once it's in.
        var items = Array.isArray(data.items) ? data.items : [];
        Promise.all(
          items.map(function (item) { return liveRefresh(metaDir, item); })
        )
          .then(function () { render(root, data); })
          .catch(function (err) {
            console.error("[trending-now] live refresh failed", err);
          });
      })
      .catch(function (err) {
        console.error("[trending-now]", err);
      });
  }

  window.initTrendingNow = initTrendingNow;
})();
