# After the vendor rebase — two regression classes no scan can find

> Data for Finalize steps B/D/E and for the QA pass (`hyva-upgrade` Phase 8).
> Category 7 of `tailwind-v4-breaking-changes.md` covers **Tailwind's** changed defaults. This file
> covers the two classes that survive a clean v4 conformance pass: **Hyvä's own** changed defaults,
> and **cascade/specificity** shifts. Neither appears in a diff of your CSS, because in both cases
> your CSS did not change — its surroundings did.

## A. Hyvä vendor drift — styling you never had, now inherited

Step 1 of the migration replaces `web/tailwind` with a **fresh vendor copy**. Your theme therefore
inherits every styling decision Hyvä made between your old version and the new one, in files you never
customised and so never look at.

These are not Tailwind breaks. The upgrade guide does not mention them, `find-deprecated-classes.js`
does not see them, and the build is clean. They show up only as "the page looks wrong".

Observed on a 1.4 → 1.5 rebase (illustrative — derive your own list, see below):

| vendor addition | symptom |
|---|---|
| sticky-footer pair: `.page-wrapper` flex column + `min-h-screen`, `.page-main` grow | short pages stretched to the viewport |
| `.columns` wrapped in `container` | content capped, full-width layouts lost |
| `.columns` grid driven by `--sidebar-width` / `--page-layout` | sidebar/main tracks re-proportioned |
| `--form-radius` | rounded inputs on a square-cornered theme |
| checkbox / radio sized `--spacing(4.5)` (was `1rem`) | controls visibly larger |
| `.account-nav` entries flex + `py-1` + recoloured to `--color-fg-secondary` | customer account nav restyled |
| `.page-main` vertical margin | extra whitespace under the header |

**Derive the list for your own jump** — that is the durable method:

```bash
diff -rq "$WORKDIR/baseline/hyva-themes/magento2-default-theme/web/tailwind" \
         "<VENDOR_DEFAULT_THEME>/web/tailwind"
```

Then read the diff of each changed file you do **not** override. Every new or changed selector is a
candidate: it will now apply to your markup.

**How to neutralise.** Do not edit the vendor file — you would lose it on the next upgrade. Restate the
declaration you want in your own file, and **write down why**, because a bare override reads as dead
code to the next person:

```css
/* Hyvä 1.5's sticky-footer pair (`.page-wrapper` flex column + min-h-screen, `.page-main` grow) is
   not carried over: this theme lets a short page end above the fold. */
```

For a vendor rule driven by a token, override the **token**, not the rule — `@theme { --form-radius: 0; }`
beats restating a radius on six selectors.

Decide deliberately per item: **adopt** (the new vendor look is fine or better) or **opt out** (with a
comment). "Didn't notice" is the failure mode this list exists to prevent.

## B. Cascade and specificity in v4

v4 puts its own output in cascade layers and compiles selector lists differently. Rules that worked in
v3 lose silently.

**Unlayered CSS beats every `@layer`, at any specificity.** A vendor stylesheet that is not in a layer
(Splide, PhotoSwipe, int-tel-input and friends) outranks anything you put in `@layer components` —
specificity never enters into it. To win, state your rule **unlayered too**, after the import:

```css
/* Unlayered on purpose: Splide ships its own unlayered stylesheet, which outranks every @layer
   whatever the specificity. */
.splide .splide__pagination { … }
```

**A selector list compiles to `:is(...)`, which takes the specificity of its strongest argument.**
Grouping a selector containing an `#id` with a plain one promotes the plain one to ID specificity, and
it starts outranking rules it used to lose to. Keep them as separate rules:

```css
/* Kept as two rules, never grouped: v4 compiles a list to `:is(...)`, which would take the #header
   specificity and outrank the :placeholder-shown block whatever the input state. */
input.search { & + svg { @apply hidden; } }
```

**`scale-*` and `rotate-*` emit the `scale` / `rotate` properties, not `transform`.** They therefore no
longer cancel a `transform` set elsewhere (typically by a vendor sheet). Reset the actual property:
`transform: none`.

**`leading-*` also sets `--tw-leading`, which any later `text-*` consults in preference to its own
value.** When a `text-*` must win the line-height, write `line-height` in plain CSS rather than relying
on the utility.

**The universal reset includes `padding: 0`**, which removes the ~1px browsers give table cells.

**Contradictory `@apply` resolves by utility sort order, not source order.** `@apply border-0 border`
does not give you a border — the emitted order decides, and it is not the order you typed. Never
`@apply` two utilities that set the same property.

**`inherit` on a custom property inherits the variable, not its computed value** — the referencing
element re-resolves it in its own context.

## C. Build-time checks that catch what reading cannot

- **Compile with `--minify` before delivering.** The optimizer is the only stage that reports invalid
  at-rules and unresolvable `@import`s. A `watch` build swallows them, so a broken rule can sit in the
  tree for weeks. `npm run build` should already carry it — check that it does.
- **A module whose `tailwind-source.css` is a bare `@import url(...)`** cannot be resolved by Tailwind:
  the statement survives into the bundle, where it is both invalid CSS and a build warning. Exclude the
  module's source while keeping its templates scanned, and import the real stylesheet yourself:

  ```json
  { "src": "vendor/<vendor>/<module>/src", "keepSource": true }
  ```

- **Before adding a token for a Hyvä-compatible module, read its own
  `view/frontend/tailwind/tailwind-source.css`** — Amasty and others already declare theirs. On one
  audit, 31 of 32 hand-added module tokens were pure duplicates.
