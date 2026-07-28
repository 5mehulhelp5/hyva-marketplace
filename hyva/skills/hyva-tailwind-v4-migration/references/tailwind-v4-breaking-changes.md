# Tailwind v3 → v4 — Transform catalogue (custom CSS)

> Data for the Finalize step (step 2; `hyva-upgrade` Phase 6). Covers the hand-written custom CSS; the
> renamed classes in the project's `.phtml`/`app/code` are handled by the scan (step 2B), not the
> official tool (it only refreshes the baseline + converts the config).
> Source: https://tailwindcss.com/docs/upgrade-guide (see `doc-sources.md`).
>
> Tier: `auto-safe` = deterministic, auto-applicable transform. `needs-review` = reasoned rewrite (a subagent + human review).

## 1. Incompatible SCSS — tier: needs-review (auto-safe if no SCSS feature)
Tailwind v4 is not a preprocessor; a `.scss` with `$variables`, `@mixin`, `@include`,
`@function`, or `&` nesting no longer works.
- Without SCSS features → simply rename `.scss` to `.css`.
- With features → de-SCSS-ify (resolve variables/mixins/nesting into flat CSS) then `.css`.

## 2. @layer → @utility — tier: needs-review
> Official docs: "In v3, any custom classes you defined within `@layer utilities` or
> `@layer components` would get picked up by Tailwind ... and would automatically work with
> variants like hover, focus, or lg. In v4 we ... introduced the `@utility` API as a replacement".

Only concerns `@layer utilities`/`@layer components`. **`@layer base` is unchanged in v4**
(global styles, no utilities) → do not convert. To *restore* modified preflight defaults,
see category 7.

v3:
```css
@layer utilities {
  .grid-rows-0fr { grid-template-rows: 0fr; }
}
```
v4:
```css
@utility grid-rows-0fr { grid-template-rows: 0fr; }
```
Without this, `md:grid-rows-0fr`, `hover:…`, etc. are no longer generated.

## 3. theme() → var() — tier: auto-safe
```css
/* v3 */  color: theme(colors.primary.500);
/* v4 */  color: var(--color-primary-500);
```
In `@media`, CSS variables don't work → `@media (width >= theme(--breakpoint-xl))`.

## 4. JS plugin addUtilities → @utility — tier: needs-review
Old `tailwind.config.js`:
```js
plugin(function ({ addUtilities }) {
  addUtilities({ '.footer-gradient': { background: '…' } })
})
```
→ each utility becomes a `@utility` in CSS v4:
```css
@utility footer-gradient { background: …; }
```

## 5. @apply in isolated files — tier: auto-safe
If a file with `@apply` has no access to the theme, add at the top:
```css
@reference "../tailwind-source.css";
```

## 6. Renamed / removed classes — tier: auto-safe
> The exhaustive list of renamed/removed classes lives in `references/renamed-classes.tsv` (single source, read by the scan and the drift guard). The table below gives the salient cases as an example.

| v3 | v4 |
|---|---|
| shadow-sm | shadow-xs |
| rounded | rounded-sm |
| outline-none | outline-hidden |
| `bg-opacity-50` (+ `bg-white`) | `bg-white/50` |
| `decoration-slice` | `box-decoration-slice` |

> Exhaustive list and drift: `renamed-classes.tsv` + `scripts/check-deprecated-drift.sh`.

## 7. Changed defaults — tier: needs-review (visual check)
- default `border` = `currentColor` (was gray-200) → specify the color or restore it in base.
- placeholder = text color at 50% (was gray-400).
- `<button>` `cursor` = `default` (was pointer).
- default `ring` = 1px / `currentColor` (was 3px / blue-500).
- `<dialog>`: default margins removed.
Restorations via `@layer base { … }` (see upgrade-guide, Preflight section).

**Border-color shim.** The migration tool may leave a universal-selector `border-color` reset in
`@layer base` (`*,::after,::before{ border-color: … }`) to preserve the v3 default. Decide
keep-intentional vs remove — the scan flags it as `border-shim` (Finalize step D). It is NOT visible
in the `.phtml` scan of `find-deprecated-classes.js`.

## 8. Syntaxes — tier: auto-safe
- Arbitrary CSS variable: `bg-[--x]` → `bg-(--x)`.
- `!important`: `!flex` → `flex!`.
- `space-y-*`: new selector (`:not(:last-child)`) → prefer `flex flex-col gap-*`.

## 9. Token / config consolidation — tier: needs-review (Finalize step A)
`convert-tailwind-config.js` turns the v3 `tailwind.config.js` `theme.extend` into a CSS `@theme`
(usually `generated/tailwind.config.css`), which then **coexists** with `generated/hyva-tokens.css`
(the Hyvä semantic aliases regenerated from `hyva.config.json`). Two token sources, and the converted
one is a hand-maintained file wrongly parked in `generated/`.
- **Single source = `hyva.config.json` `tokens.values`** (it regenerates `generated/hyva-tokens.css`).
  Move the design tokens there, **dropping what v4 provides natively** (keep only real overrides). The
  **`@utility` plugins and animations (`--animate-*` + `@keyframes`) are NOT tokens** → move them to
  files under `utilities/`. Remove the `@import` of `generated/tailwind.config.css`, that file, and the
  dead `tailwind.config.js`.
- **Namespace = `--color-*` (singular).** `--colors-*` (plural) is not the v4 color namespace → emits
  no utility. Grep `--colors-`.
- **Remap the whole semantic set**, not only `--color-primary`: primary/secondary triads
  (`lighter`/`DEFAULT`/`darker`), `on-primary`/`on-secondary`, `--form-*` bound to primary (incl.
  `--form-active-color`), `accent-color`.
- **Order + computed value decide the winner.** `hyva-tokens.css` is imported before the custom tokens;
  verify the **browser-computed** color of a rendered native component, not the CSS source.
