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
