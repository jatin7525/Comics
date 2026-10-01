# Security boundary and release gaps

Implemented protections include salted scrypt password hashes, opaque server-side sessions stored as hashes, HttpOnly/SameSite cookies (Secure and __Host prefix in production), server-side role and ownership checks, exact-origin validation for mutations, strict input schemas, request/image size limits, private object storage, optimistic concurrency, and auditable moderation.

Every private page request rechecks publication/access state. Browser restrictions such as disabling right-click or detecting developer tools are not used as authorization. A reader who can see a page can still capture it. Watermarking, anomaly detection, abuse response and takedown processes can discourage redistribution; they cannot guarantee prevention.

## Deployment configuration

- Local MongoDB intentionally has no password and is loopback-only. Production requires authenticated MongoDB with TLS and restricted network access; never expose the local Compose configuration publicly.
- Secrets belong only in server environment configuration. R2 keys must be scoped to the private bucket; do not enable public bucket access.
- Set the exact HTTPS `APP_ORIGIN`. Production cookies require HTTPS. The local production-build smoke override `ALLOW_LOCAL_STORAGE=true` must not be used for a public deployment.
- `TRUST_PROXY=true` is safe only when ingress strips client-supplied IP headers and writes the configured trusted header. Restrict direct origin access. Otherwise anonymous requests share the conservative local rate-limit bucket.
- API counters are shared in MongoDB, but SSR traffic and ingress connection/body timeouts also need proxy-level protection. Fixed-window counters are an initial control, not a comprehensive abuse defense.
- Back up the database and objects together; test restoration and failed-upload/orphan cleanup.

## Before public account launch

Implement verified email, password reset/recovery, administrator MFA, account/session management, tested privacy/deletion/export processes, and real operational monitoring. Add a nonce-based Content Security Policy compatible with Next.js and the theme bootstrap. Review content policy, age-rating behavior, licensing, appeals, retention, and moderation staffing. Age ratings currently inform readers; they are not age verification.

Image processing validates formats and strips metadata. Production upload scanning and queued processing remain work. Publication editing currently supports metadata, cover replacement, and page appends in editable states; arbitrary page replacement/reordering and post-publication revision workflows are future work. Admin status/role changes protect existing administrators; administrator provisioning is an operator responsibility.

Payment webhooks, verified entitlements, refunds, subscriptions, creator payouts, ad-network integration and consent are deliberately absent. No browser or public API can manufacture a purchase. Seeded membership is a local testing fixture only.

This is not a penetration-test certification. Unit, integration and browser tests cover the access paths described in VERIFICATION.md; independent security review and production staging are still required.
