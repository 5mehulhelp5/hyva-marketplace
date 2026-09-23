---
name: hyva-global-js
description: Decide where shared frontend JavaScript lives in a Hyvä theme (Magento 2) — a project `window.<namespace>` of stateless helpers versus Alpine stores for shared reactive state — and how to reach either from a CSP-compatible Alpine expression. Use when several templates need the same helper or flag, when adding an `isMobile` / `isDesktop` / viewport store, a `$magic`, a global `window.*` object, or JS registered from `default_hyva.xml`. Trigger phrases include "shared js hyva", "global helper", "alpine store", "isMobile store", "window namespace", "Alpine.magic", "breakpoint in js".
---

# Hyvä Global JS — namespace helpers and Alpine stores

## Overview

Shared frontend JavaScript has two homes, and the choice is not a matter of taste. One
question decides it: **does a template re-render when this value changes?**

- **No** — an environment fact or a pure computation → `window.<namespace>`, the project's
  bag of stateless helpers.
- **Yes** — state that markup binds to and that crosses component boundaries → an **Alpine
  store**.

Per-component state stays in the component's `x-data`. For writing the components
themselves, **REQUIRED BACKGROUND:** `hyva-alpine-component`.

Examples below use `acme` as the project's short name — substitute your own.

## Which one

| Question | Home |
|---|---|
| Would a template re-render when it changes? | a store |
| Is it a fact about the browser, or a pure computation? | `window.acme` |
| Is it needed before Alpine initialises, or outside an Alpine expression? | `window.acme` |
| Is it state two unrelated components must agree on? | a store |
| Is it generic browser state (viewport, …)? | top-level store — `$store.isMobile` |
| Is it project domain state? | `$store.acme` |
| Is it a purely visual mobile/desktop swap? | neither — CSS: `lg:hidden`, `max-lg:hidden` |

The last row matters: responsive classes need no JS, do not flash before Alpine boots and
survive full-page cache. Use a store only for behaviour, for markup that must not be
rendered at all (`x-if`), or for conditions CSS cannot express.

## Files and registration

Two templates, both registered from **`Magento_Theme/layout/default_hyva.xml`** in the
theme — the Hyvä-only handle, so nothing loads on a non-Hyvä page (Luma checkout fallback,
compat pages). Not `default.xml`.

| Template | Container | Position | Role |
|---|---|---|---|
| `Magento_Theme::page/js/acme.phtml` | `head.additional` | `after="head.hyva-scripts"` | `window.acme` helpers |
| `Magento_Theme::page/js/acme-alpine.phtml` | `before.body.end` | `before="script-alpine-js"` | magic + stores on `alpine:init` |

Alpine loads as a deferred module, so any inline `alpine:init` listener would still be in
time; `before="script-alpine-js"` just keeps the bridge next to the loader it serves.

```xml
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
    <body>
        <referenceContainer name="head.additional">
            <block name="acme.js" template="Magento_Theme::page/js/acme.phtml"
                   after="head.hyva-scripts"/>
        </referenceContainer>
        <referenceContainer name="before.body.end">
            <block name="acme.alpine" template="Magento_Theme::page/js/acme-alpine.phtml"
                   before="script-alpine-js"/>
        </referenceContainer>
    </body>
</page>
```

**One template, one `<script>`, one `$hyvaCsp->registerInlineScript()`.** The call hashes
(or nonces) **only the last `<script>` in the output buffer** —
`HyvaCsp::addInlineScriptHashToCspHeader()` ends in
`extractLastElementContent($pageContent, 'script')` — so two script tags under one call
leave the first one unauthorised. Never bundle.

## `window.acme` — stateless helpers

Modelled on Hyvä's own `Hyva_Theme::page/js/hyva.phtml`, which registers `window.hyva` the
same way, before Alpine boots:

```php
<?php
declare(strict_types=1);

use Hyva\Theme\ViewModel\HyvaCsp;

/** @var HyvaCsp $hyvaCsp */
?>
<script>
(function (acme, undefined) {
    acme.isIos = function () {
        return /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    };
}( window.acme = window.acme || {} ));
//# sourceURL=acme.js
</script>
<?php $hyvaCsp->registerInlineScript() ?>
```

- **IIFE taking `window.acme = window.acme || {}`** — several templates may contribute to
  the namespace without clobbering each other, and private helpers stay private. The
  `undefined` parameter is inherited from `hyva.phtml`; it protects nothing since ES5 and is
  kept only so the two files read as siblings.
