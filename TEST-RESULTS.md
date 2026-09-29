# Prototype verification

Browser checks completed successfully using Chromium through Playwright.

- Guests can discover all eight seeded comics, including premium titles.
- Page five opens an access gate after four guest preview pages.
- A free account unlocks a free comic, while premium content remains gated.
- Demo membership unlocks membership titles but not purchase-only titles.
- Individual purchase unlocks the selected comic.
- Author submissions enter the admin queue; approval adds the comic to the catalog.
- Unpublishing removes the comic from public discovery.
- Search returns the newly published title.
- Every reader, author, and admin navigation screen renders.
- Reader reports appear in admin and can be resolved.
- Suspending the author blocks the publishing form.
- Tablet and mobile workspace navigation works.
- The 390px mobile catalog and reader have no horizontal document overflow.
- No JavaScript page errors were observed during the test.

Screenshots: `tests/desktop.png`, `tests/mobile.png`, `tests/mobile-reader.png`, and `tests/admin.png`.

These are functional prototype checks, not a security audit, production payment test, or comprehensive accessibility certification.
