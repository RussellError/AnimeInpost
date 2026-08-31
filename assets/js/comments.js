const API = "https://commentapi.animeinpost.workers.dev/";


/* =========================
   CREATE UNIQUE ID
   FROM CANONICAL URL
========================= */

function getPostId() {

    let canonical = document.querySelector(
        'link[rel="canonical"]'
    );

    let url = canonical
        ? canonical.href
        : window.location.href;


    return "page_" + btoa(url)
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

}


const postId = getPostId();



/* =========================
   ELEMENT REFERENCES
   (matches the rc- markup already in ch-1.html)
========================= */

const rcWrapper = document.getElementById("rcWrapper");
const nameInput = document.getElementById("rcNameInput");
const emailInput = document.getElementById("rcEmailInput");
const commentInput = document.getElementById("rcCommentInput");
const postBtn = document.getElementById("rcPostBtn");
const countLabel = document.getElementById("rcCommentsCount");
const sortButtons = document.querySelectorAll(".rc-sort-btn");

let currentSort = "newest";
let commentsCache = [];


/* =========================
   BUILD THE COMMENT LIST CONTAINER
   (not present in the HTML yet, so we create it once
   and drop it right after the comment form)
========================= */

let list = document.getElementById("rcCommentList");

if (!list && rcWrapper) {

    list = document.createElement("div");
    list.className = "rc-comment-list";
    list.id = "rcCommentList";

    rcWrapper.appendChild(list);

}



/* =========================
   LOAD COMMENTS
========================= */

async function loadComments(){

    if(!list) return;

    try {

        const res = await fetch(
            `${API}?postId=${encodeURIComponent(postId)}`
        );

        const data = await res.json();

        commentsCache = Array.isArray(data) ? data : [];

        renderList();

    } catch(err){

        console.log(
            "Comment load error:",
            err
        );

    }

}



/* =========================
   RENDER THE FULL LIST
   (tree building + sort + count)
========================= */

function renderList(){

    if(!list) return;

    list.innerHTML = "";

    // Build a tree: top-level comments + their replies
    const byId = {};
    commentsCache.forEach(c => byId[c.id] = { ...c, children: [] });

    const roots = [];

    commentsCache.forEach(c => {
        if (c.parentId && byId[c.parentId]) {
            byId[c.parentId].children.push(byId[c.id]);
        } else {
            roots.push(byId[c.id]);
        }
    });

    const sortFn = (a, b) => {
        const ta = getTime(a);
        const tb = getTime(b);
        return currentSort === "oldest" ? ta - tb : tb - ta;
    };

    roots.sort(sortFn);
    roots.forEach(c => c.children.sort(sortFn));

    roots.forEach(c => {
        list.appendChild(renderComment(c));
    });

    updateCount();

}


function getTime(c){

    const raw = c.createdAt || c.timestamp || c.time || c.date;
    const t = raw ? new Date(raw).getTime() : NaN;

    return isNaN(t) ? 0 : t;

}


function countAll(nodes){

    return nodes.reduce(
        (total, c) => total + 1 + countAll(c.children || []),
        0
    );

}


function updateCount(){

    if(!countLabel) return;

    const byId = {};
    commentsCache.forEach(c => byId[c.id] = { ...c, children: [] });

    const roots = [];

    commentsCache.forEach(c => {
        if (c.parentId && byId[c.parentId]) {
            byId[c.parentId].children.push(byId[c.id]);
        } else {
            roots.push(byId[c.id]);
        }
    });

    const total = countAll(roots);

    countLabel.textContent =
        `${total} Comment${total === 1 ? "" : "s"}`;

}



/* =========================
   RENDER A SINGLE COMMENT
   (+ its replies, recursively)
========================= */

function renderComment(c){

    const wrapper = document.createElement("div");
    wrapper.className = "rc-comment";

    const name = c.name || "Anonymous";
    const initial = name.trim().charAt(0).toUpperCase() || "?";
    const timeLabel = formatTime(getTime(c));

    wrapper.innerHTML = `
        <div class="rc-avatar">${escapeHTML(initial)}</div>

        <div class="rc-comment-body">

            <div class="rc-comment-meta">
                <span class="rc-comment-author">${escapeHTML(name)}</span>
                ${timeLabel ? `<span class="rc-comment-time">${escapeHTML(timeLabel)}</span>` : ""}
            </div>

            <div class="rc-comment-text">${escapeHTML(c.comment)}</div>

            <div class="rc-comment-actions">
                <button class="rc-comment-action reply-btn" type="button">Reply</button>
            </div>

            <div class="rc-comment-form reply-form" style="display:none;">
                <input type="text" class="rc-input reply-name" placeholder="Name (optional)" />
                <textarea class="rc-comment-input reply-text" placeholder="Write a reply..." rows="2"></textarea>
                <div class="rc-form-toolbar">
                    <button class="rc-post-btn reply-submit" type="button">Post Reply</button>
                </div>
            </div>

            <div class="rc-comment-replies"></div>

        </div>
    `;

    const replyBtn = wrapper.querySelector(".reply-btn");
    const replyForm = wrapper.querySelector(".reply-form");
    const replySubmit = wrapper.querySelector(".reply-submit");
    const repliesDiv = wrapper.querySelector(".rc-comment-replies");

    replyBtn.addEventListener("click", () => {
        replyForm.style.display =
            replyForm.style.display === "none" ? "block" : "none";
    });

    replySubmit.addEventListener("click", async () => {

        const replyName = wrapper.querySelector(".reply-name").value.trim();
        const replyText = wrapper.querySelector(".reply-text").value.trim();

        if(!replyText) return;

        replySubmit.disabled = true;

        await postComment(replyText, replyName, c.id, "");

        replySubmit.disabled = false;
        replyForm.style.display = "none";
        wrapper.querySelector(".reply-text").value = "";
        wrapper.querySelector(".reply-name").value = "";

    });

    // Recursively render replies
    (c.children || []).forEach(child => {
        repliesDiv.appendChild(renderComment(child));
    });

    return wrapper;

}


