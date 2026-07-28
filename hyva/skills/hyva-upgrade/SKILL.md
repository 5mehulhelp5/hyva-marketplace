---
name: hyva-upgrade
description: (Beta) Drive a Hyvä version upgrade (Magento 2 + Warden or Docker), small or large, end-to-end. Use this skill when the user wants to update Hyvä, upgrade the Hyvä theme, move to a new Hyvä version, upgrade hyva-themes/magento2-default-theme or magento2-theme-module. Triggers: "upgrade Hyvä", "update Hyvä", "upgrade hyva", "hyva migration", "new hyva version", "move to the latest hyva version".
---

# Hyvä version upgrade

> ## Disclaimer — present before any action
> Before any operation (including Phase 0), present the disclaimer below to the user,
> then ask for their explicit confirmation via `AskUserQuestion` (the "I have read and understood"
> option counts as agreement). Do not undertake anything until this agreement has been given.
>
> **Text to present to the user:**
>
> This skill is a Beta version developed by Blackbird Agency. The version upgrade must be
> performed in a clean, dedicated Git branch. Claude may omit some elements: no
> exhaustiveness is guaranteed. After the migration, carefully check the modified files
> as well as the rendering of the front-end pages. Finally, this skill is likely to consume a large
> volume of tokens.

(Beta) Drives a Hyvä upgrade end-to-end, from a small patch update to a large multi-version
migration (1.4.0 break, Tailwind v3→v4). Generic: discovers the theme,
the versions and the runtime environment (Warden or plain Docker) dynamically. **No hardcoded paths.**

## Guardrails (NON negotiable)
- **Read before acting.** Always inspect the actual theme and versions before proposing anything.
- **No git.** No `git add` / `git commit` commands — the user manages history.
- **Runtimes via the project runner.** `composer`, `bin/magento`, `node`, `npm`, `npx` always run inside the PHP container through `$HYVA_RUNNER` (see "Runner" below), never on the host.
- **Human gates inline.** Reviews (diffs, QA) always happen in conversation, never inside a Workflow run.
- **Cautious Composer.** `--dry-run` before any `require`, re-read the `composer.lock` diff; `-W` may bump unwanted modules (see `references/composer-patches-and-deps.md`).
- **Rollback.** In case of unrecoverable breakage, documented rollback via `references/rollback.md`.
- **Artifacts in `var/hyva-upgrade/<timestamp>/`** (gitignored).

## Runner (resolve once, up front)
`$HYVA_RUNNER` = the command that runs a runtime (`composer`, `bin/magento`, `node`, `npm`, `npx`) **inside
the project's PHP container**. Every command in this skill and its references uses it. Resolve it once:
- **Warden** (default): `warden env exec php-fpm`
- **Docker** (no Warden): `docker compose exec -T <php-service>` (`-T` required — no TTY here; service often
  `php`/`php-fpm`/`app`), or `docker exec -i <container>`.
Export it before running this skill's scripts (they default to Warden): `export HYVA_RUNNER="…"`.

## Phase 0 — Global inventory & scoping (always inline, read-only)
Goal: produce a **global overview** of the upgrade before any change — it feeds the action plan.
1. Discover the Hyvä theme(s) (reuse `hyva-theme-list` if available, otherwise look under
   `app/design/frontend/*/*` for a `web/tailwind/tailwind.config.js`).
2. Read the installed versions:
   `$HYVA_RUNNER composer show hyva-themes/magento2-default-theme hyva-themes/magento2-theme-module`.
3. **Choose the target version early** (default: latest available) — it unlocks the entire analysis below.
4. Create the workdir and **snapshot** the baseline:
   `WORKDIR=$(.claude/skills/hyva-upgrade/scripts/snapshot-vendor.sh)`
5. Inventory the overrides:
   `.claude/skills/hyva-upgrade/scripts/inventory-overrides.sh <THEME_DIR> <VENDOR_DEFAULT_THEME_DIR> > "$WORKDIR/overrides.txt"`
6. Inventory the impacted **composer patches** (`extra.patches`) (see `references/composer-patches-and-deps.md`).
7. **Hyvä-based third-party modules** (vendor ≠ `hyva-themes/`): scope compatibility along two axes (composer
   constraint + Tailwind v4 if crossed) → status per module (see `references/third-party-modules.md`).
   Sequence: **compatible version first, patch as last resort**.
8. Produce a **short intent spec** (from/to, magnitude, crossings, third-party modules) — it feeds the plan.

