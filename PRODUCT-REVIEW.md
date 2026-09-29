# Panel: product direction and prototype review

Panel is an independent comic publishing platform with three connected experiences: a public reading destination, an authorized creator studio, and an operational admin console. The name, stories, creators, illustrations, pricing, and metrics are sample content.

## The product promise

Readers should find a story before being asked to create an account. Every published comic is discoverable by guests, including premium titles. The first four pages of every comic are readable without login. Page five is the first entitlement decision, never a catalog-wide paywall.

| Title access model | Guest | Signed-in free reader | Plus member | Individual buyer |
| --- | --- | --- | --- | --- |
| Free | Pages 1–4 | Full access | Full access | No purchase necessary |
| Membership | Pages 1–4 | Preview | Full access | Not sold individually |
| Individual purchase | Pages 1–4 | Preview | Preview unless purchased | Full access |
| Membership or purchase | Pages 1–4 | Preview | Full access | Full access |

The prototype treats the four-page allowance per comic, not per session or per chapter. Production chapter navigation must not accidentally provide four new free pages for every chapter. Login alone never unlocks paid content. Artwork can remain publicly viewable and attract readers to the associated comic.

## What is interactive now

- Public catalog, genre and access filtering, title/author search, featured story selection, and illustrated artwork detail.
- Four-page guest preview, free-account flow, correct membership versus purchase gating, simulated checkout, membership cancellation, and individual purchases.
- Saved library, reading history, continue-reading progress, followed creators, a demo notification feed, and a weekly digest preference.
- Author dashboard, analytics, revenue breakdown, payout statement export, profile editing, drafts, submission form, rights declaration, age rating, access model, and editorial feedback.
- Admin moderation decisions, author invitations and suspension, visibility controls, membership overview, policy settings, sponsorship controls, reader reports, and an exported audit log.
- An approved submitted comic appears in the public catalog. An unpublished comic disappears from discovery. A suspended author cannot open the publishing form.
- Desktop and mobile layouts, labeled controls, visible keyboard focus, modal focus containment, and reduced-motion handling.

## Revenue strategy

Treat these as hypotheses to validate with real readers and creators, not forecasts.

1. **Platform membership.** One understandable monthly price for a clearly defined catalog. The prototype uses $8/month as an illustrative starting point. Establish the creator revenue pool, eligible reads, anti-fraud rules, and payout transparency before launch.
2. **Individual comic sales.** Sell eligible titles without requiring a subscription. The prototype uses $4.99 per comic. Production must define whether the purchase covers a fixed volume, a completed series, or specified chapters. Avoid promising all future chapters indefinitely.
3. **Contextual advertising.** Clearly labeled discovery sponsorships and advertising around free reading. Avoid ads covering artwork, interfering with page navigation, or appearing as editorial recommendations. Keep member and purchased reading ad-free. Ad frequency should be capped.
4. **Creator partnerships.** Later, offer sponsored drawing workshops, art process videos, and branded creator collaborations. Keep commercial relationships explicit and give creators approval rights.
5. **Bundles and gifts.** Once the catalog has depth, offer completed-series bundles, seasonal curated collections, and gift memberships. These have a clearer reader benefit than complicated virtual currencies.
6. **Optional creator support.** Tips and one-off support can follow reliable payouts and dispute handling. Do not launch a wallet, coin system, physical merchandise store, and crowdfunding system at the same time.

Illustrative unit economics to model before choosing prices:

`Net contribution = collected revenue − creator payouts − payment fees − refunds − taxes borne by platform − delivery costs − moderation/support costs`

Track membership and comic sales separately. Show authors gross revenue, deductions, net earnings, pending balance, refund adjustments, and payout status. The demo earnings table illustrates a 15% platform fee; this is a product assumption, not an agreed commercial term.

## Why readers return

