# Architecture and capacity

## Code boundaries

`src/domain` defines publication states, access rules, types, and validation. `src/application` implements use cases against small repository/storage interfaces. `src/infrastructure` implements MongoDB and object-storage adapters. `src/server` is the composition root, HTTP validation, sessions, and DTO boundary. `src/app` and `src/components` contain server-rendered pages and interactive components.

Dependencies point toward domain and application interfaces. Reading, publishing, authentication, and administration are separate services. Local R2 and real R2 implement the same storage contract. No generic framework or base repository is introduced just to claim SOLID compliance. Test the policy as pure functions, and test transactions against real MongoDB.

Server Components read services directly, avoiding internal HTTP round trips. Client components handle forms, theme, and interaction; they receive bounded DTOs rather than database accounts or storage keys. Server-rendered authenticated pages are dynamic and private responses are not shared-cacheable.

## Consistency and access

Publication metadata carries a monotonically increasing version. Edits, page appends, submission, and reviews compare this version. Conflicting writes return 409. MongoDB transactions coordinate page counts, moderation transitions, and audit writes. Uploaded objects are removed if their database write fails. Superseded covers remain for recovery; an orphan-cleanup job is still needed.

Guest previews and paid access are evaluated independently of presentation. A hidden/unpublished comic is denied, including at its image URL. Membership does not unlock purchase-only titles. Accounts and grants are checked against expiration and revocation, not just background TTL cleanup. Administrative role alone does not buy premium reading access; authorized studio review is a separate path.

## Performance decisions in this version

- Reused MongoDB connection pools, maximum 20 connections per application process.
- Catalog cursor pagination on creation time and ID, no growing offset scan; at most 24 records per API response.
- Unique indexes for email, slugs, comic/page numbers, and reader links; compound indexes for catalog and personal history queries.
- Bounded feeds and dashboards; database query timeouts.
- Comic bytes live in object storage, not MongoDB documents. Uploads are bounded by bytes/pixels, stripped and converted to WebP; covers and pages use different target widths.
- Authenticated comic images stream through authorization rather than exposing bucket keys. They currently use `no-store` for reliable revocation.

## What “a million users” requires

This implementation is a working foundation, not a verified million-user service. Registered users, monthly readers, concurrent readers, page turns per second, and image bandwidth are different workloads. A million registrations does not imply a million simultaneous sessions.

The immediate high-volume bottlenecks are private image traffic through Node, synchronous image processing, database-backed request counters, and live reader analytics. Exact distinct-reader analytics use bounded lookup results but still scan progress records; switch to asynchronous rollups before a large audience. Admin lists currently show a bounded recent subset (50 records, 100 audit entries); add cursor navigation before large editorial operations. Personal libraries show the latest 48 entries; followed feeds consider the latest 100 follows.

Scale in measured stages:

1. Establish expected peak readers and bandwidth, representative image sizes, and latency/error objectives. Load-test a production build with a realistic catalog and concurrent read/upload/moderation workload.
2. Put immutable public covers and safe guest previews behind a CDN. Keep private media authorized at the edge or use short-lived signed delivery with an explicit revocation window. Do not cache authenticated HTML or premium bytes under public URLs.
3. Move conversion/scanning to queued workers with durable job states, retries and idempotency. Add Redis or an edge rate limiter through the existing interface when MongoDB counters become expensive.
4. Replace live analytics with rollups; inspect actual query plans and slow queries, then add search infrastructure if MongoDB text search is insufficient.
5. Add application replicas with a shared session database; budget aggregate pool connections across replicas. Configure backups, restore drills, object retention, alerts, dependency updates and capacity limits.

A modular application keeps initial cost and operational complexity lower than prematurely splitting into microservices. No paid resources are provisioned by this repository.

## Review findings addressed

The implementation review corrected blank access-filter handling, removed an unbounded reader-array aggregation, separated rate-limit buckets with different budgets, and converted corrupt-image failures into validation errors. Browser checks found inherited theme variables overriding dark surfaces; these were moved ahead of dark-theme overrides. Reader analytics are labeled as readers with progress, not unsupported claims about retention or earnings.
