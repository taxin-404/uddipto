# উদ্দীপ্ত তরুণ সংঘ — Developer Guide

> A Bengali-language Islamic community platform built with a free stack: **Cloudflare Pages + Firebase + ImgBB**.

---

## 📋 Overview

**উদ্দীপ্ত তরুণ সংঘ** (Inspired Youth Organization) is a single-page community platform for dawah activities, guidelines, and member engagement. Users can browse posts, comment (threaded, Facebook-style), like, save, search (with phonetic Banglish→Bengali support), and report content. Admins/maintainers can create posts, pin content, manage member roles, and handle reports.

### Key Features

| Feature | Details |
|---|---|
| **Tabs** | সাম্প্রতিক (Recent/This Month), কার্যক্রম (Activities), নির্দেশিকা (Guidelines) |
| **Google Auth** | Sign in with Google via Firebase Authentication |
| **Posts** | Create with title, body, tags, multi-image upload (max 10) |
| **Comments** | Threaded/reply system with pin support |
| **Likes & Saves** | Optimistic UI updates, persisted per user |
| **Search** | Full-text + phonetic Banglish→Bengali transliteration, filters by type/tag/month/sort |
| **Pin System** | Pin posts with custom duration or unlimited |
| **Image Lightbox** | Gallery viewer with prev/next navigation |
| **Real-time** | Firestore `onSnapshot` listeners for live post/comment updates |
| **Infinite Scroll** | Pagination via `IntersectionObserver` |
| **Dark/Light Theme** | Persisted in localStorage, instant apply (no flash) |
| **Reports** | Users report comments; admins review, dismiss, block users |
| **Role-based Access** | 4 roles control all UI and Firestore operations |

---

## 📁 Project Structure

```
uddipto/
├── build.sh              ← Build script: injects env vars into app.js placeholders
├── .env.example          ← Template for Firebase + ImgBB credentials
├── .gitignore            ← Excludes .env and AL project artifacts
├── firestore.rules       ← Firestore security rules (deploy to Firebase!)
├── README.md             ← This file
└── public/
    ├── index.html        ← Single-page HTML with all modals and UI structure
    ├── css/
    │   └── style.css     ← Full stylesheet with dark (default) + light themes
    └── js/
        └── app.js        ← All application logic (~3,540 lines, ES module)
```

The project was originally a single 10k+ line file. It has been split into separate HTML, CSS, and JS files.

---

## 🏗️ Architecture

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  build.sh (runs at deploy time)                   │  │
│  │  Reads env vars → replaces __PLACEHOLDER__ in     │  │
│  │  app.js with actual Firebase/ImgBB credentials    │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│                          ▼                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  public/ (static files served to browser)          │  │
│  │  index.html  →  css/style.css  →  js/app.js       │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
  ┌──────────────┐          ┌──────────────┐
  │   Firebase   │          │    ImgBB     │
  │  (Auth +     │          │  (Image      │
  │   Firestore) │          │   Hosting)   │
  └──────────────┘          └──────────────┘
```

### Build Process

1. Cloudflare Pages pulls the repo
2. Runs `./build.sh` as the build command
3. `build.sh` validates that all 7 required env vars are set
4. Uses `sed` to replace placeholders in `app.js`:
   - `__FIREBASE_API_KEY__` → actual API key
   - `__FIREBASE_AUTH_DOMAIN__` → auth domain
   - `__FIREBASE_PROJECT_ID__` → project ID
   - `__FIREBASE_STORAGE_BUCKET__` → storage bucket
   - `__FIREBASE_MESSAGING_SENDER_ID__` → sender ID
   - `__FIREBASE_APP_ID__` → app ID
   - `__IMGBB_KEY__` → ImgBB API key
5. Output directory `public/` is deployed as a static site

### Data Flow

```
Page Load
  │
  ├─→ Theme applied instantly (inline <script> in <head>)
  ├─→ loadPosts("recent") fires immediately (no auth wait)
  │     └─→ Fetches posts from Firestore
  │     └─→ Renders cards to #postsGrid
  │     └─→ Sets up IntersectionObserver for infinite scroll
  │     └─→ Starts onSnapshot listener for real-time new posts
  │
  └─→ onAuthStateChanged fires separately
        ├─→ If logged in: fetch user doc → get role
        ├─→ Show profile button, hide login button
        ├─→ Re-render cards with correct like/save states
        └─→ Show/hide admin features based on role