## Action plan & agreement (at the end of Phase 0, before modifying the project)
Present the **action plan** and obtain **explicit agreement** via `AskUserQuestion` before starting the
modifying phases. The plan recaps: starting and target version, **magnitude** (PATCH/MINOR/MAJOR), the
**sequence of applicable phases** with their 🔲 gates, what Phase 0 revealed (overrides, patches,
third-party module status, crossings), **whether the pre-migration baseline snapshot will be taken**
(gated, before Phase 1 — see below), and the key precautions (dedicated branch, `-W` caution, human gates).
Only start Phase 1 after this agreement. If the user requests adjustments, adapt and re-confirm.

> **Magnitude & execution (internal, not a user choice).** Computing the magnitude (version delta, number of
> overrides, Tailwind v4 crossing ≥ 1.4.0 / 1.4.0 break) serves to: decide whether a `PROGRESS.md` is
> useful, and whether a fan-out is worth it. When the **Workflow** feature is available, use it **by default**
> for the heavy read-only analysis phases (1 & 4) to keep the context window clean
> (`workflows/analyze-upgrade.workflow.js`); **otherwise automatic fallback** to inline + subagents. **Gates
> always stay inline.** No "mode" is submitted to the user.

## Progress tracking (MAJOR upgrades)
**MAJOR** upgrade (or any multi-session effort): tracking at **two levels**, superpowers-style:
1. **Task list** — one per phase, visible live in the conversation.
2. **`PROGRESS.md`** in the workdir — durable, resumable state, created from `templates/progress.md`,
   updated at each phase and each 🔲 gate. If the session is interrupted, resume by reading it.

Small upgrade (PATCH/MINOR): the task list is enough, `PROGRESS.md` is optional.

## Pre-migration baseline snapshot (before Phase 1 — enables the Phase 8 QA)
The Phase 8 check compares the site **before** vs **after** the migration. Its "before" reference is
only faithful if captured **while the project is still pristine** — so it is taken **now, before
Phase 1**, before any file or the DB is touched (distinct from the Phase 0 vendor snapshot, which
only copies the Hyvä package for the code diff). If the Phase 8 QA will be used (recommended whenever
the front-end is affected), provision the "before" env now, **gated**:
`.claude/skills/hyva-upgrade-front-check/scripts/provision-before-env.sh create --dry-run`
→ show the output, get explicit confirmation, then run without `--dry-run`. It clones the current
project (code + media) and imports a logical copy of its DB into a **prefixed `before-<env>` Warden
environment** that stays frozen while Phases 2–7 modify the working project (the "after"). Phase 8
**reuses** this env and **never refreshes** it (a refresh would re-import the now-migrated DB and
destroy the baseline). Skip only if no front-facing change is expected — Phase 8 then falls back to a
manual checklist.

## Phases 0–9 (walkthrough)
0. **Global inventory & scoping** (above) → then **action plan & agreement** 🔲. If the Phase 8 QA
    will be used, take the **pre-migration baseline snapshot** (section just above, gated) now — before
    Phase 1, while the project is still pristine.
1. **Changelogs + breaking changes analysis** → see `references/reading-changelogs.md` and
   `references/breaking-changes.md`. If Workflow available: `workflows/analyze-upgrade.workflow.js` (phases 1 & 4).
   🔲 **Gate: validate the breaking-change plan.**
2. **Upgrade theme-module first** (backward-compatible):
   `$HYVA_RUNNER composer require hyva-themes/magento2-theme-module:<target> -W` (⚠️ `--dry-run` first, re-read `composer.lock`).
3. **Update default-theme** (baseline already snapshotted in Phase 0):
   `$HYVA_RUNNER composer require hyva-themes/magento2-default-theme:<target> -W` (same caution).
   Then **check the patches** (see `references/composer-patches-and-deps.md`) and **handle the third-party modules**
   (see `references/third-party-modules.md`): bump the compatible ones; for the incompatible ones **with no version**,
   create a **composer patch** in `patches/hyva-upgrade-<from>-to-<to>/<vendor>/<module>/` + `extra.patches`.
