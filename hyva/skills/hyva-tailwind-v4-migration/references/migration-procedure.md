# Tailwind CSS v3 → v4 migration (Hyvä theme)

> Trigger when the upgrade path crosses v4 (default-theme ≥ 1.4.0) **and either**:
> the child theme is **still on Tailwind v3** (a `tailwind.config.js` is present → run the engine first),
> **or** it is **already on v4 but not finalized** (no `tailwind.config.js`, yet finalize symptoms remain:
> mis-organized custom CSS in `site/`/`components/style/`, a hand-maintained `@theme` in `generated/`,
> placeholder brand tokens → **skip the engine, go straight to Finalize step 2**, working from the live tree).
>
> ⚠️ The official tools refresh the Hyvä baseline (vendor comes v4-ready) and convert the config,
> but DO NOT rewrite the project's custom CSS (`.scss` files, `@layer`, `theme()`, `addUtilities`
> plugin), rename the Tailwind classes in the project's own `.phtml`/`app/code`, consolidate the
> tokens, or finalize the theme structure. That is the purpose of the **Finalize step (2)** below —
> the migration is not done before it.

## Why not `npx @tailwindcss/upgrade`?
The official Tailwind tool exists, but **do not use it on a Hyvä theme**. Hyvä explicitly
advises against it and ships its own (`update-to-tailwind-v4.js`) because the Hyvä v4 has a
non-standard architecture (`hyva.config.json`, `generated/` folder, `@import "tailwindcss" source(none)`
entrypoint, `@hyva-themes/hyva-modules` package). The official tool migrates the whole project via the config + the
standard entrypoint it expects → it would conflict with the Hyvä structure. On top of that, it does not touch the
SCSS and the Tailwind docs acknowledge you need to "tweak a few things by hand in complex projects".
→ We keep the Hyvä flow + this scan/catalogue as a safety net for the custom CSS.

## Prerequisite
Install the official tools (dev only):
```
$HYVA_RUNNER composer require --dev hyva-themes/upgrade-helper-tools:dev-main
```

## Procedure

### 1. Official engine (baseline refresh + config conversion)
`$HYVA_RUNNER ./vendor/bin/update-to-tailwind-v4.js <THEME>` (automatic backups),
or the `scripts/run-tailwind-v4-migration.sh <THEME>` wrapper (reads `HYVA_RUNNER`, defaults to Warden).

> ⚠️ **Skip this step entirely if the theme is already on v4** (no `tailwind.config.js`, no backup):
> running the engine would back up the *live* custom CSS and overwrite `web/tailwind` with a fresh vendor
> copy — destructive and pointless. Go straight to Finalize (step 2), working from the live tree.

What it does, and why the rest of the procedure exists:
- **Backs up** the current `web/tailwind` to `web/tailwind.backup.<date>` and **copies the vendor v4
  `web/tailwind` over it** (fresh v4 baseline). → After this step the theme's `web/tailwind` is the
  **vendor copy**; your custom CSS now lives **only in the backup**.
- **Converts** the old `tailwind.config.js` `theme.extend` + plugins to a CSS-v4 config, usually
  `generated/tailwind.config.css`. → A **hand-maintained** file parked in `generated/` (marked
  "do not edit, regenerable"): a trap.

Neither the custom CSS re-integration, the token consolidation, nor the theme structure it needs (CSS
kept as a full vendor copy + the parent scan) is done by the tool. **Step 2 (Finalize) repairs exactly
that** — the migration is not over until step 2 is complete.

> We do **not** use `find-deprecated-classes.js`: report-only, `.phtml`/`.xml` only, and its
> report is a dead-end (consumed by no one). The detection of deprecated/renamed classes
> is done by our scan (step 2B), which also covers `.css` and **feeds the application**.
> The official Hyvä list remains our upstream source, watched by the drift guard (step 1bis).

### 1bis. Drift guard (recommended)
`scripts/check-deprecated-drift.sh` compares the `deprecatedTailwind4Classes` list of the installed Hyvä
package against our patterns and **alerts** if Hyvä has added classes we do not cover (silent skip
if the package/node are absent). Run it when bumping `upgrade-helper-tools`.

