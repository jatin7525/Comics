# Astra Comics — comic publishing platform prototype

Open `index.html` directly, or serve this directory:

```bash
python3 -m http.server 4173
```

Then visit http://localhost:4173.

No build step or frontend dependencies are required. All illustrations are local SVG assets. Google Fonts loads the typography when online; fallback fonts work offline.

## Suggested walkthrough

1. Open any comic as a guest. Read four pages, then try page five.
2. Create a demo account with a fictional name/email. A free comic unlocks; a paid comic still needs the appropriate entitlement.
3. Try Astra Plus and a purchase-only title to compare the two demo checkout flows.
4. Save stories, follow creators, and return to Discover to see reading progress.
5. Use the bottom-left workspace selector to open **Author Studio**. Create a publication and submit for review.
6. Switch to **Admin console**, review the new submission, and approve it. Return to **Reader platform → All comics** to find the new title.
7. Explore reports, author access, policies, ad placements, and the audit log.

On mobile, the menu button opens navigation and the workspace selector.

Use the sun/moon button in the header to switch themes. The initial theme follows your device; your manual choice is saved locally under `panel-theme`.

The original internal storage keys are retained so the Astra Comics rename preserves existing reading progress and theme preferences.

Demo state persists in browser local storage under `panel-prototype`. Clear that key or browser site data to start fresh. Do not enter real credentials, bank information, or sensitive manuscript data.

See `PRODUCT-REVIEW.md` for product decisions, revenue ideas, retention strategy, launch priorities, and explicit prototype limitations.

## Verification

`tests/prototype.cjs` runs a browser smoke test with Playwright, if installed. It expects the local server on port 4173:

```bash
node tests/prototype.cjs
```

The test checks discovery, the guest limit, paid access, author submission, admin approval, publishing visibility, search, all main screens, mobile overflow, and browser errors. Screenshots are saved in `tests/`.
