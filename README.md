# উদ্দীপ্ত তরুণ সংঘ — Developer Handoff

> Free stack: Cloudflare Pages + Firebase + ImgBB  

---

## 📁 Files

```
uddipto/
├── build.sh              ← Injects env vars at deploy time
├── .env.example          ← Copy to .env for local dev
├── public/
│       ├── index.html    ← HTML
│       ├── js/
│       │   └── app.js    ← ALL the JavaScript (read the Table of Contents at the top)
│       └── css/
│           └── style.css ← CSS
├── firestore.rules       ← Firebase security rules — must be deployed!
└── README.md             ← Everything documented here
```

The original was one 10k+ line file. It is now split into:
- `index.html` — only HTML
- `css/style.css` — only CSS
- `js/app.js` — only JavaScript, with a full **Table of Contents** at the top

**Open `js/app.js` in VS Code** → read the TOC at the top → `Ctrl+G` to jump to any line number.

---

## ⚙️ Setup

### Step 1 — Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → Create project
2. **Authentication** → Get started → Enable **Google** provider → add support email → Save
3. **Firestore** → Create database → Production mode → region `asia-south1`
4. Firestore → **Rules** tab → paste contents of `firestore.rules` → Publish
5. ⚙️ Settings → Project settings → Your apps → `</>` Web → copy the config values

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
| `FIREBASE_AUTH_DOMAIN` | `uddipto-4d584.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | `uddipto-4d584` |
| `FIREBASE_STORAGE_BUCKET` | `uddipto-4d584.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | `512907631953` |
| `FIREBASE_APP_ID` | ⚠️ Get from Firebase Console → Project Settings → Web app |
| `IMGBB_KEY` | ⚠️ Get from [api.imgbb.com](https://api.imgbb.com) |

4. Deploy → Firebase → Authentication → Settings → **Authorized domains** → add your `.pages.dev` URL

> 📋 See `.env.example` for a template. Copy it to `.env` for local development.

### Step 4 — Make yourself Admin

1. Open the deployed site → Log in with Google
2. Firebase Console → Firestore → `users` collection → find your document
3. Edit `role` field: `"user"` → `"admin"` → Save
4. Refresh the site — admin features now visible

---

## 👥 Roles

| Role | What they can do |
|---|---|
| `admin` | Post, delete, pin, manage members, see reports |
| `maintainer` | Same as admin |
| `user` | Like, save, comment, reply, report |
| `blocked` | Read-only (can't comment or like) |

To change someone's role: Firebase → Firestore → `users` → find their doc → edit `role`.

---

## 🗄️ Database Structure

```
posts/{id}         title, body, type, tags[], imageUrl, images[]
                   authorId, authorName, authorPhoto, authorRole
                   createdAt, likeCount, commentCount, viewCount
                   likes:{uid:true}, savedBy:[uid], pinnedUntil

comments/{id}      text, authorId, authorName, authorPhoto
                   createdAt, replyTo, replyToId, pinned

users/{uid}        name, email, photo, role, createdAt, savedPosts[]

tags/{name}        name, color, createdBy, createdAt

reports/{id}       type, pid, cid, commentText, commentAuthor,
                   reportedBy, reportedAt, resolved, resolvedAction
```

---

## 🔑 Firestore Indexes

If posts don't load, check the browser console (F12). Firebase will print a link — click it to auto-create the index.

Needed indexes (Firestore → Indexes tab):
- `posts`: `pinnedUntil` DESC (for pinned posts)
- `posts`: `createdAt` DESC (auto-created usually)

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| Google login fails | Firebase → Auth → Authorized domains → add your Cloudflare URL |
| Posts don't load | F12 console → click the Firestore index link |
| Images don't upload | Wrong `IMGBB_KEY` env var |
| Build fails: "Missing environment variables" | Add all 7 vars in Cloudflare Pages settings |
| Permission denied errors | `firestore.rules` not deployed |
| Admin features missing after role change | Hard refresh (Ctrl+Shift+R) |

---

## 🛠️ Local Development

Copy `.env.example` to `.env` and fill in your values, then run:

```bash
# Option 1: Inject vars then serve
source .env && ./build.sh && cd public && python -m http.server 8080
```

or

```bash
# Option 2: Manual replace then serve
cp .env.example .env  # edit .env with your values
source .env && ./build.sh
cd public && npx serve .
```

Google login needs `http://localhost` — not `file://`.

---
