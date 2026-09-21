# AllToolForest

A focused collection of browser-based tools for Work, Documents, Images and Calculators.

## v2 status
Feature development is frozen. The `restructure-v2` branch is in release-hardening / QA.

## Release gates
- [x] Four category hubs
- [x] Remove legacy duplicates from primary navigation/search
- [x] About and privacy pages
- [x] robots.txt and XML sitemap
- [x] Baseline mobile/accessibility CSS
- [x] Initial third-party dependency inventory
- [ ] Full browser smoke test on desktop and mobile
- [ ] Validate every tool with empty, invalid and representative inputs
- [ ] Validate PDF/image/OCR workflows with real sample files
- [ ] Check very large-file memory behavior and graceful errors
- [ ] Self-host or formally approve critical third-party runtime dependencies
- [ ] Add production contact method and update privacy notice
- [ ] Choose commercial hosting and production domain
- [ ] Replace GitHub Pages URLs in sitemap/robots/canonical metadata after domain choice
- [ ] Add production analytics only after consent/privacy design is decided
- [ ] Run Lighthouse/Core Web Vitals checks on production-like hosting
- [ ] Validate sitemap/Search Console after deployment

## Hosting
GitHub remains source control and a development/staging surface. Commercial production hosting should be selected before monetized launch.

## Release rule
Do not merge `restructure-v2` into `main` until the release gates are reviewed and explicitly approved.
