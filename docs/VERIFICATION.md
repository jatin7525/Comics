# Verification — 1 October 2026

Environment: Node.js 24.18.1, Next.js 16.3.8, local MongoDB 8 replica set, Miniflare R2, Chromium via Playwright. No live cloud database, real R2 bucket, payment service, or deployment was used.

| Check | Result |
| --- | --- |
| ESLint (application, scripts, tests) | Passed |
| Strict TypeScript | Passed |
| Domain/unit suite | 18 passed |
| MongoDB + R2 integration suite | 10 passed |
| Browser end-to-end suite | 4 passed |
| Next.js production build | Passed |
| Existing static deployment build | Passed |
| npm audit | 0 known vulnerabilities at verification time |

The integration suite covers actual object round trips, author ownership, stale updates, submitted-state locking, competing review decisions with exactly one audit event, direct media protection, entitlement expiry, hidden content, hashed/revoked sessions, and concurrent rate counters. Its temporary database is removed after completion.

Browser journeys cover guest preview boundaries, theme persistence, 320/390/768px overflow and wrapping genres, sign-in, saved library/history, reader/admin boundaries, foreign-origin mutations, membership versus purchase-only access, and author upload → moderation → discovery → hide. Uploaded SVG is rejected. A browser fixture is hidden after the successful journey and remains in the audit history. Repeated runs reset only the loopback auth test bucket after verifying local service configuration.

Desktop/mobile discovery and Author Studio/Admin screenshots were reviewed. Screenshots and traces are local artifacts in `test-results/`, not committed website assets. Test selectors account for Next.js retaining inactive routes, and wait for completed save mutations before navigating.

## Bounded performance smoke

A local production build on port 3101, with local-storage testing explicitly enabled, ran `node scripts/load-smoke.mjs`:

- 100 catalog HTML requests, concurrency 5, after one warm-up request.
- 0 failures; 2,058 ms elapsed; 48.6 requests/second.
- p50: 89 ms; p95: 203 ms.

This is a development-machine smoke measurement with a tiny seeded catalog, not a benchmark or capacity promise. It excludes browser execution, images, internet latency and sustained traffic. The script rejects non-loopback targets and caps its workload. The production-mode server was stopped after this check.

CI is configured to run lint, typecheck, unit/integration tests and both builds. The workflow has not yet been observed on GitHub. Docker packaging, live R2 and production Cloudflare compatibility have not been verified. See SECURITY.md and ARCHITECTURE.md for explicit release gaps.


## Service separation — 2 October 2026

Reader, Studio and Admin now build as separate applications. All three production builds and standalone entry/route-manifest boundary checks passed. ESLint and TypeScript checks cover all three apps. Unit tests: 18 passed. MongoDB/R2 integration tests: 11 passed, including audience-bound sessions, scoped logout, staff registration rejection and live role demotion.

`npm run test:services` passed against the three running local processes. It verifies wrong-service routes return 404; invalid workspace roles return 403; replayed tokens return 401 even when their cookies are renamed; cross-origin admin writes return 403; valid sessions reach their own handlers and workspace screens. Chromium checks cover standalone login, reader navigation, actual staff dashboards and mobile overflow. No sample catalog was seeded. Local test authentication counters are reset only for the loopback identity before this explicitly invoked test.

A separate Firefox run visited art, catalog, About, missing pages and unauthenticated Studio redirects five times without a runtime error. The previously reported negative Performance.measure timestamp was not reproduced. A similar development-only error is tracked upstream at https://github.com/vercel/next.js/issues/86060; this result is not proof that the intermittent upstream issue is fixed. No global Performance API patch or error suppression was added.

Original seeded-catalog browser journeys have been adapted for the split origins but were not rerun against the user's empty catalog. The live service-boundary checks plus isolated publishing integration tests were used instead. Docker images, separate production credentials, network gateway policies and cloud deployments remain unverified.

Author onboarding: 12 integration tests cover the expanded backend, including private sample access, requests for changes, resubmission, atomic approval and session revocation. The dedicated local browser journey passed registration through sample upload, admin approval and first Studio sign-in, then removed its temporary account and sample. This does not establish production load capacity or verify ownership of submitted art.