```

---

## 🔐 Security Model

### Firestore Rules Strategy

The rules in `firestore.rules` use several optimization patterns:

| Pattern | Purpose |
|---|---|
| `userData()` | Caches the user document so `get()` is called once per request, not per rule check |
| `onlyChanging(fields)` | Ensures updates only modify specified fields (prevents privilege escalation) |
| `validIncrement(field, delta)` | Validates counter operations are exactly +1 or -1 |
| `validLikeUpdate()` | Validates like/unlike toggles with proper map + counter sync |

### Role Enforcement

Roles are enforced at **two levels**:

1. **Client-side** (`app.js`): `canPost()`, `canDelete()`, `canPinPost()`, etc. control UI visibility
2. **Server-side** (`firestore.rules`): `canPost()`, `isAdmin()`, `canEngage()` block unauthorized writes

⚠️ **Never trust client-side checks alone** — the Firestore rules are the real security boundary.

---

## 👥 Roles

| Role | Capabilities |
|---|---|
| `admin` | Full access: post, delete, pin, manage members, see/handle reports |
| `maintainer` | Same as admin |
| `user` | Like, save, comment, reply, report content |
| `blocked` | Read-only; cannot like, comment, or post |

To change a user's role: Firebase Console → Firestore → `users` collection → find their document → edit the `role` field.

---

## 🗄️ Database Structure

```
posts/{id}
  title, body, type ("blog" | "guideline"), tags[]
  imageUrl, images[]
  imageThumb, imageThumbs[]          ← thumbnail URLs for feed optimization
  authorId, authorName, authorPhoto, authorRole
  createdAt, likeCount, commentCount, viewCount
  likes: { uid: true }, savedBy: [uid]
  pinnedUntil: Timestamp | null

comments/{id}                         ← subcollection of posts
  text, authorId, authorName, authorPhoto
  createdAt, replyTo, replyToId, pinned

users/{uid}
  name, email, photo, role, createdAt, savedPosts[]

tags/{name}
  name, color, createdBy, createdAt

reports/{id}
  type ("comment"), pid, cid
  commentText, commentAuthor, commentPhoto, authorId
  reportedBy, reportedAt
  resolved, resolvedAction
