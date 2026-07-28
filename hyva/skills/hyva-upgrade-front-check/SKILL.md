---
name: hyva-upgrade-front-check
description: Verify a Hyvä/Tailwind theme migration on any Magento 2 + Warden project by comparing the before/after environments on three layers - full-page pixel diff, semantic DOM/console/network diff, and scripted interaction states (hover, minicart, menu...). Use this skill to check for visual or functional regressions after a Hyvä upgrade or Tailwind v3->v4 migration, do a pixel-perfect QA pass, or verify no page or interactive component broke. Triggers: "check for visual regressions", "pixel perfect QA", "verify the migration visually", "compare before after screenshots", "detect regressions after hyva migration", "vérifier la migration visuellement", "détecter les régressions".
---

# Hyvä upgrade -- visual & functional regression check

Compares a Magento 2 + Warden project **before** and **after** a Hyvä/Tailwind migration on
three complementary layers, and separates changes the migration documents as intentional from
real regressions. **Project- AND machine-agnostic**: everything is discovered at run time; the
capture browser ships in a pinned Docker image (no host-browser dependency).

| Layer | Mechanism | Catches |
|---|---|---|
| 1. Visual | full-page screenshots, pixel-diffed (`pixelmatch`) | CSS/layout drift, missing/moved visible elements, anywhere on the page |
| 2. Semantic | DOM inventory + Alpine/Magewire directives + console + failed requests | missing buttons/links/forms (even off-screen), lost `@click`/`x-data` bindings, Alpine init errors, 404'd assets |
| 3. Behavioral (targeted) | scripted interaction states re-fed through layers 1+2 | broken hover/focus, minicart/menu/slider/modal broken when opened, form error states |

**Residual limit (say it in the report):** deep business logic (a payment actually accepted, an
email actually sent) is e2e-suite territory (`hyva-playwright-test`), not this skill's.

> ⚠️ **Warden-only.** This skill orchestrates the before/after environments through Warden alone
> (`warden env-install`, `warden volume`, `warden env exec …`) and has **no Docker/DDEV fallback** — run it
> only on a Warden-based project. Its sibling skills `hyva-upgrade` and `hyva-tailwind-v4-migration` support
> plain Docker via `$HYVA_RUNNER`; this one intentionally does not.

## Guardrails (NON negotiable)
- **Runtimes in containers.** Tests/diffs: `warden env exec php-fpm node …`. Capture: ONLY the
  ephemeral Playwright container (`scripts/run-capture-container.sh`). Never host node/npm/browser.
- **Version sync.** The image tag in `run-capture-container.sh` and `playwright-core` in
  `scripts/package.json` are the SAME version -- bump together, never one alone.
- **Gated heavy actions.** Provisioning/refresh/teardown of the "before" env AND the first
  Playwright image pull (~1-2 GB): always show `--dry-run` output first, get explicit user
  confirmation, then run.
- **No git.** The user manages history.
- **Agnostic.** No hardcoded project name, brand, domain, theme path, selector-by-class.
- **Human gate.** Claude proposes `[C]`; only the user moves an item to `[x]`.
- **Keep artifacts** (screenshots, snapshots, heatmaps, manifest, report) until QA sign-off.

## Two operating modes

### Invoked by `hyva-upgrade` (Phase 8)
Receives the migrated theme(s), the shared `WORKDIR`, the worklist/breaking changes. The "before"
reference env was provisioned by the orchestrator **before Phase 1** (pristine snapshot), so here you
**reuse** it — never `create`/`refresh` it (the working project is already migrated; refreshing would
re-import the migrated DB and destroy the baseline). Writes into `WORKDIR/visual-check/`. The worklist
drives page selection (step 3) and reconciliation (step 7).

### Standalone
Creates `var/hyva-upgrade-front-check/<timestamp>/`, discovers the theme(s)
(`hyva-theme-list` or scan `app/design/frontend/*/*`), uses the DEFAULT interaction-state set
(`references/interaction-states.md`) and skips worklist reconciliation unless pointed at one.

## Procedure

1. **Discover the "after" environment.** `WARDEN_ENV_NAME`/`TRAEFIK_DOMAIN_SUFFIX` from the
   project's env file; themes and their domains.

2. **Ensure the "before" environment.** `scripts/provision-before-env.sh status`. The before env
   must snapshot the **pre-migration** state, so it is created **before any migration change**:
   - **Invoked (Phase 8):** the orchestrator already provisioned it before Phase 1 → status shows it
     exists → **reuse it as-is. Never `refresh`** (the working project is already migrated; refresh
     re-imports that migrated DB and destroys the baseline).
   - **Standalone:** if no before env exists, `create` it (`--dry-run` → user confirmation → real
     run) **before** you start the migration you want to check — `create` snapshots the state at
     call time.

3. **Build the run manifest.** Pages: `scripts/discover-pages.sh` (fixed routes + one real
   category/product/cms from `url_rewrite` via the `warden-run-sql-query` skill). Reduce to what
   the worklist touched (invoked mode) or keep the full template list (standalone). States: per
   `references/interaction-states.md` (worklist hot zones, or the default set), with
   project-adjusted aria/id selectors -- never Tailwind classes. Dismiss steps for
   cookie/newsletter overlays (all `optional: true`). Write `<workdir>/run-manifest.json`
   (schema: `templates/run-manifest.example.json`) and **show it to the user** -- it IS the
   coverage contract of the run.

