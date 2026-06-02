// ============================================================
// app.js — উদ্দীপ্ত তরুণ সংঘ · Full Application JS
// ============================================================
//
// TABLE OF CONTENTS (search by line number or section name)
//
//  Line   1  → Firebase imports & config (replace credentials here)
//  Line  53  → Shared variables (currentUser, currentRole, allTags…)
//  Line  71  → AUTH — login, logout, onAuthStateChanged, role helpers
//  Line 174  → COMMENT BOX close (closeCbBox)
//  Line 183  → COMMENT RENDERER — Facebook-style threaded tree
//  Line 325  → TAGS — loadTags(), saveTag()
//  Line 350  → INFINITE SCROLL — _setupScrollObserver, _loadMorePosts
//  Line 482  → LOAD POSTS — loadPosts(page), renderPosts, cardHtml
//  Line 776  → OPEN POST — full view modal
//  Line 862  → FLOATING COMMENT BOX — openComments, cbPostComment
//  Line 988  → COMMENT ACTIONS — pin, delete, report
//  Line 1056 → IN-MODAL COMMENTS — loadComments, postComment
//  Line 1167 → LIKES & SAVES — toggleLike, toggleSave, deletePost
//  Line 1343 → SEARCH — filterByTag, dropdowns, openSearch, runSearch
//  Line 1516 → PHONETIC SEARCH — Banglish→Bengali transliteration
//  Line 1900 → CREATE POST — openCreatePost, tag picker, submitPost
//  Line 2367 → DRAG & DROP image upload
//  Line 2398 → PROFILE MODAL — openProfile, tabs
//  Line 2602 → SAVED POSTS TAB
//  Line 2691 → MY POSTS TAB
//  Line 2827 → MEMBERS TAB — loadMembers, setRole, filterM
//  Line 2977 → REPORTS TAB — loadReports, dismiss, delete, block
//  Line 3367 → UTILS — closeModal, closeAllModals, toast, lightbox
//  Line 3433 → THEME SWITCHER — toggleTheme, applyTheme
//  Line 3463 → HISTORY / BACK BUTTON
//  Line 3582 → PIN POST — openPinModal, confirmPinPost, directUnpin
//
// ⚠️  TO CONFIGURE:
//   1. Line ~34  → Replace firebaseConfig with your credentials
//   2. Line ~1908 → Replace IMGBB_KEY with your ImgBB API key
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  increment,
  Timestamp,
  deleteField,
  limit,
  startAfter,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ✅ FIX 2: Firestore offline cache — repeat visits load instantly from IndexedDB
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  db = getFirestore(app); // fallback for private/incognito mode
}
const gp = new GoogleAuthProvider();

let currentUser = null,
  currentRole = "user",
  currentPage = "recent";
let unsubPosts = null,
  allMembers = [],
  allTags = [];
let _tagsLoaded = false,
  _membersLoaded = false,
  _srchLoaded = false;
let _tagColors = {},
  _pendingNewTag = "";
let _unsubCmList = null,
  _unsubCbList = null;
const _liking = new Set(),
  _saving = new Set();

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ── AUTH ──
window.loginWithGoogle = async () => {
  try {
    await signInWithPopup(auth, gp);
  } catch (e) {
    toast("Login failed: " + e.message, "error");
  }
};
window.logout = async () => {
  await signOut(auth);
  toast("লগআউট হয়েছে");
  closeAllModals();
};

// ✅ FIX 3: Load posts IMMEDIATELY on page load — don't block on auth.
// Posts are public and can be fetched without knowing who the user is.
// Auth fires separately and updates the UI (like/save state) after.
// Load posts immediately when page is ready — does NOT wait for auth
// (auth fires separately and re-renders with like/save state after)
window.addEventListener("load", () => loadPosts("recent"));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        photo: user.photoURL,
        role: "user",
        createdAt: serverTimestamp(),
        savedPosts: [],
      });
      currentRole = "user";
    } else currentRole = snap.data().role || "user";
    document.getElementById("loginBtn").style.display = "none";
    const pa = document.getElementById("profileArea");
    pa.style.display = "flex";
    const paImg = pa.querySelector(".pa-img");
    paImg.referrerPolicy = "no-referrer";
    paImg.src = user.photoURL || "";
    pa.querySelector(".pa-name").textContent =
      user.displayName?.split(" ")[0] || "";
  } else {
    currentRole = "user";
    _tagsLoaded = false;
    _membersLoaded = false;
    _srchLoaded = false;
    document.getElementById("loginBtn").style.display = "flex";
    document.getElementById("profileArea").style.display = "none";
  }
  updatePostBtn();
  // Re-render cards so like/save button states update for the newly logged-in user.
  // But ONLY if we have posts — avoid blanking the grid on tab switches where
  // _currentAllPosts is momentarily empty while loadPosts() hasn't finished yet.
  // Also avoid calling loadPosts() again here (that caused the activities tab bug).
  if (_currentAllPosts.length > 0) {
    renderPosts(_currentAllPosts);
  }
});

function updatePostBtn() {
  const b = document.getElementById("newPostBtn");
  if (b) b.style.display = canPost() ? "flex" : "none";
}
function isBlocked() {
  return currentRole === "blocked";
}
function canPost() {
  return ["maintainer", "admin"].includes(currentRole);
}
function canComment() {
  return currentUser && !isBlocked();
}
function canLikePost() {
  return currentUser && !isBlocked();
}
function canPinComment() {
  return ["maintainer", "admin"].includes(currentRole);
}
function canPinPost() {
  return ["maintainer", "admin"].includes(currentRole);
}
function isPinnedActive(p) {
  return (
    p.pinnedUntil && p.pinnedUntil.toDate && p.pinnedUntil.toDate() > new Date()
  );
}
function isPinnedUnlimited(p) {
  return isPinnedActive(p) && p.pinnedUntil.toDate().getFullYear() >= 9999;
}
function canDeleteComment(c) {
  if (!currentUser || isBlocked()) return false;
  if (["maintainer", "admin"].includes(currentRole)) return true;
  // user can delete their own comments
  return currentRole === "user" && c.authorId === currentUser.uid;
}
function canReportComment() {
  return !!currentUser;
} // all roles including blocked
// post delete: maintainer+admin full, user: no
function canDelete(p) {
  return (
    currentUser && (currentRole === "maintainer" || currentRole === "admin")
  );
}

// ── CLOSE FLOATING COMMENT BOX (must be window-scoped so inline onclick can reach it) ──
window.closeCbBox = () => {
  if (_unsubCbList) {
    _unsubCbList();
    _unsubCbList = null;
  }
  document.getElementById("commentBox").style.display = "none";
};

// ── SHARED COMMENT RENDERER (Facebook-style tree) ──
function _cmItemHtml(c, cid, pid, context, isReply, rootId) {
  const setReplyFn = context === "cb" ? "cbSetReply" : "cmSetReply";
  const pinnedBadge = c.pinned
    ? `<span class="cm-pin-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg></span>`
    : "";
  const acts = [];
  // When replying to a reply, target the root so it nests in the same thread
  const replyTargetId = rootId || cid;
  if (canComment())
    acts.push(
      `<button class="cm-act reply-btn" onclick="${setReplyFn}('${esc(c.authorName || "")}','${replyTargetId}','${esc(c.authorName || "")}')">রিপ্লাই</button>`,
    );
  if (canPinComment())
    acts.push(
      `<button class="cm-act cm-pin ${c.pinned ? "cm-pinned" : ""}" title="${c.pinned ? "আনপিন" : "পিন"}" onclick="togglePinComment('${pid}','${cid}',${!!c.pinned})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg></button>`,
    );
  if (canDeleteComment(c))
    acts.push(
      `<button class="cm-act cm-del" title="মুছুন" onclick="deleteComment('${pid}','${cid}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>`,
    );
  if (canReportComment())
    acts.push(
      `<button class="cm-act cm-rep" title="রিপোর্ট" onclick="reportComment('${pid}','${cid}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></button>`,
    );
  const avSize = isReply ? 24 : 28;
  return `<div class="cmi${c.pinned ? " cmi-pinned" : ""}" id="cmi-${cid}">
    <img src="${esc(c.authorPhoto || "")}" onerror="this.style.display='none'" style="width:${avSize}px;height:${avSize}px;border-radius:50%;object-fit:cover;flex-shrink:0;"/>
    <div class="cmi-body">
      <div class="cmi-bubble">
        <span class="cmi-name">${pinnedBadge}${esc(c.authorName || "")}</span>
        ${c.replyTo ? `<span class="cmi-mention">@${esc(c.replyTo)}</span>` : ""}
        <p>${esc(c.text || "")}</p>
      </div>
      <div class="cmi-meta">
        <span class="cmt">${tAgo(c.createdAt)}</span>
        ${acts.join("")}
      </div>
    </div>
  </div>`;
}

function renderCommentTree(docs, pid, context) {
  const dataMap = {},
    children = {},
    roots = [];
  docs.forEach((d) => {
    dataMap[d.id] = d.data();
    children[d.id] = [];
  });
  // Find true root: walk up replyToId chain until we hit a comment with no replyToId
  function findRoot(id, visited = new Set()) {
    if (!id || visited.has(id) || !dataMap[id]) return id;
    visited.add(id);
    const parent = dataMap[id].replyToId;
    return parent ? findRoot(parent, visited) : id;
  }
  docs.forEach((d) => {
    const parentId = d.data().replyToId;
    if (!parentId) {
      roots.push(d);
      return;
    }
    // Always nest under the true root thread
    const rootId = findRoot(parentId);
    if (rootId && dataMap[rootId]) children[rootId].push(d);
    else roots.push(d); // truly orphaned
  });
  // Deduplicate roots
  const rootIds = new Set();
  const dedupedRoots = roots.filter((d) => {
    if (rootIds.has(d.id)) return false;
    rootIds.add(d.id);
    return true;
  });
  dedupedRoots.sort((a, b) => (b.data().pinned | 0) - (a.data().pinned | 0));

  return dedupedRoots
    .map((d) => {
      const cid = d.id;
      const kids = children[cid] || [];
      let html = _cmItemHtml(d.data(), cid, pid, context, false);
      if (kids.length) {
        const repliesHtml = kids
          .map(
            (k) =>
              `<div class="cmi-thread">${_cmItemHtml(k.data(), k.id, pid, context, true, cid)}</div>`,
          )
          .join("");
        const label =
          kids.length === 1
            ? "১টি রিপ্লাই দেখুন"
            : `${kids.length}টি রিপ্লাই দেখুন`;
        // Use onclick="toggleReplies(this, N)" — passes the button itself,
        // finds the sibling .cmi-replies by DOM traversal instead of getElementById.
        // This survives onSnapshot re-renders that wipe innerHTML and create new nodes.
        html += `
        <button class="view-replies-btn" onclick="toggleReplies(this,${kids.length})">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          ${label}
        </button>
        <div class="cmi-replies" style="display:none">${repliesHtml}</div>`;
      }
      return `<div class="cmi-thread">${html}</div>`;
    })
    .join("");
}

