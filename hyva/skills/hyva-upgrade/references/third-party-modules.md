# Hyvä-based third-party modules — compatibility & patches

> Applies to any Hyvä upgrade. Third-party modules that provide a Hyvä front-end (or depend on it)
> can **block** the upgrade (version constraint) or **break** at runtime.

## 1. Scope & detection
**Targets = THIRD-PARTY modules** (vendor **≠ `hyva-themes/`**: Amasty, Blackbird…) that provide a Hyvä
front-end or depend on it — i.e. a name containing `hyva` **or** that `require` a `hyva-themes/*`.

**Out of scope = `hyva-themes/*` satellites** (`reset-theme`, `hyva-widgets`, `module-magento2-admin`,
`graphql-*`, `email-module`…). We **do not bump them** as part of this upgrade: it is **not
recommended by Hyvä**, and updating them is an **independent task, to be done separately** from the
Hyvä upgrade. (Composer may move some if the core strictly requires it; in that case re-read the
`composer.lock` and do not widen beyond what is necessary.)

List the third parties (excluding the satellites):
```
$HYVA_RUNNER composer show | grep -i hyva | grep -v '^hyva-themes/'
```
then check the candidates' `require` entries if needed.

## 2. Scope compatibility with the target version (Phase 0) — two axes
A third-party module may need an upgrade for **two distinct reasons**:

**Axis 1 — Hyvä dependency (composer constraint).** `why-not` (alias `prohibits`) tells **which packages
block** the target:
```
$HYVA_RUNNER composer why-not hyva-themes/magento2-theme-module:<target>
$HYVA_RUNNER composer why-not hyva-themes/magento2-default-theme:<target>
```
Complement with a global dry run: `$HYVA_RUNNER composer update "hyva-themes/*" --dry-run -W`.

**Axis 2 — Tailwind v4 (the module's own front-end).** If the upgrade crosses **≥ 1.4.0**, the module's
front-end (phtml/CSS) may have stayed on Tailwind v3 and **break even if composer is satisfied** (`why-not`
does not see it). Check that a **"v4-ready"** version of the module exists; optionally, the
`scan-tailwind-v4-custom.sh` scan from the `hyva-tailwind-v4-migration` skill can be pointed at the module's
vendor folder to spot v3 classes.

Status per module (combining the two axes):
- **OK** — compatible on both axes, nothing to do.
- **Compatible version available** — to bump (include it in the composer scope of phases 2-3).
- **No compatible version** — blocking (composer constraint **or** v4) → **patch** (step 4).

## 3. Sequence per third-party module (strict order)
1. Look for a COMPATIBLE version (axis 1 composer satisfied AND axis 2 v4-ready): `composer show <pkg> --all`.
2. If it exists → BUMP it (include it in the composer scope of phases 2-3).
3. ONLY if no compatible version exists → composer PATCH (see §4). The patch is the **last resort**.

## 3b. Bump the compatible modules
Include them in the `composer require`/`update` of phases 2-3 (explicit scope, `--dry-run`
first, re-read the `composer.lock` — see `composer-patches-and-deps.md`). Check that no unwanted module
moves.

## 4. Patch the incompatible modules
> **The composer patch is preferred over a theme override**: it is localized, reversible, and does not alter the
> theme. Theme overrides remain handled by the standard flow (child theme templates/layout).

> **The orchestrator is the only patch maker** — a rule valid on the composer side (dependencies) AND
> on the Tailwind front-end side. The orchestrator relies on the v3→v4 transform catalogue provided by the
> `hyva-tailwind-v4-migration` skill to compose the CSS/phtml patches; the sub-skill itself never creates a patch.

If no compatible version exists and the module is still needed:
1. Identify the breakage point (often a too-strict `hyva-themes/*` constraint in the module's
   `composer.json`, or a template/layout override that became invalid).
2. Create the patch in **`patches/hyva-upgrade-<from>-to-<to>/<vendor>/<module>/<description>.patch`**
   (per-run versioned folder).
3. Register it in `composer.json` → `extra.patches` with the note
   `"stopgap Hyvä upgrade {from}→{to}, remove as soon as a compatible version ships"`
   (see `composer-patches-and-deps.md`).
4. `composer install` reapplies the patch — check that it applies.

> Frequent case: widen the module's `hyva-themes/...` constraint via a patch on its `composer.json`
> (stopgap), while waiting for an official compatible version. To be documented for reassessment at the next bump.