### 2. Finalize & migrate styles  — the migration is NOT done until this whole step is
> The official engine only refreshed the baseline and converted the config. Nothing has yet
> re-integrated the custom CSS (still orphaned in the backup), consolidated the tokens, or finalized
> the theme structure. **A/B/C are the core; D/E are recommended completeness checks.**
> A is **interactive**: ask before inventing a shade not already in the brand palette.

#### A. Consolidate the tokens into a SINGLE source, OUTSIDE `generated/`
Symptom of the default state: **two token sources**. `generated/tailwind.config.css` holds the converted
brand `@theme` (color scales + custom `--text-*`/`--spacing-*`/`--radius-*`/… + the `@utility` plugins),
while `generated/hyva-tokens.css` holds the Hyvä **semantic aliases** regenerated from
`hyva.config.json` `tokens.values`. If those aliases still point at the default placeholders, the
**native components** (`btn`, `--form-active-color`, `accent-color`) resolve to the **wrong color**.

Fix:
1. **Move the design tokens to `hyva.config.json` `tokens.values`** — the single source. It
   **regenerates** `generated/hyva-tokens.css` (which legitimately stays in `generated/`). This carries
   the whole design scale: color scales, breakpoints, fontSizes, spacing, radius, shadows, tracking,
   leading, fonts. **Drop what is native in v4** — never re-declare a token Tailwind v4 already provides
   (e.g. `z-<number>`, `columns-<number>`, fraction widths `w-1/6`); keep only the genuine
   customisations/overrides.
2. **The `@utility` plugins and the animations are NOT tokens** → do NOT put them in `hyva.config.json`.
   Move them, **sensibly split, into files under `utilities/`**: the custom `@utility` (gradients,
   `border-1`, `grid-rows-0fr`…) and the animations (`--animate-*` **+** their `@keyframes`).
3. **Remove** the `@import "./generated/tailwind.config.css"` from `tailwind-source.css`, delete that
   file, then delete the now-dead `tailwind.config.js` (if the official tool left one).
4. **Remap the WHOLE semantic set to the brand palette**, not just `--color-primary`: the
   `primary`/`secondary` triads (`lighter`/`DEFAULT`/`darker`), `on-primary`/`on-secondary`, every
   `--form-*` bound to primary (incl. `--form-active-color`), and `accent-color`. Otherwise the
   hover/active/focus states and the text-on-color of native components stay on the placeholders.
   **Ask the user before inventing any shade not already in the brand palette** — pick the nearest
   defined shade and flag it.
5. **Namespace = v4 `--color-*` (singular).** `convert-tailwind-config.js` can emit `--colors-*`
   (plural), which is **not** the v4 color namespace and generates **no** utility. Grep for `--colors-`
   and fix.
6. Ensure the final tokens generate **exactly** the utilities used in the templates: the **semantic**
   ones (`bg-primary`) **and** the **numeric** ones (`bg-primary-500`) if both appear.
7. **Verify the COMPUTED value in the browser, not the source.** The import order between the alias
   (`hyva-tokens.css`, imported first) and any leftover placeholder decides who wins — check a rendered
   element's resolved color, not the CSS text.

#### B. Re-home AND migrate every custom CSS file into the standard Hyvä tree
**Source.** When the engine ran, the custom CSS is now **only** in `web/tailwind.backup.<date>` (the live
`web/tailwind` is the fresh vendor v4 copy). **When the theme was already on v4 there is no backup** — the
custom CSS is in the **live `web/tailwind` itself**, mis-organized in place. Either is your input; *never
treat a missing backup as "nothing to do" — re-homing the live tree is exactly this step's job.*

