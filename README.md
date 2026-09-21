# AllToolForest

A focused collection of browser-based tools for Work, Documents, Images and Calculators.

## v2 status
Feature development is frozen. The `restructure-v2` branch is a deployment-ready release candidate for post-deployment user testing.

## Release gates
- [x] Four category hubs
- [x] Remove legacy duplicates from primary navigation/search
- [x] About and privacy pages
- [x] robots.txt and XML sitemap
- [x] Baseline mobile/accessibility CSS
- [x] Initial third-party dependency inventory
- [ ] Post-deployment browser/device smoke test by owner and testers
- [ ] Post-deployment end-to-end tool validation with representative files
- [ ] Post-deployment large-file/memory observations and graceful-error review
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
The branch is prepared as the v2 release candidate. Merge/deploy only with explicit owner approval; use post-deployment testing to capture device-specific issues for fixes or v3.
