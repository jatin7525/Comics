# Author applications

Readers apply at `/become-author` in the Reader service. They save an introduction, optional HTTPS portfolio, creation-process explanation and rights declaration, then upload original artwork (at least one image) or a short comic (at least two pages). JPEG, PNG and WebP files are limited to 3 MiB each, validated, stripped of metadata and converted to WebP. Samples are private and never become catalog publications.

Submission locks editing. Administrators review `/admin/applications` in the Admin service and approve, request more evidence, or reject, with feedback and a required review acknowledgement. Changes-requested and rejected applications can be edited and resubmitted. The queue shows the oldest 50 submissions; completed applications leave the queue.

Approval atomically updates the application and account role, records an audit event and revokes existing sessions. The applicant signs in again and can access Studio while retaining reader capabilities. Direct reader-to-author promotion through account controls requires an approved application. Version checks prevent stale edits and duplicate concurrent decisions.

Samples are served through authenticated, no-store endpoints: the applicant can read their own samples and administrators can review them through Admin. Uploaded samples are evidence for human review, not proof of identity or ownership. Request drafts, process evidence or portfolio verification when uncertain. Automated plagiarism detection and identity verification are not implemented.

## API surface

Reader:
- `POST /api/author-applications`: start or retrieve the reader's single application.
- `PATCH /api/author-applications/:id`: save details with the current version.
- `POST /api/author-applications/:id/upload`: multipart sample, description and version.
- `GET /api/author-applications/:id/samples/:sample`: private owner preview.
- `DELETE /api/author-applications/:id/samples/:sample`: remove an editable sample.
- `POST /api/author-applications/:id/submit`: submit a complete application.

Admin:
- `GET /api/admin/author-applications/:id/samples/:sample`: private review preview.
- `POST /api/admin/author-applications/:id`: version, decision, feedback note and review acknowledgement.

Run `npm run db:indexes` before deployment for the unique applicant and review-queue indexes. The three services currently share storage credentials. Production storage separation should grant Reader sample-upload permissions without published-content write permissions. Automated retention and orphan-object cleanup remain operational work; no automatic expiry is claimed.

## Verification

`npm run test:integration` covers ownership, incomplete submissions, review permissions, request-changes/resubmission, sample deletion, concurrent approval, session revocation and Studio access. `npm run test:onboarding` exercises the local three-service browser journey using a temporary account and sample; it removes both afterwards and does not seed the catalog. It requires the local services and Chromium (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).

The application editor supports multiple image selection with local previews and earlier/later controls before uploading. Images upload sequentially in that order with individual size limits and version checks. Saved sample pages can also be reordered; the server requires an exact permutation of existing page IDs. A separate optional thumbnail can be uploaded, replaced or removed; it does not count toward the minimum comic length. It has the same private access rules as samples and appears in the admin review. Upload failures may leave successfully uploaded images saved; reload before retrying.

`POST /api/author-applications/:id/reorder` accepts `version` and the ordered `ids`. The upload endpoint accepts `kind=sample|thumbnail` and returns the new version.

For an additional local administrator, set `LOCAL_ADMIN_PASSWORD` (at least 12 characters) and run `npm run db:admin`. This creates `admin@astra.local` only if absent and leaves existing credentials unchanged. It is restricted to a local MongoDB connection and does not seed publications. Do not deploy shared local test credentials.

There is no application-level page-count cap. Per-image validation and request rate protection remain in place.
