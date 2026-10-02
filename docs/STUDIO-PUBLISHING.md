# Guided Studio publishing

Studio offers separate comic and artwork entry points. Both use four steps: Details, Images, Access, and Review. Drafts can be reopened and saved independently of submission. Submitted publications remain locked under the existing editorial review rules.

Comics support a cover/thumbnail and multi-selection of page images. A horizontal strip previews the selected order; arrow buttons work with keyboard and touch before upload and for saved pages. One upload action processes the selected files sequentially using the returned optimistic version. Completed uploads remain saved after a partial failure; unsuccessful selections stay available for retry. There is no application-level page-count maximum. Per-image validation and request rate protection still apply. Artwork has a single image and public free access.

Each saved comic page has an accessibility description and optional story text for dialogue/narration. Text is rendered server-side only when the reader may view the corresponding image. Only the first four pages contribute to the publication's public search text. Moving a page into or out of the preview updates that text in the same transaction as the order. Editing a page updates its text and the preview search document atomically. The application does not automatically transcribe images.

Tags are normalized and deduplicated, with up to 20 tags of 40 characters. Public catalog search indexes title, author, synopsis, tags and free-preview text. Related-title recommendations rank matching tags within the same publication kind and age rating, with genre as a fallback. These are content-based suggestions, not personalized recommendations. Detail pages provide canonical URLs, descriptions and social metadata. Reader preview pages include story text in HTML; later pages use noindex metadata and never expose protected text in metadata. Search indexing/rank is not guaranteed.

Individual-purchase and membership-or-purchase comics accept custom INR prices stored as integer paise. A positive price is required on submission for those access modes. Admin review and the public details page show the saved price. Checkout, charging, revenue sharing and payouts remain unimplemented.

## API additions

- `GET /api/publications/:id`: owner/admin editor data, including safe page fields.
- `POST /api/publications/:id/pages/order`: current version and an exact permutation of page IDs.
- `PATCH /api/publications/:id/pages/:pageId`: current version, image description and story text.
- Upload responses include the next version for batched uploads.
- Publication details accept `tags` and nullable `pricePaise`.

Run `npm run db:indexes` during deployment to replace the legacy publication text index with the expanded index. Existing publications remain readable; missing tags, prices and page text use empty defaults. Existing purchase publications must set a price before any new submission. Plan text-index migration timing for a live catalog because index replacement temporarily interrupts text search.

`npm run test:studio` verifies the local three-service browser workflow with temporary publications and removes those publications and their objects afterwards. Integration tests cover ownership, stale versions, concurrent reorder, search visibility, and page-text edits. Production serverless upload-body limits still require a direct-to-private-object-storage upload design for large images; this local implementation retains the existing 10 MB per-image handler.
