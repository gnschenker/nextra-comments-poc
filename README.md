# nextra-comments-poc

In-house comments for a Nextra docs site. Page-level threads live at the bottom of each page. Inline comments attach to a quote, not to character offsets.

This is a prototype. The sample pages are a generic internal platform handbook. They do not use real company or client data.

## How it works

### Component mounting

`<Comments />` is mounted once in `app/[[...mdxPath]]/page.tsx`, which is the Nextra 4 catch-all route for every MDX page in `content/`. You do not add the component to individual MDX files.

Nextra 4 dropped the v3 `theme.config` `main` slot. The catch-all page is the equivalent place to wrap article content.

### Data model

Each stored row is one comment:

- `page`: docs pathname, such as `/deploy`
- `pageVersion`: hash of the article text at write time
- `anchor`: `null` for a page-level comment. For an inline comment it is the quote, prefix, suffix, and nearest heading id. Character offsets are never stored.
- `threadId`: shared by a root comment and its replies
- `parentId`: `null` on a root comment
- `author`, `body`, `createdAt`, `resolved`

`resolved` is stored on the thread root. Replies belong to that thread.

### Anchoring algorithm

On write, the client stores the selected quote plus about 40 characters of prefix and suffix, and the id of the nearest heading.

On load, `attachAnchor` re-finds the quote in the live article:

1. Exact substring match of the quote.
2. If several exact matches exist, prefix, suffix, and heading id break the tie.
3. If there is no exact match, a fuzzy window search (Levenshtein similarity at least 0.78), still using prefix, suffix, and heading as tie-breakers.
4. If nothing qualifies, the thread is listed under **Outdated**.

Highlights and margin markers are computed from the live DOM. They are not stored.

### Auth seam

`getCurrentUser(req)` in `lib/comments/auth.ts` is the only place that decides who the caller is. Today it reads the `nextra_comments_user` cookie. The UI posts a display name to `POST /api/me`, which sets that cookie.

Delete-own is enforced in `CommentService.deleteOwn`. The server compares `comment.author.id` to `getCurrentUser(req)`.

### Storage seam

`CommentRepository` in `lib/comments/repository.ts` is the storage interface. `PrismaCommentRepository` is the SQLite implementation. HTTP handlers call `CommentService`, not Prisma.

## Run locally

Requires Node.js 20.19 or newer. Node.js 22 is the version in `.nvmrc`. Node.js 26 is in CI.

```bash
cp .env.example .env
npm ci
npm run dev
```

Use `npm ci`, not `npm install`. `next` is pinned to **15.5.29** (exact). See [SECURITY-NOTES.md](SECURITY-NOTES.md) for audit overrides and npm 11 `allowScripts`. Nextra 4.5.1's peer range is `next: >=14`, which includes Next 16, and `npx next` with no local bind installs `next@latest` (16 today). The lockfile and `overrides` keep 15.5.29. `npm run dev` runs the local `node_modules/next` binary, never `npx next`.

`npm run dev` runs a preflight (Node version and pinned Next version), `prisma migrate deploy`, then `next dev`. If Next 16 is present, the launcher passes `--webpack` because Nextra injects a webpack config and Next 16 defaults to Turbopack. Next 15.5.29 does not accept `--webpack`; webpack is already the default. If Next exits before it prints Ready, the wrapper exits 1 and prints the last log. Default `DATABASE_URL` is `file:./prisma/dev.db` from the repo root, so the database file is `prisma/dev.db`. Open [http://localhost:3000](http://localhost:3000).

Pick a display name in the comments panel. Select article text to leave an inline comment.

```bash
npm test
npm run smoke
```

Tests cover quote re-attachment and the HTTP API, including a rejected delete of someone else's comment. `npm run smoke` starts the dev server and waits until `GET /` and `GET /api/comments?page=/deploy` return HTTP 200.

## Prisma 8 / Prisma ORM 7

`prisma@latest` is Prisma 8 (release candidate). There is no `@prisma/client@8`. Prisma 8's SQLite package is experimental `@prisma/orm-sqlite`, and the Prisma 8 CLI has no `generate` or `migrate deploy`.

The official upgrade table for a Prisma 6 app that is not on MongoDB, when staying on the generated client, is [Upgrade to Prisma ORM 7](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7). This repo follows that guide:

- `prisma` and `@prisma/client` are pinned at **7.10.1** (current `@prisma/client`).
- Generator is `prisma-client` with required `output = "../generated/prisma"`.
- CLI config lives in `prisma.config.ts` (schema path, migrations path, `DATABASE_URL`). Datasource URL is no longer in `schema.prisma`.
- Runtime uses the **driver adapter** `@prisma/adapter-better-sqlite3` (Rust-free client). That removes the Prisma 6 query engine binary.
- `prisma generate` is explicit (`postinstall` and CI). `db push` / `migrate` no longer take `--skip-generate`.
- `migrate deploy` still applies `prisma/migrations`.

Application code outside `lib/comments/prisma-repository.ts` and `lib/db.ts` still does not import Prisma. `CommentRepository` is unchanged.

## Wire OIDC or Entra ID SSO

Replace the body of `getCurrentUser` in `lib/comments/auth.ts`. Keep the return type `{ id, name } | null`.

A typical Entra ID path:

1. Put the Next.js app behind your identity-aware proxy, or validate the ID token in `getCurrentUser`.
2. Map the subject claim to `id` and the name or email claim to `name`.
3. Leave `CommentService.deleteOwn` unchanged. It already trusts `user.id` from this function.
4. You can delete `POST /api/me` once a real session exists, or keep it only as a local stub behind an env flag.

Do not read the display name from the client on mutating routes. The API already ignores the posted author and uses `getCurrentUser`.

## Switch to Postgres

1. In `prisma/schema.prisma`, set `datasource.db.provider` to `postgresql`.
2. Set `DATABASE_URL` to a Postgres URL.
3. Install `@prisma/adapter-pg` and `pg` at the same Prisma 7 version, then change `lib/db.ts` to construct `PrismaClient` with `new PrismaPg({ connectionString: url })` instead of `PrismaBetterSqlite3`.
4. Run `npx prisma migrate dev` to emit a Postgres migration. Do not reuse the SQLite migration files.
5. Keep `CommentRepository` as the boundary. The Prisma adapter is the file that should change if you later move storage into a separate service.

No application code outside `lib/comments/prisma-repository.ts` and `lib/db.ts` should import Prisma.
