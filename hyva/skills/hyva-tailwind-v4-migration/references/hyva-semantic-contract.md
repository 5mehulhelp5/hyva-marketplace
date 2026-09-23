# Hyvä's semantic contract in v4 — reserved names, layers, component variables

> Data for Finalize step A (token consolidation) and step B (custom CSS).
> Everything here is about names Hyvä **already owns**. Tailwind's own upgrade guide says nothing
> about them, so no scan and no `@tailwindcss/upgrade` run will flag a mistake in this file's scope.
> The failure mode throughout is **silent**: it compiles, and the wrong colour ships.

## 0. Read the contract before writing a single token

The reserved names and their defaults live in the **installed** package, not in your memory and not in
this file. Read them first, every time — they drift between Hyvä versions:

```bash
CSS="<THEME>/web/tailwind/node_modules/@hyva-themes/hyva-modules/css"
BTN="<VENDOR_DEFAULT_THEME>/web/tailwind/components/button.css"

cat "$CSS/theme.css"                                 # @theme defaults: the colour roles
cat "$CSS/fallback.css"                              # v2/v3 utilities kept alive for 3rd-party modules
grep -roh -- '--form-[a-z0-9-]*' "$CSS" | sort -u    # the form contract
grep -oh  -- '--btn-[a-z0-9-]*'  "$BTN" | sort -u    # the button contract
```

**Do not infer a variable name from its role.** Asked to "remap the whole `--form-*` set", an agent
under test produced `--form-border`, `--form-border-active`, `--form-background`, `--form-text` and
`--form-focus-ring`. The contract that version actually shipped was `--form-bg`, `--form-color`,
`--form-stroke`, `--form-radius`, `--form-px`, `--form-py`, `--form-active-color`. Nought for five —
and every invented name compiles clean and does nothing.

If you cannot run the greps (no `node_modules` yet), say so and stop rather than guessing. A guessed
token name is worse than an absent one: absent fails loudly at review, guessed fails silently in prod.

## 1. One name, one colour — the v3 namespace collapse

v3 kept `backgroundColor`, `textColor` and `borderColor` as **separate** namespaces, so a theme could
give one name two meanings:

```js
backgroundColor: { primary: '#FFFFFF' },   // bg-primary  = white
textColor:       { primary: '#202020' },   // text-primary = near-black
```

v4 has a single `--color-*` space. `--background-color-*`, `--text-color-*` and `--border-color-*` are
gone. **You cannot keep both meanings** — pick one, then sweep every call site of the other.

Resolving it: name the family after the **colour**, not after the utility that used it. Check which
meaning the *vendor* templates you don't override assume (§2), and let that win — those you cannot
edit; your own templates you can.

The sweep is the expensive half and it is not optional: `bg-primary` silently inverts everywhere. Grep
`.phtml`, `.xml`, and any `@apply` in CSS.

## 2. Reserved names — redefining them breaks vendor templates

`@hyva-themes/hyva-modules/css/theme.css` already declares, as a `@theme` block:

| name | vendor default (1.5.x — **verify against your install**) |
|---|---|
| `--color-primary` / `-lighter` / `-darker` | a saturated accent (`oklch(46% 0.2 265)`, i.e. blue) |
| `--color-on-primary` | `--color-white` |
| `--color-secondary` / `-lighter` / `-darker` | a second accent (`oklch(53% 0.15 150)`) |
| `--color-on-secondary` | `--color-white` |
| `--color-surface` | `--color-white` |
| `--color-background` | `--color-gray-50` |
| `--color-ink` / `--color-ink-muted` | `--color-gray-950` / `--color-gray-600` |

`fallback.css` adds `container` / `-lighter` / `-darker`.

The contract vendor markup relies on is **`bg-primary` is a filled brand surface and `text-on-primary`
is legible on top of it**. Give `primary` your light brand value while `on-primary` stays white and
every such pair renders white-on-white — it compiles, and the element simply vanishes.

Find the blast radius in the version you are on rather than trusting a list:

```bash
cd <VENDOR_DEFAULT_THEME>
grep -rl --include=*.phtml -e 'bg-primary' -e 'text-on-primary' -e 'bg-surface' .
```

On 1.5.x that is the header compare and wishlist counters, the gift-options containers, the mobile
menu, the footer, the breadcrumbs and the compare list — i.e. small, easily-missed chrome, which is
why this reaches QA undetected.

**`--color-primary` is load-bearing beyond the utilities.** Before repointing it, check what else
reads it — typically the `preflight.css` focus ring, `accent-color`, `caret-color`, and vendor range
sliders. `grep -rn 'var(--color-primary)' <THEME>/web/tailwind` answers it in one command.

## 3. Two layers: palette in JSON, roles in `@theme`

Keep these apart. Merging them is the single most common failure in testing (agents put `surface`,
`ink`, `background` straight into `tokens.values.color`, or drop the role layer entirely):

| layer | lives in | holds |
|---|---|---|
| **palette** | `hyva.config.json` → `tokens.values.color` | the actual colours, grouped by family with `DEFAULT` |
| **roles** | a `@theme` block in `tailwind-source.css`, **after** the `@import` of `generated/` | aliases: `--color-fg: var(--color-ink)`, `--color-surface: var(--color-secondary)` … |
| **generated** | `generated/hyva-tokens.css` | output of `npm run generate` — never hand-edited |

