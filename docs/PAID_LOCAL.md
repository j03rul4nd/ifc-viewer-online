# Paid workspace against a local backend

The paid workspace reads and writes through one data layer
(`src/lib/cloud/paid-client.ts`, `paidDataSource()`):

| Source | When | What it does |
|---|---|---|
| `sample` | Default, the public preview, production builds without a session | Sample data; nothing leaves the browser |
| `local` | Dev build, `VITE_API_URL` on localhost and `VITE_PAID_DEV_SESSION` set | Talks to `ifc-cloud-api` running on this machine |
| `cloud` | Signed-in session against the deployed API | Not switched on yet |

Screens use `usePaidQuery` / `usePaidDataSource` (`src/hooks/usePaidQuery.ts`) and never
decide this themselves. A production build ignores `VITE_PAID_DEV_SESSION`.

## 1. Backend (private repo `ifc-cloud-api`, branch `feat/real-data-local`)

```bash
cd ifc-cloud-api && docker compose up -d db storage
```

Create a database and the bucket once:

```bash
docker exec ifc-cloud-api-db-1 psql -U ifc -d postgres -c "CREATE DATABASE ifc_real"
```

```bash
DATABASE_URL=postgresql://ifc:ifc@localhost:54329/ifc_real DIRECT_URL=postgresql://ifc:ifc@localhost:54329/ifc_real npx prisma migrate deploy
```

```bash
DATABASE_URL=postgresql://ifc:ifc@localhost:54329/ifc_real node scripts/seed-local-roles.mjs
```

The bucket `ifc-deliveries` is created with a signed `PUT` to `http://localhost:8333/ifc-deliveries`
(see the backend README). `.dev.vars` (gitignored) needs `ENVIRONMENT=development`, `DEV_AUTH=true`,
the local `DATABASE_URL`, the `R2_*` values of the SeaweedFS container, a `RUNNER_TOKEN` of 32+
characters and the `FEATURE_*` flags (`RECEPTION`, `ISSUES`, `AUTOMATIONS`, `MAIL_QUEUE`, `WEBHOOKS`,
`QUALITY_GATE`) set to `true`, plus `WEBHOOKS_ALLOW_LOCAL=true` (signed webhooks to a local receiver). Then:

```bash
npx wrangler dev --port 8787 --ip 127.0.0.1 --test-scheduled
```

The seed creates `org_localdemo` with one member per role:
`user_localowner`, `user_localadmin`, `user_localeditor`, `user_localreviewer`, `user_localviewer`,
`user_localguest`. The dev token is `dev:<user>:org_localdemo`.

## 2. Validation runner (this repo)

Deliveries are validated by the viewer's own engine, the same workers the browser runs
(`mcp/src/engine.ts`), in a small Node process that claims jobs from the API:

```bash
IFC_API_URL=http://127.0.0.1:8787 RUNNER_TOKEN=<same as .dev.vars> npm run runner:local
```

It refuses any API that is not on localhost. It checks the SHA-256 and the STEP header first, so a
swapped or non-IFC file is rejected before validation; an IDS requirement set is checked too.

## 3. Web app

`.env.local`:

```
VITE_API_URL=http://127.0.0.1:8787
VITE_PAID_DEV_SESSION=dev:user_localowner:org_localdemo
```

Open `/workspace?preview=pricing`. Change the session to act as another role.

The supplier's upload page (`/deliver#t=<supplier token>&p=<project slug>`) exists only with
`VITE_FEATURE_SUPPLIER_UPLOAD=true` in `.env.local`; production has no such flag, so the route stays
off. Inviting a supplier in Reception (workspace mode) shows that link once. The page checks the IFC in
the browser with the viewer's validator (the same score the runner gives) and the project's ISO 19650
naming rule, delivers straight to storage and shows the receiver's verdict once the runner has
validated it (`npm run runner:local -- --drain`).

## 4. Integration tests

```bash
PAID_LOCAL_API=http://127.0.0.1:8787 RUNNER_TOKEN=<token> npm run test:paid-local
```

Covers: a real IFC delivered → validated by the runner → verdict → a person's decision sealed with
the file hash; the same file twice is one delivery; a non-IFC file rejected; an issue created from a
clash and edited by two users at once (both changes kept); roles (Reviewer cannot decide, Guest cannot
see deliveries, Viewer cannot queue mail); the mail queue (same key → one message, cancel); network
errors returned as a code. `PAID_LOCAL_BIG=1` also delivers the 94 MB Shanghai Tower. Without
`PAID_LOCAL_API` the file is skipped, so CI stays green.

Part 5 (`paid-local-5.integration.test.ts`) covers the supplier page (the token alone shows no
project; with the link's project it shows that one; own deliveries only, with the real verdict), an
issue raised from a validation result (the same rule on the same element twice is one issue; Viewer and
Guest cannot), and automations whose e-mail action lands in `/mail/outbox` after a real delivery is
validated, never sent, and skips a contact who unsubscribed.

Part 2 (`paid-local-2.integration.test.ts`) covers: a watched folder (contract mock of the
SharePoint/Drive connector) → a real Reception delivery → server validation → the result written next
to the model, and the signed webhooks (`delivery.received`, `validation.completed`) verified with the
connector's `verifySignature`; mail contacts (consent, unsubscribe by link, no consent → refused);
the rule library by role (Owner/Admin edit; Editor, Reviewer, Viewer and Guest cannot) and requirement
versions published at the same time (never two with the same number). The webhook receiver listens
on `PAID_LOCAL_HOOK_PORT` (default 9912): workerd cannot reach ephemeral ports. The suites run one
after the other because they share the runner queue.

Part 3 (`paid-local-3.integration.test.ts`, robustness): every role tries every write and gets exactly
what `lib/team.ts` allows; a proxy (`PAID_LOCAL_PROXY_PORT`, default 9913) lets the backend commit and
then drops the answer, and the retry neither duplicates (mail by key) nor overwrites (issue and rule
set edits come back as a conflict showing the change already saved); two people editing the same issue
or rule set — the second gets a 409 with the current copy; Pro client links (password, wrong password,
views, revoke, lock after 10 tries); a certificate signed from a real validation
(`runner.mjs --validate <file>`) carries the company logo on the public lookup. `.dev.vars` also needs
`FEATURE_CLIENT_LINKS=true` and a dev `CERT_SIGNING_KEY_PKCS8` (`npm run generate-key`, local only).
The tests run the runner with `--drain`, so an earlier job never takes a later test's place.

Part 4 (`paid-local-4.integration.test.ts`): Reception tabs built from the server's requirement sets,
suppliers and deliveries (the register hash-chains the real file SHA-256 and the decision); project
edits by role; clash statuses shared through `cloudSync` between two members (a late older copy never
wins, a Viewer cannot write); an issue from a clash with both GlobalIds; the certificate logo set and
removed only by Owner/Admin.
