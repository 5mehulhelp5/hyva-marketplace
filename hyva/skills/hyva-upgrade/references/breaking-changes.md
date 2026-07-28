# Hyvä — Breaking changes & changelogs (frozen reference)

> Offline summary. **Always** re-check the online docs for the exact target version
> (see `doc-sources.md`), as the changelogs evolve.

## Version lines
Hyvä maintains two parallel lines: `1.3.x` (Tailwind v3) **and** `1.4.x` (Tailwind v4 from 1.4.0 on).
The upgrade path is therefore not linear — read the changelogs of BOTH components
(`magento2-default-theme` AND `magento2-theme-module`).

## Major breaks to detect

| Version (default-theme) | Break | Impact | Actions |
|---|---|---|---|
| **1.4.0** | Removal of the `reset-theme` dependency; introduction of **Design Tokens**; `HTML Dialog` for header/minicart; **View Transitions** stable; GliderJS/Custom JS → **Hyvä Snap Slider**; header layout rework (removal of the CSS `order` logic); **switch to Tailwind CSS v4** | Header, minicart, sliders, base CSS; the whole Tailwind CSS/config chain | Replace reset-theme with base-layout-reset; review header/minicart overrides; migrate custom sliders to Snap Slider; migrate Tailwind v3→v4 (see skill hyva-tailwind-v4-migration) |
| 1.3.21 | License change (dual OSL/AFL); `reset-theme` replaced by `base-layout-reset` on the 1.3 line | Base CSS | Adapt the reset dependency |

## default-theme version summary (1.3.6 → 1.4.6)

- **1.4.6** (2026-05-12) — no functional change vs 1.4.5.
- **1.4.5** — fixes (dialog z-index, fetch error handling).
- **1.4.4** (2026-03-03) — fix legacy opacity support (Tailwind v4), rich snippets, reCAPTCHA legal notice, PDP gallery accessibility.
- **1.4.3 / 1.4.2 / 1.4.1** — PayPal, input-group CSS, RTL, taxes, Recently Viewed → Snap Slider.
- **1.4.0** (2025-11-10) — **break** (see table above) + switch to Tailwind v4.
- **1.3.22 → 1.3.7** — fixes on the 1.3 line (price, breadcrumbs JSON-LD, calendar, bundles, etc.).

## theme-module version summary (1.4.4 → 1.4.6)

- **1.4.6** (2026-05-12) — PHP 8.5 compat, Symfony Console, PHPUnit 12.
- **1.4.5** — fixes (dialog z-index, fetch, plugins setup).
- **1.4.4** (2026-03-03) — reCAPTCHA legal notice; configurable view transitions; Lucide Icons v0.563.

> No explicit break documented 1.4.4→1.4.6 on the theme-module, but some
> behavior changes (view transitions defaults) may require attention.
