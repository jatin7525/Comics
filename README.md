# Astra Comics

A Next.js + TypeScript publishing application with MongoDB, private comic storage, reader accounts, Author Studio, and an editorial Admin console. The original HTML prototype remains at the repository root.

## Run locally

Requirements: Node.js 22 or newer, npm, and Docker Compose. Node.js 24 was used for verification.

```bash
npm ci
npm run local:init
npm run db:up
```

Start the persistent Cloudflare R2 simulator in a separate terminal:

```bash
npm run storage:dev
```

Then create test accounts without placeholder comics and start the Reader service:

```bash
npm run db:accounts
npm run dev
```

Start **`npm run dev:studio`** and **`npm run dev:admin`** in separate terminals for Author Studio at **http://localhost:3101/studio** and Admin at **http://localhost:3102/admin**. Each requires its own sign-in.

Open Reader at **http://localhost:3100**. Use this hostname consistently: mutations validate the configured `APP_ORIGIN`.

`local:init` creates an ignored `.env.local` with random secrets. Find the local demo password in its `SEED_PASSWORD` entry. Do not share or commit this file.

| Account | Access |
| --- | --- |
| reader@astra.test | Reader |
| member@astra.test | Reader; a test membership is added only by the optional full demo seed |
| author@astra.test | Author |
| author2@astra.test | A different author for ownership testing |
| admin@astra.test | Editorial administrator |

All seeded accounts use that local password. Seeding is restricted to local development and does not reset existing passwords. New registrations are always readers. Administrators can grant author access. There is no role-switching shortcut in the application.

MongoDB listens only on `127.0.0.1:27028`; the R2 simulator listens on `127.0.0.1:8788` and requires a server token. MongoDB uses a single-node replica set so publishing and audit transactions work locally. `npm run db:down` stops MongoDB without deleting its volume. R2 objects persist in `.local/r2`.

## Implemented flows

- Public discovery, search, genre/access filters, cursor pagination, artwork, creator profiles, light/dark themes, and wrapping mobile categories.
- Exactly four guest preview pages per published comic. Subsequent free pages require login. Premium pages require the matching active entitlement, checked again at the image endpoint.
- Persistent saved library, reading history, creator follows, and reports.
- Author-owned drafts, image validation and WebP conversion, sequential page upload, rights declarations, age ratings, submission, and actionable editorial feedback.
- Named comic chapters with chapter navigation for readers; the four-page guest preview still applies per comic. See [Studio publishing](docs/STUDIO-PUBLISHING.md#chapters).
- Admin review, publication hiding, author permissions, account suspension/session revocation, reports, platform policies, and transactional audit records.

**Payments are deliberately deferred.** Subscription/purchase controls cannot grant access. Ads currently mean a labeled house-promotion placement with an admin policy switch; no paid ad network or payout calculation is connected.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build:all
```

Integration tests need MongoDB and the simulator running; they use an isolated temporary test database and clean it up. The original sample-catalog browser journeys need all three apps running and the optional `npm run db:seed` fixtures. To preserve an empty catalog, use `npm run test:services` instead.

```bash
npx playwright install chromium
npm run test:e2e
```

Browser tests create a sample publication in the development database and hide it after successful verification. They reset only the loopback authentication test counter for repeatability. Never point them at production. Screenshots and traces are ignored under `test-results/`.

## Deployment

The existing Cloudflare static build remains **`node scripts/build.mjs`**, output **`dist`**. This still deploys the original HTML prototype. Connecting GitHub does not automatically convert that deployment into this backend application.

The new application needs a Node.js runtime, reachable MongoDB replica set, and private R2 credentials. `npm run build` produces a Next.js standalone build. The included Dockerfile is a packaging option; its image has not been deployment-tested. Run `npm run db:indexes` as a controlled release step against the target database before traffic.

For real R2, configure `STORAGE_DRIVER=r2` and the server-only R2 variables in `.env.example`. Keep the bucket private. The adapter uses R2's S3 API; live cloud credentials have not been tested. Cloudflare Workers would require a separately validated Next.js adapter and compatibility checks for MongoDB and image processing. Do not change the live static pipeline to `next build` and expect it to work.

See [service separation and deployment](docs/SERVICES.md), [architecture and scaling](docs/ARCHITECTURE.md), [security and release gaps](docs/SECURITY.md), and [verification](docs/VERIFICATION.md). Earlier product strategy is in [PRODUCT-REVIEW.md](PRODUCT-REVIEW.md).

Author onboarding is documented in [Author applications](docs/AUTHOR-APPLICATIONS.md): readers submit private samples, and administrators review evidence before granting Studio access.

Studio now has a [guided publishing workflow](docs/STUDIO-PUBLISHING.md) with batch page upload, ordering, story text, tags and INR price settings.
