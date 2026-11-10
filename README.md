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

Requires Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm run dev
```

`npm run dev` runs `prisma migrate deploy` and then `next dev`. Prisma resolves `file:./dev.db` relative to `prisma/schema.prisma`, so the database file is `prisma/dev.db`. Open [http://localhost:3000](http://localhost:3000).

Pick a display name in the comments panel. Select article text to leave an inline comment.

```bash
npm test
```

Tests cover quote re-attachment and the HTTP API, including a rejected delete of someone else's comment.

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
3. Run `npx prisma migrate dev` to emit a Postgres migration. Do not reuse the SQLite migration files.
4. Keep `CommentRepository` as the boundary. The Prisma adapter is the file that should change if you later move storage into a separate service.

No application code outside `lib/comments/prisma-repository.ts` and `lib/db.ts` should import Prisma.
