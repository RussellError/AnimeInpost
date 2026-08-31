let chFetchStatus = false;
const ChapterList = [];

async function loadChapters() {
    if (chFetchStatus) return;

    const script = document.getElementById("main-script");
    const url = script.dataset.titles;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to load chapter list (status ${res.status})`);
    }
    const data = await res.json();
    ChapterList.push(...data);

    chFetchStatus = true;
}

function disableStaticNavLink(link) {
    if (!link || link.classList.contains("disabled")) return;
    link.classList.add("disabled");
    link.setAttribute("aria-disabled", "true");
    link.removeAttribute("href");
    link.style.pointerEvents = "none";
    link.style.opacity = "0.4";
}

async function populateStaticNav() {
    const select = document.getElementById("chapter-select-static");
    const prevLink = document.getElementById("static-prev-link");
    const nextLink = document.getElementById("static-next-link");

    const overlayNav = document.querySelector(".change-ch");
    const overlayPrevLink = overlayNav ? overlayNav.querySelector("a:first-child") : null;
    const overlayNextLink = overlayNav ? overlayNav.querySelector("a:last-child") : null;

    if (!select && !prevLink && !nextLink && !overlayPrevLink && !overlayNextLink) return;

    try {
        await loadChapters();
    } catch (err) {
        console.error("There was a problem loading chapters:", err);
        if (select) select.innerHTML = `<option>Couldn't load chapters</option>`;
        return;
    }

    const currentChapter = Number(
        document.getElementById("main-script").dataset.index
    );

    if (select) {
        select.innerHTML = ChapterList.map(ch => `
            <option value="${ch.index}" ${ch.index == currentChapter ? "selected" : ""}>
                ${ch.title}
            </option>
        `).join("");

        select.addEventListener("change", () => {
            window.location.href = `./chapter-${select.value}`;
        });
    }

    const chapterExists = index => ChapterList.some(ch => ch.index == index);

    if (prevLink && !chapterExists(currentChapter - 1)) {
        disableStaticNavLink(prevLink);
    }

    if (nextLink && !chapterExists(currentChapter + 1)) {
        disableStaticNavLink(nextLink);
    }

    if (overlayPrevLink && !chapterExists(currentChapter - 1)) {
        disableStaticNavLink(overlayPrevLink);
    }

    if (overlayNextLink && !chapterExists(currentChapter + 1)) {
        disableStaticNavLink(overlayNextLink);
    }
}

document.addEventListener("DOMContentLoaded", populateStaticNav);

function renderChapterItem(ch, currentChapter) {
    return `
        <div class="chapter_item ${ch.index == currentChapter ? "active" : ""}">
            <a href="./chapter-${ch.index}">
                <p>${ch.title}</p>
            </a>
        </div>
    `;
}

async function openChapters() {
    const container = document.getElementById("chapter-search-reasult");
    if (!container) {
        console.error("Element #chapter-search-reasult not found.");
        return;
    }

    try {
        await loadChapters();
    } catch (err) {
        console.error("There was a problem loading chapters:", err);
        container.innerHTML = `<div class="chapter_item"><p>Couldn't load chapters. Please try again.</p></div>`;
        const panel = document.getElementById("chapters");
        if (panel) panel.style.display = "block";
        return;
    }

    const currentChapter = Number(
        document.getElementById("main-script").dataset.index
    );

    container.innerHTML = ChapterList
        .map(ch => renderChapterItem(ch, currentChapter))
        .join("");

    document.getElementById("chapters").style.display = "block";

    requestAnimationFrame(() => {
        const active = container.querySelector(".active");

        if (active) {
            active.scrollIntoView({
                behavior: "instant",
                block: "center"
            });
        }
    });
}