- **`//# sourceURL=acme.js`** — the block is inline, so without it devtools attribute every
  frame to the HTML document and breakpoints die on reload. Hyvä ships this line; keep it.
- Loaded **after `head.hyva-scripts`**, so helpers may build on `hyva.*`.

Belongs here: environment facts and pure computations — `isIos()`, `isTouch()`, formatting
helpers, URL builders. Available to plain scripts and before `alpine:init` fires.

**No reactive state in `window.acme`** — no flags, no `MediaQueryList`, no `isMobile()`. A
plain global is not observed by Alpine: a binding evaluates it once and never updates. A
live-reading function only moves the bug: it is correct when called, but nothing re-calls
it on resize.

## `acme-alpine.phtml` — the Alpine bridge

```php
<?php
declare(strict_types=1);

use Hyva\Theme\ViewModel\HyvaCsp;

/** @var HyvaCsp $hyvaCsp */
?>
<script>
window.addEventListener('alpine:init', () => {
    Alpine.magic('acme', () => window.acme);

    const breakpoint = getComputedStyle(document.documentElement)
        .getPropertyValue('--breakpoint-lg').trim() || '64rem';
    const desktop = window.matchMedia(`(min-width: ${breakpoint})`);
    const update = () => {
        Alpine.store('isMobile', !desktop.matches);
        Alpine.store('isDesktop', desktop.matches);
    };

    update();
    desktop.addEventListener('change', update);
}, {once: true});
//# sourceURL=acme-alpine.js
</script>
<?php $hyvaCsp->registerInlineScript() ?>
```

- **`isMobile` is a boolean, never a breakpoint string** — Hyvä's own shape
  (`Magento_LayeredNavigation/templates/layer/view.phtml`, `html/collapsible.phtml`), and a
  string cannot be compared in a CSP expression anyway.
- **Pick the breakpoint where the theme's layout actually switches** (usually the header),
  not Hyvä's `md` by default.
- **Read it from `--breakpoint-<name>`**, the custom property Tailwind v4 derives from
  `hyva.config.json`, so the value is single-sourced and JS follows a change of screens.
  Tailwind v4 inlines breakpoints into media queries and **emits the variable only when
  something references it** (a `max-w-screen-lg`, a `var(--breakpoint-lg)`) — stock Hyvä
  CSS does not. `grep -- '--breakpoint-lg' web/css/styles.css` after a build; if absent,
  reference it once from the theme CSS (`:root { --acme-desktop: var(--breakpoint-lg); }`).
  Keep the literal fallback, and keep it equal to the configured value.
- **`matchMedia` `change`, not `@resize.window.debounce`** — it fires once per crossing,
  not every resize frame, and needs no per-component `$refs` (Hyvä's `getComputedStyle`
  on a hidden element pattern does).
- **Generic browser state is top-level** (`$store.isMobile`), not a member of
  `$store.acme`, which stays reserved for project domain state.
- **A primitive store never gets `init()`** — Alpine calls `init()` only on object
  stores — so the media query is wired in the `alpine:init` listener itself. Reactivity
  still holds: `Alpine.store(name, value)` writes a reactive object and re-triggers
  bindings.
- **Both stores are written by one function**, so `isMobile` and `isDesktop` cannot drift.

**Domain state is an object store.** Derived flags are **getters**, not methods (see
*`this` in a path* below), and an object store *does* get `init()`:

```js
Alpine.store('acme', {
    cartCount: 0,
    get cartIsEmpty() { return this.cartCount === 0; },
    get cartHasItems() { return this.cartCount > 0; },
    init() {
        window.addEventListener('private-content-loaded', (event) => {
            this.cartCount = Number(event.detail.data?.cart?.summary_count) || 0;
        });
    }
});
```

`init()` must be an own property — Alpine checks `hasOwnProperty('init')`, so one inherited
from a class or prototype never runs.

## Reaching it from a template — the CSP grammar

The Alpine **CSP build** evaluates an attribute expression as nothing more than a dotted
property path against the Alpine scope:

```js
expression.split('.').reduce((scope, key) => scope[key], scope)
```

No parentheses, no operators, no literals — and a function landing at the end of the path
is invoked for you. Which build loads is not a template decision:
`ThemeLibrariesConfig::appendCspIfRequired()` swaps in `alpine3-csp` the moment the page
policy stops allowing `unsafe-eval`. Write every expression as if it already had.