window.toggleReplies = (btn, count) => {
  // Find the sibling .cmi-replies div by DOM traversal — survives innerHTML re-renders
  const box = btn.nextElementSibling;
  if (!box || !box.classList.contains("cmi-replies")) return;
  // Use data-open as source of truth — immune to CSS specificity issues
  const isOpen = box.dataset.open === "1";
  if (isOpen) {
    box.style.display = "none";
    box.dataset.open = "0";
  } else {
    box.style.cssText = "display:flex;flex-direction:column;gap:.3rem";
    box.dataset.open = "1";
  }
  const label = count === 1 ? "১টি রিপ্লাই দেখুন" : `${count}টি রিপ্লাই দেখুন`;
  btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="${isOpen ? "6 9 12 15 18 9" : "18 15 12 9 6 15"}"/></svg> ${isOpen ? label : "লুকান"}`;
};

// compat shim
function renderCommentItem(c, cid, pid, context) {
  return _cmItemHtml(c, cid, pid, context, false);
}
function sortComments(docs) {
  return [
    ...docs.filter((d) => d.data().pinned),
    ...docs.filter((d) => !d.data().pinned),
  ];
}

// ── TAGS ──
async function loadTags(force = false) {
  if (_tagsLoaded && !force) return;
  const snap = await getDocs(collection(db, "tags"));
  allTags = snap.docs.map((d) => d.data().name).filter(Boolean);
  snap.docs.forEach((d) => {
    if (d.data().color) _tagColors[d.data().name] = d.data().color;
  });
  _tagsLoaded = true;
}
async function saveTag(name, color = "") {
  const clean = name.trim().toLowerCase().replace(/\s+/g, "-");
  if (!clean || allTags.includes(clean)) return clean;
  await setDoc(doc(db, "tags", clean), {
    name: clean,
    color: color || "",
    createdBy: currentUser.uid,
    createdAt: serverTimestamp(),
  });
  allTags.push(clean);
  if (color) _tagColors[clean] = color;
  return clean;
}

// ── INFINITE SCROLL / PAGINATION ──
const PAGE_SIZE = 8;
let _lastDoc = null; // cursor for next page
let _allLoaded = false; // true when no more pages
let _loadingMore = false; // debounce guard
let _currentAllPosts = []; // all fetched posts for current tab (client-side merge)
let _scrollObserver = null;

function _destroyScrollObserver() {
  if (_scrollObserver) {
    _scrollObserver.disconnect();
    _scrollObserver = null;
  }
  const sentinel = document.getElementById("scrollSentinel");
  if (sentinel) sentinel.remove();
}

function _setupScrollObserver() {
  _destroyScrollObserver();
  const sentinel = document.createElement("div");
  sentinel.id = "scrollSentinel";
  sentinel.style.cssText = "height:1px;margin-top:1rem;";
  document.getElementById("postsGrid").after(sentinel);
  _scrollObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !_loadingMore && !_allLoaded) {
        _loadMorePosts();
      }
    },
    { rootMargin: "200px" },
  );
  _scrollObserver.observe(sentinel);
}

async function _loadMorePosts() {
  if (_loadingMore || _allLoaded) return;
  _loadingMore = true;

  const grid = document.getElementById("postsGrid");
  const shimmerEl = document.createElement("div");
  shimmerEl.id = "loadMoreShimmer";
  shimmerEl.style.cssText =
    "grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;";
  shimmerEl.innerHTML = Array(3).fill('<div class="shimmer"></div>').join("");
  grid.after(shimmerEl);

  try {
    const now = new Date();
    const monthStart = Timestamp.fromDate(
      new Date(now.getFullYear(), now.getMonth(), 1),
    );

    let q;
    if (currentPage === "recent") {
      q = query(
        collection(db, "posts"),
        where("createdAt", ">=", monthStart),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE),
        startAfter(_lastDoc),
      );
    } else {
      // No composite index — fetch all by date, filter by type client-side
      q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE * 3),
        startAfter(_lastDoc),
      );
    }

    const snap = await getDocs(q);
    if (!snap.docs.length) {
      _allLoaded = true;
      shimmerEl.remove();
      _loadingMore = false;
      return;
    }

    _lastDoc = snap.docs[snap.docs.length - 1];

    let newPosts = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    if (currentPage !== "recent") {
      newPosts = newPosts.filter((p) => p.type === currentPage);
    }
    if (newPosts.length < PAGE_SIZE) _allLoaded = true;

    const existingIds = new Set(_currentAllPosts.map((p) => p.id));
    const fresh = newPosts.filter((p) => !existingIds.has(p.id));
    _currentAllPosts = [..._currentAllPosts, ...fresh];
    _appendPosts(fresh);
  } catch (e) {
    console.error("loadMore error:", e);
  } finally {
    shimmerEl.remove();
    _loadingMore = false;
  }
}

function _appendPosts(posts) {
  if (!posts.length) return;
  const grid = document.getElementById("postsGrid");
  // Remove empty state if present
  const empty = grid.querySelector(".empty");
  if (empty) empty.remove();

  // Sort new batch: pinned first
  const pinned = posts.filter((p) => isPinnedActive(p));
  const rest = posts.filter((p) => !isPinnedActive(p));
  const sorted = [...pinned, ...rest];
  sorted.forEach((p) => {
    const div = document.createElement("div");
    div.innerHTML = cardHtml(p);
    while (div.firstChild) grid.appendChild(div.firstChild);
  });
}

// ── LOAD POSTS (initial, replaces old onSnapshot version) ──
window.loadPosts = async (page = currentPage) => {
  currentPage = page;
  document
    .querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.page === page));
  const titleMap = {
    recent: "সাম্প্রতিক · This Month",
    blog: "কার্যক্রম · Activities",
    guideline: "নির্দেশিকা · Guidelines",
  };
  const subtitleMap = {
    recent: "এই মাসের সাম্প্রতিক পোস্টসমূহ",
    blog: "সংগঠনের সকল কার্যক্রমের তালিকা",
    guideline: "সদস্যদের জন্য নির্দেশনা ও নিয়মাবলি",
  };
  const labelMap = {
    recent: "সাম্প্রতিক · LATEST",
    blog: "কার্যক্রম · ALL",
    guideline: "নির্দেশিকা · ALL",
  };
  const st = document.getElementById("sectionTitle");
  if (st) st.textContent = titleMap[page] || "Posts";
  const sd = document.getElementById("sectionDesc");
  if (sd) sd.textContent = subtitleMap[page] || "";
  const sl = document.getElementById("sectionLabel");
  if (sl) sl.textContent = labelMap[page] || "";

  // show sec-head for all pages
  const secHead = document.querySelector(".sec-head");
  if (secHead) secHead.style.display = "";

  // hide hero split content + feature boxes for non-recent tabs
  const heroSplit = document.querySelector(".hero-split");
  const heroFeatures = document.querySelector(".hero-features");
  if (heroSplit) heroSplit.style.display = page === "recent" ? "grid" : "none";
  if (heroFeatures)
    heroFeatures.style.display = page === "recent" ? "grid" : "none";
  // shrink hero to nav-only height on non-recent tabs
  const hero = document.querySelector(".hero");
  if (hero) {
    hero.style.paddingTop = page === "recent" ? "" : "0";
    hero.style.paddingBottom = page === "recent" ? "" : "0";
    hero.style.borderBottom = page === "recent" ? "" : "none";
    // Remove hero background for activities/guidelines; use main's bg color
    hero.style.background = page === "recent" ? "" : "var(--bg)";
    hero.style.backgroundImage = page === "recent" ? "" : "none";
    hero.classList.toggle("hero--flat", page !== "recent");
  }

  const grid = document.getElementById("postsGrid");
  grid.innerHTML = Array(6).fill('<div class="shimmer"></div>').join("");

  // Tear down previous subscription + pagination state
  if (unsubPosts) {
    unsubPosts();
    unsubPosts = null;
  }
  _destroyScrollObserver();
  _lastDoc = null;
  _allLoaded = false;
  _loadingMore = false;
  _currentAllPosts = [];

  await loadTags();

  const now = new Date();
  const monthStart = Timestamp.fromDate(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );

  // Fetch all posts with a simple single-field query (no composite index needed).
  // Filter by type/month client-side — fast because PAGE_SIZE is small.
  let firstQ;
  if (page === "recent") {
    firstQ = query(
      collection(db, "posts"),
      where("createdAt", ">=", monthStart),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE * 4),
    );
  } else {
    // Fetch recent posts without type filter, filter client-side — avoids composite index
    firstQ = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE * 4),
    );
  }

  try {
    const snap = await getDocs(firstQ);

    let posts = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // Client-side type filter for blog/guideline
    if (page !== "recent") {
      posts = posts.filter((p) => p.type === page);
    }

    _lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    if (posts.length < PAGE_SIZE) _allLoaded = true;

    // Fetch active pinned posts and prepend (recent tab only)
    if (page === "recent") {
      try {
        const pinnedSnap = await getDocs(
          query(
            collection(db, "posts"),
            where("pinnedUntil", "!=", null),
            orderBy("pinnedUntil", "desc"),
          ),
        );
        const pinned = pinnedSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => isPinnedActive(p));
        const pinnedIds = new Set(pinned.map((p) => p.id));
        posts = [...pinned, ...posts.filter((p) => !pinnedIds.has(p.id))];
      } catch (e) {
        /* pinnedUntil index may not exist yet — skip */
      }
    }

    // Deduplicate
    const seen = new Set();
    posts = posts.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    _currentAllPosts = posts;
    renderPosts(posts);

    // Real-time listener for NEW posts only (last 60s) — simple single-field query
    const recentThreshold = Timestamp.fromDate(new Date(Date.now() - 60000));
    unsubPosts = onSnapshot(
      query(
        collection(db, "posts"),
        where("createdAt", ">=", recentThreshold),
        orderBy("createdAt", "desc"),
      ),
      (snap2) => {
        let hasNew = false;
        snap2.docChanges().forEach((change) => {
          if (change.type === "added") {
            const p = {
              id: change.doc.id,
              ...change.doc.data(),
            };
            // Only add if it matches the current tab's type
            const matchesTab = page === "recent" ? true : p.type === page;
            if (matchesTab && !_currentAllPosts.find((x) => x.id === p.id)) {
              _currentAllPosts.unshift(p);
              hasNew = true;
            }
          }
        });
        if (hasNew) renderPosts(_currentAllPosts);
      },
    );

    _setupScrollObserver();
  } catch (e) {
    console.error("loadPosts error:", e);
    grid.innerHTML = '<div class="empty"><p>লোড করতে ব্যর্থ হয়েছে</p></div>';
  }
};

function tAgo(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts),
    s = (Date.now() - d) / 1000;
  if (s < 60) return "এইমাত্র";
  if (s < 3600) return Math.floor(s / 60) + "m আগে";
  if (s < 86400) return Math.floor(s / 3600) + "h আগে";
  return d.toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "short",
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mdToHtml(md) {
  if (!md) return "";
  let s = esc(md);
  // code blocks
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // headings
  s = s.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  s = s.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  s = s.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // horizontal rules
  s = s.replace(/^(?:[-*_ ]{3,})\s*$/gm, '<hr>');
  // bold+italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  // bold
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // italic
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');
  // strikethrough
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // images
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  // links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // task lists — must go before regular list items
  s = s.replace(/^[\t ]*[-*+] \[([ xX])\](.+)$/gm, (m, ch, txt) =>
    '<li style="list-style:none"><input type="checkbox" disabled' +
    (ch.trim() ? ' checked' : '') + '>' + txt.trim() + '</li>'
  );
  // unordered list items
  s = s.replace(/^[\t ]*[-*+] (.+)$/gm, '<li>$1</li>');
  // ordered list items
  s = s.replace(/^[\t ]*\d+\. (.+)$/gm, '<li>$1</li>');
  // wrap consecutive <li> in <ul> or <ol>
  s = s.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // blockquotes
  s = s.replace(/^>\s?(.+)$/gm, '<blockquote><p>$1</p></blockquote>');
  // paragraphs — wrap lines not in block elements
  let inBlock = false;
  s = s.split('\n').map(line => {
    if (/^<(h[1-6]|ul|ol|li|pre|code|blockquote|hr|div|table)/.test(line) || /^<\/(ul|ol|pre|blockquote)/.test(line)) {
      inBlock = /^<\/(ul|ol|pre|blockquote)>/.test(line) ? false : !/^<\/(h[1-6]|li)>/.test(line);
      return line;
    }
    if (/^<\/(h[1-6]|li)>/.test(line)) { inBlock = false; return line; }
    if (inBlock) return line;
    line = line.trim();
    if (!line) return '';
    // double newlines = paragraph break
    return '<p>' + line + '</p>';
  }).join('\n');
  // line breaks within paragraphs
  s = s.replace(/  \n/g, '<br>\n');
  return s;
}

function stripMd(md) {
  if (!md) return "";
  const html = mdToHtml(md);
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function renderExcerpt(md, maxLen) {
  if (!md) return "";
  let s = md;
  // strip block-level syntax (keep task/regular lists — handled later)
  s = s.replace(/```[\s\S]*?```/g, '');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/^(?:[-*_ ]{3,})\s*$/gm, '');
  s = s.replace(/^>\s?/gm, '');
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  // truncate at word boundary
  s = s.trim();
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  }
  // escape HTML then apply inline markdown
  s = esc(s);
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // task list checkbox
  s = s.replace(/^[\t ]*[-*+] \[([ xX])\](.*)$/gm, (m, ch, txt) =>
    '<span class="ex-task"><input type="checkbox" disabled' + (ch.trim() ? ' checked' : '') + '>' + txt.trim() + '</span>'
  );
  // strip remaining list markers
  s = s.replace(/^[\t ]*[-*+]\s+/gm, '');
  s = s.replace(/^[\t ]*\d+\.\s+/gm, '');
  return s;
}

function renderPosts(posts) {
  const grid = document.getElementById("postsGrid");
  if (!posts.length) {
    grid.innerHTML = `<div class="empty"><div style="font-size:2rem;margin-bottom:.5rem"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></div><p>কোনো পোস্ট নেই।</p></div>`;
    return;
  }
  // Sort: active pinned posts first, then by date
  const pinned = posts.filter((p) => isPinnedActive(p));
  const rest = posts.filter((p) => !isPinnedActive(p));
  grid.innerHTML = [...pinned, ...rest].map(cardHtml).join("");
}

function cardHtml(p) {
  const liked = currentUser && (p.likes || {})[currentUser.uid] === true;
  const saved = currentUser && (p.savedBy || []).includes(currentUser.uid);
  // ✅ FIX 5: Use thumbnail URLs in card feed — saves bandwidth for list views.
  // Full-size images are still used in lightbox via window._postImgs.
  const allImgs = [p.imageUrl, ...(p.images || [])].filter(Boolean);
  const allThumbs = [p.imageThumb || p.imageUrl, ...(p.imageThumbs || p.images || [])].filter(Boolean);
  const hasText = !!(p.body || "").trim();
  const hasImgs = allImgs.length > 0;
  const tagsHtml = (p.tags || [])
    .map((t) => _tagHtml(t, `event.stopPropagation();filterByTag('${esc(t)}')`))
    .join("");

  // Image layout: 1=full, 2=big+small, 3+=big+small+blur/count
  let imgBlock = "";
  if (hasImgs) {
    if (allImgs.length === 1) {
      imgBlock = `<div class="card-img-wrap ci-single" onclick="openPost('${p.id}')">
        <div class="ci-full" style="background-image:url('${esc(allThumbs[0] || allImgs[0])}')"></div>
      </div>`;
    } else if (allImgs.length === 2) {
      // Two images: big left + full-height right — no fake blurred 3rd panel
      imgBlock = `<div class="card-img-wrap ci-equal" onclick="openPost('${p.id}')">
        <div class="ci-main" style="background-image:url('${esc(allThumbs[0] || allImgs[0])}')"></div>
        <div class="ci-main" style="background-image:url('${esc(allThumbs[1] || allImgs[1])}')"></div>
      </div>`;
    } else {
      // 3+ images: big left + top-right + bottom-right (with count if >3)
      const extra = allImgs.length - 3;
      const ci_s2_overlay =
        extra > 0 ? `<div class="ci-overlay">+${extra}</div>` : "";
      imgBlock = `<div class="card-img-wrap" onclick="openPost('${p.id}')">
        <div class="ci-main" style="background-image:url('${esc(allThumbs[0] || allImgs[0])}')"></div>
        <div class="ci-side">
          <div class="ci-s1" style="background-image:url('${esc(allThumbs[1] || allImgs[1])}')"></div>
          <div class="ci-s2" style="background-image:url('${esc(allThumbs[2] || allImgs[2])}')">
            ${ci_s2_overlay}
          </div>
        </div>
      </div>`;
    }
  }

  const typeLabel =
    { blog: "কার্যক্রম", guideline: "নির্দেশিকা" }[p.type] || "কার্যক্রম";

  const isPostPinned = isPinnedActive(p);
  const pinExpiry = isPostPinned ? p.pinnedUntil.toDate() : null;
  const pinExpiryStr = pinExpiry
    ? isPinnedUnlimited(p)
      ? "♾"
      : tAgo({ toDate: () => pinExpiry })
    : "";
  const pinBadgeHtml = isPostPinned
    ? `<span class="pin-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg> পিন করা<span class="pin-expires">${pinExpiryStr}</span></span>`
    : "";

  return `<div class="card${isPostPinned ? " card-pinned" : ""}" onclick="openPost('${p.id}')">
    <div class="card-inner">
      <div class="card-meta-row">
        <div class="card-author-row">
          <img src="${esc(p.authorPhoto || "")}" class="card-av" onerror="this.style.display='none'"/>
          <span class="card-author">${esc(p.authorName || "")}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem">
          ${pinBadgeHtml}
          <span class="card-type-badge ct-${p.type || "blog"}">${typeLabel}</span>
        </div>
      </div>
      <h3 class="card-title">${esc(p.title || "")}</h3>
      ${hasText ? `<p class="card-excerpt">${renderExcerpt(p.body, 120)}</p>` : ""}
      ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ""}
    </div>
    ${imgBlock}
    <div class="card-footer-row">
      <span class="card-date"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${tAgo(p.createdAt)}</span>
      <span class="card-readtime"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${p.viewCount || 0}</span>
    </div>
    <div class="cact" onclick="event.stopPropagation()">
      <button class="ca ${liked ? "cal" : ""}" onclick="toggleLike('${p.id}',this)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
        ${p.likeCount ? `<span>${p.likeCount}</span>` : ""}
      </button>
      <button class="ca" onclick="openComments('${p.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        ${p.commentCount ? `<span>${p.commentCount}</span>` : ""}
      </button>
      <button class="ca ${saved ? "cas" : ""}" onclick="toggleSave('${p.id}',this)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
      ${canDelete(p) ? `<button class="ca ca-del" onclick="deletePost('${p.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ""}
    </div>
  </div>`;
}

// ── OPEN POST (full view) ──
window.openPost = async (id) => {
  // Cleanup any existing comment listener from a previously open post
  if (_unsubCmList) {
    _unsubCmList();
    _unsubCmList = null;
  }
  const snap = await getDoc(doc(db, "posts", id));
  if (!snap.exists()) return;
  const p = { id, ...snap.data() };
  // Deduplicate views: track seen posts in localStorage (persists across sessions)
  const viewKey = "viewed_" + id;
  const alreadySeen = localStorage.getItem(viewKey);
  if (!alreadySeen && currentUser && currentRole !== "blocked") {
    try {
      await updateDoc(doc(db, "posts", id), {
        viewCount: increment(1),
      });
    } catch (e) {}
    localStorage.setItem(viewKey, "1");
  }
  const liked = currentUser && (p.likes || {})[currentUser.uid] === true;
  const saved = currentUser && (p.savedBy || []).includes(currentUser.uid);
  // ✅ FIX 5: Use thumbnail URLs in card feed — saves bandwidth for list views.
  // Full-size images are still used in lightbox via window._postImgs.
  const allImgs = [p.imageUrl, ...(p.images || [])].filter(Boolean);
  const allThumbs = [p.imageThumb || p.imageUrl, ...(p.imageThumbs || p.images || [])].filter(Boolean);
  const typeLabel =
    { blog: "কার্যক্রম", guideline: "নির্দেশিকা" }[p.type] || "কার্যক্রম";
  const tagsHtml = (p.tags || [])
    .map((t) => _tagHtml(t, `filterByTag('${esc(t)}')`))
    .join("");

  // Store images globally so lightbox onclick can use index only (avoids JSON-in-HTML-attr issue)
  window._postImgs = allImgs;
  let imgHtml = "";
  if (allImgs.length === 1) {
    imgHtml = `<div class="pm-img-single" onclick="openLightbox(0)" style="background-image:url('${esc(allThumbs[0] || allImgs[0])}')"><div class="pm-img-hover"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></div></div>`;
  } else if (allImgs.length > 1) {
    imgHtml = `<div class="pm-gallery">${allImgs.map((u, i) => `<div class="pm-gimg" style="background-image:url('${esc(u)}')" onclick="openLightbox(${i})"><div class="pm-gimg-hover"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></div></div>`).join("")}</div>`;
  }

  document.getElementById("postModal").innerHTML = `
    <div class="mo" onclick="closeModal('postModal')"></div>
    <div class="mb pmb">
      <button class="mcl" onclick="closeModal('postModal')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      <div class="pm-bd">
        <div class="pm-meta">
          <span class="card-type-badge ct-${p.type || "blog"}">${typeLabel}</span>
          <span>${tAgo(p.createdAt)}</span><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${p.viewCount || 0}</span>
        </div>
        <h2 class="pm-title">${esc(p.title || "")}</h2>
        <div class="pm-auth">
          <img src="${esc(p.authorPhoto || "")}" onerror="this.style.display='none'"/>
          <span>${esc(p.authorName || "")}</span>
          <span class="pm-rb">${p.authorRole || "user"}</span>
        </div>
        ${p.body != null ? `<div class="pm-txt md-body" id="pmBody"></div>` : ""}
        ${tagsHtml ? `<div class="card-tags" style="margin-top:.75rem">${tagsHtml}</div>` : ""}
        ${imgHtml}
        <div class="pm-acts">
          <button class="pill ${liked ? "pla" : ""}" onclick="toggleLike('${id}',this)" style="display:inline-flex;align-items:center;gap:.35rem"><svg width="13" height="13" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> Like ${p.likeCount || 0}</button>
          <button class="pill ${saved ? "psa" : ""}" onclick="toggleSave('${id}',this)" style="display:inline-flex;align-items:center;gap:.35rem"><svg width="13" height="13" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Save</button>
          ${canDelete(p) ? `<button class="pill pill-del" onclick="deletePost('${id}');closeModal('postModal')" style="display:inline-flex;align-items:center;gap:.35rem"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> মুছুন</button>` : ""}
          ${canPinPost() ? `<button class="pill pill-pin${isPinnedActive(p) ? " pill-pin-active pill-unpin" : ""}" data-pin-id="${id}" onclick="${isPinnedActive(p) ? `directUnpin('${id}')` : `openPinModal('${id}',false)`}" style="display:inline-flex;align-items:center;gap:.35rem"><svg width="13" height="13" viewBox="0 0 24 24" fill="${isPinnedActive(p) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg> ${isPinnedActive(p) ? "আনপিন করুন" : "পিন করুন"}</button>` : ""}
        </div>
        <div class="cmw">
          <h4>মন্তব্য · Comments</h4>
          <div id="cmList"></div>
          ${
            currentUser
              ? `<div class="cmf"><img src="${esc(currentUser.photoURL || "")}" onerror="this.style.display='none'"/>
               <input id="cmIn" placeholder="মন্তব্য লিখুন…" onkeydown="if(event.key==='Enter')postComment('${id}')"/>
               <button onclick="postComment('${id}')">Post</button></div>`
              : '<p class="cmt-h">মন্তব্য করতে লগইন করুন</p>'
          }
        </div>
      </div>
    </div>`;
  const pmBody = document.getElementById("pmBody");
  if (pmBody) pmBody.innerHTML = mdToHtml(p.body || "");
  document.getElementById("postModal").style.display = "flex";
  _pushModal("postModal");
  loadComments(id);
};

// ── FLOATING COMMENT BOX ──
window.openComments = async (id) => {
  const snap = await getDoc(doc(db, "posts", id));
  if (!snap.exists()) return;
  const p = snap.data();
  const box = document.getElementById("commentBox");
  const formHtml = canComment()
    ? `<div class="cb-form">
         <img src="${esc(currentUser.photoURL || "")}" onerror="this.style.display='none'"/>
         <input id="cbInput" placeholder="মন্তব্য লিখুন…" onkeydown="if(event.key==='Enter')cbPostComment('${id}')"/>
         <button onclick="cbPostComment('${id}')" title="পাঠান"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
       </div>`
    : currentUser
      ? '<p class="cmt-h cmt-blocked"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> আপনি ব্লক আছেন</p>'
      : '<p class="cmt-h">মন্তব্য করতে লগইন করুন</p>';
  box.innerHTML = `
    <div class="cb-header">
      <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> ${esc(p.title || "Comments")}</span>
      <button class="cb-close-btn" onclick="closeCbBox()" title="বন্ধ করুন"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="cb-list" id="cbList"></div>
    ${formHtml}`;
  box.style.display = "flex";
  _pushModal("commentBox");
  if (_unsubCbList) {
    _unsubCbList();
    _unsubCbList = null;
  }
  _unsubCbList = onSnapshot(
    query(collection(db, "posts", id, "comments"), orderBy("createdAt", "asc")),
    (snap) => {
      const list = document.getElementById("cbList");
      if (!list) return;
      if (snap.empty) {
        list.innerHTML = '<p class="cmt-h">কোনো মন্তব্য নেই</p>';
        return;
      }
      list.innerHTML = renderCommentTree(snap.docs, id, "cb");
      list.scrollTop = list.scrollHeight;
    },
  );
};

let _cbReplyTo = "";
let _cbReplyToId = "";
window.cbSetReply = (name, cid, mentionName) => {
  _cbReplyTo = name;
  _cbReplyToId = cid || "";
  const displayName = mentionName || name;
  const inp = document.getElementById("cbInput");
  if (inp) {
    inp.placeholder = "রিপ্লাই লিখুন…";
    inp.focus();
  }
  const form = document.querySelector(".cb-form");
  if (form) {
    let chip = form.querySelector(".reply-chip");
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "reply-chip";
      form.parentNode.insertBefore(chip, form);
    }
    chip.innerHTML = `<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> <strong>${esc(displayName)}</strong> কে রিপ্লাই</span><button onclick="cbCancelReply()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
  }
};
window.cbCancelReply = () => {
  _cbReplyTo = "";
  _cbReplyToId = "";
  const chip = document.querySelector(".cb-form")?.previousElementSibling;
  if (chip?.classList.contains("reply-chip")) chip.remove();
  const inp = document.getElementById("cbInput");
  if (inp) {
    inp.placeholder = "মন্তব্য লিখুন…";
    inp.value = "";
    inp.focus();
  }
};
window.cbPostComment = async (pid) => {
  if (!canComment()) {
    toast("আপনি ব্লক আছেন", "error");
    return;
  }
  const inp = document.getElementById("cbInput");
  const txt = inp?.value?.trim();
  if (!txt) return;
  if (txt.length > 2000) {
    toast("মন্তব্য ২০০০ অক্ষরের বেশি হতে পারবে না", "error");
    return;
  }
  const replyTo = _cbReplyTo;
  const replyToId = _cbReplyToId;
  cbCancelReply();
  inp.disabled = true;
  try {
    await addDoc(collection(db, "posts", pid, "comments"), {
      text: txt,
      authorId: currentUser.uid,
      authorName: currentUser.displayName,
      authorPhoto: currentUser.photoURL,
      replyTo: replyTo || null,
      replyToId: replyToId || null,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "posts", pid), {
      commentCount: increment(1),
    });
  } catch (e) {
    toast("মন্তব্য পাঠানো যায়নি", "error");
    if (inp) {
      inp.value = txt;
    }
    if (replyTo) {
      _cbReplyTo = replyTo;
      _cbReplyToId = replyToId;
      cbSetReply(replyTo, replyToId, replyTo);
    }
  } finally {
    if (inp) inp.disabled = false;
  }
};