**B1 — structural / placement audit (active judgment; the scan does NOT surface this).** The scan (below)
finds only *syntax*. Whether a file sits in the wrong folder, carries an SCSS-style name, or bundles five
unrelated concerns is something **you** must read and fix, by reorganizing the custom CSS into the standard
Hyvä layout. Fix these smells:
- **non-standard subfolders** (e.g. `components/style/`) → flatten into `base/`/`components/`/`theme/`/`utilities/`;
- **SCSS-style names/dirs** — a `site/` folder, `_name.css` partial prefixes → plain files in the right folder;
- **grab-bag files** — one file mixing buttons + forms + layout + scrollbars… → split, **one concern per file** (`components/button.css`, `components/forms.css`, `utilities/scrollbar.css`…);
- **wrong folder / wrong layer** — component classes parked in `@layer base`, layout rules living in a "forms" file;
- **bespoke conventions** — custom `button`/`button-small` classes instead of the Hyvä `btn`/`btn-primary`/`btn-size-*`.
When relocating, **preserve the cascade** (keep each rule's `@layer` and relative order so precedence
doesn't shift) and **verify the compiled `styles.css` is behavior-equivalent before/after** (same set of
declarations & selectors — a cheap, strong safety net for a pure relocation). Moves that ripple into many
`.phtml` (adopting `btn`, renaming a widely-used class) are a genuine refactor → flag & gate them, don't
rewrite blindly.

**B2 — migrate & place each file.** Go through **each** file (from the backup, or the live tree if there
is no backup):
- **A pure vendor copy** (an old-Hyvä file with **no** custom added) → **discard** it: the new vendor v4
  already ships it. To tell a pure copy from a real custom, diff the backup file against the **v3**
  vendor (Phase 0 baseline in orchestrated mode; by judgement in standalone).