| Context | Write |
|---|---|
| Plain JS — a `<script>` block | `window.acme.isIos()` |
| Inside an `x-data` component method | `this.$acme.isIos()` or `window.acme.isIos()` |
| An Alpine attribute expression | `$acme.isIos` — **no parens** |

```html
<nav x-data x-show="$store.isMobile" x-cloak>…</nav>
<nav x-data x-show="$store.isDesktop" x-cloak>…</nav>
<p x-data x-show="$acme.isIos">…</p>
```

- `window.acme` is not in the Alpine scope — `acme.isIos` in an attribute resolves nothing.
  That is why the magic exists.
- `!$store.isMobile` is not expressible, which is why the inverse is a store of its own
  rather than a negation. Hyvä pairs `isMobile` with `isNotMobile()` for the same reason.
- Add `x-cloak` on `x-show` swaps so the hidden variant does not flash before Alpine boots.

**`this` in a path.** A function at the end of an attribute path is invoked as
`value.apply(scope, params)` with the **merged Alpine scope** as `this` — not the object
that owns it. So a `window.acme` helper or a store method reached from an attribute must not
use `this`. Expose derived store values as getters (a getter keeps the store proxy as
`this`), and write helpers as plain closures over the IIFE argument (`acme.x()`, not
`this.x()`).

**Native Hyvä templates are not all CSP-safe.** Default-theme templates still write
`x-data="initHeader()"`, `@private-content-loaded.window="getData(event.detail.data)"` or
`:aria-disabled="!isMobile"`. An override that must run under the CSP build rewrites those
expressions too — adding the shared helpers is not enough.

**Where CSP bites.** The decision is per page (per route policy), from the `script-src`
policy:

| Policy allows | Effect |
|---|---|
| `inline` | `registerInlineScript()` returns early (`isInlineAllowed()`), nothing is hashed |
| `eval` | the standard Alpine build loads — non-CSP-safe expressions still work |
| neither | every inline `<script>` needs its `registerInlineScript()`, and **`alpine3-csp` loads** |

Magento's storefront default allows both (and is report-only), so most pages forgive
everything. Not all:

- **Hyvä Checkout** (`storefront_hyva_checkout_index_index`) enforces `eval=0`,
  `inline=0`, `event_handlers=0`, `report_only=0` — the CSP build runs there, and the
  global helpers load on it.
- `Magento_Checkout` (`checkout_index_index`) refuses inline scripts but still allows eval.

Nothing but review enforces these rules on the other pages — follow them everywhere, so a
page flipping its policy breaks nothing.

## Red flags

| Thought | Reality |
|---|---|
| "It's shared, so it goes in a store" | Shared *and* reactive. A constant in a store is overhead for nothing. |
| "`window.acme.isMobile()` works, I tested it" | At one viewport. Resize and every binding is stale. |
| "`$acme.isIos()` reads better with the parens" | It breaks under the CSP build. The paren-less form works under both. |
| "`x-show="!$store.isMobile"`" | No operators in CSP expressions. Use `$store.isDesktop`. |
| "I'll hardcode 1024 in the media query" | Read `--breakpoint-lg`. Tailwind owns the breakpoints. |
| "Both scripts can share one `registerInlineScript()`" | It authorises the last `<script>` only. The first ships blocked. |
| "`default.xml` is simpler" | It loads on non-Hyvä pages too. `default_hyva.xml`. |
| "A store method `isEmpty()` reads `this.count`" | From an attribute, `this` is the merged scope. Use a getter. |
| "It works on the PDP, so it's CSP-safe" | The PDP allows eval. Test on Hyvä Checkout, where `alpine3-csp` loads. |
| "I'll make `window.acme` reactive with a Proxy" | That is what stores are for. |
| "Alpine isn't loaded yet, I'll inline the helper" | That is precisely the case `window.acme` exists for. |
| "It's one function, the header template can keep it" | The second component needing it makes two copies drifting apart. |
| "A store to hide the desktop menu on mobile" | `max-lg:hidden`. No JS, no flash. |

## References

- `vendor/hyva-themes/magento2-theme-module/src/view/frontend/templates/page/js/hyva.phtml` — the `window.hyva` model
- `vendor/hyva-themes/magento2-theme-module/src/view/frontend/layout/default_hyva.xml` — `head.hyva-scripts`, `script-alpine-js`
- `vendor/hyva-themes/magento2-theme-module/src/ViewModel/HyvaCsp.php` — last-`<script>` hashing
- `vendor/hyva-themes/magento2-theme-module/src/ViewModel/ThemeLibrariesConfig.php` — CSP build selection
