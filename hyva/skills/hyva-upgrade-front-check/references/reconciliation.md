# Reconciling diffs with the migration worklist

Goal: before asking the user to look at anything, explain away every diff that the migration
itself already documents as an intentional change.

## Inputs (when invoked from hyva-upgrade / after hyva-tailwind-v4-migration)

Read from the shared `WORKDIR`, whichever of these exist:
- `tw-custom.tsv` (hyva-tailwind-v4-migration scan: file, pattern, tier, note)
- `overrides.txt` / `classification.tsv` (hyva-upgrade override diff: file, classification, priority)
- Breaking-change items produced by `workflows/analyze-upgrade.workflow.js` (version, title,
  impact) -- read from the workflow's returned JSON if still available in context, otherwise skip
  this source.

## Matching heuristic

For each page/viewport classified `REVIEW` by `diff-screenshots.js`:
1. Map the page's template key (home/category/product/cart/checkout/account/cms/header/slider) to
   the theme file paths that render it (e.g. `product` -> `Magento_Catalog/templates/product/
   view*`, `header` -> `Magento_Theme/templates/html/header*`, `slider`/`category` -> whatever the
   worklist entries under `web/tailwind` or `app/code/**/view/frontend` point to).
2. If any worklist entry's file path matches that template's known paths -> candidate match.
3. If any breaking-change item's `title`/`impact` text shares a keyword with the template (e.g.
   "minicart", "Snap Slider", "Dialog") -> candidate match.
4. A candidate match reclassifies the page to `ATTENDU (documenté)`, with a one-line reference to
   the matched worklist file or breaking-change title -- never silently drop the row, always show
   what explained it, so the user can challenge the match.
5. No candidate match -> stays `À REVOIR`, moves to the investigation step (see `SKILL.md`).

## Without a worklist (standalone mode, nothing found in WORKDIR)

Skip steps 1-4 entirely -- every page above the pixel threshold stays `À REVOIR`. Say so
explicitly in the report's header ("aucun rapprochement automatique -- worklist introuvable") so
the user knows why everything above threshold needs manual triage.

## Never auto-resolve to OK

This reconciliation can only move a page from `À REVOIR` to `ATTENDU (documenté)` -- never to
`OK` directly, and never to `[x]`. A documented-expected diff still needs the same human sign-off
as any other, just with the explanation attached.

## Stage-2 (DOM) findings

- `classChanges` are informational and never drive the verdict: `diff-dom.js` first normalizes
  Tailwind v4 renames via the sibling skill's TSV
  (`.claude/skills/hyva-tailwind-v4-migration/references/renamed-classes.tsv`, auto-loaded when
  present; `--renames` overrides). What remains after normalization is unexplained drift -- show
  it, let the human judge.
- Verdict-driving stage-2 findings (`removedElements`, lost directives, `newConsoleErrors`,
  `newFailedRequests`, `stateAsymmetry`) reconcile like pixel diffs: match the page's template to
  the worklist/breaking-change entries (see the matching heuristic above). A minicart button
  whose `@click` moved into the new 1.4.0 Dialog markup is a classic `ATTENDU (documenté)`.
- A stage-2 finding with no worklist match stays `À REVOIR` even when the pixel diff of the same
  page says OK -- an unbound event is invisible to pixels; that is exactly why stage 2 exists.