// ── COMMENT ACTIONS ──
window.togglePinComment = async (pid, cid, isPinned) => {
  if (!canPinComment()) return;
  try {
    await updateDoc(doc(db, "posts", pid, "comments", cid), {
      pinned: !isPinned,
    });
    toast(isPinned ? "পিন সরানো হয়েছে" : "পিন করা হয়েছে");
  } catch (e) {
    toast("পিন করা যায়নি", "error");
  }
};

window.deleteComment = async (pid, cid) => {
  if (!currentUser) return;
  if (!confirm("এই মন্তব্য মুছে দেবেন?")) return;
  try {
    await deleteDoc(doc(db, "posts", pid, "comments", cid));
    await updateDoc(doc(db, "posts", pid), {
      commentCount: increment(-1),
    });
    toast("মন্তব্য মুছে গেছে");
  } catch (e) {
    toast("মুছতে পারা যায়নি", "error");
  }
};

window.reportComment = async (pid, cid) => {
  if (!currentUser) {
    toast("লগইন করুন", "error");
    return;
  }
  if (!confirm("এই মন্তব্যটি রিপোর্ট করবেন?")) return;
  try {
    // Snapshot comment content now so history is preserved if comment is later deleted
    let commentText = "",
      commentAuthor = "",
      commentPhoto = "",
      authorId = "";
    try {
      const cmSnap = await getDoc(doc(db, "posts", pid, "comments", cid));
      if (cmSnap.exists()) {
        const cd = cmSnap.data();
        commentText = cd.text || "";
        commentAuthor = cd.authorName || "";
        commentPhoto = cd.authorPhoto || "";
        authorId = cd.authorId || "";
      }
    } catch (e2) {}
    await addDoc(collection(db, "reports"), {
      type: "comment",
      pid,
      cid,
      reportedBy: currentUser.uid,
      reportedAt: serverTimestamp(),
      commentText,
      commentAuthor,
      commentPhoto,
      authorId,
    });
    toast("রিপোর্ট পাঠানো হয়েছে");
  } catch (e) {
    toast("রিপোর্ট করা যায়নি", "error");
  }
};

window.loadComments = (pid) => {
  const list = document.getElementById("cmList");
  if (!list) return;
  if (_unsubCmList) {
    _unsubCmList();
    _unsubCmList = null;
  }
  _unsubCmList = onSnapshot(
    query(
      collection(db, "posts", pid, "comments"),
      orderBy("createdAt", "asc"),
    ),
    (snap) => {
      if (!document.getElementById("cmList")) return;
      if (snap.empty) {
        list.innerHTML = '<p class="cmt-h">কোনো মন্তব্য নেই</p>';
        return;
      }
      list.innerHTML = renderCommentTree(snap.docs, pid, "cm");
    },
  );
};

let _cmReplyTo = "";
let _cmReplyToId = "";
window.cmSetReply = (name, cid, mentionName) => {
  _cmReplyTo = name;
  _cmReplyToId = cid || "";
  const displayName = mentionName || name;
  const inp = document.getElementById("cmIn");
  if (inp) {
    inp.placeholder = "রিপ্লাই লিখুন…";
    inp.focus();
  }
  const form = document.querySelector(".cmf");
  if (form) {
    let chip = form.querySelector(".reply-chip");
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "reply-chip";
      form.parentNode.insertBefore(chip, form);
    }
    chip.innerHTML = `<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> <strong>${esc(displayName)}</strong> কে রিপ্লাই</span><button onclick="cmCancelReply()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
  }
};
window.cmCancelReply = () => {
  _cmReplyTo = "";
  _cmReplyToId = "";
  const form = document.querySelector(".cmf");
  const chip = form?.previousElementSibling;
  if (chip?.classList.contains("reply-chip")) chip.remove();
  const inp = document.getElementById("cmIn");
  if (inp) {
    inp.placeholder = "মন্তব্য লিখুন…";
    inp.value = "";
    inp.focus();
  }
};
window.postComment = async (pid) => {
  if (!canComment()) {
    toast(currentUser ? "আপনি ব্লক আছেন" : "লগইন করুন", "error");
    return;
  }
  const inp = document.getElementById("cmIn");
  const txt = inp?.value?.trim();
  if (!txt) return;
  if (txt.length > 2000) {
    toast("মন্তব্য ২০০০ অক্ষরের বেশি হতে পারবে না", "error");
    return;
  }
  const replyTo = _cmReplyTo;
  const replyToId = _cmReplyToId;
  cmCancelReply();
  inp.disabled = true;
  try {
    await addDoc(collection(db, "posts", pid, "comments"), {
      text: txt,
      authorId: currentUser.uid,
      authorName: currentUser.displayName,
      authorPhoto: currentUser.photoURL,
      replyTo: replyTo || null,
      replyToId: replyToId || null,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "posts", pid), {
      commentCount: increment(1),
    });
  } catch (e) {
    toast("মন্তব্য পাঠানো যায়নি", "error");
    if (inp) {
      inp.value = txt;
    }
    // restore reply context so user can try again
    if (replyTo) {
      _cmReplyTo = replyTo;
      _cmReplyToId = replyToId;
      cmSetReply(replyTo, replyToId, replyTo);
    }
  } finally {
    if (inp) inp.disabled = false;
  }
};

// ── LIKES & SAVES ──
window.toggleLike = async (id, btn) => {
  if (!currentUser) {
    toast("লাইক দিতে লগইন করুন", "error");
    return;
  }
  if (isBlocked()) {
    toast("আপনি ব্লক আছেন", "error");
    return;
  }
  if (_liking.has(id)) return;
  _liking.add(id);
  const wasLiked =
    btn?.classList.contains("cal") || btn?.classList.contains("pla");
  btn?.classList.toggle("cal", !wasLiked);
  btn?.classList.toggle("pla", !wasLiked);
  // Optimistically update SVG fill and like count text
  if (btn) {
    const svg = btn.querySelector("svg");
    if (svg) svg.setAttribute("fill", wasLiked ? "none" : "currentColor");
    // card button: anonymous <span> holds the count
    const countSpan = btn.querySelector("span:not(.lc)");
    if (countSpan && !isNaN(parseInt(countSpan.textContent))) {
      const cur = parseInt(countSpan.textContent) || 0;
      const next = wasLiked ? cur - 1 : cur + 1;
      if (next > 0) countSpan.textContent = next;
      else countSpan.remove();
    } else {
      // modal pill button: text node "Like N"
      for (const node of btn.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim().startsWith("Like")) {
          const cur = parseInt(node.textContent.replace(/\D/g, "")) || 0;
          node.textContent = ` Like ${wasLiked ? cur - 1 : cur + 1}`;
          break;
        }
      }
    }
  }
  try {
    const likesUpdate = wasLiked
      ? {
          [`likes.${currentUser.uid}`]: deleteField(),
          likeCount: increment(-1),
        }
      : {
          [`likes.${currentUser.uid}`]: true,
          likeCount: increment(1),
        };
    await updateDoc(doc(db, "posts", id), likesUpdate);
  } catch (e) {
    btn?.classList.toggle("cal", wasLiked);
    btn?.classList.toggle("pla", wasLiked);
    if (btn) {
      const svg = btn.querySelector("svg");
      if (svg) svg.setAttribute("fill", wasLiked ? "currentColor" : "none");
      const countSpan = btn.querySelector("span:not(.lc)");
      if (countSpan && !isNaN(parseInt(countSpan.textContent))) {
        countSpan.textContent = wasLiked
          ? parseInt(countSpan.textContent) + 1
          : parseInt(countSpan.textContent) - 1;
      } else {
        for (const node of btn.childNodes) {
          if (
            node.nodeType === 3 &&
            node.textContent.trim().startsWith("Like")
          ) {
            const cur = parseInt(node.textContent.replace(/\D/g, "")) || 0;
            node.textContent = ` Like ${wasLiked ? cur + 1 : cur - 1}`;
            break;
          }
        }
      }
    }
    toast("ত্রুটি হয়েছে", "error");
  } finally {
    _liking.delete(id);
  }
};
window.toggleSave = async (id, btn) => {
  if (!currentUser) {
    toast("সেভ করতে লগইন করুন", "error");
    return;
  }
  if (_saving.has(id)) return;
  _saving.add(id);
  const wasSaved =
    btn?.classList.contains("cas") || btn?.classList.contains("psa");
  btn?.classList.toggle("cas", !wasSaved);
  btn?.classList.toggle("psa", !wasSaved);
  try {
    const pr = doc(db, "posts", id),
      ur = doc(db, "users", currentUser.uid);
    await updateDoc(pr, {
      savedBy: wasSaved
        ? arrayRemove(currentUser.uid)
        : arrayUnion(currentUser.uid),
    });
    await updateDoc(ur, {
      savedPosts: wasSaved ? arrayRemove(id) : arrayUnion(id),
    });
    toast(wasSaved ? "সেভ সরানো হয়েছে" : "সেভ হয়েছে");
  } catch (e) {
    btn?.classList.toggle("cas", wasSaved);
    btn?.classList.toggle("psa", wasSaved);
    toast("ত্রুটি হয়েছে", "error");
  } finally {
    _saving.delete(id);
  }
};
window.deletePost = async (id) => {
  if (!currentUser) {
    toast("লগইন করুন", "error");
    return;
  }
  // Fetch post to verify permissions
  const pSnap = await getDoc(doc(db, "posts", id));
  if (!pSnap.exists()) {
    toast("পোস্ট পাওয়া যায়নি", "error");
    return;
  }
  const pData = pSnap.data();
  if (!canDelete({ ...pData, id })) {
    toast("আপনার অনুমতি নেই", "error");
    return;
  }
  if (!confirm("এই পোস্ট মুছে দেবেন?")) return;
  try {
    const cmSnap = await getDocs(collection(db, "posts", id, "comments"));
    // Delete comments one-by-one; ignore individual failures so the post itself still deletes
    await Promise.allSettled(cmSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "posts", id));
    _srchLoaded = false; // invalidate search cache
    // Remove card from DOM immediately (no listener fires for deletes)
    document
      .querySelectorAll(`.card[onclick*="'${id}'"]`)
      .forEach((el) => el.remove());
    _currentAllPosts = _currentAllPosts.filter((p) => p.id !== id);
    // Show empty state if grid is now empty
    const grid = document.getElementById("postsGrid");
    if (grid && !grid.querySelector(".card")) {
      grid.innerHTML = `<div class="empty"><div style="font-size:2rem;margin-bottom:.5rem"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></div><p>কোনো পোস্ট নেই।</p></div>`;
    }
    toast("পোস্ট মুছে গেছে");
  } catch (e) {
    toast("মুছতে পারা যায়নি", "error");
  }
};

// ── SEARCH ──
window.filterByTag = async (tag) => {
  await openSearch();
  if (tag && !window._srchTagVals.includes(tag)) {
    window._srchTagVals.push(tag);
    _updateSrchTagBtn();
    _buildSrchTagDd();
    runSearch();
  }
};

// ── CUSTOM SEARCH DROPDOWNS ──
window._srchTagVals = [];
window._srchSortVal = "newest";

function _buildSrchTagDd() {
  const dd = document.getElementById("srchTagDd");
  if (!dd) return;
  const none = window._srchTagVals.length === 0;
  dd.innerHTML =
    `<div class="srch-dd-item srch-dd-clear${none ? " srch-dd-active" : ""}" data-val="" onclick="setSrchTag('',this)">
      ${none ? '<span class="srch-dd-chk"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' : '<span class="srch-dd-chk" style="opacity:0">✓</span>'}সব ট্যাগ
    </div>` +
    allTags
      .map((t) => {
        const c = _tagColors[t];
        const dotStyle = c
          ? `background:${c};`
          : "background:rgba(255,255,255,.25);";
        const sel = window._srchTagVals.includes(t);
        return `<div class="srch-dd-item${sel ? " srch-dd-tag-sel" : ""}" data-val="${t}" onclick="setSrchTag('${t}',this)">
          <span class="srch-dd-dot" style="${dotStyle}"></span>
          <span style="flex:1;min-width:0;">#${t}</span>
          <span class="srch-dd-chk" style="opacity:${sel ? 1 : 0}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
        </div>`;
      })
      .join("");
}

function _updateSrchTagBtn() {
  const btn = document.querySelector("#srchTagWrap .srch-custom-sel-btn");
  if (!btn) return;
  const vals = window._srchTagVals;
  if (!vals.length) {
    btn.innerHTML = `<span id="srchTagLabel">সব ট্যাগ</span><span class="srch-sel-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>`;
  } else {
    const chips = vals
      .map((t) => {
        const c = _tagColors[t];
        const sty = c
          ? `color:${c};background:${c}18;border-color:${c}44;`
          : "";
        return `<span class="srch-tag-chip" style="${sty}">#${t}</span>`;
      })
      .join("");
    btn.innerHTML = `<span id="srchTagLabel" class="srch-tag-chips-wrap">${chips}</span><span class="srch-sel-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>`;
  }
}

