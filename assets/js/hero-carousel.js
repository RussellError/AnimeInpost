/* ============================================================
   HERO CAROUSEL ENGINE
   Fetches ./data/hero-slides.json and renders a cover-flow
   style carousel into #heroTrack / #heroDots (see index.html).
   Vanilla JS, no dependencies.
   ============================================================ */
(function () {
  "use strict";

  var CONFIG = {
    dataUrl: "./data/hero-slides.json",
    autoplayDelay: 4000,
    transitionDuration: 520, // ms — keep in sync with --hc-transition in hero-carousel.css
    dragThresholdRatio: 0.18,
    visibleRange: 2, // how many slides are rendered/visible on each side of active
    sizeFalloff: 1, // distance (in card-widths) over which active -> side size/opacity interpolates
    sideScale: 0.75, // flat scale for any non-active card beyond sizeFalloff
    sideOpacity: 0.7, // flat opacity for any non-active card beyond sizeFalloff
    skeletonCount: 5
  };

  var track = document.getElementById("heroTrack");
  var dotsWrap = document.getElementById("heroDots");
  var section = document.getElementById("heroCarousel");

  if (!track || !section) return;

  // Slug is derived from each slide's own url ("/series/<slug>/"),
  // the same folder the meta files are named after.
  function slugFromUrl(url) {
    if (!url) return null;
    return url.replace(/^\/+|\/+$/g, "").split("/").pop();
  }

  // Fetches meta/<slug>_meta.json and patches the slide's rating in
  // place. Leaves the cached value untouched on failure, so a slide
  // still shows something sensible if /meta is briefly unreachable.
  function liveRefreshRating(slide) {
    var slug = slugFromUrl(slide.url);
    if (!slug) return Promise.resolve();

    return fetch("./meta/" + slug + "_meta.json")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (meta) {
        if (meta && typeof meta.rating === "number") {
          slide.rating = meta.rating;
        }
      })
      .catch(function () {});
  }

  var skeletonEl = renderSkeleton();

  var state = {
    slides: [],
    currentIndex: 0,
    isDragging: false,
    isAnimating: false,
    startX: 0,
    currentX: 0,
    dragOffset: 0,
    autoplayTimer: null,
    animTimeout: null,
    resizeTimer: null,
    cardWidth: 0,
    spacing: 0,
    pointerId: null,
    wasDragged: false
  };

  var cardEls = [];
  var dotEls = [];
  var ratingBadgeEls = [];

  // ---------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------
  function loadSlides() {
    fetch(CONFIG.dataUrl, { cache: "force-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("hero-slides.json request failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) {
          section.style.display = "none";
          return;
        }
        state.slides = data;
        renderSlides();
        renderDots();
        measure();
        updateSlider(false);
        preloadNeighbors();
        bindEvents();
        if (state.slides.length > 1) startAutoplay();

        // Reveal the real carousel and retire the skeleton only once slides
        // are positioned, so there's never a frame of unstyled/misplaced cards.
        requestAnimationFrame(function () {
          track.classList.add("is-ready");
          hideSkeleton();
        });

        // Cached ratings are on screen now. Quietly fetch each slide's
        // live rating from /meta and patch just the badge text in
        // place — never re-render the carousel itself, so its drag/
        // position state is never disturbed.
        Promise.all(state.slides.map(liveRefreshRating))
          .then(function () {
            state.slides.forEach(function (slide, i) {
              if (ratingBadgeEls[i]) renderRatingBadge(ratingBadgeEls[i], slide.rating);
            });
          })
          .catch(function (err) {
            console.error("[hero-carousel] live rating refresh failed", err);
          });
      })
      .catch(function (err) {
        console.error("[hero-carousel]", err);
        hideSkeleton();
        section.style.display = "none";
      });
  }

  // ---------------------------------------------------------
  // Loading skeleton — shown instantly on load, hidden once the
  // real carousel is fetched, rendered, and positioned.
  // ---------------------------------------------------------
  function renderSkeleton() {
    var el = document.createElement("div");
    el.className = "hero-skeleton";
    el.id = "heroSkeleton";
    var activeIdx = Math.floor(CONFIG.skeletonCount / 2);
    for (var i = 0; i < CONFIG.skeletonCount; i++) {
      var card = document.createElement("div");
      card.className = "hero-skeleton-card" + (i === activeIdx ? " is-active" : "");
      el.appendChild(card);
    }
    section.insertBefore(el, track);
    return el;
  }

  function hideSkeleton() {
    if (!skeletonEl) return;
    skeletonEl.classList.add("is-hidden");
    var el = skeletonEl;
    skeletonEl = null;
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 320);
  }

  // ---------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------
  function renderSlides() {
    track.innerHTML = "";
    ratingBadgeEls = [];
    cardEls = state.slides.map(function (slide, i) {
      var card = document.createElement("div");
      card.className = "hero-slide";
      card.dataset.index = i;

      var imgWrap = document.createElement("div");
      imgWrap.className = "hero-slide-imgwrap";

      var img = document.createElement("img");
      img.alt = slide.title || "";
      img.decoding = "async";
      img.loading = "lazy";
      img.draggable = false;
      img.src = slide.img;
      img.addEventListener(
        "load",
        function () {
          img.classList.add("loaded");
        },
        { once: true }
      );
      img.addEventListener("error", function () {
        card.classList.add("hero-slide-error");
      });
      imgWrap.appendChild(img);

      var badge = document.createElement("div");
      badge.className = "hero-rating";
      renderRatingBadge(badge, slide.rating);
      ratingBadgeEls[i] = badge;

      var overlay = document.createElement("div");
      overlay.className = "hero-slide-overlay";
      var title = document.createElement("div");
      title.className = "hero-slide-title";
      title.textContent = slide.title || "";
      overlay.appendChild(title);

      card.appendChild(imgWrap);
      card.appendChild(badge);
      card.appendChild(overlay);

      card.addEventListener("click", function (e) {
        onCardClick(e, i);
      });

      track.appendChild(card);
      return card;
    });
  }

  function renderRatingBadge(badge, rating) {
    badge.innerHTML = "";
    if (typeof rating === "number") {
      badge.style.display = "";
      var star = document.createElement("span");
      star.className = "hero-rating-star";
      star.textContent = "\u2605";
      badge.appendChild(star);
      badge.appendChild(document.createTextNode(" " + rating.toFixed(1)));
    } else {
      badge.style.display = "none";
    }
  }

  function renderDots() {
    dotsWrap.innerHTML = "";
    dotEls = state.slides.map(function (slide, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero-dot";
      dot.setAttribute("aria-label", "Go to slide " + (i + 1) + (slide.title ? ": " + slide.title : ""));
      dot.addEventListener("click", function () {
        goToSlide(i);
      });
      dotsWrap.appendChild(dot);
      return dot;
    });
    updateDots();
  }

  function updateDots() {
    for (var i = 0; i < dotEls.length; i++) {
      dotEls[i].classList.toggle("active", i === state.currentIndex);
    }
  }

  // ---------------------------------------------------------
  // Layout / positioning
  // ---------------------------------------------------------
  function measure() {
    if (!cardEls.length) return;
    var rect = cardEls[0].getBoundingClientRect();
    state.cardWidth = rect.width;
    state.spacing = rect.width * 0.62;
  }

  // Shortest signed distance from i to current on a circular track of length n
  function circularDiff(i, current, n) {
    var diff = i - current;
    if (diff > n / 2) diff -= n;
    if (diff < -n / 2) diff += n;
    return diff;
  }

  function updateSlider(withTransition) {
    var n = state.slides.length;
    if (!n) return;

    track.classList.toggle("dragging", !withTransition && state.isDragging);

    // Fraction of a card-width currently dragged (0 when not dragging).
    // Adding this to each card's integer distance gives a *continuous*
    // distance-from-center, so scale/opacity interpolate smoothly as the
    // finger moves instead of only snapping when currentIndex changes.
    // This is what makes the cards themselves visibly grow/shrink while
    // sweeping, rather than the whole row translating as a rigid strip.
    var dragFraction = state.spacing ? state.dragOffset / state.spacing : 0;

    for (var i = 0; i < cardEls.length; i++) {
      var card = cardEls[i];
      var baseDiff = circularDiff(i, state.currentIndex, n);
      var cdiff = baseDiff + dragFraction; // continuous (fractional) distance from center
      var absCdiff = Math.abs(cdiff);

      var x = cdiff * state.spacing;

      // Interpolate only across the first `sizeFalloff` card-widths so the
      // active card pops clearly against a *uniform* smaller/dimmer size for
      // every other visible card, rather than tapering size across all of them.
      var od = Math.min(absCdiff, CONFIG.sizeFalloff) / CONFIG.sizeFalloff;
      var scale = 1 - od * (1 - CONFIG.sideScale);
      var opacity = 1 - od * (1 - CONFIG.sideOpacity);

      if (absCdiff > CONFIG.visibleRange) {
        // Beyond the normal visible range (only reachable mid-drag, via
        // rubber-band over-drag): keep shrinking/fading toward 0 instead of
        // popping, so an entering/exiting card never snaps.
        var over = Math.min(1, (absCdiff - CONFIG.visibleRange) / 1.4);
        scale -= over * 0.15;
        opacity *= 1 - over;
      }

      var z = Math.round(100 - absCdiff * 10);
      var hidden = opacity <= 0.03;

      card.style.transform = "translate(-50%, -50%) translateX(" + x + "px) scale(" + scale + ")";
      card.style.opacity = opacity;
      card.style.zIndex = z;
      card.style.pointerEvents = hidden ? "none" : "auto";
      card.classList.toggle("active", absCdiff < 0.5);
    }

    updateDots();
  }

  // ---------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------
  function goToSlide(index) {
    var n = state.slides.length;
    if (!n || state.isAnimating || state.isDragging) return;
    var target = ((index % n) + n) % n;
    if (target === state.currentIndex) return;

    state.currentIndex = target;
    state.isAnimating = true;
    updateSlider(true);
    preloadNeighbors();

    clearTimeout(state.animTimeout);
    state.animTimeout = setTimeout(function () {
      state.isAnimating = false;
    }, CONFIG.transitionDuration);

    restartAutoplay();
  }

  function nextSlide() {
    goToSlide(state.currentIndex + 1);
  }

  function prevSlide() {
    goToSlide(state.currentIndex - 1);
  }

  function preloadNeighbors() {
    var n = state.slides.length;
    if (!n) return;
    var indices = [state.currentIndex, (state.currentIndex + 1) % n, (state.currentIndex - 1 + n) % n];
    indices.forEach(function (i) {
      var img = cardEls[i] && cardEls[i].querySelector("img");
      if (img && img.loading === "lazy") img.loading = "eager";
    });
  }

  function onCardClick(e, i) {
    if (state.wasDragged) {
      e.preventDefault();
      state.wasDragged = false;
      return;
    }
    if (i === state.currentIndex) {
      var url = state.slides[i] && state.slides[i].url;
      if (url) window.location.href = url;
    } else {
      goToSlide(i);
    }
  }

  // ---------------------------------------------------------
  // Autoplay
  // ---------------------------------------------------------
  function startAutoplay() {
    stopAutoplay();
    state.autoplayTimer = setInterval(function () {
      if (!state.isDragging && !document.hidden) nextSlide();
    }, CONFIG.autoplayDelay);
  }

  function stopAutoplay() {
    if (state.autoplayTimer) {
      clearInterval(state.autoplayTimer);
      state.autoplayTimer = null;
    }
  }

  function restartAutoplay() {
    if (state.slides.length > 1) startAutoplay();
  }

  // ---------------------------------------------------------
  // Pointer drag / swipe
  // ---------------------------------------------------------
  function handlePointerDown(e) {
    if (state.isAnimating || state.isDragging || !state.slides.length) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    state.isDragging = true;
    state.wasDragged = false;
    state.startX = e.clientX;
    state.currentX = e.clientX;
    state.dragOffset = 0;
    state.pointerId = e.pointerId;

    stopAutoplay();
    track.classList.add("dragging");
    try {
      track.setPointerCapture(e.pointerId);
    } catch (err) {
      /* no-op */
    }
  }

  function handlePointerMove(e) {
    if (!state.isDragging || e.pointerId !== state.pointerId) return;

    state.currentX = e.clientX;
    var offset = state.currentX - state.startX;

    // Light rubber-band resistance past the natural drag range
    var maxOffset = state.spacing * 1.35;
    if (offset > maxOffset) offset = maxOffset + (offset - maxOffset) * 0.25;
    if (offset < -maxOffset) offset = -maxOffset + (offset + maxOffset) * 0.25;

    state.dragOffset = offset;
    if (Math.abs(offset) > 5) state.wasDragged = true;

    updateSlider(false);
  }

  function handlePointerUp(e) {
    if (!state.isDragging || e.pointerId !== state.pointerId) return;

    state.isDragging = false;
    track.classList.remove("dragging");
    try {
      track.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* no-op */
    }

    var threshold = state.spacing * CONFIG.dragThresholdRatio;
    var offset = state.dragOffset;
    state.dragOffset = 0;

    if (offset <= -threshold) {
      nextSlide();
    } else if (offset >= threshold) {
      prevSlide();
    } else {
      updateSlider(true);
      restartAutoplay();
    }
  }

  function handlePointerCancel(e) {
    if (e.pointerId !== state.pointerId) return;
    state.isDragging = false;
    state.dragOffset = 0;
    track.classList.remove("dragging");
    updateSlider(true);
    restartAutoplay();
  }

  // ---------------------------------------------------------
  // Resize handling
  // ---------------------------------------------------------
  function onResize() {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(function () {
      measure();
      updateSlider(false);
    }, 150);
  }

  // ---------------------------------------------------------
  // Event binding
  // ---------------------------------------------------------
  function bindEvents() {
    track.addEventListener("pointerdown", handlePointerDown);
    track.addEventListener("pointermove", handlePointerMove);
    track.addEventListener("pointerup", handlePointerUp);
    track.addEventListener("pointercancel", handlePointerCancel);

    section.addEventListener("mouseenter", stopAutoplay);
    section.addEventListener("mouseleave", function () {
      if (!state.isDragging) restartAutoplay();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopAutoplay();
      else if (!state.isDragging) restartAutoplay();
    });

    window.addEventListener("resize", onResize);
  }

  loadSlides();
})();
