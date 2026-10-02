# Independent Reader, Studio and Admin services

The repository now builds three Next.js applications. Shared domain/application code stays under `src/`; route trees, build outputs and running processes are separate.

| Service | Route source | Development command | Local URL | Build |
| --- | --- | --- | --- | --- |
| Reader | `src/app` | `npm run dev` | http://localhost:3100 | `npm run build` |
| Author Studio | `apps/studio/src/app` | `npm run dev:studio` | http://localhost:3101/studio | `npm run build:studio` |
| Administration | `apps/admin/src/app` | `npm run dev:admin` | http://localhost:3102/admin | `npm run build:admin` |

Run development commands in separate terminals. MongoDB and the R2 simulator are still shared local services. `npm run build:all` verifies all three artifacts. `npm run db:accounts` creates missing local test accounts and indexes without adding publications or paid grants. `npm run db:seed` remains an explicit, optional demo-data command; do not run it to preserve an empty catalog.

## Enforced boundaries

- Reader does not install `/studio`, `/admin`, publication-write APIs, moderation APIs or unpublished-page preview APIs.
- Studio installs publication editing/upload/submission and owner-authorized previews. It does not install admin APIs or public registration.
- Admin installs moderation, policy, account-access and report APIs plus review previews. It does not install publication creation/upload APIs or public registration.
- Staff login validates the current account role before issuing a session: author/admin for Studio, admin only for Admin. Role and suspension are checked again when a session is used.
- Each session stores its issuing audience. A valid reader token belonging to an administrator still cannot authenticate against Admin. Renaming its cookie does not change this. Logout also respects audience.
- Cookies have different names, are host-only (no Domain attribute), HttpOnly, SameSite=Lax, and Secure with a `__Host-` prefix in production. Existing pre-split sessions are intentionally invalid; sign in again separately in each workspace.
- Every mutation checks its service's exact configured APP_ORIGIN. Rate-limit buckets are service-scoped. Application ownership and admin checks remain in the use cases and handlers.
- Navigation to another workspace uses its configured origin. Login and registration remain standalone screens without platform navigation.

## Deployment and remaining infrastructure work

Use different HTTPS hosts, for example reader, studio and admin subdomains of your eventual domain. Configure `READER_ORIGIN`, `STUDIO_ORIGIN`, `ADMIN_ORIGIN`, and set `APP_ORIGIN` to the current service's origin. The local runner chooses it for you; production environments must supply it. Never use wildcard CORS or a shared parent-domain session cookie.

The Dockerfile accepts `--build-arg SERVICE=reader`, `studio` or `admin` and packages the selected standalone output. It is a packaging recipe, not a deployed or fully verified container release. Direct Next.js start commands are available as `start`, `start:studio`, and `start:admin`; these require the corresponding `*_ORIGIN` variable. For standalone deployment, use the generated server entry with its static/public assets as the Dockerfile does.

Sharing MongoDB is intentional so new publications and moderation decisions are immediately visible across services. This is application/deployment separation, not independent databases or a complete zero-trust microservice topology. Local services currently share database and storage credentials. Before public hosting, give each service separate least-privilege database/R2 credentials; Reader should not have publication-mutation permissions. Author applications require private sample PUT/DELETE access: use a separate application-sample bucket and credentials when enforcing storage isolation; the local implementation currently uses an applications/ prefix in the shared private bucket. Protect admin ingress with an identity-aware gateway and administrator MFA. Restrict direct origin access, configure trusted proxy headers, and run each artifact under a separate service identity. A compromised process with broad shared credentials is not contained by route separation alone.

Cloudflare's existing static build is unchanged and cannot deploy these three backend services automatically. No new cloud resources, DNS records or access gateway have been provisioned.

## Verification

`npm run test:services` uses the local test accounts to check absent cross-service routes, forbidden roles, token replay (including renamed cookies), exact-origin rejection, authenticated workspace rendering, standalone login and reader browser navigation. It leaves the catalog untouched. Run it after starting all three services; install Chromium with Playwright first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing installation.

The integration suite now also checks cross-service sessions, scoped logout, denied staff registration, and immediate role demotion against an isolated MongoDB database. Original sample-catalog browser journeys use all three services and require explicitly seeded demo data; they are separate from the empty-catalog isolation test.
