(function () {
  "use strict";

  function slugFromHref(href) {
    if (!href) return null;
    return href.replace(/^\/+|\/+$/g, "").split("/").pop();
  }

  // Fetches meta/<slug>_meta.json and patches the item's rating in
  // place. Leaves the cached value untouched on failure.
  function liveRefresh(metaDir, item) {
    var slug = slugFromHref(item.href);
    if (!slug) return Promise.resolve();

    return fetch(metaDir + slug + "_meta.json")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (meta) {
        if (meta && typeof meta.rating === "number") {
          item.rating = meta.rating;
        }
      })
      .catch(function () {});
  }

  var STAR_ICON =
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

  function stars() {
    var out = "";
    for (var i = 0; i < 5; i++) out += STAR_ICON;
    return out;
  }

  function rowHtml(item, rank) {
    var title = escapeHtml(item.title || "");
    var href = escapeHtml(item.href || "#");
    var img = escapeHtml(item.image || "");
    var genres = Array.isArray(item.genres) ? item.genres.join(", ") : "";
    var rating =
      typeof item.rating === "number" ? item.rating.toFixed(1) : "";

    return (
      '<a class="pop-row" href="' +
      href +
      '">' +
      '<div class="pop-rank-cover">' +
      '<div class="pop-cover">' +
      '<img src="' +
      img +
      '" alt="' +
      title +
      '" loading="lazy">' +
      "</div>" +
      '<span class="pop-rank">' +
      rank +
      "</span>" +
      "</div>" +
      '<div class="pop-body">' +
      '<p class="pop-title">' +
      title +
      "</p>" +
      '<p class="pop-genres">Genres: <b>' +
      escapeHtml(genres) +
      "</b></p>" +
      '<div class="pop-rating">' +
      '<span class="pop-stars">' +
      stars() +
      "</span>" +
      '<span class="pop-rating-num">' +
      escapeHtml(rating) +
      "</span>" +
      "</div>" +
      "</div>" +
      "</a>"
    );
  }

  function renderList(listEl, items) {
    listEl.innerHTML = items
      .map(function (item, i) {
        return rowHtml(item, i + 1);
      })
      .join("");
  }

  function render(root, data) {
    var heading = data.heading || "Popular";
    var tabs = Array.isArray(data.tabs) ? data.tabs : [];

    root.innerHTML =
      '<h2 class="pop-heading">' +
      escapeHtml(heading) +
      "</h2>" +
      '<div class="pop-tabs" id="popTabs"></div>' +
      '<div class="pop-divider"></div>' +
      '<div class="pop-list" id="popList"></div>';

    var tabsEl = root.querySelector("#popTabs");
    var listEl = root.querySelector("#popList");

    tabsEl.innerHTML = tabs
      .map(function (tab, i) {
        return (
          '<button type="button" class="pop-tab' +
          (i === 0 ? " active" : "") +
          '" data-tab="' +
          escapeHtml(tab.id) +
          '">' +
          escapeHtml(tab.label) +
          "</button>"
        );
      })
      .join("");

    if (tabs.length) {
      renderList(listEl, tabs[0].items || []);
    }

    tabsEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".pop-tab");
      if (!btn) return;

      tabsEl
        .querySelectorAll(".pop-tab")
        .forEach(function (b) {
          b.classList.remove("active");
        });
      btn.classList.add("active");

      var tab = tabs.find(function (t) {
        return t.id === btn.dataset.tab;
      });
      renderList(listEl, tab ? tab.items || [] : []);
    });
  }

  function initPopular(opts) {
    opts = opts || {};
    var rootSelector = opts.rootSelector || "#popular";
    var dataUrl = opts.dataUrl || "./data/popular.json";
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

        // Cached list is on screen now. Quietly fetch live rating
        // per card (across every tab) and re-render the active tab
        // once it's in.
        var tabs = Array.isArray(data.tabs) ? data.tabs : [];
        var allItems = [];
        tabs.forEach(function (tab) {
          (tab.items || []).forEach(function (item) { allItems.push(item); });
        });

        Promise.all(
          allItems.map(function (item) { return liveRefresh(metaDir, item); })
        )
          .then(function () {
            var activeTabId = root.querySelector(".pop-tab.active");
            activeTabId = activeTabId ? activeTabId.dataset.tab : null;
            var listEl = root.querySelector("#popList");
            var activeTab = tabs.find(function (t) { return t.id === activeTabId; }) || tabs[0];
            if (listEl && activeTab) renderList(listEl, activeTab.items || []);
          })
          .catch(function (err) {
            console.error("[popular] live refresh failed", err);
          });
      })
      .catch(function (err) {
        console.error("[popular]", err);
      });
  }

  window.initPopular = initPopular;
})();