function formatTime(t){

    if(!t) return "";

    const diffSec = Math.round((Date.now() - t) / 1000);

    if (diffSec < 60) return "just now";

    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;

    return new Date(t).toLocaleDateString();

}



/* =========================
   POST COMMENT
========================= */

async function postComment(commentOverride, nameOverride, parentId = null, emailOverride){

    const name = nameOverride !== undefined
        ? nameOverride
        : nameInput?.value.trim();

    const comment = commentOverride !== undefined
        ? commentOverride
        : commentInput?.value.trim();

    const email = emailOverride !== undefined
        ? emailOverride
        : emailInput?.value.trim();


    if(!comment) return;


    try {

        await fetch(API,{

            method:"POST",

            headers:{
                "Content-Type":"application/json"
            },

            body:JSON.stringify({

                postId,

                name: name || "Anonymous",

                comment,

                parentId,

                email: email || ""

            })

        });


        // Only clear the top-level form if this wasn't a reply
        if (parentId === null) {
            if(nameInput) nameInput.value = "";
            if(commentInput) commentInput.value = "";
            if(emailInput) emailInput.value = "";
        }


        loadComments();


    }catch(err){

        console.log(
            "Comment post error:",
            err
        );

    }

}



/* =========================
   TOP-LEVEL POST BUTTON
========================= */

if (postBtn) {

    postBtn.addEventListener("click", async () => {

        const comment = commentInput?.value.trim();

        if(!comment) return;

        postBtn.disabled = true;

        await postComment(comment, nameInput?.value.trim(), null);

        postBtn.disabled = false;

    });

}



/* =========================
   SORT TOGGLE (Newest / Oldest)
========================= */

sortButtons.forEach(btn => {

    btn.addEventListener("click", () => {

        currentSort = btn.dataset.sort === "oldest" ? "oldest" : "newest";

        sortButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        renderList();

    });

});



/* =========================
   REACTIONS
========================= */

const REACTION_EMOJI = {
    upvote: "👍",
    funny: "😂",
    love: "❤️",
    surprised: "😲",
    angry: "😡",
    sad: "😢"
};

const reactionButtons = document.querySelectorAll(".rc-reaction-btn");
const totalCountLabel = document.getElementById("rcTotalCount");
const reactionStorageKey = `rc_reaction_${postId}`;

let reactionCounts = {};

function getSelectedReaction(){
    return localStorage.getItem(reactionStorageKey);
}

function setSelectedReaction(reaction){
    if(reaction){
        localStorage.setItem(reactionStorageKey, reaction);
    } else {
        localStorage.removeItem(reactionStorageKey);
    }
}

async function loadReactions(){

    if(!reactionButtons.length) return;

    try {

        const res = await fetch(
            `${API}?postId=${encodeURIComponent(postId)}&type=reactions`
        );

        reactionCounts = await res.json();

    } catch(err){

        console.log(
            "Reaction load error:",
            err
        );

        reactionCounts = {};

    }

    renderReactions();

}


function renderReactions(){

    const selected = getSelectedReaction();
    let total = 0;

    reactionButtons.forEach(btn => {

        const reaction = btn.dataset.reaction;
        const emojiEl = btn.querySelector(".rc-emoji");
        const countEl = btn.querySelector(".rc-count");
        const count = reactionCounts[reaction] || 0;

        total += count;

        if(emojiEl) emojiEl.textContent = REACTION_EMOJI[reaction] || "";
        if(countEl) countEl.textContent = count;

        btn.classList.toggle("selected", reaction === selected);

    });

    if(totalCountLabel){
        totalCountLabel.textContent =
            `${total} reaction${total === 1 ? "" : "s"}`;
    }

}


async function postReaction(reaction, delta){

    try {

        await fetch(API, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                postId,
                type: "reaction",
                reaction,
                delta
            })

        });

    } catch(err){

        console.log(
            "Reaction post error:",
            err
        );

    }

}


reactionButtons.forEach(btn => {

    btn.addEventListener("click", async () => {

        const reaction = btn.dataset.reaction;
        const previous = getSelectedReaction();

        if(previous === reaction){

            // Unselect current reaction
            reactionCounts[reaction] = Math.max(0, (reactionCounts[reaction] || 0) - 1);
            setSelectedReaction(null);
            renderReactions();
            await postReaction(reaction, -1);
            return;

        }

        if(previous){
            // Switch from a different reaction
            reactionCounts[previous] = Math.max(0, (reactionCounts[previous] || 0) - 1);
            await postReaction(previous, -1);
        }

        reactionCounts[reaction] = (reactionCounts[reaction] || 0) + 1;
        setSelectedReaction(reaction);
        renderReactions();
        await postReaction(reaction, 1);

    });

});



/* =========================
   SECURITY
========================= */

function escapeHTML(text){

    return String(text ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}



/* =========================
   START
========================= */

loadComments();
loadReactions();