window.setSrchTag = (val, el) => {
  if (!val) {
    window._srchTagVals = [];
    const dd = document.getElementById("srchTagDd");
    if (dd) dd.style.display = "none";
  } else {
    const idx = window._srchTagVals.indexOf(val);
    if (idx >= 0) window._srchTagVals.splice(idx, 1);
    else window._srchTagVals.push(val);
  }
  _updateSrchTagBtn();
  _buildSrchTagDd();
  runSearch();
};

window.setSrchSort = (val, label, el) => {
  window._srchSortVal = val;
  const lbl = document.getElementById("srchSortLabel");
  if (lbl) lbl.textContent = label;
  document
    .querySelectorAll("#srchSortDd .srch-dd-item")
    .forEach((i) =>
      i.classList.toggle("srch-dd-active", i.dataset.val === val),
    );
  const dd = document.getElementById("srchSortDd");
  if (dd) dd.style.display = "none";
  runSearch();
};

window.toggleSrchDd = (which, e) => {
  if (e) e.stopPropagation();
  const tagDd = document.getElementById("srchTagDd");
  const sortDd = document.getElementById("srchSortDd");
  if (which === "tag") {
    const open = tagDd.style.display !== "none";
    tagDd.style.display = open ? "none" : "block";
    if (sortDd) sortDd.style.display = "none";
  } else {
    const open = sortDd.style.display !== "none";
    sortDd.style.display = open ? "none" : "block";
    if (tagDd) tagDd.style.display = "none";
  }
};

// Close search custom dropdowns on outside click
document.addEventListener("click", (e) => {
  if (!e.target.closest("#srchTagWrap")) {
    const d = document.getElementById("srchTagDd");
    if (d) d.style.display = "none";
  }
  if (!e.target.closest("#srchSortWrap")) {
    const d = document.getElementById("srchSortDd");
    if (d) d.style.display = "none";
  }
});

let _srchType = "",
  _srchAllPosts = [];
window.openSearch = async () => {
  document.getElementById("searchModal").style.display = "flex";
  _pushModal("searchModal");
  setTimeout(() => document.getElementById("srchMain")?.focus(), 50);
  if (!_srchLoaded) {
    const snap = await getDocs(
      query(collection(db, "posts"), orderBy("createdAt", "desc")),
    );
    _srchAllPosts = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    _srchLoaded = true;
    await loadTags();
    _buildSrchTagDd();
  }
  runSearch();
};
window.closeSearch = () => {
  document.getElementById("searchModal").style.display = "none";
  // Reset all filters so next open is clean
  _srchType = "";
  window._srchTagVals = [];
  window._srchSortVal = "newest";
  const monthEl = document.getElementById("srchMonth");
  if (monthEl) monthEl.value = "";
  const mainEl = document.getElementById("srchMain");
  if (mainEl) mainEl.value = "";
  const clrBtn = document.getElementById("srchClrBtn");
  if (clrBtn) clrBtn.style.display = "none";
};
window.setSrchType = (btn, val) => {
  _srchType = val;
  document
    .querySelectorAll("#typeFilters .srch-pill")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  runSearch();
};
window.clearSearch = () => {
  document.getElementById("srchMain").value = "";
  document.getElementById("srchClrBtn").style.display = "none";
  runSearch();
};

// ── PHONETIC / BANGLISH SEARCH ENGINE ──
// Converts Banglish (Bengali typed in English) to Unicode Bengali for search
const _phoneticMap = [
  // Digraphs first (longest match priority)
  ["ksh", "ক্ষ"],
  ["kkh", "ক্ষ"],
  ["sht", "ষ্ট"],
  ["shth", "ষ্ঠ"],
  ["ngg", "ঙ্গ"],
  ["ngh", "ঙ"],
  ["rri", "ঋ"],
  ["rr", "ড়"],
  ["shh", "শ"],
  ["sh", "শ"],
  ["Sh", "ষ"],
  ["kh", "খ"],
  ["gh", "ঘ"],
  ["ch", "চ"],
  ["jh", "ঝ"],
  ["Th", "ঠ"],
  ["Dh", "ঢ"],
  ["th", "থ"],
  ["dh", "ধ"],
  ["ph", "ফ"],
  ["bh", "ভ"],
  ["ng", "ং"],
  ["oo", "উ"],
  ["ee", "ই"],
  ["aa", "আ"],
  ["ii", "ই"],
  ["ou", "ঔ"],
  ["oi", "ঐ"],
  ["kk", "ক্ক"],
  ["tt", "ত্ত"],
  ["pp", "প্প"],
  ["ll", "ল্ল"],
  ["mm", "ম্ম"],
  ["nn", "ন্ন"],
  ["ss", "স্স"],
  // Singles
  ["k", "ক"],
  ["K", "ক"],
  ["g", "গ"],
  ["G", "গ"],
  ["j", "জ"],
  ["J", "জ"],
  ["z", "জ"],
  ["T", "ট"],
  ["D", "ড"],
  ["t", "ত"],
  ["d", "দ"],
  ["n", "ন"],
  ["N", "ন"],
  ["p", "প"],
  ["b", "ব"],
  ["m", "ম"],
  ["r", "র"],
  ["l", "ল"],
  ["s", "স"],
  ["S", "স"],
  ["h", "হ"],
  ["y", "য"],
  ["w", "ওয়"],
  ["f", "ফ"],
  ["v", "ভ"],
  ["q", "ক"],
  ["x", "ক্স"],
  ["a", "া"],
  ["i", "ি"],
  ["u", "ু"],
  ["e", "ে"],
  ["o", "ো"],
  ["A", "আ"],
  ["E", "এ"],
  ["O", "ও"],
  ["I", "ই"],
  ["U", "উ"],
];

// Common whole-word dictionary (Banglish word → Bengali word)
const _phoneticDict = {
  ami: "আমি",
  amar: "আমার",
  amra: "আমরা",
  tumi: "তুমি",
  tomar: "তোমার",
  se: "সে",
  tar: "তার",
  ta: "তা",
  ei: "এই",
  oi: "ওই",
  je: "যে",
  ki: "কি",
  ke: "কে",
  keno: "কেন",
  kothay: "কোথায়",
  kothai: "কোথায়",
  ache: "আছে",
  chilo: "ছিল",
  hobe: "হবে",
  hoi: "হই",
  holo: "হলো",
  nam: "নাম",
  naam: "নাম",
  bhai: "ভাই",
  bon: "বোন",
  baba: "বাবা",
  ma: "মা",
  din: "দিন",
  rat: "রাত",
  shomoy: "সময়",
  somoy: "সময়",
  valo: "ভালো",
  bhalo: "ভালো",
  khub: "খুব",
  onek: "অনেক",
  aro: "আরো",
  kintu: "কিন্তু",
  tahole: "তাহলে",
  jodi: "যদি",
  ar: "আর",
  ebong: "এবং",
  islam: "ইসলাম",
  quran: "কুরআন",
  kuran: "কুরআন",
  hadith: "হাদিস",
  salah: "সালাহ",
  salat: "সালাত",
  namaz: "নামাজ",
  namaaz: "নামাজ",
  dawah: "দাওয়াহ",
  dawa: "দাওয়া",
  deen: "দ্বীন",
  din: "দ্বীন",
  ramadan: "রমাদান",
  romadan: "রমাদান",
  eid: "ঈদ",
  iftar: "ইফতার",
  sehri: "সেহরি",
  suhur: "সুহুর",
  masjid: "মসজিদ",
  mosque: "মসজিদ",
  alhamdulillah: "আলহামদুলিল্লাহ",
  inshallah: "ইনশাআল্লাহ",
  subhanallah: "সুবহানআল্লাহ",
  mashallah: "মাশাআল্লাহ",
  bangladesh: "বাংলাদেশ",
  dhaka: "ঢাকা",
  bangla: "বাংলা",
  shikkha: "শিক্ষা",
  shiksha: "শিক্ষা",
  biggyan: "বিজ্ঞান",
  manush: "মানুষ",
  manob: "মানব",
  jibon: "জীবন",
  jiban: "জীবন",
  shamai: "সমাজ",
  somaj: "সমাজ",
  desh: "দেশ",
  nari: "নারী",
  purush: "পুরুষ",
  shishu: "শিশু",
  tarun: "তরুণ",
  torun: "তরুণ",
  uddiptta: "উদ্দীপ্ত",
  uddippt: "উদ্দীপ্ত",
  uddipat: "উদ্দীপ্ত",
  sangha: "সংঘ",
  shongho: "সংঘ",
  community: "কমিউনিটি",
  karjokom: "কার্যক্রম",
  karjokrom: "কার্যক্রম",
  activities: "কার্যক্রম",
  nirdeshika: "নির্দেশিকা",
  guidelines: "নির্দেশিকা",
  shampratik: "সাম্প্রতিক",
  recent: "সাম্প্রতিক",
  blog: "ব্লগ",
  post: "পোস্ট",
  oikotan: "ঐক্যতান",
  brotherhood: "ভ্রাতৃত্ব",
};

