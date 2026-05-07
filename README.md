# উদ্দীপ্ত তরুণ সংঘ — Developer Handoff

> Free stack: Cloudflare Pages + Firebase + ImgBB  

---

## 📁 Files

```
uddipto/public
│       ├── index.html        ← HTML
│       ├── js/
│       │   └── app.js        ← ALL the JavaScript (read the Table of Contents at the top)
│       └── css/
│           └── style.css     ← CSS
├── firestore.rules           ← Firebase security rules — must be deployed!
└── README.md                 ← Everything documented here
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
5. ⚙️ Settings → Project settings → Your apps → `</>` Web → copy `firebaseConfig`
6. Open `js/app.js`, find **line ~72** (the `firebaseConfig` object) → paste your values:

```js
const firebaseConfig = {
    apiKey: "YOUR_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_ID",
    appId: "YOUR_APP_ID",
};
```

### Step 2 — ImgBB

1. Sign up at [api.imgbb.com](https://api.imgbb.com) → copy your API key
2. Open `js/app.js`, find **line ~2288** (`const IMGBB_KEY = "..."`) → replace with your key

### Step 3 — Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Pages → Direct Upload
2. Drag and drop the **entire `uddipto/` folder** → Deploy
3. Firebase → Authentication → Settings → **Authorized domains** → add your `.pages.dev` URL

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
| Images don't upload | Wrong ImgBB key at line ~2288 in `js/app.js` |
| Permission denied errors | `firestore.rules` not deployed |
| Admin features missing after role change | Hard refresh (Ctrl+Shift+R) |

---

## 🛠️ Local Development

```bash
cd uddipto/public
python -m http.server 8080
# Open http://localhost:8080
```
or
```bash
cd uddipto/public
npx serve .
# check the output
```
Google login needs `http://localhost` — not `file://`.

---
