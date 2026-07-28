# Interaction states -- hot zones, breaking changes, manifest states

Stage 3 captures the SAME scripted interaction on both sides, then feeds the resulting state
pairs through the exact same diff pipeline (pixel + DOM). Which states to script comes from the
migration's own worklist/breaking changes; without a worklist (standalone), use the default set.

## Default state set (standalone mode)
| State name | Hot zone | Typical breaking change | Steps (manifest) |
|---|---|---|---|
| `minicart-open` | header/minicart | 1.4.0 HTML Dialog rework | click `#menu-cart-icon, [aria-label*='cart' i], [aria-label*='panier' i]` |
| `menu-open` | main nav (mobile above all) | header layout rework | click `header button[aria-label*='menu' i]` |
| `search-open` | header search | header rework | click `[aria-label*='search' i], [aria-label*='recherche' i]` |
| `hover-nav` | nav links | Tailwind hover: utilities, focus/outline defaults | hover `header nav a` |
| `hover-cta` | primary buttons | border/ring/cursor default changes (TW v4) | hover `button[type='submit'], .btn-primary, [class*='btn']` |
| `slider-next` | carousels | Snap Slider replaces GliderJS | click `[aria-label*='next' i], [aria-label*='suivant' i]` |
| `form-error` | forms | validation styles | click submit on an empty required form, e.g. `form button[type='submit']` |

## Selector rules
- Prefer role/aria/id attributes (`[aria-label*=… i]`, `#menu-cart-icon`) -- NEVER Tailwind
  utility classes (they are exactly what the migration renames).
- The Hyvä-specific pitfalls (hidden `x-show` duplicates, strict-mode multi-matches, `#messages`
  scoping) are documented in the org's `hyva-playwright-test` skill -- reuse its selector
  patterns when refining a state for a given project.
- Selectors live in the MANIFEST, not in code: adjust them per project/theme when generating the
  run manifest; `capture-run.js` only provides the mechanism (click/hover/focus/fill/press).

## Reading the results
- A state that applies on "before" but not on "after" (`stateApplied` asymmetry) is itself a
  finding (`À REVOIR`): the trigger element disappeared or stopped responding.
- A state skipped on BOTH sides is a coverage gap, not a regression: refine the selector.
- Hover states: the pixel pair captures the hovered rendering; a lost `hover:` style shows as a
  diff between the two hovered screenshots.

## Scaling coverage
Derive extra states from the worklist: any template the migration touched that has an
interactive component (gallery zoom, tabs, accordion, add-to-cart) deserves a scripted state.
Keep each state to 1-3 steps -- long flows (checkout funnel) belong to a real e2e suite, not to
this skill (see the residual-limit note in the spec §1).
