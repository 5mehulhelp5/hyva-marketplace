# Hyvä upgrade process — 6 official steps ↔ 10 skill phases

## The 6 official Hyvä steps
1. Read the release notes (backward incompatible changes).
2. Read the changelogs (theme-module + default-theme).
3. Upgrade the **theme-module** first (backward-compatible, safe).
4. Inspect the default-theme changes for each overridden file (diff).
5. Upgrade the **default-theme**.
6. Apply the necessary modifications in the overridden files.

## Mapping to the 10 skill phases
| Skill phase | Hyvä step |
|---|---|
| 0 Global inventory & scoping (overrides, patches, third-party modules) | — |
| 1 Changelogs + breaking changes analysis | 1, 2 |
| 2 Upgrade theme-module | 3 |
| 3 Update default-theme + third-party modules | 5 |
| 4 Diff & worklist | 4 |
| 5 Hybrid application | 6 |
| 6 Tailwind v4 migration & style finalize (if crossed, ≥ 1.4.0) | 6 |
| 7 Auto checks (build, setup:upgrade, cache, logs) | — |
| 8 Front-end QA | — |
| 9 Wrap-up | — |

## Guiding principle
"The more overridden files there are, the heavier the upgrade." Prioritize the templates
with DOM structure changes; class-only changes may require nothing.

Phase 5 (hybrid application) fights this at the root **for templates**: a `pristine` override
identical to vendor is deleted (inherited via the native Magento fallback), so the **next** upgrade's
template override count — and its weight — stays minimal. (CSS is different and out of that scope: the
Tailwind v4 Finalize keeps `web/tailwind` a full vendor copy, compiled at build, never trimmed.)
