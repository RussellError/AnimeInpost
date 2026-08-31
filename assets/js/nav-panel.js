/* ============================================================
   NAV PANEL
   Opens/closes the full-panel overlay (fast in-place fade, no
   slide/shift). Wires the panel's search input to search.js
   for live filtering.

   Requires search.js to be loaded before this file for the
   search box to function.
   ============================================================ */

(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const trigger = document.getElementById("navPanelTrigger");
    const panel = document.getElementById("navPanel");
    const overlay = document.getElementById("navPanelOverlay");
    const closeBtn = document.getElementById("navPanelClose");

    if (!trigger || !panel || !overlay) return;

    function openPanel() {
      panel.classList.add("open");
      overlay.classList.add("active");
      document.body.style.overflow = "hidden";
    }

    function closePanel() {
      panel.classList.remove("open");
      overlay.classList.remove("active");
      document.body.style.overflow = "";
    }

    trigger.addEventListener("click", openPanel);
    overlay.addEventListener("click", closePanel);
    if (closeBtn) closeBtn.addEventListener("click", closePanel);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    // wire the panel's search input to the search.js module
    if (typeof initSearch === "function") {
      initSearch({
        inputSelector: "#navSearchInput",
        resultsSelector: "#navSearchResults",
        dataUrl: "/data/search-index.json",
      });
    }
  });
})();