4. **Capture both sides.**
   `bash scripts/run-capture-container.sh <workdir-rel>/run-manifest.json <workdir-rel>/captures --dry-run`
   → show, confirm (first run pulls the image), re-run without `--dry-run`. Determinism is
   handled inside `capture-run.js` (see `references/determinism-checklist.md`). Artifacts:
   `<template>__<viewport>__<state>__<side>.{png,json}`.

5. **Layer 1+3 diff, per pixel pair.**
   `warden env exec -T php-fpm node .claude/skills/hyva-upgrade-front-check/scripts/diff-screenshots.js <before.png> <after.png> <heatmap.png> --threshold 0.01 --pad-to-match`
   (deps once: `warden env exec -T php-fpm npm install --prefix .claude/skills/hyva-upgrade-front-check/scripts`).
   Collect `diffRatio`/`verdict`/`paddedRows`. A `size mismatch` despite `--pad-to-match` = width
   drift = capture bug: fix, re-shoot, never diff around it.

6. **Layer 2 diff, per snapshot pair.**
   `warden env exec -T php-fpm node .claude/skills/hyva-upgrade-front-check/scripts/diff-dom.js <before.json> <after.json>`
   (Tailwind renames auto-normalized via the sibling skill's TSV). Verdict-driving: removed
   elements, lost directives, new console errors, new failed requests, state asymmetry.
   `classChanges`/`addedElements`/`newAbortedRequests` (benign `ERR_ABORTED` cancellations) are informational.

7. **Reconcile.** Apply `references/reconciliation.md` (pixel AND stage-2 rules) against the
   worklist/breaking changes → `ATTENDU (documenté)` with reference, or `À REVOIR`.

8. **Investigate what's left.** For each `À REVOIR`: inspect heatmap + stage-2 findings; if
   ambiguous, open BOTH live pages via Claude-in-Chrome (its only role in this skill) and check
   by hand (hover, console, DOM). Record `[C]` verdicts. 🔲 **Gate: never resolve to `[x]`.**

9. **Report.** Fill `templates/report.md` (pixel table + semantic table), artifact or file --
   user's choice. Include the residual-limit note and the manifest reference.

10. **Wrap-up.** Recap regressions vs documented changes. Propose (never auto-run) teardown:
    `scripts/provision-before-env.sh teardown --dry-run` → confirm → real.

## Watch-outs
- Image/lib version sync (see Guardrails) -- a mismatch fails at browser launch.
- Captures MUST land under the mounted project tree (`var/...`) -- container `/tmp` is invisible
  to the diff step. `run-capture-container.sh` enforces this by construction.
- Full-page + sticky elements: pinned image keeps behaviour reproducible; check the first run's
  heatmaps for stitching artefacts around fixed headers before trusting them.
- Interaction-state selectors: aria/id only; a selector that stops matching on "after" is
  reported as state asymmetry -- that is a finding, not an error to silence.
- Threshold: the default 1% is a starting point -- recalibrate per project. A small isolated CSS
  change on a large viewport can fall under a global page-ratio threshold, and JS carousels inflate
  it (`--ignore` their region, or dismiss/pause them) -- watch for OK-pairs that should be REVIEW.
- **After a Tailwind v4 migration:** native-component color drift (`btn`, form active color,
  `accent-color`) across rest AND hover/active/focus states is the visual half of the v4 verification
  gate (E) -- treat it as a **token-consolidation regression**, never reconcile it as `ATTENDU`. The
  interaction-state layer is what surfaces the hover/active/focus miss.
- **Not this skill's job:** build-output assertions (compiled `styles.css` contains a utility, no
  `Unknown at rule: @screen` warning, a vendor-only `.phtml` class reaches the CSS) are the v4 gate E
  / `hyva-upgrade` Phase 7 -- they need the build, not a before/after diff.

## References
- `references/determinism-checklist.md` -- capture determinism (what capture-run.js enforces)
- `references/interaction-states.md` -- default states, hot zones, selector rules
- `references/reconciliation.md` -- worklist matching, pixel + stage-2 rules
- `references/doc-sources.md` -- Playwright/pixelmatch/Warden sources
- `scripts/provision-before-env.sh` -- before-env lifecycle (status/create/refresh/teardown)
- `scripts/discover-pages.sh` -- template → real URL selection
- `scripts/run-capture-container.sh` -- ephemeral Playwright container launcher
- `scripts/capture-run.js` -- in-container capture + snapshot engine
- `scripts/diff-screenshots.js` -- pixel diff (PNG/JPEG, ignore regions, padding)
- `scripts/diff-dom.js` -- semantic diff (elements, directives, console, network)
- `templates/run-manifest.example.json` -- manifest schema example
- `templates/report.md` -- report skeleton
- Invoked from: skill **`hyva-upgrade`** (Phase 8)