Why: `tokens.values` is plain JSON and cannot hold `var()`. A role is by definition a reference to
another token, so it can only be expressed in CSS. Putting a role in the palette forces you to
duplicate a literal hex, and the two copies drift.

The role block must come **after** the `generated/` imports — same specificity, so source order decides.

Do **not** define a token in both places. One agent under test emitted
`@theme { --font-sans: "Akzidenz", var(--font-sans); }` alongside a JSON `font.sans` — a
self-referential custom property (invalid at computed-value time) *and* a duplicate source.

## 4. The token group key **is** the v4 namespace

`tokens.values.<group>.<key>` emits `--<group>-<key>`. The group is the Tailwind v4 namespace, not the
v3 config key:

| write | emits | effect |
|---|---|---|
| `font.sans` | `--font-sans` | ✅ overrides the default sans stack |
| `fontFamily.sans` | `--fontFamily-sans` | ❌ dead variable; the default stack still wins |
| `font.display-sans` | `--font-display-sans` | ❌ dead variable, no utility reads it |

Same trap for `text` (not `fontSize`), `breakpoint` (not `screens`), `shadow` (not `boxShadow`).
After `npm run generate`, grep `generated/hyva-tokens.css` for the variable you *expect*; if it is not
there under that exact name, the key is wrong.

## 5. Verify by value, in the browser — never by name

Utilities do not all read the same namespace history. In v3 `bg-`, `text-` and `border-` had their own;
**everything else** — `from-`, `to-`, `via-`, `ring-`, `outline-`, `fill-`, `divide-`, `accent-`,
`caret-` — read the generic `colors` map, and in v4 all of them read `--color-*`.

So a rename reasoned over the `bg-`/`text-` families **silently breaks gradients, rings and fills**. A
diff of names sees nothing.

After any rename or remap: rebuild, then resolve each affected class to a hexadecimal on both sides and
compare **values**. Read the computed style of a rendered element, not the CSS source.

## 6. Component contracts — `--btn-*`

**Mirror vendor by default.** The migration brings the old infrastructure onto the new vendor contract,
it does not build a parallel one beside it. Keep vendor's variable names, its state selectors and its
structure, so the next upgrade arrives as a readable diff. Deviate only where the evidence below forces
it, and say so in a comment.

The contract: **`.btn` does the wiring; variants supply `--btn-*`.** Available: `--btn-bg`,
`--btn-stroke`, `--btn-color`, plus the same triplet prefixed `--btn-hover-*`, `--btn-active-*`,
`--btn-focus-*`, `--btn-disabled-*`.

```css
@utility btn-ghost {
    --btn-bg: transparent;
    --btn-stroke: var(--color-dark-lighter);
    --btn-color: var(--color-fg);
    --btn-hover-bg: var(--color-secondary-lighter);
}
```

### The one place vendor's own file is a trap

Vendor declares `--btn-*` **defaults on the `@utility btn` base**. Base and variant are both
single-class selectors, so whichever Tailwind emits **later** wins — and **`@utility` emit order is not
source order**. Vendor's own `btn-primary`/`btn-secondary` happen to sort after the base, so vendor's
file is self-consistent. A custom variant may not.

Measured on a real theme, all five declared in one file with `btn` first:

| emitted at | utility | source line |
|---|---|---|
| 63 995 | `.btn-sizing` | 94 |
| 76 068 | `.btn` (base) | 1 |
| 79 294 | `.btn-tool` | — |
| 97 097 | `.btn-secondary` | — |
| 97 651 | `.btn-primary` | — |

`btn-sizing` is declared 93 lines *after* the base and still emitted 12 KB *before* it. Had the base
carried `--btn-bg`, that variant would have been silently overridden and rendered transparent — which
is exactly how a product-page size selector went missing on the theme measured here.

**So: check, don't assume.** After adding or re-homing a variant:

```bash
/usr/bin/grep -bo -E '\.btn(-[a-z-]+)?\{' <THEME>/web/css/styles.css | sort -n | head
```

Every variant must appear **after** the base's offset. For any variant that does not, its `--btn-*`
cannot be defended by the base's defaults, and you have two options:

1. **Keep vendor's shape** and give that one variant `!important`-free protection by not relying on a
   base default for the properties it sets — i.e. the base declares no default for them.
2. **Move the defaults off the base entirely** into the `var()` fallbacks
   (`background-color: var(--btn-bg, transparent)`), so no variant can ever be clobbered regardless of
   order. This is a deviation from vendor; it is the robust option, and it is what a theme with many
   custom variants will converge on. Record why in a comment at the top of the file.

The same applies to `border-width`: vendor hardcodes `2px` on the base, so a variant that wants a
different width (or `border-none`) is fighting the base rather than configuring it.

Call-site overrides work either way — Tailwind sorts custom `@utility` **before** native utilities, so
`class="btn btn-secondary bg-surface"` beats `--btn-bg`. No variant needed for a one-off.
