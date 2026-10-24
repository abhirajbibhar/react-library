# BookLore React

A port of the [BookLore](../booklore-ui) Angular UI to React, backed by a Cloudflare Worker API with R2 object storage. No database, no server ops: the Worker serves the SPA and the API, and R2 holds both book files and the library index.

## Architecture

```
booklore-react/
├── apps/
│   ├── web/      Vite + React 19 + React Router 7 + PrimeReact 10 (MIT)
│   └── worker/   Cloudflare Worker (Hono + jose) with an R2 bucket binding
```

**Storage model.** All metadata (users, libraries, shelves, books) lives in a single JSON index at `data/index.json` in the bucket. Every mutation goes through an optimistic compare-and-swap on the object's etag (`IndexStore`), so concurrent uploads/writes from several devices never lose data. Book files live at `files/{bookId}/original.{ext}` and covers at `files/{bookId}/cover`.

**Auth.** First-run setup creates the admin account and a default "General" library (or the optional `ADMIN_USER`/`ADMIN_PASSWORD` secrets do it for you — see Deploying). Login issues stateless JWTs (12 h access / 30 d refresh, HS256). Passwords are PBKDF2-SHA256 (100k iterations). Multi-user with per-user permissions and optional library assignment. Password changes and "Logout everywhere" bump a per-user token version, instantly revoking every token issued before it. There is no sign-up: the first admin is created from `ADMIN_USER`/`ADMIN_PASSWORD` Cloudflare Worker secrets (or by editing the bucket directly), and additional users are added from the Settings → Users panel by an admin.

**Uploads.** The browser reads embedded metadata and a cover thumbnail from the file before uploading (EPUB via JSZip, PDF via pdf.js first-page render, CBX via first image), so books arrive already described. The Worker stores the file, the cover and the index entry.

## Milestone 1 (this codebase)

- First-run admin bootstrap from `ADMIN_USER`/`ADMIN_PASSWORD` secrets / login / change password / multi-user admin
- App shell: sidebar (All Books, Series, Authors, Libraries, Shelves, Unshelved), topbar with upload
- Book browser: grid + table views, search, faceted filter sidebar (author, genre, series, format, read status, rating, publisher, shelf, tag, year, size, language, pages), sorting, multi-select with bulk actions (shelf assign/unassign, read status, delete)
- Series browser + series page, author browser + author detail (derived client-side from the book list)
- Book detail: cover, read status, personal rating, editable description, metadata table, series siblings, download
- Settings: libraries CRUD, shelves CRUD, users CRUD with permissions and password reset
- Worker: ranged file streaming, cover serving, cascading deletes, library-scoped visibility

Deliberately out of scope for now (ported later): audiobook player, dashboard, stats, notebook, metadata manager, bookdrop, magic shelves, i18n, websockets.

## Milestone 2: Readers

Fullscreen readers at `/read/:bookId`, dispatched by the book's format (entry point: the **Read / Continue reading** button on the book detail page):

