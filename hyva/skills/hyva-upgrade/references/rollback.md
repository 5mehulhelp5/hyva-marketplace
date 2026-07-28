# Rollback — abandoning a Hyvä upgrade

> The upgrade happens in a **dedicated branch** and the user manages git. The rollback lever is therefore
> git + composer. No automated script: Claude documents, the user executes the git actions.

## When
If a phase breaks the project unrecoverably (build KO, broken front-end, inconsistent composer) and you
decide to abandon this upgrade.

## Procedure
1. **Restore `composer.lock`** to the pre-upgrade state (it is versioned):
   `git restore composer.lock composer.json` (or `git checkout <ref> -- composer.lock composer.json`).
2. **Reinstall the vendor** to the restored state:
   `$HYVA_RUNNER composer install`.
3. **Revert the theme modifications** carried over during the upgrade:
   `git restore app/design/frontend/<Vendor>/<theme>` (user action; adjust the scope).
4. **Remove this upgrade's patches** if added: delete the
   `patches/hyva-upgrade-<from>-to-<to>/` folder and the corresponding `extra.patches` entries, then
   `$HYVA_RUNNER composer install`.
5. **Set Magento straight again**:
   `$HYVA_RUNNER bin/magento setup:upgrade` then `cache:flush`.
6. **Check** the front-end (key pages) after rollback.
7. **Tear down the pre-migration baseline env**, if the Phase 8 QA baseline snapshot was taken. The
   `before-<env>` reference environment (`hyva-upgrade-front-check`) is provisioned **before Phase 1**, so
   abandoning the upgrade leaves it running and orphaned — its teardown is otherwise only proposed in
   Phase 8. Remove it, gated:
   `.claude/skills/hyva-upgrade-front-check/scripts/provision-before-env.sh teardown --dry-run` → show,
   confirm, then run without `--dry-run` (run `status` first if unsure it exists). This is a Warden env
   operation, not git — it does not touch your branch.

## Note
The `var/hyva-upgrade/<ts>/baseline/` snapshot is for the **diff**, not for rollback (the vendor is restored via
`composer install` from the versioned `composer.lock`). The `before-<env>` clone (step 7) is a **separate
Warden environment**, not part of your project tree — restoring git does not remove it; use the teardown above.
