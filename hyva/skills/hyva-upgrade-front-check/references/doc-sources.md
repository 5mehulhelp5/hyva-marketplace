# hyva-upgrade-front-check -- documentation sources

## Diff engine
- pixelmatch (pixel-level image comparison, pure JS -- operates on raw RGBA, format-agnostic): https://github.com/mapbox/pixelmatch
- pngjs (PNG decode/encode, pure JS): https://github.com/lukeapage/pngjs
- jpeg-js (JPEG decode/encode, pure JS -- defensive input support: the Playwright container
  captures PNG, but hand-supplied JPEGs decode straight to RGBA with no lossy conversion, no
  native deps): https://github.com/jpeg-js/jpeg-js
- Node.js built-in test runner (node:test): https://nodejs.org/api/test.html

## Capture engine
- Playwright (library API -- contexts, screenshots, locators): https://playwright.dev/docs/api/class-playwright
- playwright-core (pure-JS driver, no bundled browsers): https://www.npmjs.com/package/playwright-core
- Official Docker image (browsers preinstalled; tag MUST equal the playwright-core version in
  scripts/package.json): https://mcr.microsoft.com/en-us/product/playwright/about
- Hyvä/Alpine selector pitfalls for interaction states: the org's `hyva-playwright-test` skill.

## Environment cloning
- Warden: https://warden.dev/
- `warden volume backup-env` / `restore-env` / `env-install`: run `warden volume --help` /
  `warden env-install --help` on the target project before relying on exact flags -- these come
  from the project's own Warden installation and can vary by Warden version.

> Migration context (worklist, breaking changes) comes from the hyva-upgrade and
> hyva-tailwind-v4-migration skills -- see their own references/doc-sources.md.
