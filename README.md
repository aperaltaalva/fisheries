# Nowcasting Fishing License Revenues in Kiribati

A free public-interest research dashboard connecting Global Fishing Watch vessel activity to a transparent economic model of fishing license revenue changes. Includes an overview, revenue nowcast, fishing-activity explorer, visual methodology and source documentation. A separate Tuvalu case tab adapts the method to a second country, preserving the original model estimates and source-checked fiscal overlay.

**Website:** https://aperaltaalva.github.io/fisheries/

The site has no password or account requirement. It serves a bundled historical snapshot, with no live tracking feed or automatic refresh. Fishing effort and active-vessel observations reach 30 September 2026. Presence, regional comparisons and the revenue model retain their separately verified 31 August 2026 cutoff.

This repository contains the reviewed static dashboard and aggregate CSV exports. It does not contain raw tracks, vessel-level register records, API credentials or the research source archives. Model-equivalent revenue amounts are not full-year cash-collection forecasts.

The Tuvalu case uses the reviewed 15 October 2026 snapshot, with model history from 2019 and January–August extensions through 2026. Comparable reported revenues end in 2022; the July 2024–June 2025 fiscal outturn is shown separately. The sensitivity ranges are specification ranges, not statistical confidence intervals.

See [Sources and reuse](DATA-LICENCES.md) and the dashboard's **Data & sources** page for provenance and source-data conditions. This is an independent research tool and does not imply endorsement by any institution or data provider. No blanket open licence is asserted for all inputs or application code.

## Hosting

GitHub Pages serves the root of the `main` branch. `.nojekyll` keeps the HTML, JavaScript, CSS and CSV assets unchanged. All application asset paths are relative, including when hosted at `/fisheries/`.

Updates are prepared and verified locally before a new reviewed snapshot is committed to this repository. The website does not query third-party APIs.