function phoneticToBengali(text) {
  // First try whole-word dictionary lookup on each word
  const words = text.toLowerCase().split(/\s+/);
  const translatedWords = words.map((word) => {
    const clean = word.replace(/[^a-zA-Z]/g, "");
    return _phoneticDict[clean] || _phoneticDict[clean.toLowerCase()] || null;
  });
  const dictResult = translatedWords.every(Boolean)
    ? translatedWords.join(" ")
    : null;

  // Also do character-level transliteration
  let result = text;
  let out = "";
  let i = 0;
  while (i < result.length) {
    let matched = false;
    for (const [rom, ben] of _phoneticMap) {
      if (result.slice(i, i + rom.length) === rom) {
        out += ben;
        i += rom.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += result[i];
      i++;
    }
  }

  return { dict: dictResult, char: out };
}

function isAscii(str) {
  return /^[\x00-\x7F]+$/.test(str);
}

function matchesQuery(p, q) {
  const fields = [
    (p.title || "").toLowerCase(),
    (p.body || "").toLowerCase(),
    (p.authorName || "").toLowerCase(),
    ...(p.tags || []).map((t) => t.toLowerCase()),
  ];
  // Direct match
  if (fields.some((f) => f.includes(q))) return true;
  // If query is ASCII (Banglish), try phonetic conversion
  if (isAscii(q)) {
    const words = q.split(/\s+/);
    for (const w of words) {
      if (!w) continue;
      const wl = w.toLowerCase();
      // 1. Exact dictionary match
      const exactBn = _phoneticDict[wl];
      if (exactBn && fields.some((f) => f.includes(exactBn))) return true;
      // 2. Prefix match — "ift" matches "iftar" → ইফতার
      const prefixMatches = Object.entries(_phoneticDict)
        .filter(([key]) => key.startsWith(wl))
        .map(([, val]) => val);
      for (const bn of prefixMatches) {
        if (fields.some((f) => f.includes(bn))) return true;
      }
      // 3. Substring match in dict keys — "tar" matches "iftar"
      const subMatches = Object.entries(_phoneticDict)
        .filter(([key]) => key.includes(wl) && key !== wl)
        .map(([, val]) => val);
      for (const bn of subMatches) {
        if (fields.some((f) => f.includes(bn))) return true;
      }
    }
    // 4. Character-level transliteration for unknown words
    const { char } = phoneticToBengali(q);
    if (char && char !== q && fields.some((f) => f.includes(char))) return true;
  }
  return false;
}

window.runSearch = () => {
  const q = (document.getElementById("srchMain")?.value || "")
    .trim()
    .toLowerCase();
  const tag = window._srchTagVals || [];
  const month = document.getElementById("srchMonth")?.value || "";
  const sort = window._srchSortVal || "newest";
  const clrBtn = document.getElementById("srchClrBtn");
  if (clrBtn) clrBtn.style.display = q ? "block" : "none";

  let posts = [..._srchAllPosts];

  // Type filter
  if (_srchType) posts = posts.filter((p) => p.type === _srchType);

  // Text filter — supports Banglish/phonetic search
  if (q) posts = posts.filter((p) => matchesQuery(p, q));

  // Tag filter — AND logic: post must have ALL selected tags
  if (tag.length)
    posts = posts.filter((p) => tag.every((t) => (p.tags || []).includes(t)));

  // Month filter
  if (month)
    posts = posts.filter((p) => {
      if (!p.createdAt) return false;
      const d = p.createdAt.toDate
        ? p.createdAt.toDate()
        : new Date(p.createdAt);
      return (
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` ===
        month
      );
    });

  // Sort
  if (sort === "newest")
    posts.sort(
      (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
    );
  else if (sort === "oldest")
    posts.sort(
      (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0),
    );
  else if (sort === "liked")
    posts.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  else if (sort === "viewed")
    posts.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));

  const statusEl = document.getElementById("srchStatus");
  const resultsEl = document.getElementById("srchResults");
  if (!q && !tag.length && !month && !_srchType) {
    statusEl.textContent = `মোট ${_srchAllPosts.length} টি পোস্ট আছে — ফিল্টার বা সার্চ করুন`;
    resultsEl.innerHTML = "";
    return;
  }
  statusEl.textContent = posts.length ? `${posts.length} টি ফলাফল` : "";
  if (!posts.length) {
    resultsEl.innerHTML =
      '<div class="srch-empty"><div style="font-size:2rem"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div><p>কোনো ফলাফল পাওয়া যায়নি</p></div>';
    return;
  }
  resultsEl.innerHTML = posts
    .map((p) => {
      const typeLabel =
        { blog: "কার্যক্রম", guideline: "নির্দেশিকা" }[p.type] || "কার্যক্রম";
      const excerpt = renderExcerpt(p.body || "", 100);
      const tagsHtml = (p.tags || [])
        .slice(0, 4)
        .map((t) => _tagHtml(t))
        .join("");
      const img = [p.imageUrl, ...(p.images || [])].filter(Boolean)[0];
      return `<div class="srch-item" onclick="closeSearch();openPost('${p.id}')">
      ${img ? `<div class="srch-item-img" style="background-image:url('${esc(img)}')"></div>` : ""}
      <div class="srch-item-body">
        <div class="srch-item-meta">
          <span class="card-type-badge ct-${p.type || "blog"}">${typeLabel}</span>
          <span class="srch-item-time">${tAgo(p.createdAt)}</span>
          <span class="srch-item-stat"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> ${p.likeCount || 0}</span>
          <span class="srch-item-stat"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${p.viewCount || 0}</span>
        </div>
        <div class="srch-item-title">${esc(p.title || "Untitled")}</div>
        ${excerpt ? `<div class="srch-item-excerpt">${excerpt}</div>` : ""}
        ${tagsHtml ? `<div class="srch-item-tags">${tagsHtml}</div>` : ""}
        <div class="srch-item-author">
          <img src="${esc(p.authorPhoto || "")}" onerror="this.style.display='none'"/>
          <span>${esc(p.authorName || "")}</span>
        </div>
      </div>
    </div>`;
    })
    .join("");
};

// ── MARKDOWN LIVE PREVIEW ──
let _mdPreviewTimer = null;
window.updateMdPreview = () => {
  clearTimeout(_mdPreviewTimer);
  _mdPreviewTimer = setTimeout(() => {
    const textarea = document.getElementById("pbody");
    const preview = document.getElementById("mdPreview");
    if (!textarea || !preview) return;
    preview.innerHTML = textarea.value.trim()
      ? mdToHtml(textarea.value)
      : '<p class="md-preview-placeholder">Preview will appear here…</p>';
  }, 250);
};

// ── CREATE POST ──
window.openCreatePost = () => {
  if (!currentUser) {
    toast("লগইন করুন", "error");
    return;
  }
  loadTags();
  _selectedTags = [];
  _tcMode = "";
  _tcTargetTag = "";
  tagPickerRenderChips();
  const si = document.getElementById("tagSearchInp");
  if (si) {
    si.value = "";
  }
  const dd = document.getElementById("tagDropdown");
  if (dd) dd.style.display = "none";
  // Reset markdown preview
  const pv = document.getElementById("mdPreview");
  if (pv) pv.innerHTML = '<p class="md-preview-placeholder">Preview will appear here…</p>';
  document.getElementById("createModal").style.display = "flex";
  _pushModal("createModal");
};

// ── TAG PICKER ──
let _selectedTags = [];
let _tcMode = ""; // 'create' | 'editcolor'
let _tcTargetTag = "";

const TAG_PALETTE = [
  { label: "সবুজ", hex: "#5aad6b" },
  { label: "আকাশি", hex: "#4da8e0" },
  { label: "কমলা", hex: "#e8852a" },
  { label: "বেগুনি", hex: "#9b72d4" },
  { label: "লাল", hex: "#e05a5a" },
  { label: "হলুদ", hex: "#d4b840" },
  { label: "গোলাপি", hex: "#d46fa0" },
  { label: "ধূসর", hex: "#7a9880" },
];

function _tagStyle(t) {
  const c = _tagColors[t];
  if (!c) return "";
  return `color:${c};border-color:${c}55;background:${c}18;`;
}
function _tagHtml(t, onclick = "") {
  const sty = _tagStyle(t);
  const handler = onclick ? `onclick="${onclick}"` : "";
  return `<span class="post-tag" style="${sty}" ${handler}>#${esc(t)}</span>`;
}
function _tagDotStyle(t) {
  const c = _tagColors[t];
  return c ? `background:${c};` : "background:rgba(255,255,255,.2);";
}

function _buildColorPicker(tagName, existingColor, titleText, confirmLabel) {
  const swatches = TAG_PALETTE.map((p) => {
    const active = p.hex === existingColor ? " tc-swatch-active" : "";
    return `<button class="tc-swatch${active}" title="${p.label}" style="background:${p.hex};" onclick="tcPickColor('${p.hex}',this)"></button>`;
  }).join("");
  const noColorActive = !existingColor ? " tc-swatch-active" : "";
  return `
    <div class="tc-create-box" onclick="event.stopPropagation()">
      <div class="tc-create-label">${titleText}</div>
      <div class="tc-create-tag-preview" id="tcPreview" style="${_tagStyle(tagName)}">#${tagName}</div>
      <div class="tc-create-label" style="margin-top:.5rem;">রঙ বেছে নিন</div>
      <div class="tc-swatches">
        <button class="tc-swatch tc-no-color${noColorActive}" title="রঙ নেই" onclick="tcPickColor('',this)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        ${swatches}
      </div>
      <div class="tc-create-btns">
        <button class="tc-cancel-btn" onclick="tcCancel()">বাতিল</button>
        <button class="tc-confirm-btn" onclick="tcConfirm()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${confirmLabel}</button>
      </div>
    </div>`;
}

function tagPickerRender(filter = "") {
  if (_tcMode) return; // color picker is open — don't overwrite
  const dd = document.getElementById("tagDropdown");
  if (!dd) return;
  const lower = filter.toLowerCase().trim();
  let list = lower ? allTags.filter((t) => t.includes(lower)) : [...allTags];
  list.sort((a, b) => {
    const aS = _selectedTags.includes(a),
      bS = _selectedTags.includes(b);
    return aS === bS ? a.localeCompare(b) : aS ? 1 : -1;
  });
  const newTag = lower.replace(/[^\w\u0980-\u09FF-]/g, "");
  const canCreate =
    newTag && !allTags.includes(newTag) && !_selectedTags.includes(newTag);
  const canManageTags = ["maintainer", "admin"].includes(currentRole);

  const items = list
    .slice(0, 20)
    .map((t) => {
      const sel = _selectedTags.includes(t);
      const sty = _tagStyle(t);
      return `<div class="tag-dd-item ${sel ? "tag-dd-sel" : ""}" style="${sty}" onclick="tagPickerPick('${t}')">
      <span class="tag-dd-dot" style="${_tagDotStyle(t)}"></span>
      <span class="tag-dd-label">#${t}</span>
      <div class="tag-dd-actions">
        ${sel ? '<span class="tag-dd-check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' : ""}
        ${canManageTags ? `<button class="tag-color-btn" title="রঙ পরিবর্তন" onclick="tagEditColor('${t}',event)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></button>` : ""}
        ${canManageTags ? `<button class="tag-del-btn" title="মুছুন" onclick="deleteTag('${t}',event)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ""}
      </div>
    </div>`;
    })
    .join("");

  dd.innerHTML =
    (canCreate
      ? `<div class="tag-dd-new" onclick="tagPickerInitCreate('${newTag}',event)">+ "<strong>#${newTag}</strong>" তৈরি করুন</div>`
      : "") + (items || '<div class="tag-dd-empty">কোনো ট্যাগ নেই</div>');
  dd.style.display = "block";
}

window.tagPickerInitCreate = (t, e) => {
  if (e) e.stopPropagation();
  _tcMode = "create";
  _tcTargetTag = t;
  window._tcSelectedColor = "";
  const dd = document.getElementById("tagDropdown");
  if (!dd) return;
  dd.innerHTML = _buildColorPicker(t, "", "নতুন ট্যাগ তৈরি", "তৈরি করুন");
  dd.style.display = "block";
};

window.tagEditColor = (t, e) => {
  if (e) e.stopPropagation();
  if (!["maintainer", "admin"].includes(currentRole)) return;
  _tcMode = "editcolor";
  _tcTargetTag = t;
  window._tcSelectedColor = _tagColors[t] || "";
  const dd = document.getElementById("tagDropdown");
  if (!dd) return;
  dd.innerHTML = _buildColorPicker(
    t,
    _tagColors[t] || "",
    `"#${t}" রঙ পরিবর্তন`,
    "সংরক্ষণ",
  );
  dd.style.display = "block";
};

window.tcPickColor = (hex, btn) => {
  window._tcSelectedColor = hex;
  document
    .querySelectorAll(".tc-swatch,.tc-no-color")
    .forEach((s) => s.classList.remove("tc-swatch-active"));
  btn.classList.add("tc-swatch-active");
  const preview = document.getElementById("tcPreview");
  if (preview) {
    if (hex) {
      preview.style.color = hex;
      preview.style.borderColor = hex + "60";
      preview.style.background = hex + "20";
    } else {
      preview.style.color = "";
      preview.style.borderColor = "";
      preview.style.background = "";
    }
  }
};

window.tcCancel = () => {
  _tcMode = "";
  _tcTargetTag = "";
  window._tcSelectedColor = "";
  tagPickerRender(document.getElementById("tagSearchInp")?.value || "");
};

window.tcConfirm = async () => {
  const mode = _tcMode,
    tag = _tcTargetTag,
    color = window._tcSelectedColor || "";
  _tcMode = "";
  _tcTargetTag = "";
  window._tcSelectedColor = "";

  if (mode === "create") {
    if (_selectedTags.length >= 5) {
      toast("সর্বোচ্চ ৫টি ট্যাগ দেওয়া যাবে", "error");
      tagPickerRender("");
      return;
    }
    const saved = await saveTag(tag, color);
    if (saved && !_selectedTags.includes(saved)) _selectedTags.push(saved);
    document.getElementById("tagSearchInp").value = "";
    tagPickerRenderChips();
    tagPickerRender("");
    _srchLoaded = false;
    _buildSrchTagDd();
  } else if (mode === "editcolor") {
    try {
      await updateDoc(doc(db, "tags", tag), { color });
      if (color) _tagColors[tag] = color;
      else delete _tagColors[tag];
      tagPickerRenderChips();
      tagPickerRender(document.getElementById("tagSearchInp")?.value || "");
      _buildSrchTagDd();
      // Refresh button chips if this tag is selected in search
      if (window._srchTagVals.includes(tag)) _updateSrchTagBtn();
      toast("রঙ সংরক্ষিত হয়েছে");
    } catch (err) {
      toast("সংরক্ষণ ব্যর্থ হয়েছে", "error");
      tagPickerRender("");
    }
  }
};

window.deleteTag = async (t, e) => {
  e.stopPropagation();
  if (!["maintainer", "admin"].includes(currentRole)) return;
  if (!confirm(`"#${t}" ট্যাগটি মুছে দেবেন?`)) return;
  try {
    await deleteDoc(doc(db, "tags", t));
    allTags = allTags.filter((x) => x !== t);
    delete _tagColors[t];
    _selectedTags = _selectedTags.filter((x) => x !== t);
    tagPickerRenderChips();
    tagPickerRender(document.getElementById("tagSearchInp")?.value || "");
    _srchLoaded = false;
    window._srchTagVals = window._srchTagVals.filter((x) => x !== t);
    _updateSrchTagBtn();
    _buildSrchTagDd();
    toast("ট্যাগ মুছে গেছে");
  } catch (e2) {
    toast("মুছতে পারা যায়নি", "error");
  }
};
const _debouncedTagRender = debounce((val) => {
  if (!_tcMode) tagPickerRender(val);
}, 180);
window.tagPickerOpen = async () => {
  await loadTags();
  if (!_tcMode)
    tagPickerRender(document.getElementById("tagSearchInp")?.value || "");
};
window.tagPickerSearch = async (val) => {
  await loadTags();
  _debouncedTagRender(val);
};
window.tagPickerToggle = async (e) => {
  if (e) e.stopPropagation();
  const dd = document.getElementById("tagDropdown");
  if (dd.style.display === "none") {
    await tagPickerOpen();
  } else {
    dd.style.display = "none";
    _tcMode = "";
    _tcTargetTag = "";
  }
};
window.tagPickerPick = (t) => {
  if (_selectedTags.includes(t)) {
    _selectedTags = _selectedTags.filter((x) => x !== t);
  } else {
    if (_selectedTags.length >= 5) {
      toast("সর্বোচ্চ ৫টি ট্যাগ দেওয়া যাবে", "error");
      return;
    }
    _selectedTags.push(t);
  }
  tagPickerRenderChips();
  tagPickerRender(document.getElementById("tagSearchInp")?.value || "");
};
function tagPickerRenderChips() {
  const row = document.getElementById("tagChips");
  if (!row) return;
  row.innerHTML = _selectedTags
    .map((t) => {
      const c = _tagColors[t];
      const sty = c ? `color:${c};border-color:${c}55;background:${c}20;` : "";
      return `<span class="tag-chip" style="${sty}">#${t}<button onclick="tagPickerPick('${t}')">×</button></span>`;
    })
    .join("");
}
window.tagPickerReset = () => {
  _selectedTags = [];
  tagPickerRenderChips();
};
// Close dropdown on outside click
document.addEventListener("click", (e) => {
  if (!e.target.closest(".tag-picker-wrap")) {
    const dd = document.getElementById("tagDropdown");
    if (dd) dd.style.display = "none";
    _tcMode = "";
    _tcTargetTag = "";
  }
});
function parseTags() {
  return [..._selectedTags].slice(0, 5);
}

window.submitPost = async () => {
  if (!currentUser) return;
  const title = document.getElementById("ptitle").value.trim();
  const body = document.getElementById("pbody").value.trim();
  const type = document.getElementById("ptype").value;
  const imgFiles = [...document.getElementById("pimg").files].slice(0, 10);
  const dateVal = document.getElementById("pdate").value;
  if (!title) {
    toast("শিরোনাম দিন", "error");
    return;
  }
  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "প্রকাশ হচ্ছে…";
  try {
    const createdAt = dateVal
      ? Timestamp.fromDate(new Date(dateVal))
      : serverTimestamp();
    const tags = parseTags();
    const IMGBB_KEY = "__IMGBB_KEY__";
    const uploadImg = async (file) => {
      try {
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(",")[1]);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const fd = new FormData();
        fd.append("key", IMGBB_KEY);
        fd.append("image", base64);
        const resp = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          body: fd,
        });
        const d = await resp.json();
        // ✅ FIX 5: Use ImgBB thumbnail in card feed — full URL only in lightbox.
        // thumb is ~150px wide and loads 5-10x faster than the full image.
        // We store both: imageUrl (full) and imagethumb (thumbnail).
        if (!d.success) return { url: "", thumb: "" };
        return { url: d.data.url, thumb: d.data.thumb?.url || d.data.medium?.url || d.data.url };
      } catch (e) {
        console.error("Upload failed:", e);
        return "";
      }
    };
    btn.textContent = "ছবি আপলোড হচ্ছে…";
    const uploadResults = imgFiles.length
      ? (await Promise.all(imgFiles.map(uploadImg))).filter(r => r && r.url)
      : [];
    const urls = uploadResults.map(r => r.url);
    const thumbs = uploadResults.map(r => r.thumb);
    btn.textContent = "সেভ হচ্ছে…";
    const docRef = await addDoc(collection(db, "posts"), {
      title,
      body,
      type,
      tags,
      imageUrl: urls[0] || "",
      imageThumb: thumbs[0] || "",
      images: urls.slice(1),
      imageThumbs: thumbs.slice(1),
      authorId: currentUser.uid,
      authorName: currentUser.displayName,
      authorPhoto: currentUser.photoURL,
      authorRole: currentRole,
      createdAt,
      likeCount: 0,
      commentCount: 0,
      viewCount: 0,
      likes: {},
      savedBy: [],
    });
    // Optimistically prepend the new post to the grid immediately
    const newPost = {
      id: docRef.id,
      title,
      body,
      type,
      tags,
      imageUrl: urls[0] || "",
      imageThumb: thumbs[0] || "",
      images: urls.slice(1),
      imageThumbs: thumbs.slice(1),
      authorId: currentUser.uid,
      authorName: currentUser.displayName,
      authorPhoto: currentUser.photoURL,
      authorRole: currentRole,
      createdAt:
        createdAt === serverTimestamp()
          ? { toDate: () => new Date() }
          : createdAt,
      likeCount: 0,
      commentCount: 0,
      viewCount: 0,
      likes: {},
      savedBy: [],
    };
    const matchesCurrentTab =
      currentPage === "recent" ? true : newPost.type === currentPage;
    if (
      matchesCurrentTab &&
      !_currentAllPosts.find((p) => p.id === docRef.id)
    ) {
      _currentAllPosts.unshift(newPost);
      renderPosts(_currentAllPosts);
    }
    closeModal("createModal");
    ["ptitle", "pbody", "pdate"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    document.getElementById("pimg").value = "";
    document.getElementById("imgPrev").innerHTML = "";
    tagPickerReset();
    document.getElementById("tagSearchInp").value = "";
    toast("প্রকাশিত হয়েছে! بارك الله فيك");
    _srchLoaded = false;
  } catch (e) {
    toast("প্রকাশ করা যায়নি: " + (e.message || "অজানা ত্রুটি"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "প্রকাশ করুন";
  }
};

window.prevImgs = (inp) => {
  const prev = document.getElementById("imgPrev");
  prev.innerHTML = "";
  [...inp.files].slice(0, 10).forEach((file) => {
    const r = new FileReader();
    r.onload = (e) => {
      const d = document.createElement("div");
      d.style.cssText = `width:64px;height:64px;border-radius:7px;background:url('${e.target.result}') center/cover;border:1px solid rgba(255,255,255,.1);flex-shrink:0;`;
      prev.appendChild(d);
    };
    r.readAsDataURL(file);
  });
};

// ── DRAG & DROP on img-drop ──
document.addEventListener("DOMContentLoaded", () => {
  const drop = document.querySelector(".img-drop");
  if (!drop) return;
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag-over");
  });
  drop.addEventListener("dragleave", (e) => {
    if (!drop.contains(e.relatedTarget)) drop.classList.remove("drag-over");
  });
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag-over");
    const inp = document.getElementById("pimg");
    const dt = e.dataTransfer;
    if (!dt.files.length) return;
    // Merge with existing
    const existing = inp.files ? [...inp.files] : [];
    const incoming = [...dt.files].filter((f) => f.type.startsWith("image/"));
    const merged = [...existing, ...incoming].slice(0, 10);
    const transfer = new DataTransfer();
    merged.forEach((f) => transfer.items.add(f));
    inp.files = transfer.files;
    prevImgs(inp);
  });
});

// ── PROFILE ──
window.openProfile = async () => {
  if (!currentUser) return;
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  const ud = snap.data() || {};
  const role = ud.role || "user";
  const rc = {
    maintainer: "#a8cc5a",
    admin: "#e05c5c",
    user: "#888",
  };
  const canManage = role === "maintainer" || role === "admin";
  const canPostRole = role === "maintainer" || role === "admin";
  document.getElementById("profileModal").innerHTML = `
    <div class="mo" onclick="closeModal('profileModal')"></div>
    <div class="mb profmb">
      <button class="mcl" onclick="closeModal('profileModal')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      <div class="ph">
        <img src="${esc(currentUser.photoURL || "")}" class="pav" onerror="this.style.display='none'"/>
        <div><h2>${esc(currentUser.displayName || "")}</h2>
        <p>${esc(currentUser.email || "")}</p>
        <span class="role-badge" style="background:${rc[role]}20;color:${rc[role]};border:1px solid ${rc[role]}50">${role}</span></div>
      </div>
      <div class="ptabs">
        <button class="ptab active" onclick="swTab(this,'ts');loadSavedPosts()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> সেভ</button>
        ${canPostRole ? `<button class="ptab" onclick="swTab(this,'tmy');loadMyPosts()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> আমার পোস্ট<span id="myPostsBadge" class="mp-badge"></span></button>` : ""}
        ${canManage ? `<button class="ptab" onclick="swTab(this,'tm');loadMembers()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> সদস্য</button>` : ""}
        ${canManage ? `<button class="ptab" onclick="swTab(this,'trp');loadReports()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> রিপোর্ট</button>` : ""}
        ${canManage ? `<button class="ptab" onclick="swTab(this,'tperm')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> পারমিশন</button>` : ""}
        <button class="ptab" onclick="swTab(this,'tmd')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> মার্কডাউন</button>
        <button class="ptab" onclick="swTab(this,'tset')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> সেটিংস</button>
      </div>
      <div id="ts" class="tc active">
        <p class="tab-lbl">সেভ করা পোস্ট</p>
        <div id="savedList"><p class="cmt-h">লোড হচ্ছে…</p></div>
      </div>
      ${
        canPostRole
          ? `<div id="tmy" class="tc">
        <div class="mbh" style="align-items:center">
          <p class="tab-lbl" style="margin:0">আমার পোস্ট · My Posts</p>
          <input id="mpSrch" placeholder="শিরোনাম খুঁজুন…" oninput="filterMyPosts(this.value)"/>
        </div>
        <div id="myPostsList"><p class="cmt-h">লোড হচ্ছে…</p></div>
      </div>`
          : ""
      }
      ${
        canManage
          ? `<div id="tm" class="tc">
        <div class="mbh"><p class="tab-lbl">সদস্য পরিচালনা</p>
        <input id="msrch" placeholder="নাম বা ইমেইল খুঁজুন…" oninput="filterM(this.value)"/></div>
        <div class="rfrow">
          <button class="rf active" onclick="filterR(this,'all')">সব</button>
          <button class="rf" onclick="filterR(this,'maintainer')">Maintainer</button>
          <button class="rf" onclick="filterR(this,'admin')">Admin</button>
          <button class="rf" onclick="filterR(this,'user')">User</button>
        </div>
        <div id="mlist"><p class="cmt-h">লোড হচ্ছে…</p></div>
      </div>`
          : ""
      }
      ${
        canManage
          ? `<div id="trp" class="tc">
        <p class="tab-lbl">রিপোর্টকৃত মন্তব্য · Reported Comments</p>
        <div id="rplist"><p class="cmt-h">লোড হচ্ছে…</p></div>
      </div>`
          : ""
      }
      ${
        canManage
          ? `<div id="tperm" class="tc">
        <p class="tab-lbl">পারমিশন চার্ট · Permission Matrix</p>
        <div class="perm-wrap">
          <p class="perm-desc">প্রতিটি ভূমিকা কী কী কাজ করতে পারে তার সম্পূর্ণ তালিকা।</p>

          <div class="perm-section">
            <div class="perm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              পোস্ট · Posts
            </div>
            <div class="perm-table-wrap">
              <table class="perm-table">
                <thead><tr><th>অ্যাকশন</th><th class="role-admin">Admin</th><th class="role-maint">Maintainer</th><th class="role-user">User</th><th class="role-blocked">Blocked</th><th class="role-guest">Guest</th></tr></thead>
                <tbody>
                  <tr><td>পোস্ট পড়া (Read)</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td></tr>
                  <tr><td>পোস্ট তৈরি (Create)</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>পোস্ট আপডেট (Full Edit)</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>লাইক / আনলাইক</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>সেভ করা</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td></tr>
                  <tr><td>ভিউ কাউন্ট বাড়ানো</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>পোস্ট পিন করা</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>পোস্ট ডিলিট করা</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="perm-section">
            <div class="perm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              মন্তব্য · Comments
            </div>
            <div class="perm-table-wrap">
              <table class="perm-table">
                <thead><tr><th>অ্যাকশন</th><th class="role-admin">Admin</th><th class="role-maint">Maintainer</th><th class="role-user">User</th><th class="role-blocked">Blocked</th><th class="role-guest">Guest</th></tr></thead>
                <tbody>
                  <tr><td>মন্তব্য পড়া (Read)</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td></tr>
                  <tr><td>মন্তব্য করা (Create)</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>মন্তব্য পিন করা</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>নিজের মন্তব্য ডিলিট</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>যেকোনো মন্তব্য ডিলিট</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>মন্তব্য রিপোর্ট করা</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="perm-section">
            <div class="perm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              সদস্য · Users
            </div>
            <div class="perm-table-wrap">
              <table class="perm-table">
                <thead><tr><th>অ্যাকশন</th><th class="role-admin">Admin</th><th class="role-maint">Maintainer</th><th class="role-user">User</th><th class="role-blocked">Blocked</th><th class="role-guest">Guest</th></tr></thead>
                <tbody>
                  <tr><td>সদস্য তালিকা দেখা</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>নিজের প্রোফাইল আপডেট</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td></tr>
                  <tr><td>অন্যের ভূমিকা (role) পরিবর্তন</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>সদস্য ব্লক করা</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>সদস্য অ্যাকাউন্ট ডিলিট</td><td class="no">✗</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="perm-section">
            <div class="perm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              ট্যাগ · Tags
            </div>
            <div class="perm-table-wrap">
              <table class="perm-table">
                <thead><tr><th>অ্যাকশন</th><th class="role-admin">Admin</th><th class="role-maint">Maintainer</th><th class="role-user">User</th><th class="role-blocked">Blocked</th><th class="role-guest">Guest</th></tr></thead>
                <tbody>
                  <tr><td>ট্যাগ দেখা (Read)</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td></tr>
                  <tr><td>ট্যাগ তৈরি (Create)</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>ট্যাগ সম্পাদনা (Edit)</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>ট্যাগ ডিলিট করা</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="perm-section">
            <div class="perm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              রিপোর্ট · Reports
            </div>
            <div class="perm-table-wrap">
              <table class="perm-table">
                <thead><tr><th>অ্যাকশন</th><th class="role-admin">Admin</th><th class="role-maint">Maintainer</th><th class="role-user">User</th><th class="role-blocked">Blocked</th><th class="role-guest">Guest</th></tr></thead>
                <tbody>
                  <tr><td>রিপোর্ট দেখা (Read)</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>রিপোর্ট করা (File)</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td></tr>
                  <tr><td>রিপোর্ট সমাধান (Resolve)</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                  <tr><td>রিপোর্ট ডিলিট করা</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="perm-legend">
            <span class="perm-leg-item"><span class="pleg yes">✓</span> অনুমতি আছে</span>
            <span class="perm-leg-item"><span class="pleg no">✗</span> অনুমতি নেই</span>
          </div>
          <div class="perm-role-key">
            <span class="prk-admin">Admin</span>
            <span class="prk-maint">Maintainer</span>
            <span class="prk-user">User</span>
            <span class="prk-blocked">Blocked</span>
            <span class="prk-guest">Guest (লগইন নেই)</span>
          </div>
        </div>
      </div>`
          : ""
      }
      <div id="tmd" class="tc">
        <p class="tab-lbl">মার্কডাউন গাইড</p>
        <div class="md-guide">
          <p style="color:var(--txt2);font-size:.8rem;margin-bottom:1rem">মার্কডাউন সিনট্যাক্স · Markdown Syntax Reference</p>
          <div class="md-guide-table-wrap">
            <table class="md-guide-table">
              <thead><tr><th>#</th><th>ফিচার</th><th>সিনট্যাক্স</th><th>কার্ড</th><th>পোস্ট</th></tr></thead>
              <tbody>
                <tr><td>1</td><td><strong>Bold</strong></td><td><code>**text**</code> or <code>__text__</code></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td>2</td><td><em>Italic</em></td><td><code>*text*</code> or <code>_text_</code></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td>3</td><td><strong><em>Bold+Italic</em></strong></td><td><code>***text***</code></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td>4</td><td><del>Strikethrough</del></td><td><code>~~text~~</code></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td>5</td><td><code>Inline code</code></td><td><code>\`code\`</code></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td>6</td><td><a href="#">Links</a></td><td><code>[text](url)</code></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td>7</td><td>Images</td><td><code>![alt](url)</code></td><td>—</td><td class="yes">✓</td></tr>
                <tr><td>8</td><td><span class="ex-task"><input type="checkbox" disabled></span> Task list</td><td><code>- [ ]</code></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td>9</td><td>Headings h1–h6</td><td><code># </code> to <code>###### </code></td><td>—</td><td class="yes">✓</td></tr>
                <tr><td>10</td><td>Code blocks</td><td><code>\`\`\`</code> fenced</td><td>—</td><td class="yes">✓</td></tr>
                <tr><td>11</td><td>Blockquotes</td><td><code>&gt; </code></td><td>—</td><td class="yes">✓</td></tr>
                <tr><td>12</td><td>Horizontal rule</td><td><code>---</code></td><td>—</td><td class="yes">✓</td></tr>
                <tr><td>13</td><td>Unordered lists</td><td><code>-</code>, <code>*</code>, <code>+</code></td><td>—</td><td class="yes">✓</td></tr>
                <tr><td>14</td><td>Ordered lists</td><td><code>1.</code>, <code>2.</code></td><td>—</td><td class="yes">✓</td></tr>
                <tr><td>15</td><td>Paragraph auto-wrap</td><td>plain text</td><td>—</td><td class="yes">✓</td></tr>
                <tr><td>16</td><td>Line breaks</td><td>two trailing spaces</td><td>—</td><td class="yes">✓</td></tr>
              </tbody>
            </table>
          </div>
          <div class="md-guide-legend">
            <span><span class="yes">✓</span> সমর্থিত</span>
            <span><span class="no">—</span> নেই</span>
          </div>
          <p style="color:var(--txt3);font-size:.72rem;margin-top:1rem">কোনো CDN বা লাইব্রেরি ছাড়াই নিজস্ব <code>mdToHtml()</code> রেন্ডারার ব্যবহার করা হয়েছে।</p>
        </div>
      </div>
      <div id="tset" class="tc">
        <p class="tab-lbl">অ্যাকাউন্ট</p>
        <div class="sirows">
          <div class="sir"><label>নাম</label><span>${esc(currentUser.displayName || "")}</span></div>
          <div class="sir"><label>ইমেইল</label><span>${esc(currentUser.email || "")}</span></div>
          <div class="sir"><label>ভূমিকা</label><span>${role}</span></div>
          <div class="sir"><label>যোগ দিয়েছেন</label><span>${ud.createdAt ? new Date(ud.createdAt.toDate()).toLocaleDateString("bn-BD") : "N/A"}</span></div>
        </div>
        <button class="danger-btn" onclick="logout()">সাইন আউট</button>
      </div>
    </div>`;
  document.getElementById("profileModal").style.display = "flex";
  _pushModal("profileModal");
  loadSavedPosts();
};

// ── SAVED POSTS TAB — infinite scroll ──
const SAVED_PAGE = 8;
let _savedIds = [],
  _savedOffset = 0,
  _savedLoading = false,
  _savedObserver = null;

function _destroySavedObserver() {
  if (_savedObserver) {
    _savedObserver.disconnect();
    _savedObserver = null;
  }
  document.getElementById("savedSentinel")?.remove();
}
function _setupSavedObserver() {
  _destroySavedObserver();
  const list = document.getElementById("savedList");
  if (!list) return;
  const s = document.createElement("div");
  s.id = "savedSentinel";
  s.style.cssText = "height:1px;";
  list.after(s);
  _savedObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !_savedLoading) _loadMoreSaved();
    },
    { rootMargin: "120px" },
  );
  _savedObserver.observe(s);
}
async function _loadMoreSaved() {
  if (_savedLoading || _savedOffset >= _savedIds.length) return;
  _savedLoading = true;
  const list = document.getElementById("savedList");
  if (!list) return;
  const batch = _savedIds.slice(_savedOffset, _savedOffset + SAVED_PAGE);
  const snaps = await Promise.all(
    batch.map((id) => getDoc(doc(db, "posts", id))),
  );
  const rows = snaps
    .filter((s) => s.exists())
    .map(
      (s) =>
        `<div class="spr" onclick="closeModal('profileModal');openPost('${s.id}')">
      <span>${esc(s.data().title || "Untitled")}</span>
      <span class="spd">${tAgo(s.data().createdAt)}</span>
    </div>`,
    )
    .join("");
  if (rows) list.insertAdjacentHTML("beforeend", rows);
  _savedOffset += SAVED_PAGE;
  if (_savedOffset >= _savedIds.length) _destroySavedObserver();
  _savedLoading = false;
}
window.loadSavedPosts = async () => {
  _destroySavedObserver();
  _savedOffset = 0;
  _savedLoading = false;
  const list = document.getElementById("savedList");
  if (!list) return;
  list.innerHTML = '<p class="cmt-h">লোড হচ্ছে…</p>';
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  _savedIds = (snap.data()?.savedPosts || []).slice().reverse();
  list.innerHTML = "";
  if (!_savedIds.length) {
    list.innerHTML = '<p class="cmt-h">কোনো সেভ করা পোস্ট নেই</p>';
    return;
  }
  await _loadMoreSaved();
  if (_savedIds.length > SAVED_PAGE) _setupSavedObserver();
};