| Reader need | Product response | Measure |
| --- | --- | --- |
| Find something that suits me | Genre browsing, editorial collections, clear cover art and synopsis | Detail-to-preview conversion |
| Finish what I started | Saved progress and continue-reading cards | Next-session reading rate |
| Know when a creator publishes | Following, opt-in digest, chapter release notices | Return rate after an opted-in notification |
| Trust the paid offering | Explicit access labels, real previews, simple cancellation | Conversion, refund rate, cancellation reasons |
| Find the next story after finishing | Related titles and creator back catalogs | Completed readers starting another comic |
| Feel part of the creative process | Public concept art, creator notes, moderated discussions later | Follows and repeat creator visits |

Favor meaningful retention over streak pressure. Avoid forced notifications, guilt-based cancellation, endless popup offers, or paying for artificial reading energy. A reader should return because a story matters to them.

## Add next, after the prototype

**Launch-critical:** actual page assets and chapter ordering; reliable sign-in; server-side roles and entitlements; payment and refund handling; secure upload processing; creator agreements; copyright reporting; age controls; publication scheduling; error monitoring; backups; and operational support.

**Next product layer:** dedicated creator profiles, series tables of contents, chapter release calendars, collections, spoiler-aware comments, accessible image descriptions, reading direction controls, zoom, full-screen reading, content warnings before opening mature work, and a robust library filter.

**Growth layer:** editorial newsletters, referral experiments, gift purchases, creator recommendations, giftable bundles, multilingual catalogs, and consent-based personalization. Only add these when the reading and publishing loops work consistently.

## Admin and safety model

Use distinct production roles: reader, author, editor, moderator, finance, and platform admin. An author manages only their own work. Reviewers need a rights checklist, policy evidence, an action reason, revision history, and an appeal route. Finance access should be separated from content moderation.

Moderation lifecycle: draft → submitted → under review → approved/scheduled → published. Alternative paths: changes requested → revised submission; rejected → appeal; published → restricted/unpublished with a recorded reason. Production must preserve existing purchase entitlements according to the published removal/refund policy.

Require decisions and settings changes to produce an immutable audit event. The local demo log shows the experience; it is not immutable or security-grade. Sensitive changes such as disabling pre-publication review should require elevated production permissions and a reason.

For reported content, support triage severity, assignment, deadlines, investigation notes, author response, and an appeal decision. A report should not automatically remove a publication without an appropriate policy decision.

## Review decisions made during this build

- Kept premium titles visible to guests; moved access decisions into the reader.
- Separated membership-only, purchase-only, and dual-access titles so readers do not buy a subscription under a false assumption.
- Added continue-reading cards instead of an arbitrary engagement score or gamified dashboard.
- Added an art gallery as a creator discovery surface, not a competing storefront with another payment system.
- Connected author submissions to admin review and public visibility to make the demo more than disconnected screens.
- Included rights checks and mandatory rejection/change notes instead of a context-free approve/reject control.
- Kept ads clearly labeled and their controls separate from editorial picks.
- Deferred tokens, auctions, chat rooms, merchandise inventory, and creator-specific subscriptions until the central reading business has evidence of demand.

## Prototype boundaries

This is a frontend prototype, not an enterprise backend. Workspace switching is intentionally open for review. Authentication, payments, uploads, emails, notifications, ratings, operational metrics, and payouts are simulated. File inputs do not transfer manuscript data. Sample comic pages reuse original vector scene assets and sample dialogue; they are not finished comics. Local storage can be modified by the user and must never enforce paid access in production.

Policy switches illustrate administrative settings; most are not full enforcement engines. Ad controls for placements without a rendered slot are configuration demonstrations. Art submissions do not yet publish actual uploaded imagery. Admin approval publishes a sample illustrated comic record, not an uploaded manuscript.

Production should authorize every protected page request on the server and use short-lived signed asset access. Do not ship full-resolution protected pages to guest browsers and merely hide them with CSS. Do not use local storage as a source of truth for purchases. Payment events must be verified, idempotent, and reconciled to the entitlement ledger.

Before public release, complete legal policy drafting, privacy/consent design, accessibility review with real assistive technology, payment failure and chargeback behavior, security review, load testing, and device testing with actual comic assets.
