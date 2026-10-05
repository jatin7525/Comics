# Admin MCP and chapter editing

MCP is hosted **only by the Admin service** at `${ADMIN_ORIGIN}/mcp` (Streamable HTTP). The Reader and Studio services do not expose MCP or its OAuth routes. It is disabled by default and initially shares no content.

## Who and what may connect

- Only an **active administrator account** can authorize OAuth or receive an admin-issued Bearer token. Account role/status is checked on every authenticated request, including refresh.
- Only **admin-created comics** (the server-owned `original: true` flag) explicitly selected in Admin → AI connections are eligible. Independent-author comics are excluded from configuration, catalog queries, direct page reads, draft reads, annotations, and reference results—even if an ID is inserted into settings outside the UI.
- This is an editorial integration, not a public catalog API. A selected original's published pages can be inspected by the admin without a reader purchase. Unpublished material requires the separate preview permission below.
- Removing a selection blocks subsequent reads. Disabling MCP permanently invalidates existing credentials, including after re-enabling. Revoking a client invalidates all its existing connections.

## Enable and configure

1. Deploy the updated Admin and Studio builds. Reader can deploy from the same revision as usual.
2. Apply the repository's indexes to the intended MongoDB database using `scripts/indexes.ts` with that environment's configuration. New collections are `mcpSettings`, `mcpClients`, `mcpGrants`, `mcpTickets`, and `imageAnnotations`. Transactions require a replica set (including Atlas).
3. Sign into **Admin → AI connections** (`/admin/mcp`). Enable MCP and enter the publication IDs of the **admin-created comics** you wish to share, one per line. IDs appear in their Studio/review URLs. Invalid or independent-author IDs are rejected; an empty list exposes nothing.
4. Enable draft preview and/or image annotation only if required. Then grant those permissions to the individual connection.
5. Browser-hosted clients may need their exact origin approved. Enter origins without paths or trailing slashes. Native/server-side clients that send no Origin header do not require an entry. Do not use wildcard origins.

No new environment secret is required. Existing `ADMIN_ORIGIN`, service origins, MongoDB, private R2, and rate-limit configuration must be correct. Production origins and callbacks use HTTPS; loopback HTTP callbacks are accepted for desktop development. All credentials remain server-side. Do not prefix them with `NEXT_PUBLIC_`.

## OAuth

Register the client's **exact callback URL(s)** in Admin → AI connections. Use a public client for desktop applications, or a confidential client when its server can keep a secret. Copy the client ID and, if issued, the once-visible secret into the AI client's connector settings.

Discovery:

- `/.well-known/oauth-protected-resource/mcp` (also root `/.well-known/oauth-protected-resource`)
- `/.well-known/oauth-authorization-server`
- `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`

Authorization Code with PKCE **S256** is required for every client. Requests must identify the MCP endpoint as `resource`; callbacks match exactly. Authorization codes and consent tickets expire in five minutes and can be consumed once. Access tokens last one hour; refresh connections last up to 30 days, rotate refresh tokens, and revoke the connection on refresh/code replay. Reconnect after expiry. Client authentication supports `none`, `client_secret_post`, and `client_secret_basic`.

Optional dynamic client registration is **off by default**. When enabled, `/oauth/register` creates a **pending** client. An administrator must verify and approve its callbacks before anyone can authorize it. Reuse that client ID after approval. There is no automatic approval or remote client-metadata-document fetching. Clients must support pre-registration or retry after pending registration approval; compatibility is not guaranteed with clients that require automatic registration or CIMD.

Scopes (space-separated, always including `comics:read`):

| Scope             | Permission                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comics:read`     | Read selected admin-created comics and their published pages; search stored image references. No writes.                                                   |
| `comics:preview`  | Additionally inspect selected originals' drafts and unreleased chapters. Requires the admin preview setting.                                               |
| `comics:annotate` | Write only per-image character names, visual tags, and descriptions. Requires the annotation setting. Combine with preview to annotate unpublished images. |

## Bearer-token clients

Create a token in Admin → AI connections using an existing **admin** email and an expiry of 1–365 days. Copy it once into the AI client's secret/header settings:

```text
URL: https://your-admin-domain.example/mcp
Authorization: Bearer <admin-issued-token>
```

The client must support remote MCP over Streamable HTTP and custom authentication headers. Tokens cannot be recovered after dismissal; revoke and replace if lost. Tokens and OAuth secrets are stored as hashes; plaintext credentials are returned only when issued.

## Tools and image references

Read-only tools: `search_comics`, `get_comic`, `read_comic_page`, `search_image_references`.

Preview adds: `search_unpublished_comics`, `get_comic_preview`, `read_unpublished_page`. The preview catalog includes selected originals at any publication stage; preview details identify private chapter page ranges.

Annotation adds: `annotate_comic_image`. Read the image first. Pass its `imageRevision` and `annotationVersion` (as `expectedVersion`) together with character names, tags, and a description. Labels are normalized for exact case-insensitive reference search. Concurrent edits fail instead of silently overwriting. Replacing an image invalidates its old labels until re-annotated; reordering keeps labels attached to the same page ID. Annotation changes enter the audit log. No tool can publish, delete, replace artwork, change accounts, or buy anything.

An AI image generator with MCP image-reading support can search a character/tag, then call the returned `readTool` for that reference. Reading returns actual WebP image content, optional story text, and metadata, not a public R2 URL. MCP does not itself generate images or automatically run a tagging model. Comic text and image text are untrusted content, not instructions.

Each request is stateless, authenticated, and rate-limited. Catalog/reference responses are paginated (up to 20 items); selection is bounded to 500 IDs. One page image is decoded with a pixel cap, scaled for the MCP response, and capped at 2 MB before base64 encoding. Original stored art is unchanged. Missing story text is not represented as an OCR transcript. This is a bounded implementation, not evidence of million-user load capacity.

## Studio: edit comics and chapters

Existing publications open the management interface at `/studio/publications/{id}/edit`; creation still uses the separate wizard. Management has sections for details, cover/artwork, access/pricing, chapter structure, pages, new chapter releases, and review.

Each chapter has its own URL: `/studio/publications/{id}/chapters/{chapterId}`. Owner authors and admins may edit; other accounts are rejected. The page offers single/batch upload, a horizontal preview strip, page movement, replacement/removal, image descriptions, and per-page story text. Use the release's own ID for an unpublished chapter, or `all` for a comic without chapter boundaries. Admin review pages link into Studio, which uses its own admin/author login session.

Draft releases remain beyond the published page count. Their edits and reorders cannot move public pages, and their story text never enters public preview search. Submitting locks the release until editorial changes are requested or approval publishes it. Editing an already-published chapter applies immediately, as the existing platform workflow does; the UI explicitly indicates this.

## Validation and operations

Automated integration tests cover admin-only authorization, eligibility/selection enforcement, PKCE/resource/callback checks, consent/code replay, refresh replay, revocation on demotion/disable/client changes, private-page editing, stale annotations, reference ordering, and SDK read-only/image behavior. Run the existing unit, typecheck, lint, integration, and all-service build commands; integration tests require local MongoDB and the R2 simulator.

Secrets and content are not automatically provisioned, enabled, or deployed. Expiry is checked in application code even before MongoDB TTL cleanup. Monitor request rates, database latency, private storage access, and image-processing costs before increasing traffic. Disconnected image objects follow the existing storage-cleanup policy.
