# Guided Studio publishing

Studio offers separate comic and artwork entry points. Both use four steps: Details, Images, Access, and Review. Drafts can be reopened and saved independently of submission. Submitted publications remain locked under the existing editorial review rules.

Comics support a cover/thumbnail and multi-selection of page images. A horizontal strip previews the selected order; arrow buttons work with keyboard and touch before upload and for saved pages. One upload action processes the selected files sequentially using the returned optimistic version. Completed uploads remain saved after a partial failure; unsuccessful selections stay available for retry. There is no application-level page-count maximum. Per-image validation and request rate protection still apply. Artwork has a single image and public free access.

Each saved comic page has an accessibility description and optional story text for dialogue/narration. Story text is not displayed on the reading screen; it is used for search (preview pages only) and shown to admins during review. Only the first four pages contribute to the publication's public search text. Moving a page into or out of the preview updates that text in the same transaction as the order. Editing a page updates its text and the preview search document atomically. The application does not automatically transcribe images.

Tags are normalized and deduplicated, with up to 20 tags of 40 characters. Public catalog search indexes title, author, synopsis, tags and free-preview text. Related-title recommendations rank matching tags within the same publication kind and age rating, with genre as a fallback. These are content-based suggestions, not personalized recommendations. Detail pages provide canonical URLs, descriptions and social metadata. Reader preview pages may use their story text as the page's meta description; later pages use noindex metadata and never expose protected text in metadata. Search indexing/rank is not guaranteed.

Individual-purchase and membership-or-purchase comics accept custom INR prices stored as integer paise. A positive price is required on submission for those access modes. Admin review and the public details page show the saved price. Checkout, charging, revenue sharing and payouts remain unimplemented.

## Chapters

A comic can be split into named chapters. Chapters are boundaries in the comic's single ordered page sequence: each has a title and a start page and runs until the next chapter begins. The first chapter starts on page 1, later chapters start on strictly later saved pages, and no chapter may be empty. Comics without chapters read as one continuous story, so existing publications need no migration.

In Studio's Pages step, authors can tick "Start a new chapter with these pages" before uploading a batch, or use the chapter editor to split, rename, move chapter starts and remove chapters (removed chapters' pages join the previous chapter). Chapters are edited only in draft and changes-requested states, use the same optimistic version as pages, and are checked again on submission. Reordering pages keeps chapter starts at the same page numbers. Admin review shows the chapter structure and groups pages by chapter.

Readers see chapter counts on cards and a chapter list on the details page. The reading screen scrolls continuously, loading further pages as the reader nears the end and offering "Show earlier pages" when opened mid-comic. A sticky toolbar holds a chapter drop-down, previous/next chapter buttons and the current page; chapter headings appear in the page stream, and the address and reading progress follow the page being read. Page URLs and media authorization are unchanged. The four-page guest preview applies to the whole comic, not to each chapter, so chapter navigation never unlocks extra free pages.

To give existing comics a single "Chapter 1" covering all their pages, run `npm run db:chapters` (dry run) and then `npm run db:chapters -- --apply`. For another environment, point it at that environment's file: `npx tsx --env-file=.env.production scripts/chapters-backfill.ts --apply`. Comics that already have chapters, comics without pages, and artwork are skipped, so re-running is safe. Without local database access, run the **Backfill comic chapters** GitHub Actions workflow instead: add a `MONGODB_URI` repository secret, run it once as a dry run, then again with **apply** checked. Atlas network access must allow GitHub-hosted runners.

Chapters in a draft are reviewed with the whole publication.

### New chapters for published comics

Authors add chapters to a published comic from Studio's Pages step ("Add a new chapter"): name the chapter, upload its pages in reading order, then submit it. Readers keep reading the published chapters meanwhile. New pages are stored after the public page count, so every reader route, image request and scroll batch treats them as nonexistent until approval. Admin lists submitted chapters at the top of the Review queue and on the dashboard, and counts them in Pending reviews; the review page shows the new pages separately and offers approve or request changes (with feedback). Approval atomically adds the pages to the comic, appends the chapter (a comic that had no chapters gets its earlier pages as "Chapter 1"), clears the release and records an audit event. Authors can rename or discard an unfinished chapter; discarding deletes its pages and images. One chapter can be in preparation at a time. Pages of a new chapter cannot yet be reordered or given story text before approval.

### Managing published comics

Owners (and administrators) can change a published comic from Studio, and every change is live immediately, without editorial review:

- Edit details: title, synopsis, genre, tags, age rating, access and price (the rights declaration must stay confirmed, and paid access needs a price), and replace the cover.
- Rename chapters and move chapter boundaries.
- Add pages to the end of any chapter (later chapters shift automatically), replace a page's image, reorder pages, edit page text, and remove pages (a published comic keeps at least one page).
- **Delete a chapter and its pages** permanently. Later chapters shift up; the last remaining chapter cannot be deleted (delete the comic instead).
- **Delete the whole comic** permanently from the Review step by typing its title. This removes every page and image (including an unfinished new chapter), the cover, and readers' saved entries and reading progress.

Each change to a published comic and each deletion is recorded in the audit log. While a new chapter is being prepared for review, page-sequence edits (add, move, remove, delete chapter) are paused so the pending pages stay aligned; details, cover, page text, chapter names and page replacement still work. Readers fetch images by publication version, so an edit changes image and cover URLs immediately. A browser that already downloaded a deleted page may keep showing it from its own cache for up to seven days.

Because these edits skip review, adding pages to an existing chapter is not reviewed even though starting a brand-new chapter is. Use the audit log to monitor live changes.

## Originals and site name

Publications created by administrator accounts are the platform's own **Originals** (set on the server; authors cannot set it). They carry an Originals badge, appear on `/originals` and in an Originals section on the home page, and their administrator creator may approve them in Admin, because they are the platform's own publications. Independent work still needs a different administrator to review it. Run the "Backfill comic chapters" workflow with task `originals` (or `npm run db:originals`) to mark works administrators uploaded before this change.

The site name is not hard-coded. Administrators set it in Admin → Policies; it renders in the logo, page titles, footer and Originals labels of all three apps. Until one is saved, `SITE_NAME` from the environment, or "Astra Comics", is used.

## API additions

- `GET /api/publications/:id`: owner/admin editor data, including safe page fields.
- `POST /api/publications/:id/pages/order`: current version and an exact permutation of page IDs.
- `PATCH /api/publications/:id/pages/:pageId`: current version, image description and story text.
- `PUT /api/publications/:id/chapters`: current version and the complete ordered chapter list (`id` optional for new chapters, `title`, `startPage`). An empty list removes chapters.
- Upload responses include the next version for batched uploads.
- Publication details accept `tags` and nullable `pricePaise`.

Run `npm run db:indexes` during deployment to replace the legacy publication text index with the expanded index. Existing publications remain readable; missing tags, prices and page text use empty defaults. Existing purchase publications must set a price before any new submission. Plan text-index migration timing for a live catalog because index replacement temporarily interrupts text search.

`npm run test:studio` verifies the local three-service browser workflow with temporary publications and removes those publications and their objects afterwards. Integration tests cover ownership, stale versions, concurrent reorder, search visibility, and page-text edits. Production serverless upload-body limits still require a direct-to-private-object-storage upload design for large images; this local implementation retains the existing 10 MB per-image handler.
