# nextra-comments-poc

Nextra 4 docs site with an in-house inline comments prototype. Sample pages are a generic platform handbook. No real company or client data.

`<Comments />` is mounted once in `app/[[...mdxPath]]/page.tsx` (Nextra 4 has no v3 `theme.config` `main` slot). Do not add it to individual MDX files.

## Features

- **Selection composer.** Select article text, then Comment. The popup sits below the selection and flips above near the viewport bottom. Empty (Save disabled), typing, saving, and error with Retry (draft kept). A draft prompts before discard.
- **Thread overlay.** Click the marker or `<mark>` to open the thread. ≥1280: right gutter, flip left then below if needed, 8px inside the viewport. 641–1279: float below the line across the content column. ≤640: bottom sheet, max 70vh, modal, focus-trapped.
- **Bottom index.** Page / Inline / Outdated lists stay at the foot of the page. Inline rows have **Show on page**, which scrolls to the quote and opens the overlay. Outdated threads (quote not re-found) live only here.
- **Author-only resolve.** Only the author of the root comment can resolve or reopen. Anyone else gets HTTP 403; the UI shows status without the button.
- **No replies on resolved threads.** `POST` with `parentId` on a resolved thread returns 409 (`Thread is resolved`).
- **Shortcut.** Ctrl/⌘+Alt+M opens the composer on the current selection. The Comment button tooltip shows the same hint.
- **A11y.** Markers are real buttons in reading order (`aria-label` like `2 comments on ‘…’`, `aria-expanded`). Highlights are `<mark class="nc-mark">` re-applied after MDX paint. Comment works from mouse, keyboard (Shift+arrows), touch, and the shortcut. Focus moves into the popup and back to the trigger. Esc, click-outside, and Close dismiss it.

Inline comments store quote + prefix + suffix + heading id. Character offsets are never stored.

## Quick start

Node.js ≥20.19. Use **22** (`.nvmrc`) or **26** (CI).

```bash
cp .env.example .env
npm ci
npm run dev
```

Open http://localhost:3000. Pick a display name in the comments panel, then select text on a page such as `/deploy`.

Use `npm ci`, not `npm install`. `next` is pinned to **15.5.29**. Nextra’s peer range includes Next 16; `npx next` installs `next@latest`. The lockfile, `overrides`, and `scripts/run-next.mjs` keep 15.5.29 and never call `npx next`. See [SECURITY-NOTES.md](SECURITY-NOTES.md) for audit overrides and npm 11 `allowScripts`.

`npm run dev` runs a Node/Next preflight, `prisma migrate deploy`, then local `next dev`. Default `DATABASE_URL` is `file:./prisma/dev.db` from the repo root.

## Architecture

| Piece | Role |
| --- | --- |
| `components/comments/Comments.tsx` | Client UI: marks, markers, composer, overlay, index |
| `lib/comments/reattach.ts` | Exact match, then fuzzy (similarity ≥ 0.78), else Outdated |
| `lib/comments/service.ts` | Create, resolve, delete-own; 403/409 rules |
| `lib/comments/repository.ts` | Storage interface (`CommentRepository`) |
| `lib/comments/prisma-repository.ts` | SQLite implementation |
| `lib/comments/auth.ts` | `getCurrentUser(req)` (cookie stub today) |
| `app/api/comments` | `GET`/`POST` list and create |
| `app/api/comments/[id]` | `PATCH` resolve/reopen, `DELETE` own |
| `app/api/me` | Display-name cookie for the stub |

Each row: `page`, `pageVersion`, `threadId`, `parentId`, `author`, `body`, `createdAt`, `resolved`, `anchor` (`null` for page-level). `resolved` lives on the thread root.

**Prisma ORM 7.10.1** (`prisma` + `@prisma/client`; there is no `@prisma/client@8`). Generator output is `generated/prisma`. CLI config is `prisma.config.ts`. Runtime uses `@prisma/adapter-better-sqlite3`. Application code outside `lib/db.ts` and `prisma-repository.ts` does not import Prisma.

Replace `getCurrentUser` for OIDC/Entra ID. Keep `{ id, name } | null`. Mutating routes ignore any posted author.

### Postgres

1. Set `datasource.db.provider` to `postgresql` in `prisma/schema.prisma`.
2. Set `DATABASE_URL` to a Postgres URL.
3. Install `@prisma/adapter-pg` and `pg` at Prisma 7.10.1; in `lib/db.ts` use `PrismaPg` instead of `PrismaBetterSqlite3`.
4. `npx prisma migrate dev` for a new Postgres migration. Do not reuse the SQLite migration files.
5. Leave `CommentRepository` as the boundary.

## Scripts and tests

| Script | What it does |
| --- | --- |
| `npm run dev` | Preflight, migrate, Next 15.5.29 |
| `npm test` | Vitest: quote re-attachment and HTTP API |
| `npm run test:e2e` | Playwright: composer, overlay, keyboard, 390px sheet; axe-core on open/closed in light and dark |
| `npm run smoke` | Dev server until `GET /` and `GET /api/comments?page=/deploy` return 200 |
| `npm run build` / `start` | Production build and server |

Vitest covers exact/fuzzy/outdated attach, create/list/reply, delete-own, delete-other 403, resolve/reopen by the author, resolve/reopen 403 for anyone else, and reply 409 on a resolved thread.

Playwright uses Google Chrome (`channel: 'chrome'`). Install with `npx playwright install chrome`.

## CI

`.github/workflows/ci.yml` on `main`, `cursor/**`, and pull requests:

- **test** matrix Node 22 and 26: `npm ci` (fails if npm 11 prints an `install-scripts` warning), `npm audit --audit-level=high`, Next pin check, vitest, smoke. Playwright e2e on Node 22 only.
- **npm-install-smoke** on Node 26: uncached `npm install`, audit, Next pin, smoke.

## Security notes

Audit overrides, remaining deprecations, and `allowScripts` are in [SECURITY-NOTES.md](SECURITY-NOTES.md).