function findChapter() {
    const container = document.getElementById("chapter-search-reasult");
    const searchInput = document.getElementById("find-chapter");
    if (!container || !searchInput) return;

    const query = searchInput.value.trim().toLowerCase();
    const currentChapter = Number(
        document.getElementById("main-script").dataset.index
    );

    if (!query) {
        container.innerHTML = ChapterList
            .map(ch => renderChapterItem(ch, currentChapter))
            .join("");
        return;
    }

    const results = ChapterList.filter(ch =>
        ch.title.toLowerCase().includes(query)
    );

    if (results.length === 0) {
        container.innerHTML = `<div class="chapter_item"><p>Chapter not found</p></div>`;
        return;
    }

    container.innerHTML = results
        .map(ch => renderChapterItem(ch, currentChapter))
        .join("");
}

// Disable right-click
document.addEventListener("contextmenu", e => e.preventDefault());

// Disable copy, cut and text selection
["copy", "cut", "selectstart"].forEach(event => {
    document.addEventListener(event, e => e.preventDefault());
});

// Disable drag
document.addEventListener("dragstart", e => e.preventDefault());

// Disable common keyboard shortcuts
document.addEventListener("keydown", e => {
    const key = e.key.toLowerCase();

    if (
        e.key === "F12" ||
        (e.ctrlKey && ["a", "c", "u", "s", "x"].includes(key))
    ) {
        e.preventDefault();
    }
});

// Chapter-image space reservation — CSS reserves min-height for every
// panel image by default (present from the very first paint, so
// nothing below the images — reactions, comments — ever renders up
// at the top before jumping down). This script's only job is to mark
// each image .loaded once it actually finishes, which releases the
// reservation back to the image's real natural height.
(function initChapterImageLoadTracking() {
    function armImage(img) {
        // Already rendered (e.g. from cache) — release immediately,
        // no reservation needed
        if (img.complete && img.naturalHeight !== 0) {
            img.classList.add("loaded");
            return;
        }

        const markLoaded = () => img.classList.add("loaded");
        img.addEventListener("load", markLoaded, { once: true });
        img.addEventListener("error", markLoaded, { once: true });
    }

    function run() {
        document.querySelectorAll(".chapter-images img").forEach(armImage);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run);
    } else {
        run();
    }
})();

