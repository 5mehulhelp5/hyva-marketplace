# Front-end QA checklist — template & rules

> Produced **before** QA (Phase 8a). Goal: list ALL the front-end areas (pages/elements) impacted
> by the upgrade, as a **simple, testable** checklist. Built from the worklist (`tw-custom.tsv`,
> overrides diff) **+** the breaking changes (header/minicart 1.4.0, Snap Slider, Tailwind v4…).
> Only include the areas actually touched by THIS run (adapt / prune the template below).

## Format (the user chooses)
- **Artifact** (recommended): readable/shareable page, updated by redeploying the **same URL**.
  More token-hungry (see disclaimer).
- **File**: `var/hyva-upgrade/<ts>/qa-checklist.md`. Lighter.

## States — distinguish auto vs validated
- `[ ]` to test
- `[C]` **auto-verified by Claude** (via Claude-in-Chrome) — to be **confirmed** by the user
- `[x]` **validated by the user**

> Rule: during assisted QA (`/chrome`), Claude moves to `[C]` the items it has verified (with
> a note: screenshot / observation) and **lets the user** move to `[x]` what they validate.
> **Never check `[x]` on the user's behalf.**

> The template to copy/instantiate lives in `templates/qa-checklist.md` (placeholders {FROM}/{TO}).

## When Phase 6 (Tailwind v4 + Finalize) ran — extra items
Add these to the checklist (they mirror the sub-skill's verification gate E):
- **Native components at brand colors, rest AND hover/active/focus** — `btn`, form active color,
  `accent-color`. A token-consolidation miss (Finalize A) shows up here first.
- **Compiled `styles.css` contains the utilities used**, and **no build warning** (e.g.
  `Unknown at rule: @screen`).
- **A class used only in a non-overridden vendor `.phtml` renders** — proof the Finalize-C parent scan
  works (classes in non-overridden parent templates are not purged).
