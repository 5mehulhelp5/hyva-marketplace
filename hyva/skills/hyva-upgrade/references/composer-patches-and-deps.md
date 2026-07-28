# Composer patches & dependencies — upgrade precautions

> Applies to any Hyvä upgrade (composer steps), not just Tailwind.

## Composer patches (cweagans/composer-patches)
Patches live in `composer.json` → `extra.patches` (package → patch file). Bumping a
patched package may **break** the patch or make it **obsolete**.

### Before the upgrade (Phase 0)
- Read `extra.patches` and **spot the patches targeting a bumped package** (`hyva-themes/*` family,
  Hyvä-adjacent modules, or Magento if concerned).
- For each one, anticipate one of the 3 cases below.

### After the `composer require`
Patches are **reapplied at `composer install`**. Watch the output:
- ✅ patch applied → nothing to do.
- ❌ "**Could not apply patch**" → the patch no longer applies (code changed). **Blocking.**

### Course of action (per impacted patch)
| Case | Action |
|---|---|
| The fix has been **merged upstream** in the new version | **Remove** the `extra.patches` entry (+ the file). |
| The patch no longer applies but is still **needed** | **Re-roll**: regenerate the patch on the new base (manual diff or `symplify/vendor-patches`). |
| The patch still applies | **Keep** it as is. |

> Decision = human judgment (reading the changelog + the patch). Never remove a patch without
> checking that its need is covered by the new version.

## Dependencies: caution with `-W`
`composer require <pkg>:<v> -W` (`--with-all-dependencies`) updates **all** transitive
dependencies → risk of **bumping unwanted modules** (Amasty, Swissup… sharing a dependency).

`-W` is often **necessary** to bump the Hyvä family consistently — so we don't forbid it,
we **control what it pulls in**:
1. **`--dry-run` first**:
   `$HYVA_RUNNER composer require hyva-themes/...:<v> -W --dry-run` (see everything that would move).
2. **Re-read the `composer.lock` diff** afterwards (which packages changed version?).
3. **Tighten if it overreaches**: explicit scope (list the Hyvä packages to bump together),
   or `-w` (`--with-dependencies`, direct deps only) instead of `-W`.
4. If needed, **constrain** the modules not to move via their version constraints in `composer.json`.