## Comic chapters — 2 October 2026

ESLint and strict TypeScript passed for all three apps. Unit tests: 24 passed, including chapter range derivation, boundary validation and the rule that the guest preview is per comic, not per chapter. MongoDB/R2 integration tests: 16 passed, including chapter ownership, invalid boundaries, exactly one winner for concurrent chapter saves, preserved chapter IDs across detail edits, and locking after submission. `npm run test:studio` passed against the three local services: it uploads a second page batch as a new chapter, renames and adds chapters in the editor, publishes through Admin, and checks the reader chapter list, current-chapter heading and chapter jump links. It also checks mobile overflow, then removes its temporary publications.

## Infinite-scroll reader and image caching — 2 October 2026

Lint, strict TypeScript, unit tests (24) and MongoDB/R2 integration tests (17) passed. The new integration test checks that scroll batches stop at the first locked page for guests (login) and readers without entitlement (payment), never return locked story text, report the next batch start, and reject out-of-range pages. `npm run test:studio` passed against the three local services: the reader server-renders three pages, fetches the fourth on scroll, shows the sign-in gate inline, updates the address to the page being read, and switches chapters through the drop-down (landing on the gate for a locked chapter). It also checks the 7-day private cache header on a readable page, `no-store` on a denied page, and 390px mobile overflow.

## New chapters, Originals and site name — 2 October 2026

Lint, strict TypeScript, unit tests (24), MongoDB/R2 integration tests (20) and production builds of all three apps passed. New integration tests cover the chapter release lifecycle on a published comic (ownership, stale versions, a single release at a time, pending pages unreadable through images and scroll batches, upload locking after submission, admin-only decisions, request changes and resubmission, exactly one concurrent approval with one audit event, discard deleting pages and stored images), Originals (admin-created work flagged, author work not, administrator publishing their own Original, the `original` catalog filter), and the stored site name. The new browser journey `npm run test:originals` passed against the three local services: one admin account signs in to Reader, Studio and Admin; renaming the site updates the title, logo and footer; an admin's comic is published as an Original with its badge and `/originals` listing; an author starts, uploads and submits a new chapter in Studio; the pending page renders the not-found page and its image returns 404; Admin approves it from the dashboard; and the reader shows "Chapter 2". The earlier Studio journey (`npm run test:studio`) still passes.

## Managing published comics — 2 October 2026

Lint, strict TypeScript, unit tests (24), MongoDB/R2 integration tests (25) and production builds of all three apps passed. New integration tests publish a two-chapter comic, then verify immediate detail and chapter edits with audit events, the rights requirement, that published work cannot be re-submitted, inserting a page at the end of a chapter with later chapters shifted, replacing a page image (old object deleted), reordering, removing a page with chapter shifting and object deletion, ownership checks, pausing page-sequence edits while a new chapter is pending, deleting a chapter (pages and objects removed, last chapter protected), and deleting the comic (publication, pages, cover, saved entries removed; one audit event). `npm run test:originals` now continues after the chapter approval: the author renames the live comic (reader shows the new title), adds a page to Chapter 1 through Studio, replaces page 1, removes page 2, deletes chapter 2 and its pages, then deletes the comic by typing its title; the reader then shows the not-found page. The first run after starting the development servers timed out once on the Admin review page while routes were still compiling; the next two complete runs passed. `npm run test:studio` still passes.

## Chapter comments — 3 October 2026

Lint, strict TypeScript, unit tests (24), MongoDB/R2 integration tests (26) and production builds of all three apps passed. New integration tests cover per-chapter threads, newest-first ordering, the Author label, `mine`/`canDelete` for commenter, comic owner and guest, deletion rules, unknown chapters, cursor paging past 20, refusing comments on a chapter the reader cannot open (membership chapter), and comment cleanup when a chapter or comic is deleted. `npm run test:originals` now has a signed-in reader open Chapter 1's comments on the reading screen and post one, then checks a guest can read the thread through the public API but cannot post (401). Two consecutive runs passed. `npm run test:studio` still passes.