(function () {
    const menuBar = document.getElementById('menu-bar');
    const changeBar = document.querySelector('.change-ch');
    const readerArea = document.querySelector('.chapter-images');
    const chaptersPanel = document.getElementById('chapters');
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    const commentSection = document.getElementById('rcWrapper');

    if (!menuBar || !changeBar || !readerArea) return;

    let overlayVisible = false;
    let savedScrollY = 0;
    let lastScrollY = window.scrollY;
    let inCommentSection = false;

    // Prevents the scroll listener from fighting programmatic scroll
    // changes (scroll-to-top button, fullscreen enter/exit)
    let isProgrammaticScroll = false;
    let programmaticScrollTimeout = null;

    function updateArrowVisibility() {
        if (!scrollTopBtn) return;
        const shouldShow = overlayVisible || inCommentSection;
        scrollTopBtn.classList.toggle('visible', shouldShow);
    }

    function showOverlay() {
        menuBar.classList.add('visible');
        changeBar.classList.add('visible');
        overlayVisible = true;
        updateArrowVisibility();
    }

    function hideOverlay() {
        menuBar.classList.remove('visible');
        changeBar.classList.remove('visible');
        overlayVisible = false;
        updateArrowVisibility();
    }

    function toggleOverlay() {
        overlayVisible ? hideOverlay() : showOverlay();
    }

    // Lock the page in place so opening the panel can't shift/scroll it
    function lockBodyScroll() {
        savedScrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${savedScrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
    }

    // Unlock and restore exact scroll position
    function unlockBodyScroll() {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';

        // Explicit "instant" behavior overrides any CSS scroll-behavior:
        // smooth rule, so the page snaps back instead of visibly animating.
        window.scrollTo({ top: savedScrollY, left: 0, behavior: 'instant' });
    }

    function openChaptersPanel() {
        if (!chaptersPanel) {
            console.error("Element #chapters not found — chapter panel markup is missing from this page.");
            return;
        }
        lockBodyScroll();
        chaptersPanel.style.display = 'block';
    }

    function closeChaptersPanel() {
        if (chaptersPanel) chaptersPanel.style.display = 'none';
        unlockBodyScroll();
    }

    readerArea.addEventListener('click', function (e) {
        if (e.target.closest('a, button, input, textarea')) return;
        toggleOverlay();
    });

    const openChaptersBtn = menuBar.querySelector('a[onclick*="openChapters"]');
    if (openChaptersBtn) {
        openChaptersBtn.addEventListener('click', function () {
            openChaptersPanel();
            hideOverlay();
        });
    }

    if (chaptersPanel) {
        chaptersPanel.addEventListener('click', function (e) {
            const closeBtn = e.target.closest('.close-chapters-btn');
            const chapterLink = e.target.closest('a');

            if (closeBtn) {
                closeChaptersPanel();
                hideOverlay();
            } else if (chapterLink) {
                // Navigating to a chapter — no need to restore scroll
                hideOverlay();
            }
        });
    }

    // Hide overlay on scroll (up or down)
    let scrollTicking = false;
    window.addEventListener('scroll', function () {
        if (!scrollTicking) {
            window.requestAnimationFrame(function () {
                // Skip while auto-scrolling to top or transitioning
                // fullscreen — both fire scroll events we don't want
                // to treat as "the user scrolled"
                if (isProgrammaticScroll) {
                    scrollTicking = false;
                    return;
                }

                const currentScrollY = window.scrollY;
                if (overlayVisible && currentScrollY !== lastScrollY) {
                    hideOverlay();
                }
                lastScrollY = currentScrollY;
                scrollTicking = false;
            });
            scrollTicking = true;
        }
    }, { passive: true });

    // Track when comment section is in view — independent of overlay
    if (commentSection) {
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                inCommentSection = entry.isIntersecting;
                updateArrowVisibility();
            });
        }, { threshold: 0.1 });

        observer.observe(commentSection);
    }

    // Click arrow -> scroll to top
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', function () {
            isProgrammaticScroll = true;
            window.scrollTo({ top: 0, behavior: 'smooth' });

            clearTimeout(programmaticScrollTimeout);
            programmaticScrollTimeout = setTimeout(() => {
                isProgrammaticScroll = false;
                lastScrollY = window.scrollY;
            }, 800);
        });
    }

    // Fullscreen button (old <a href="#" onclick="requestFullscreen()">) —
    // intercept it to stop the "#" href from jumping to top, toggle
    // fullscreen on/off, keep the overlay visible throughout, and
    // prevent the viewport-resize jump caused by browser chrome
    // showing/hiding during the fullscreen transition.
    const fullscreenLink = menuBar.querySelector('a[onclick*="requestFullscreen"]');
    if (fullscreenLink) {
        fullscreenLink.addEventListener('click', function (e) {
            e.preventDefault();

            isProgrammaticScroll = true;
            clearTimeout(programmaticScrollTimeout);

            const wasOverlayVisible = overlayVisible;
            const scrollBefore = window.scrollY;

            function settle() {
                // Force scroll back to where the user actually was —
                // overrides the browser's own repositioning caused by
                // the address bar / nav bar appearing or disappearing
                window.scrollTo(0, scrollBefore);

                if (wasOverlayVisible) showOverlay();

                // Correct again a frame later — some browsers apply
                // their own scroll adjustment one frame late
                requestAnimationFrame(() => {
                    window.scrollTo(0, scrollBefore);
                    programmaticScrollTimeout = setTimeout(() => {
                        isProgrammaticScroll = false;
                        lastScrollY = window.scrollY;
                    }, 200);
                });
            }

            if (document.fullscreenElement) {
                document.exitFullscreen().finally(settle);
            } else {
                document.documentElement.requestFullscreen().finally(settle);
            }
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (chaptersPanel && chaptersPanel.style.display !== 'none') {
                closeChaptersPanel();
            }
            if (overlayVisible) hideOverlay();
        }
    });
})();