window.swTab = (btn, id) => {
  document
    .querySelectorAll(".ptab")
    .forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tc").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
};

// ── MY POSTS TAB — infinite scroll ──
const MY_PAGE = 10;
let _myPostsAll = [],
  _myPostsFiltered = [],
  _myOffset = 0,
  _myLoading = false,
  _myObserver = null;

function _destroyMyObserver() {
  if (_myObserver) {
    _myObserver.disconnect();
    _myObserver = null;
  }
  document.getElementById("myPostsSentinel")?.remove();
}
function _setupMyObserver() {
  _destroyMyObserver();
  const list = document.getElementById("myPostsList");
  if (!list) return;
  const s = document.createElement("div");
  s.id = "myPostsSentinel";
  s.style.cssText = "height:1px;";
  list.after(s);
  _myObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !_myLoading) _loadMoreMyPosts();
    },
    { rootMargin: "120px" },
  );
  _myObserver.observe(s);
}
function _myPostRowHtml(p) {
  const typeLabel = {
    blog: "ব্লগ",
    recent: "সাম্প্রতিক",
    guideline: "নির্দেশিকা",
  };
  return `<div class="mpr" onclick="closeModal('profileModal');openPost('${p.id}')">
    <div class="mpr-main">
      <span class="mpr-type ${p.type || ""}">${typeLabel[p.type] || p.type || "পোস্ট"}</span>
      <span class="mpr-title">${esc(p.title || "Untitled")}</span>
      ${isPinnedActive(p) ? `<span class="mpr-pin-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg> ${isPinnedUnlimited(p) ? "♾ পিন করা" : "পিন করা"}</span>` : ""}
    </div>
    <div class="mpr-meta">
      <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${tAgo(p.createdAt)}</span>
      <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${p.viewCount || 0}</span>
      <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> ${p.likeCount || 0}</span>
      ${
        (p.tags || []).length
          ? `<span class="mpr-tags">${(p.tags || [])
              .slice(0, 2)
              .map((t) => `<span class="mpr-tag">#${esc(t)}</span>`)
              .join("")}</span>`
          : ""
      }
    </div>
  </div>`;
}
function _loadMoreMyPosts() {
  if (_myLoading || _myOffset >= _myPostsFiltered.length) return;
  _myLoading = true;
  const list = document.getElementById("myPostsList");
  if (!list) return;
  const batch = _myPostsFiltered.slice(_myOffset, _myOffset + MY_PAGE);
  list.insertAdjacentHTML("beforeend", batch.map(_myPostRowHtml).join(""));
  _myOffset += MY_PAGE;
  if (_myOffset >= _myPostsFiltered.length) _destroyMyObserver();
  _myLoading = false;
}
window.loadMyPosts = async () => {
  _destroyMyObserver();
  _myOffset = 0;
  _myLoading = false;
  const list = document.getElementById("myPostsList");
  const srch = document.getElementById("mpSrch");
  if (!list || !currentUser) return;
  if (srch) srch.style.display = "";
  list.innerHTML = '<p class="cmt-h">লোড হচ্ছে…</p>';
  try {
    const snap = await getDocs(
      query(collection(db, "posts"), where("authorId", "==", currentUser.uid)),
    );
    _myPostsAll = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
      );
    _myPostsFiltered = _myPostsAll;
    const badge = document.getElementById("myPostsBadge");
    if (badge) badge.textContent = _myPostsAll.length || "";
    list.innerHTML = "";
    if (!_myPostsAll.length) {
      list.innerHTML = '<p class="cmt-h">কোনো পোস্ট নেই</p>';
      return;
    }
    _loadMoreMyPosts();
    if (_myPostsAll.length > MY_PAGE) _setupMyObserver();
  } catch (e) {
    list.innerHTML = '<p class="cmt-h">লোড করতে ব্যর্থ হয়েছে</p>';
  }
};
window.filterMyPosts = (val) => {
  _destroyMyObserver();
  _myOffset = 0;
  _myLoading = false;
  const q = val.trim().toLowerCase();
  _myPostsFiltered = q
    ? _myPostsAll.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.body || "").toLowerCase().includes(q),
      )
    : _myPostsAll;
  const list = document.getElementById("myPostsList");
  if (!list) return;
  list.innerHTML = "";
  if (!_myPostsFiltered.length) {
    list.innerHTML = '<p class="cmt-h">কোনো ফলাফল নেই</p>';
    return;
  }
  _loadMoreMyPosts();
  if (_myPostsFiltered.length > MY_PAGE) _setupMyObserver();
};
// ── MEMBERS TAB — infinite scroll ──
const MEM_PAGE = 15;
let _membersFiltered = [],
  _memOffset = 0,
  _memLoading = false,
  _memObserver = null;

