# Pacific Fisheries Monitor · Kiribati

A free public-interest research dashboard for historical fishing activity, vessel comparisons and the saved revenue model.

**Website:** https://aperaltaalva.github.io/fisheries/

The site has no password or account requirement. It serves a bundled historical snapshot, with no live tracking feed or automatic refresh. Fishing effort and active-vessel observations reach 30 September 2026. Presence, regional comparisons and the revenue model retain their separately verified 31 August 2026 cutoff.

This repository contains the reviewed static dashboard and aggregate CSV exports. It does not contain raw tracks, vessel-level register records, API credentials or the research source archives. Model-equivalent revenue amounts are not full-year cash-collection forecasts.

See [Sources and reuse](DATA-LICENCES.md) and the dashboard's **Sources & definitions** page for provenance and source-data conditions. This is an independent research tool and does not imply endorsement by any institution or data provider. No blanket open licence is asserted for all inputs or application code.

## Hosting

GitHub Pages serves the root of the `main` branch. `.nojekyll` keeps the HTML, JavaScript, CSS and CSV assets unchanged. All application asset paths are relative, including when hosted at `/fisheries/`.

Updates are prepared and verified locally before a new reviewed snapshot is committed to this repository. The website does not query third-party APIs.