- **EPUB** — [foliate](https://github.com/johnfactotum/foliate) (MIT), vendored under `apps/web/public/foliate` and loaded as plain ES modules. Books are *streamed*: the Worker walks the ZIP central directory on demand (ranged R2 reads + `DecompressionStream`), so a large EPUB is never buffered. Includes a TOC drawer, themes (light/sepia/dark/night), font size, paginated vs. scrolling flow, justified text, and resume at the saved CFI.
- **CBX** — page images served one at a time from the archive (`GET /api/v1/cbx/:id/pages`, `GET /api/v1/media/book/:id/cbx/pages/:page`): single/spread view, fit page/width, background colour, right-to-left (manga) direction, swipe + keyboard navigation, natural page ordering (`page-2` before `page-10`). CBZ/ZIP work; CBR (RAR) returns a clear error.
- **PDF** — `pdfjs-dist` fetching the ranged file endpoint with an auth header; fit page/width, zoom, page input, keyboard navigation.

Progress: each reader POSTs `/api/v1/books/progress` (debounced, flushed on unmount and `pagehide`), which stores `epubProgress` / `pdfProgress` / `cbxProgress` and `lastReadTime` on the book — readers reopen where you left off. Display preferences are device-local (localStorage).

New Worker pieces: `src/zip.ts` (random-access ZIP over R2), `src/xml.ts` (minimal XML parser — Workers have no DOMParser), `src/routes/epub.ts` (`/info` + `/file/*`) and `src/routes/cbx.ts`. Browser-initiated resource loads (fonts/images inside readers) authenticate with `?token=` in addition to the `Authorization` header.

## Development

Prerequisites: Node 22+, npm 11+.

```bash
npm install            # at the repo root of booklore-react
npm run dev:worker     # terminal 1: API on http://localhost:8787 (local R2)
npm run dev:web        # terminal 2: SPA on http://localhost:5173 (proxies /api)
```

Open http://localhost:5173 — the first visit shows the login page. Sign in with the `ADMIN_USER`/`ADMIN_PASSWORD` values you used when deploying (or set them as local wrangler secrets).

> If npm blocks `esbuild`/`workerd` install scripts, approve them once:
> `npm install-scripts approve esbuild workerd && npm install`

## Tests, typecheck, build

```bash
npm run typecheck      # tsc for both workspaces
npm test               # vitest: store CAS, auth, API end-to-end (incl. zip/epub/cbx/progress),
                       #          filter/sort/entity logic, reader utilities
npm run build          # web: vite build; worker: wrangler dry-run bundle check
```

The worker API tests run the real Hono app against an in-memory R2 double that honours conditional-put semantics.

## Deploying to Cloudflare

One-time setup:

```bash
cd apps/worker
npx wrangler r2 bucket create reader          # same name as in wrangler.jsonc
```

**1. JWT signing secret — required.** Generate a random value and store it as a worker secret. There is no fallback: if `JWT_SECRET` is not set the worker fails on the first request that needs to sign or verify a token.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # generate a value (or: openssl rand -base64 32)
npx wrangler secret put JWT_SECRET                                            # paste the generated value when prompted
```

**2. Required — create the first admin.** There is no sign-up page. Set two Cloudflare Worker secrets so the worker can create the initial admin on first use:

```bash
npx wrangler secret put ADMIN_USER        # e.g. admin
npx wrangler secret put ADMIN_PASSWORD    # choose your own password (8+ characters)
```

Both secrets are required (one alone is ignored). On a fresh store the worker creates that admin — plus the default "General" library — the first time `setup/status` or login is hit, and you can sign in straight away. The secrets are inert once any account exists: they never overwrite or add users. Name/email default to the username; edit them later under Settings → Users.

After deploying, open the URL and sign in with those credentials. From Settings → Users the admin can add, edit, permission and remove other users, and reset their passwords.

```bash
npm run build             # builds the SPA into apps/web/dist
npm run deploy            # wrangler deploy: worker + static assets + R2
```

`wrangler.jsonc` serves `apps/web/dist` as Workers Static Assets with SPA fallback, and routes `/api/*` through the worker first.

To point the worker at a different bucket, edit `r2_buckets[].bucket_name` in `wrangler.jsonc`.

## Resetting local dev data

The local R2 state lives in `apps/worker/.wrangler/` (gitignored). Stop the dev server and delete that folder to start over with an empty store. On Windows the folder can be locked for a moment after stopping; a retry or reboot clears it.

## Security notes

- `wrangler.jsonc` sets `ENVIRONMENT: "production"`. The only JWT signing secret source is the `JWT_SECRET` worker secret — there is no bucket fallback and no dev fallback. If it is not set the worker throws on the first request that signs or verifies a token.
- Every response (API, SPA, reader assets) carries security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Content-Security-Policy` that restricts scripts, styles, images, fonts and connections to the app's own origin plus the CDN the app loads PrimeReact and foliate from.
- Password changes (self-service or admin reset) and **Logout everywhere** bump the user's `tokenVersion`; every token issued before the bump — access and refresh, all devices — is rejected until the user signs in again.
- `ADMIN_USER`/`ADMIN_PASSWORD` only ever act on an empty user list; after the first admin exists they do nothing. Remove them with `npx wrangler secret delete <NAME>` if you prefer.
- The dev script overrides this locally: `npm run dev:worker` runs `wrangler dev --var ENVIRONMENT:development` so local development needs no secrets.
- To throttle login brute-force, add a Cloudflare dashboard rate-limiting rule on `reader.abhirajbibhar.workers.dev/api/v1/auth/login` (e.g. 10 requests per minute per IP, then block). This is configured in the Cloudflare dashboard, not in the worker code.
- ⚠️ After any env-scoped config or secret command (`wrangler ... --env <name>`), confirm production kept its binding: `npx wrangler deployments list` must not show a version message like "Deleted R2 bucket binding Library", and `reader.abhirajbibhar.workers.dev/api/v1/version` must return 200. A plain `npm run deploy` restores the binding if it was ever stripped.