function _destroyMemObserver() {
  if (_memObserver) {
    _memObserver.disconnect();
    _memObserver = null;
  }
  document.getElementById("memSentinel")?.remove();
}
function _setupMemObserver() {
  _destroyMemObserver();
  const list = document.getElementById("mlist");
  if (!list) return;
  const s = document.createElement("div");
  s.id = "memSentinel";
  s.style.cssText = "height:1px;";
  list.after(s);
  _memObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !_memLoading) _loadMoreMembers();
    },
    { rootMargin: "120px" },
  );
  _memObserver.observe(s);
}
function _memberRowHtml(m) {
  const rc = {
    maintainer: "#a8cc5a",
    admin: "#e05c5c",
    user: "#888",
  };
  const canP = currentRole === "maintainer",
    canA = currentRole === "admin";
  const ini = (m.name || "?")
    .split(" ")
    .map((c) => c[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const roles = canP || canA ? ["maintainer", "admin", "user", "blocked"] : [];
  return `<div class="mrow">
    <div class="mav" style="background:${rc[m.role || "user"]}25;color:${rc[m.role || "user"]}">${ini}</div>
    <div class="minf"><strong>${esc(m.name || "")}${m.uid === currentUser?.uid ? ' <span class="you">আপনি</span>' : ""}</strong><small>${esc(m.email || "")}</small></div>
    <span class="role-badge" style="background:${rc[m.role || "user"]}20;color:${rc[m.role || "user"]};border:1px solid ${rc[m.role || "user"]}40">${m.role || "user"}</span>
    ${roles.length && m.uid !== currentUser?.uid ? `<div class="rbtns">${roles.map((r) => `<button class="rb ${r} ${m.role === r ? "rba" : ""}" onclick="setRole('${m.uid}','${r}',this)">${r}</button>`).join("")}</div>` : ""}
  </div>`;
}
function _loadMoreMembers() {
  if (_memLoading || _memOffset >= _membersFiltered.length) return;
  _memLoading = true;
  const list = document.getElementById("mlist");
  if (!list) return;
  const batch = _membersFiltered.slice(_memOffset, _memOffset + MEM_PAGE);
  list.insertAdjacentHTML("beforeend", batch.map(_memberRowHtml).join(""));
  _memOffset += MEM_PAGE;
  if (_memOffset >= _membersFiltered.length) _destroyMemObserver();
  _memLoading = false;
}
function _renderMembersScrollable(members) {
  _destroyMemObserver();
  _memOffset = 0;
  _memLoading = false;
  _membersFiltered = members;
  const list = document.getElementById("mlist");
  if (!list) return;
  // Keep stats header, clear rows below it
  const statsEl = list.querySelector(".mstats");
  list.innerHTML = "";
  if (statsEl) list.appendChild(statsEl);
  if (!members.length) {
    list.insertAdjacentHTML("beforeend", '<p class="cmt-h">কোনো সদস্য নেই</p>');
    return;
  }
  _loadMoreMembers();
  if (members.length > MEM_PAGE) _setupMemObserver();
}
window.loadMembers = async () => {
  if (!["admin", "maintainer"].includes(currentRole)) {
    toast("অনুমতি নেই", "error");
    return;
  }
  if (_membersLoaded) {
    renderMembers(allMembers);
    return;
  }
  const snap = await getDocs(collection(db, "users"));
  allMembers = snap.docs.map((d) => d.data());
  _membersLoaded = true;
  renderMembers(allMembers);
};
window.renderMembers = (members) => {
  const rc = {
    maintainer: "#a8cc5a",
    admin: "#e05c5c",
    user: "#888",
  };
  const list = document.getElementById("mlist");
  if (!list) return;
  // Render stats header first
  list.innerHTML = `<div class="mstats">
    <div class="msc">মোট <strong>${allMembers.length}</strong></div>
    ${["maintainer", "admin", "user", "blocked"].map((r) => `<div class="msc">${r} <strong>${allMembers.filter((m) => m.role === r).length}</strong></div>`).join("")}
  </div>`;
  _renderMembersScrollable(members);
};
window.filterM = (v) => {
  const filtered = allMembers.filter(
    (m) =>
      (m.name || "").toLowerCase().includes(v.toLowerCase()) ||
      (m.email || "").toLowerCase().includes(v.toLowerCase()),
  );
  _renderMembersScrollable(filtered);
};
window.filterR = (btn, role) => {
  document.querySelectorAll(".rf").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  _renderMembersScrollable(
    role === "all" ? allMembers : allMembers.filter((m) => m.role === role),
  );
};

// Cache for report item data — avoids passing complex strings through HTML onclick attrs
const _rpCache = {};

// ── REPORTS TAB — infinite scroll ──
const RP_PAGE = 10;
let _rpDocs = [],
  _rpOffset = 0,
  _rpLoading = false,
  _rpObserver = null;

function _destroyRpObserver() {
  if (_rpObserver) {
    _rpObserver.disconnect();
    _rpObserver = null;
  }
  document.getElementById("rpSentinel")?.remove();
}
function _setupRpObserver() {
  _destroyRpObserver();
  const list = document.getElementById("rplist");
  if (!list) return;
  const s = document.createElement("div");
  s.id = "rpSentinel";
  s.style.cssText = "height:1px;";
  list.after(s);
  _rpObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !_rpLoading) _loadMoreReports();
    },
    { rootMargin: "120px" },
  );
  _rpObserver.observe(s);
}

function _rpItemHtml({
  r,
  commentText,
  commentAuthor,
  commentPhoto,
  authorId,
  reporterName,
  isBlockedUser,
}) {
  const isResolved = !!r.resolved;
  const resolvedBadge = isResolved
    ? `<span class="rp-resolved-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${esc(r.resolvedAction || "সমাধান হয়েছে")}</span>`
    : "";
  return `<div class="rp-row${isResolved ? " rp-resolved" : ""}" id="rprow-${r.id}">
    <div class="rp-comment">
      <img src="${esc(commentPhoto)}" onerror="this.style.display='none'" class="rp-av"/>
      <div class="rp-body">
        <div class="rp-author">${esc(commentAuthor || "অজানা")}${isBlockedUser ? ' <span class="rp-blocked-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> blocked</span>' : ""}${resolvedBadge}</div>
        <div class="rp-text">${commentText ? esc(commentText) : '<em style="opacity:.6">মন্তব্য মুছে গেছে</em>'}</div>
        <div class="rp-meta">রিপোর্ট: <strong>${esc(reporterName || r.reportedBy || "")}</strong> · ${tAgo(r.reportedAt)}</div>
      </div>
    </div>
    ${
      !isResolved
        ? `<div class="rp-actions">
      ${commentText ? `<button class="rp-btn rp-del" title="মন্তব্য মুছুন" onclick="reportDeleteComment('${r.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ""}
      ${authorId && !isBlockedUser && ["admin", "maintainer"].includes(currentRole) ? `<button class="rp-btn rp-block" onclick="reportBlockUser('${r.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>` : ""}
      ${authorId && isBlockedUser && ["admin", "maintainer"].includes(currentRole) ? `<button class="rp-btn rp-unblock" onclick="reportUnblockUser('${r.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg></button>` : ""}
      <button class="rp-btn rp-dismiss" title="বাতিল করুন" onclick="dismissReport('${r.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`
        : ""
    }
  </div>`;
}

async function _enrichReportDoc(d) {
  const r = { id: d.id, ...d.data() };
  let commentText = r.commentText || "",
    commentAuthor = r.commentAuthor || "",
    commentPhoto = r.commentPhoto || "",
    authorId = r.authorId || "";
  if (!commentAuthor && r.pid && r.cid) {
    try {
      const cmSnap = await getDoc(doc(db, "posts", r.pid, "comments", r.cid));
      if (cmSnap.exists()) {
        const cd = cmSnap.data();
        commentText = cd.text || "";
        commentAuthor = cd.authorName || "";
        commentPhoto = cd.authorPhoto || "";
        authorId = cd.authorId || "";
      }
    } catch (e) {}
  }
  let reporterName = "",
    isBlockedUser = false;
  try {
    const rs = await getDoc(doc(db, "users", r.reportedBy));
    if (rs.exists()) reporterName = rs.data().name || "";
  } catch (e) {}
  if (authorId) {
    try {
      const us = await getDoc(doc(db, "users", authorId));
      if (us.exists()) isBlockedUser = us.data().role === "blocked";
    } catch (e) {}
  }
  _rpCache[r.id] = {
    r,
    commentText,
    commentAuthor,
    commentPhoto,
    authorId,
    reporterName,
    isBlockedUser,
  };
  return _rpCache[r.id];
}

async function _loadMoreReports() {
  if (_rpLoading || _rpOffset >= _rpDocs.length) return;
  _rpLoading = true;
  const list = document.getElementById("rplist");
  if (!list) return;

  // Show a mini spinner while fetching this batch
  const spinner = document.createElement("p");
  spinner.className = "cmt-h";
  spinner.id = "rpSpinner";
  spinner.textContent = "লোড হচ্ছে…";
  list.appendChild(spinner);

  const batch = _rpDocs.slice(_rpOffset, _rpOffset + RP_PAGE);
  const items = await Promise.all(batch.map(_enrichReportDoc));

  document.getElementById("rpSpinner")?.remove();

  // Separate pending vs resolved in this batch and insert under the right section header
  const pending = items.filter((i) => !i.r.resolved);
  const resolved = items.filter((i) => i.r.resolved);

  // Pending section
  if (pending.length) {
    let pendingSection = list.querySelector(".rp-pending-section");
    if (!pendingSection) {
      pendingSection = document.createElement("div");
      pendingSection.className = "rp-pending-section";
      pendingSection.innerHTML = `<div class="rp-section-lbl" id="rpPendingLbl"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> অপেক্ষমাণ</div>`;
      list.appendChild(pendingSection);
    }
    pending.forEach((item) =>
      pendingSection.insertAdjacentHTML("beforeend", _rpItemHtml(item)),
    );
    // Update count in label
    const lbl = list.querySelector("#rpPendingLbl");
    if (lbl) {
      const total = list.querySelectorAll(".rp-pending-section .rp-row").length;
      lbl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> অপেক্ষমাণ (${total})`;
    }
  }

  // Resolved section
  if (resolved.length) {
    let resolvedSection = list.querySelector(".rp-resolved-section");
    if (!resolvedSection) {
      resolvedSection = document.createElement("div");
      resolvedSection.className = "rp-resolved-section";
      resolvedSection.innerHTML = `<div class="rp-section-lbl rp-section-resolved" id="rpResolvedLbl"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> সমাধান হয়েছে</div>`;
      list.appendChild(resolvedSection);
    }
    resolved.forEach((item) =>
      resolvedSection.insertAdjacentHTML("beforeend", _rpItemHtml(item)),
    );
    const lbl = list.querySelector("#rpResolvedLbl");
    if (lbl) {
      const total = list.querySelectorAll(
        ".rp-resolved-section .rp-row",
      ).length;
      lbl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> সমাধান হয়েছে (${total})`;
    }
  }

  _rpOffset += RP_PAGE;
  if (_rpOffset >= _rpDocs.length) _destroyRpObserver();
  _rpLoading = false;
}

window.loadReports = async () => {
  _destroyRpObserver();
  _rpOffset = 0;
  _rpLoading = false;
  _rpDocs = [];
  const list = document.getElementById("rplist");
  if (!list) return;
  list.innerHTML = '<p class="cmt-h">লোড হচ্ছে…</p>';
  try {
    const snap = await getDocs(
      query(collection(db, "reports"), orderBy("reportedAt", "desc")),
    );
    if (snap.empty) {
      list.innerHTML =
        '<p class="cmt-h"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> কোনো রিপোর্ট নেই</p>';
      return;
    }
    _rpDocs = snap.docs;
    list.innerHTML = "";
    await _loadMoreReports();
    if (_rpDocs.length > RP_PAGE) _setupRpObserver();
  } catch (e) {
    list.innerHTML =
      '<p class="cmt-h" style="color:var(--red)">লোড করা যায়নি</p>';
    console.error(e);
  }
};

// Helper: instant UI resolve for a report row
function _rpResolveRow(rid, actionLabel) {
  const row = document.getElementById("rprow-" + rid);
  if (!row) return;
  row.classList.add("rp-resolved");
  row.querySelector(".rp-actions")?.remove();
  const authorEl = row.querySelector(".rp-author");
  if (authorEl && !authorEl.querySelector(".rp-resolved-badge")) {
    authorEl.insertAdjacentHTML(
      "beforeend",
      `<span class="rp-resolved-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${actionLabel}</span>`,
    );
  }
}

