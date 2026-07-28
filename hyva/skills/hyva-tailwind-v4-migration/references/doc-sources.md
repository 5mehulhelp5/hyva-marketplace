# Sources — Tailwind v4 & official Hyvä tools

## Tailwind
- Hyvä — Updating to Tailwind CSS v4: https://docs.hyva.io/hyva-themes/working-with-tailwindcss/updating-to-tailwind-4.html
- Hyvä — Updating to Tailwind CSS v3: https://docs.hyva.io/hyva-themes/working-with-tailwindcss/updating-to-tailwind-3.html
- Tailwind CSS — Upgrade guide (v3→v4): https://tailwindcss.com/docs/upgrade-guide

## Official Hyvä tools (`hyva-themes/upgrade-helper-tools`)
> Dev only — **never in production**. Install:
> `$HYVA_RUNNER composer require --dev hyva-themes/upgrade-helper-tools:dev-main`

- `update-to-tailwind-v4.js <theme>` — wrapper (refresh baseline + config conversion, backups)
- `convert-to-tailwind-v4.js <theme>` — replaces styles with their v4 versions (with backups)
- `convert-tailwind-config.js <tailwind.config.js> <theme/web/tailwind>` — JS config → CSS variables
- `find-deprecated-classes.js <dir>` — scan deprecated classes (NOT used: report-only, see procedure)
- `hyva-csp-helper [...DIR]` — CSP helper (≥ 1.3.11)