```

---

## 🔑 Firestore Indexes

If posts don't load, check the browser console (F12). Firebase will print a link — click it to auto-create the missing index.

Required indexes (Firestore Console → Indexes tab):

| Collection | Fields | Purpose |
|---|---|---|
| `posts` | `pinnedUntil` DESC | Fetching active pinned posts |
| `posts` | `createdAt` DESC | Chronological post listing (usually auto-created) |

---

## 🧭 Code Navigation

### `js/app.js` — Table of Contents

Open the file and use `Ctrl+G` to jump to any section:

| Line | Section | Key Functions |
|---|---|---|
| 1 | Firebase imports & config | `initializeApp`, `firebaseConfig` |
| 53 | Shared variables | `currentUser`, `currentRole`, `allTags` |
| 71 | Auth | `loginWithGoogle`, `logout`, `onAuthStateChanged`, role helpers |
| 174 | Comment box close | `closeCbBox` |
| 183 | Comment renderer | `renderCommentTree`, `_cmItemHtml` (Facebook-style threaded tree) |
| 325 | Tags | `loadTags`, `saveTag` |
| 350 | Infinite scroll | `_setupScrollObserver`, `_loadMorePosts`, `_appendPosts` |
| 482 | Load posts | `loadPosts`, `renderPosts`, `cardHtml`, `tAgo`, `esc` |
| 776 | Open post modal | `openPost` (full view with gallery) |
| 862 | Floating comment box | `openComments`, `cbSetReply`, `cbPostComment` |
| 988 | Comment actions | `togglePinComment`, `deleteComment`, `reportComment` |
| 1056 | In-modal comments | `loadComments`, `cmSetReply`, `postComment` |
| 1167 | Likes & saves | `toggleLike`, `toggleSave`, `deletePost` |
| 1343 | Search | `filterByTag`, `openSearch`, `runSearch`, type/tag/sort filters |
| 1516 | Phonetic search | Banglish→Bengali transliteration engine |
| 1900 | Create post | `openCreatePost`, tag picker, `submitPost`, image upload |
| 2367 | Drag & drop | Image drag-and-drop upload handler |
| 2398 | Profile modal | `openProfile`, tab navigation |
| 2602 | Saved posts tab | Loads and renders user's saved posts |
| 2691 | My posts tab | Loads and renders user's own posts |
| 2827 | Members tab | `loadMembers`, `setRole`, role assignment UI |
| 2977 | Reports tab | `loadReports`, dismiss, delete, block user |
| 3367 | Utilities | `closeModal`, `closeAllModals`, `toast`, `openLightbox` |
| 3433 | Theme switcher | `toggleTheme`, `applyTheme` |
| 3463 | History / back button | Browser history management for modals |
| 3582 | Pin post | `openPinModal`, `confirmPinPost`, `directUnpin` |

---

## ⚙️ Setup

### Step 1 — Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Create project**
2. **Authentication** → Get started → Enable **Google** provider → add support email → Save
3. **Firestore** → Create database → Production mode → region `asia-south1` (or closest to your users)
4. Firestore → **Rules** tab → paste contents of `firestore.rules` → Publish
5. ⚙️ Settings → Project settings → Your apps → `</>` Web app → copy the config values

### Step 2 — ImgBB

1. Sign up at [api.imgbb.com](https://api.imgbb.com) → copy your API key

### Step 3 — Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Pages → **Connect to Git** (or Direct Upload)
2. **Build settings:**
   - **Build command:** `./build.sh`
   - **Output directory:** `public`
3. **Environment variables** → Settings → Environment variables → Add production variables:

| Variable | Value |
|---|---|
| `FIREBASE_API_KEY` | ⚠️ Get from Firebase Console → Project Settings → Web app |
| `FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | `your-project-id` |
| `FIREBASE_STORAGE_BUCKET` | `your-project.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | `your-sender-id` |
| `FIREBASE_APP_ID` | ⚠️ Get from Firebase Console → Project Settings → Web app |
| `IMGBB_KEY` | ⚠️ Get from [api.imgbb.com](https://api.imgbb.com) |

4. Deploy → Firebase → Authentication → Settings → **Authorized domains** → add your `.pages.dev` URL

> 📋 See `.env.example` for a template. Copy it to `.env` for local development.

### Step 4 — Make Yourself Admin

1. Open the deployed site → Log in with Google
2. Firebase Console → Firestore → `users` collection → find your document
3. Edit `role` field: `"user"` → `"admin"` → Save
4. Refresh the site — admin features are now visible

---

## 🛠️ Local Development

Copy `.env.example` to `.env` and fill in your values, then run:

```bash
# Option 1: Inject vars then serve
source .env && ./build.sh && cd public && python -m http.server 8080
```

```bash
# Option 2: Manual replace then serve
cp .env.example .env  # edit .env with your values
source .env && ./build.sh
cd public && npx serve .
```

> Google login needs `http://localhost` — not `file://`. Add `localhost` to Firebase Auth → Authorized domains.

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| Google login fails | Firebase → Auth → Authorized domains → add your Cloudflare URL or `localhost` |
| Posts don't load | F12 console → click the Firestore index link to auto-create it |
| Images don't upload | Wrong `IMGBB_KEY` env var, or ImgBB API rate limit hit |
| Build fails: "Missing environment variables" | All 7 vars must be set in Cloudflare Pages settings |
| Permission denied errors | `firestore.rules` not deployed to Firebase |
| Admin features missing after role change | Hard refresh (Ctrl+Shift+R) — role is cached in the page session |
| Search returns no results | Phonetic search only works for Bengali/Banglish text; try simpler keywords |
| Pinned posts not showing | Missing `pinnedUntil` DESC index in Firestore → Indexes tab |

---

## ⚠️ Known Limitations

| Limitation | Reason | Workaround |
|---|---|---|
| Client-side type filtering | Avoids needing a composite Firestore index on `type + createdAt` | Fetches 3× PAGE_SIZE and filters in JS — acceptable for small datasets |
| No server-side full-text search | Firestore doesn't support native full-text search | Phonetic search runs client-side on fetched posts; fine for ~hundreds of posts |
| ImgBB rate limits | Free tier has upload limits | Consider upgrading or adding a CDN/cache layer |
| No image optimization | Images served at full size from ImgBB | Thumbnails (`imageThumb`, `imageThumbs[]`) are used in the feed to save bandwidth |
| Single JS bundle | All code in one `app.js` file | TOC at top of file + `Ctrl+G` for navigation; consider bundler for larger projects |
| No offline write queue | Firestore cache is read-only for offline | Users see cached posts offline but can't create/edit without connection |

---

## 🚀 Deployment Checklist

- [ ] Firebase project created with Auth (Google) + Firestore enabled
- [ ] `firestore.rules` deployed to Firestore → Rules tab
- [ ] Firestore indexes created (`pinnedUntil` DESC, `createdAt` DESC)
- [ ] ImgBB account created, API key obtained
- [ ] Cloudflare Pages connected to repo
- [ ] All 7 environment variables set in Cloudflare Pages
- [ ] Cloudflare Pages build command: `./build.sh`, output dir: `public`
- [ ] Firebase Auth → Authorized domains includes your `.pages.dev` URL
- [ ] First user logged in and promoted to `admin` in Firestore
- [ ] Test: create a post, upload images, comment, like, search, pin, switch theme