window.reportDeleteComment = async (rid) => {
  const cached = _rpCache[rid];
  if (!cached) return;
  const { r, commentText, commentAuthor, commentPhoto, authorId } = cached;
  if (!confirm("এই মন্তব্য মুছে দেবেন?")) return;
  _rpResolveRow(rid, "মন্তব্য মুছে দেওয়া হয়েছে");
  const textEl = document.querySelector("#rprow-" + rid + " .rp-text");
  if (textEl)
    textEl.innerHTML = '<em style="opacity:.6">মন্তব্য মুছে গেছে</em>';
  try {
    await deleteDoc(doc(db, "posts", r.pid, "comments", r.cid));
    await updateDoc(doc(db, "posts", r.pid), {
      commentCount: increment(-1),
    });
    await deleteDoc(doc(db, "reports", rid));
    delete _rpCache[rid];
    setTimeout(() => {
      document.getElementById("rprow-" + rid)?.remove();
    }, 400);
    toast("মন্তব্য মুছে গেছে");
  } catch (e) {
    loadReports();
    toast("মুছতে পারা যায়নি", "error");
  }
};
window.reportBlockUser = async (rid) => {
  if (!["admin", "maintainer"].includes(currentRole)) {
    toast("অনুমতি নেই", "error");
    return;
  }
  const cached = _rpCache[rid];
  if (!cached) return;
  const { r, commentText, commentAuthor, commentPhoto, authorId } = cached;
  if (!confirm("এই ব্যবহারকারীকে ব্লক করবেন?")) return;
  _rpResolveRow(rid, "ব্যবহারকারী ব্লক করা হয়েছে");
  const authorNameEl = document.querySelector("#rprow-" + rid + " .rp-author");
  if (authorNameEl && !authorNameEl.querySelector(".rp-blocked-badge")) {
    authorNameEl.insertAdjacentHTML(
      "beforeend",
      ` <span class="rp-blocked-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> blocked</span>`,
    );
  }
  try {
    await updateDoc(doc(db, "users", authorId), {
      role: "blocked",
    });
    allMembers = allMembers.map((m) =>
      m.uid === authorId ? { ...m, role: "blocked" } : m,
    );
    _membersLoaded = false;
    await deleteDoc(doc(db, "reports", rid));
    delete _rpCache[rid];
    setTimeout(() => {
      document.getElementById("rprow-" + rid)?.remove();
    }, 400);
    toast("ব্লক করা হয়েছে");
  } catch (e) {
    loadReports();
    toast("ব্লক করা যায়নি", "error");
  }
};
window.reportUnblockUser = async (rid) => {
  if (!["admin", "maintainer"].includes(currentRole)) {
    toast("অনুমতি নেই", "error");
    return;
  }
  const cached = _rpCache[rid];
  if (!cached) return;
  const { authorId } = cached;
  if (!confirm("আনব্লক করবেন?")) return;
  _rpResolveRow(rid, "ব্যবহারকারী আনব্লক করা হয়েছে");
  try {
    await updateDoc(doc(db, "users", authorId), {
      role: "user",
    });
    allMembers = allMembers.map((m) =>
      m.uid === authorId ? { ...m, role: "user" } : m,
    );
    _membersLoaded = false;
    await deleteDoc(doc(db, "reports", rid));
    delete _rpCache[rid];
    setTimeout(() => {
      document.getElementById("rprow-" + rid)?.remove();
    }, 400);
    toast("আনব্লক করা হয়েছে");
  } catch (e) {
    loadReports();
    toast("আনব্লক করা যায়নি", "error");
  }
};
window.dismissReport = async (rid) => {
  _rpResolveRow(rid, "বাতিল করা হয়েছে");
  // Remove the row from DOM immediately
  setTimeout(() => {
    document.getElementById("rprow-" + rid)?.remove();
  }, 400);
  try {
    await deleteDoc(doc(db, "reports", rid));
    delete _rpCache[rid];
    toast("রিপোর্ট বাতিল করা হয়েছে");
  } catch (e) {
    loadReports();
    toast("বাতিল করা যায়নি", "error");
  }
};

window.setRole = async (uid, role, btn) => {
  try {
    await updateDoc(doc(db, "users", uid), { role });
    const rc = {
      maintainer: "#a8cc5a",
      admin: "#e05c5c",
      user: "#888",
    };
    const row = btn.closest(".mrow");
    row.querySelectorAll(".rb").forEach((b) => b.classList.remove("rba"));
    btn.classList.add("rba");
    const badge = row.querySelector(".role-badge");
    badge.textContent = role;
    badge.style.cssText = `background:${rc[role]}20;color:${rc[role]};border:1px solid ${rc[role]}40`;
    allMembers = allMembers.map((m) => (m.uid === uid ? { ...m, role } : m));
    _membersLoaded = false; // invalidate cache so next open re-fetches fresh data
    toast(`ভূমিকা → ${role}`);
  } catch (e) {
    toast("ভূমিকা পরিবর্তন ব্যর্থ হয়েছে", "error");
  }
};

// ── UTILS ──
window.closeModal = (id) => {
  document.getElementById(id).style.display = "none";
  if (id === "postModal" && _unsubCmList) {
    _unsubCmList();
    _unsubCmList = null;
  }
  if (id === "profileModal") {
    _destroySavedObserver();
    _destroyMyObserver();
    _destroyMemObserver();
    _destroyRpObserver();
  }
};
window.closeAllModals = () => {
  ["postModal", "createModal", "profileModal"].forEach(
    (id) => (document.getElementById(id).style.display = "none"),
  );
  if (_unsubCmList) {
    _unsubCmList();
    _unsubCmList = null;
  }
};
window.toast = (msg, type = "success") => {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  setTimeout(() => t.classList.remove("show"), 3000);
};
// initial load triggered by window.addEventListener("load") above

// LIGHTBOX
let _lbImgs = [],
  _lbIdx = 0;
window.openLightbox = (idx) => {
  _lbImgs = window._postImgs || [];
  _lbIdx = idx || 0;
  renderLightbox();
  document.getElementById("lightbox").style.display = "flex";
  _pushModal("lightbox");
};
function renderLightbox() {
  const lb = document.getElementById("lightbox");
  const total = _lbImgs.length;
  lb.querySelector(".lb-img").style.backgroundImage =
    "url('" + _lbImgs[_lbIdx] + "')";
  lb.querySelector(".lb-counter").textContent =
    total > 1 ? _lbIdx + 1 + " / " + total : "";
  lb.querySelector(".lb-prev").style.display = total > 1 ? "flex" : "none";
  lb.querySelector(".lb-next").style.display = total > 1 ? "flex" : "none";
}
window.lbPrev = () => {
  _lbIdx = (_lbIdx - 1 + _lbImgs.length) % _lbImgs.length;
  renderLightbox();
};
window.lbNext = () => {
  _lbIdx = (_lbIdx + 1) % _lbImgs.length;
  renderLightbox();
};
window.closeLightbox = () => {
  document.getElementById("lightbox").style.display = "none";
};

// ── THEME SWITCHER ──
const _themeKey = "uts-theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon =
    theme === "light"
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const fab = document.getElementById("themeToggleFab");
  if (fab) fab.innerHTML = icon;
  localStorage.setItem(_themeKey, theme);
}
window.toggleTheme = () => {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "light" ? "dark" : "light");
};
// Apply saved or system theme on load
(function () {
  const saved = localStorage.getItem(_themeKey);
  if (saved) {
    applyTheme(saved);
  } else if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    applyTheme("light");
  } else {
    applyTheme("dark");
  }
})();
// ── HISTORY / BACK BUTTON ──
// Push a state whenever a modal opens so the browser back button (and Android
// back gesture) closes it instead of leaving the page.
function _pushModal(name) {
  history.pushState({ modal: name }, "");
}
window.addEventListener("popstate", (e) => {
  // Called when the user hits the browser/device back button.
  // Close whichever layer is currently visible, in priority order.
  const lb = document.getElementById("lightbox");
  if (lb && lb.style.display === "flex") {
    closeLightbox();
    return;
  }
  const pinOverlay = document.getElementById("pinModalOverlay");
  if (pinOverlay && pinOverlay.classList.contains("open")) {
    closePinModal();
    return;
  }
  if (document.getElementById("postModal")?.style.display === "flex") {
    closeModal("postModal");
    return;
  }
  if (document.getElementById("createModal")?.style.display === "flex") {
    closeModal("createModal");
    return;
  }
  if (document.getElementById("profileModal")?.style.display === "flex") {
    closeModal("profileModal");
    return;
  }
  if (document.getElementById("searchModal")?.style.display === "flex") {
    closeSearch();
    return;
  }
  if (document.getElementById("commentBox")?.style.display === "flex") {
    closeCbBox();
    return;
  }
});

// Escape key closes the top-most visible layer
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    openSearch();
    return;
  }
  if (e.key === "Escape") {
    const lb = document.getElementById("lightbox");
    if (lb && lb.style.display === "flex") {
      closeLightbox();
      return;
    }
    const pinOverlay = document.getElementById("pinModalOverlay");
    if (pinOverlay && pinOverlay.classList.contains("open")) {
      closePinModal();
      return;
    }
    if (document.getElementById("postModal")?.style.display === "flex") {
      closeModal("postModal");
      return;
    }
    if (document.getElementById("createModal")?.style.display === "flex") {
      closeModal("createModal");
      return;
    }
    if (document.getElementById("profileModal")?.style.display === "flex") {
      closeModal("profileModal");
      return;
    }
    if (document.getElementById("searchModal")?.style.display === "flex") {
      closeSearch();
      return;
    }
    if (document.getElementById("commentBox")?.style.display === "flex") {
      closeCbBox();
      return;
    }
    return;
  }
  const lb = document.getElementById("lightbox");
  if (lb && lb.style.display === "flex") {
    if (e.key === "ArrowLeft") lbPrev();
    else if (e.key === "ArrowRight") lbNext();
  }
});

// ── PIN POST ──
let _pinTargetId = null;

function _pinIsUnlimited() {
  const cb = document.getElementById("pinUnlimited");
  return cb && cb.checked;
}
function _pinTotalMinutes() {
  if (_pinIsUnlimited()) return Infinity;
  const d = parseInt(document.getElementById("pinDays").value) || 0;
  const h = parseInt(document.getElementById("pinHours").value) || 0;
  const m = parseInt(document.getElementById("pinMins").value) || 0;
  return d * 1440 + h * 60 + m;
}

function _pinUpdatePreview() {
  const prev = document.getElementById("pinPreview");
  if (!prev) return;
  if (_pinIsUnlimited()) {
    prev.textContent = "সীমাহীন সময়ের জন্য পিন থাকবে";
    return;
  }
  const total = _pinTotalMinutes();
  if (total <= 0) {
    prev.textContent = "মোট সময়: —";
    return;
  }
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  let parts = [];
  if (d) parts.push(d + " দিন");
  if (h) parts.push(h + " ঘণ্টা");
  if (m) parts.push(m + " মিনিট");
  prev.textContent = "মোট সময়: " + parts.join(" ");
}

window._toggleUnlimitedInputs = (isUnlimited) => {
  ["pinDays", "pinHours", "pinMins"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = isUnlimited;
      el.style.opacity = isUnlimited ? ".35" : "1";
    }
  });
  _pinUpdatePreview();
};

window.openPinModal = (postId, isCurrentlyPinned) => {
  _pinTargetId = postId;
  // Reset inputs
  ["pinDays", "pinHours", "pinMins"].forEach((id) => {
    document.getElementById(id).value = 0;
  });
  const unlCb = document.getElementById("pinUnlimited");
  if (unlCb) {
    unlCb.checked = false;
    _toggleUnlimitedInputs(false);
  }
  _pinUpdatePreview();
  document.getElementById("pinUnpinBtn").style.display = isCurrentlyPinned
    ? "block"
    : "none";
  document.getElementById("pinModalOverlay").classList.add("open");
  _pushModal("pinModal");
};

window.closePinModal = () => {
  document.getElementById("pinModalOverlay").classList.remove("open");
  _pinTargetId = null;
};

const _updateModalPinBtn = (postId, isPinned) => {
  const btn = document.querySelector('.pill-pin[data-pin-id="' + postId + '"]');
  if (!btn) return;
  const svg = btn.querySelector("svg");
  if (isPinned) {
    btn.classList.add("pill-pin-active", "pill-unpin");
    btn.onclick = () => window.directUnpin(postId);
    if (svg) svg.setAttribute("fill", "currentColor");
    btn.childNodes.forEach((n) => {
      if (n.nodeType === 3) n.textContent = " আনপিন করুন";
    });
  } else {
    btn.classList.remove("pill-pin-active", "pill-unpin");
    btn.onclick = () => window.openPinModal(postId, false);
    if (svg) svg.setAttribute("fill", "none");
    btn.childNodes.forEach((n) => {
      if (n.nodeType === 3) n.textContent = " পিন করুন";
    });
  }
};
window.directUnpin = async (postId) => {
  try {
    await updateDoc(doc(db, "posts", postId), {
      pinnedUntil: null,
    });
    toast("পিন সরানো হয়েছে।", "success");
    openPost(postId);
  } catch (e) {
    toast("সমস্যা হয়েছে: " + (e.message || e.code || ""), "error");
  }
};
window.unpinPost = async () => {
  if (!_pinTargetId) return;
  const pid = _pinTargetId;
  closePinModal();
  try {
    await updateDoc(doc(db, "posts", pid), {
      pinnedUntil: null,
    });
    toast("পিন সরানো হয়েছে।", "success");
    openPost(pid);
  } catch (e) {
    toast("সমস্যা হয়েছে: " + (e.message || e.code || ""), "error");
  }
};

window.confirmPinPost = async () => {
  if (!_pinTargetId) return;
  const unlimited = _pinIsUnlimited();
  const mins = _pinTotalMinutes();
  if (!unlimited && mins <= 0) {
    toast("সময় দিন।", "error");
    return;
  }
  const pid = _pinTargetId; // capture before closePinModal nulls it
  // Unlimited = year 9999
  const until = unlimited
    ? new Date(253402300799000)
    : new Date(Date.now() + mins * 60 * 1000);
  closePinModal();
  try {
    await updateDoc(doc(db, "posts", pid), {
      pinnedUntil: until,
    });
    toast("পোস্ট পিন করা হয়েছে!", "success");
    openPost(pid);
  } catch (e) {
    console.error("Pin error:", e);
    toast("পিন করা যায়নি: " + (e.message || e.code || ""), "error");
  }
};

// Live preview on input change
["pinDays", "pinHours", "pinMins"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", _pinUpdatePreview);
});
document
  .getElementById("pinUnlimited")
  ?.addEventListener("change", (e) => _toggleUnlimitedInputs(e.target.checked));

// Close on overlay click
document.getElementById("pinModalOverlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closePinModal();
});
