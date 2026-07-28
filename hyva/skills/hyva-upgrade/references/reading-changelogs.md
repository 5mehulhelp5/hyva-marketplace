# Reading the Hyvä changelogs

## What to read
For the current → target version, read **both** changelogs:
- default-theme: https://docs.hyva.io/hyva-themes/upgrading/changelog-default-theme.html
- theme-module: https://docs.hyva.io/hyva-themes/upgrading/changelog-theme-module.html

## How to proceed
1. Get the installed version: `$HYVA_RUNNER composer show hyva-themes/magento2-default-theme | grep versions`.
2. List all versions between current and target (mind the two lines 1.3.x / 1.4.x).
3. For each intermediate version, note: breaks, DOM changes, Alpine/JS changes, Tailwind.
4. Consolidate into a **breaking-changes table** (see `breaking-changes.md` for the format).
5. Detect the key crossings: Tailwind v4 (≥ 1.4.0), 1.4.0 break.

## Tip
The frozen summary in `breaking-changes.md` is the offline starting point, but the online
docs are authoritative for the exact target version.