4. **Diff & worklist**:
   `.../scripts/diff-overrides.sh "$WORKDIR/baseline/hyva-themes/magento2-default-theme" <NEW_VENDOR> "$WORKDIR/overrides.txt" "$WORKDIR" <THEME_DIR>`
   then `.../scripts/classify-changes.sh "$WORKDIR"`. (If Workflow available, note enrichment is done by the workflow; the **classification stays the script's**.)
   **Also include `app/code`**: the modules' front-end `.phtml` and `layout/*.xml` have no vendor baseline → inventory them and confront them with the breaking changes (`needs-review` tier).
5. **Hybrid application**: auto-apply the `auto-safe` ones (`pristine` override → refresh/delete;
   `customized` override → `git apply --3way` of the vendor patch), **guided review** for `needs-review`
   (DOM/logic/conflicts). 🔲 **Gate: review the applied diffs.**
6. **Tailwind v4 migration & style finalize** — **only if crossed** (default-theme target **≥ 1.4.0**
   AND child theme in v3).
   → **Invoke the `hyva-tailwind-v4-migration` skill**, passing it `<THEME>`, the shared `<WORKDIR>`,
   `app/code` as additional sources, and the already-collected breaking-change context. Its **Finalize**
   step is **Tailwind-only** and is where the style migration actually completes (the official tool only
   refreshes the baseline + converts the config): **A** consolidate the tokens into `hyva.config.json`
   (drop the native ones; `@utility`/animations → `utilities/`), **B** re-migrate every custom file from
   the backup into the full vendor v4 tree (override same-named files or add customs), **C** keep
   `web/tailwind` a **full vendor copy** (CSS is compiled, not inherited → nothing deleted) + configure
   the parent scan (`hyva.config.json` include/`src` + `.gitignore` deny-list), **D/E** conformance +
   verification. **Trimming templates to overrides-only is NOT its job** — that already happened in
   Phase 5 (the override model handles `.phtml`/`.xml`); the sub-skill only renames Tailwind classes in
   `.phtml`. Writes into the `WORKDIR`, **does not rebuild** (deferred to Phase 7), returns a recap
   (migrated files, defaults + branded native components to check in QA). 🔲 **Gate carried by the
   sub-skill (custom-styles review).**
7. **Auto checks**: Tailwind build (`hyva-compile-tailwind-css` skill or `$HYVA_RUNNER` in
   `web/tailwind`), `bin/magento setup:upgrade`, `cache:flush`, scan `var/log/*.log` and `var/report/`.
   If Phase 6 ran, **close its verification gate (E) here** (post-build): the compiled `styles.css`
   contains the utilities used in the templates, **no build warning** (e.g. `Unknown at rule: @screen`),
   and a class present only in a non-overridden vendor `.phtml` reaches `styles.css` (proof the parent
   scan from step C works).
8. **QA — visual & functional regression check** → invoke the **`hyva-upgrade-front-check`** skill,
   passing it the migrated theme(s), the shared `WORKDIR`, and the worklist/breaking changes already
   collected. It **reuses** the **prefixed "before" reference environment** snapshotted before Phase 1
   (never refreshes it — that would pull the now-migrated DB and destroy the baseline) and captures
   both sides via an **ephemeral Playwright container**, then diffs on **three layers** — full-page
   pixel, semantic DOM/Alpine/console/network, and scripted interaction states — reconciling each
   finding against the worklist. The **run manifest it builds from the worklist is the coverage
   contract** (shown to the user) — it replaces a hand-ticked checklist, so no separate QA checklist is
   produced here. Claude investigates the leftovers via Claude-in-Chrome, moves items to `[C]`
   (verified, to confirm) and **lets the user** validate to `[x]`, then proposes tearing the "before"
   env down. 🔲 **Gate carried by the sub-skill: QA sign-off.**
   - **Fallback — no before env** (baseline snapshot skipped, or the front env could not be
      provisioned): produce a manual **front-end QA checklist** from the worklist + breaking changes
      (`references/qa-checklist.md` rules + `templates/qa-checklist.md`), as an artifact or a
      `var/hyva-upgrade/<ts>/qa-checklist.md` file, for a manual pass.
9. **Wrap-up**: recap of the changes carried over, patches added (+ removal condition), points to watch,
   cleanup of the workdir if desired. If Phase 6 ran, note the theme layout: **templates are
   overrides-only** (identical-to-vendor `.phtml`/`.xml` removed → lighter future upgrades) while
   **`web/tailwind` stays a full vendor v4 copy** (overridden content + custom additions, compiled at
   build — no CSS deletion). Remove `web/tailwind.backup.<date>` only after QA sign-off. (No commit —
   the user handles it.)

## References
- `references/upgrade-process.md` — 6 Hyvä steps ↔ phases
- `references/breaking-changes.md` — breaks per version (Tailwind v4 = 1.4.0)
- `references/reading-changelogs.md` — reading the changelogs
- `references/composer-patches-and-deps.md` — composer patches & `-W` caution
- `references/third-party-modules.md` — Hyvä third-party modules: compat & patches (versioned folder)
- `references/rollback.md` — rollback procedure
- `references/qa-checklist.md` — front-end QA checklist rules (manual QA fallback, Phase 8)
- `references/doc-sources.md` — Hyvä upgrade URLs
- `templates/progress.md` — `PROGRESS.md` template
- `templates/qa-checklist.md` — QA checklist template (manual QA fallback, Phase 8)
- Tailwind v4 migration: skill **`hyva-tailwind-v4-migration`** (triggered in Phase 6).
- Visual & functional regression: skill **`hyva-upgrade-front-check`** (3-layer before/after check, triggered in Phase 8).