- **A real customisation** → **map it into the live `web/tailwind`** (which holds the vendor v4 copy),
  **merging into the native file rather than duplicating it**:
  - it **matches a vendor v4 file** — same name, **or a differently-named file playing the same role**
    (e.g. a custom `header-nav.css` vs the vendor `header.css`) → **merge your custom into that native
    file** (keep the vendor file name, re-apply your custom on top of the new v4 base). **Do NOT keep
    both.**
  - it has **no vendor counterpart** → **add it as a new custom file** in the right folder (`base/` /
    `components/` / `theme/` / `utilities/`) and wire its `@import` (via `tailwind-source.css`, or the
    folder's `index.css` for `utilities/`, `theme/`…).

  **No functional duplicates:** never end up with two files doing the same thing (a custom one *and* the
  native one). When unsure whether a backup file overlaps a native one, compare their scope **before**
  adding a new file.

Discovery — scan the **backup** if the engine ran, otherwise the **live `web/tailwind`** (this syntax
scan feeds B2, not the B1 placement audit):
```
# backup exists (engine ran):
TW_DIR="<THEME>/web/tailwind.backup.<date>" \
  scripts/scan-tailwind-v4-custom.sh <THEME> "" app/code > "$WORKDIR/tw-custom.tsv"
# already on v4 / no backup — scan the live tree (TW_DIR defaults to <THEME>/web/tailwind):
scripts/scan-tailwind-v4-custom.sh <THEME> "" app/code > "$WORKDIR/tw-custom.tsv"
```
(`TW_DIR` overrides the CSS scan root; the `.phtml` scan still covers the theme + `app/code`, whose
templates are untouched by the tool.) Produces the `file⇥pattern⇥tier⇥note` worklist,
`auto-safe` / `needs-review`.

Apply the **v4 syntax** while migrating (guided by `tailwind-v4-breaking-changes.md`):
- **`auto-safe` tier** → deterministic, auto-applied: `theme()`→`var()`, renamed/scale-shifted classes
  in `@apply`, `bg-[--x]`→`bg-(--x)` (arbitrary var → parens), `!important` as **suffix** (`w-full!`),
  `@import` in **relative** paths (`./ ../`), `.scss`→`.css` without SCSS features.
- **`needs-review` tier** → reasoned rewrite by **one subagent per file** (parallel on a large theme):
  `@layer utilities/components`→`@utility`, `addUtilities` plugin→`@utility`, de-SCSS-ification,
  `@screen`→media queries, `*-opacity-*`→slash modifier, `bg-gradient-to`→`bg-linear-to`,
  `flex-shrink`→`shrink`, `@apply` in isolated files needs `@reference "…/tailwind-source.css"`,
  defaults to restore (cat. 7).

**Completeness rule:** nothing stays orphaned (backup **or** live) — every file is either **merged into
its matching native file**, **added as a new custom file** (no native counterpart), or **discarded** (pure
vendor copy) — never left as a functional duplicate. And **nothing is left mis-placed (B1)**: no `site/`
or `components/style/` folder, no `_`-prefixed or grab-bag file survives. 🔲 **Gate: review of migrated
custom styles.**

#### C. CSS stays a full vendor copy + configure the scan (Tailwind only)
- **CSS (`web/tailwind`) is compiled at build; it does NOT inherit.** The theme's `web/tailwind` must
  keep the **same files as the new vendor v4** — content overridden where you customise, plus your extra
  custom files in the right folders (result of B). **Never delete a CSS file just because it is
  identical to vendor**: its `@import` is part of the build, removing it breaks compilation. (Opposite
  of the Luma/Less model — there is no CSS fallback to a parent theme.)
- **Parent-theme scan.** A child theme overrides only some templates; the classes used in the
  **non-overridden parent `.phtml`** (which live only in vendor) must still be scanned or Tailwind
  purges them. Declare the parent via `hyva.config.json` `tailwind.include` (`src` key) — note
  `tailwind-source.css` also `@source`s the vendor parent. **Secure `.gitignore`:** in v4 `@source`
  **respects `.gitignore`**, so a blanket-ignored `vendor/` breaks the scan → use an explicit
  **deny-list**, never a blanket ignore of `vendor/`.

> **Scope — Tailwind only.** This skill touches `.phtml` **solely to rename Tailwind classes** (step B /
> the scan), never their structure. Trimming templates to overrides-only (deleting `.phtml`/`.xml`
> identical to vendor, inherited via the native Magento fallback) is **out of scope** → it belongs to
> `hyva-upgrade` (Phase 5, its override model). Standalone: this skill leaves the template layout as-is.

#### D. Extend the v4 conformance check to the custom CSS  *(recommended)*
`find-deprecated-classes.js` covers only `.phtml`; our `scan-tailwind-v4-custom.sh` already covers
`.css`. Beyond what it flags, watch in the migrated custom CSS for:
- **scale shift** `rounded`/`shadow`/`blur` (incl. in `@apply`) — see `renamed-classes.tsv`;
- `outline-none`→`outline-hidden`;
- the **border-color compatibility shim** the migration tool may leave (a universal-selector
  `border-color` reset in `@layer base`) → decide keep-intentional vs remove (the scan flags it as
  `border-shim`);
- **arbitrary variables in brackets** (`-[--x]`→`-(--x)`).

Re-scanning the **migrated** `web/tailwind` (not the backup) should come back clean.

#### E. Verification gate (before declaring the migration done)  *(recommended)*
- The compiled `styles.css` actually **contains** the utilities used in the templates.
- Native components render at the **brand palette in rest AND hover/active/focus** states.
- **No build warning** (e.g. `Unknown at rule: @screen`).
- A class present **only** in a non-overridden **vendor** `.phtml` shows up in `styles.css` — proof
  the parent scan/import from C works.

Build-output items need the rebuild first: **standalone** → after step 3; **orchestrated** → after
Phase 7 (build) and during Phase 8 (branded-states visual check via `hyva-upgrade-front-check`).

### 3. Rebuild
See Phase 7 (Tailwind build via `$HYVA_RUNNER` / `hyva-compile-tailwind-css` skill). Standalone only — in
invoked mode the orchestrator rebuilds in Phase 7.

## Watch-outs
- The config format moves from JS to CSS/variables — review the merge carefully.
- **One token source = `hyva.config.json`** (it regenerates `generated/hyva-tokens.css`); no
  hand-maintained `@theme` left in `generated/`. Two `@theme` blocks (placeholders vs brand values) is
  the #1 silent regression; verify the **browser-computed** color, not the source text.
- Keep the generated backups (`web/tailwind.backup.<date>`) until QA validation — B and C both read them.
- Changed defaults (border `currentColor`, ring, placeholder, button cursor) are not detectable by the
  scan → check visually (category 7 of the catalogue) in QA Phase 8.
