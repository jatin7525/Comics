# HTTP API

Endpoints are installed only in their owning service: reader community/catalog APIs on Reader, publication-write APIs on Studio, administrative APIs on Admin. Login/logout and authorized cover retrieval exist in each service; registration exists only on Reader. Review page retrieval exists in Studio and Admin. Sessions cannot cross these boundaries. See SERVICES.md.

Mutation requests require the exact configured `Origin` and JSON content type, except image upload (multipart). Authentication uses the HttpOnly session cookie. IDs are UUIDs. Unknown fields are rejected on mutation schemas. Errors return `{ error: { code, message, requestId } }`; common statuses are 400 validation, 401 login required, 403 permission/access denied, 404 inaccessible object, 409 stale version/state, 413 oversized body, 429 throttled.

| Method and path | Purpose |
| --- | --- |
| POST /api/auth/register | `{ name, email, password }`; creates reader only |
| POST /api/auth/login | `{ email, password }` |
| POST /api/auth/logout | Revoke current session |
| GET /api/catalog | `genre`, `access`, `search`, `cursor`, `limit` (1–24), `kind` |
| GET /api/comics/:id/cover | Public published cover or authorized workspace access |
| GET /api/comics/:id/pages | `from`, `limit` (1–10); readable pages from `from` with alt/story text, stopping at the first locked page (`gate`, `gatePage`, `nextFrom`) |
| GET /api/comics/:id/media/:page | Guest preview or server-verified reader entitlement; browser-cacheable for 7 days (`private`) |
| POST /api/comics/:id/save | `{ enabled }`; authenticated |
| POST /api/comics/:id/progress | `{ page }`; must have reading access |
| POST /api/comics/:id/report | `{ reason }`; authenticated |
| POST /api/creators/:id/follow | `{ enabled }`; authenticated |
| POST /api/publications | Publication input; author/admin |
| PATCH /api/publications/:id | `{ version, publication }`; owner/admin, editable state |
| POST /api/publications/:id/upload | Multipart `kind` (cover/page), `version`, `alt`, `file` |
| PUT /api/publications/:id/chapters | `{ version, chapters: [{ id?, title, startPage }] }`; owner/admin, editable comic |
| POST /api/publications/:id/submit | `{ version }`; complete assets + rights |
| GET /api/studio/:id/media/:page | Owner/admin preview, including unpublished pages |
| POST /api/admin/reviews/:id | `{ version, decision, note }`; separate reviewer |
| POST /api/admin/content/:id | `{ version, reason }`; hide published content |
| PATCH /api/admin/users/:id | `{ role, status, reason }`; protected admin accounts |
| PATCH /api/admin/policies | `{ adsEnabled, submissionsEnabled }` |
| POST /api/admin/reports/:id | `{ reason }`; resolve report |

Publication input: `title`, `synopsis`, `genre`, `kind` (comic/artwork), `access` (free/membership/purchase/both), `ageRating` (everyone/teen/mature), `rightsConfirmed`. Authorship and initial status are assigned on the server. Standalone artwork must be free. Comics require a cover and at least five pages before submission. Review decisions are published, changes_requested, or rejected; the latter two require actionable notes.

Updates increment the version. On 409 reload current data before making another decision; do not blindly retry a stale payload. Images must be single-frame JPEG, PNG or WebP, at most 10 MiB and 25 million decoded pixels. No payment or public entitlement-grant endpoint exists.
