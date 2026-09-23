---
name: hyva-svg-icons
description: Place, override and render SVG icons in a Hyvä theme (Magento 2). Use when adding a project icon, redrawing a Lucide or Heroicon that native templates already render, choosing between LucideIcons and SvgIcons, naming the icon view-model variable in a template, or debugging an icon override that "does not apply". Trigger phrases include "add svg icon", "custom icon hyva", "override lucide icon", "replace hyva icon", "icon not showing", "$hyvaicons", "renderHtml icon".
---

# Hyvä SVG Icons

## Overview

Hyvä renders icons through view models that resolve an SVG file by Magento asset fallback.
There are exactly **two** destinations for a project icon, and one question decides which:
*does an icon of that name already exist in the icon set native templates call?*

- **Yes, but ours must look different** → it is an **override**: shadow the vendor file.
- **No, it is ours** → it is a **theme icon**: theme root `web/svg/`.

Never invent a third location inside a theme. (Icons that must work without any theme
belong in an icon-set module — see *Beyond one theme*.)

## Icon sets

| View model | `iconPathPrefix` | Source directory |
|---|---|---|
| `Hyva\Theme\ViewModel\LucideIcons` | `Hyva_Theme::svg/lucide` | `magento2-theme-module/src/view/base/web/svg/lucide/` |
| `Hyva\Theme\ViewModel\SvgIcons` | `Hyva_Theme::svg` | theme and module `web/svg/` |
| `HeroiconsOutline` / `HeroiconsSolid` | `Hyva_Theme::svg/heroicons/{outline,solid}` | legacy |

If `vendor/hyva-themes/magento2-theme-module/src/view/base/web/svg/lucide/` exists (Lucide
shipped since theme-module 1.3.14; the default theme uses it from 1.4), **Lucide is the icon
set** — do not introduce new Heroicon usage.

## How an icon path resolves

`SvgIcons::getFilePath()` — for `renderHtml('x')` with prefix `My_Module::svg` — returns the
first existing of:

1. `<theme>/My_Module/web/svg/x.svg` — the current theme **or any parent theme** shadowing the module
2. `My_Module/view/{frontend,base}/web/svg/x.svg` — the module itself
3. `<theme>/web/svg/x.svg` — **only reached if 1 and 2 are missing**

The file is read from its **source** location at render time (`getSourceFile()`), not from
`pub/static`.

## 1. Override — the icon exists, ours looks different

```
app/design/frontend/<Vendor>/<theme>/Hyva_Theme/web/svg/lucide/<name>.svg
```

- Keep the vendor filename **byte for byte** — it is what every native template calls
  (`$lucideIcons->shoppingCartHtml()` → `shopping-cart`).
- No PHP, no layout, no view model, no template override: fallback step 1 picks it up at
  every native call site.

**Not `<theme>/web/svg/lucide/<name>.svg`.** It is the intuitive guess and it fails
silently: step 3 is only consulted when the module file is missing, which never happens for
an icon the module ships. The file sits there looking installed while the vendor drawing
keeps rendering. (Some Hyvä docs pages say `web/svg/lucideicons/` — check the installed
directory name, it is `lucide`.)

The same rule applies to any other set: shadow `Hyva_Theme::svg/heroicons/outline/x.svg` at
`<theme>/Hyva_Theme/web/svg/heroicons/outline/x.svg`.

## 2. Theme icon — new, project-specific

No equivalent in the icon set (brand mark, carrier pictogram, domain glyph):

```
app/design/frontend/<Vendor>/<theme>/web/svg/<name>.svg
```

Theme root `web/`, **no** `Hyva_Theme/` segment, **no** `lucide/` subfolder, rendered with
`SvgIcons`.

- **Convention: the `Hyva_Theme/` segment means "I shadow a vendor file".** A file placed
  there without a vendor twin renders too — the Hyvä default theme itself keeps its own
  `loader.svg` in `Hyva_Theme/web/svg/` — but in a project theme the segment is reserved
  for overrides, so the path alone tells a reader whether a file replaces something.
- Never park a custom icon inside `lucide/` "to keep icons together": an upgrade adding a
  real Lucide icon of that name collides with it, and it pretends to be an override.
- Because step 3 comes last, anything resolving `Hyva_Theme::svg/<name>.svg` first — a later
  module release, or a parent theme's `Hyva_Theme/web/svg/` (where `loader` lives) —
  shadows a theme icon. Prefix project icons with the brand (`acme-mark`,
  `acme-delivery`) so that never happens.

### Beyond one theme

- **Shared across websites** — the theme `web/svg/` fallback walks parent themes, so icons
  common to several websites go in the **common parent theme's** `web/svg/`; a child theme
  redraws one by dropping the same filename in its own `web/svg/`.
- **Independent of any theme** — icons rendered by a module's own templates, or shared by
  themes with no common parent, belong in an **icon-set module**: a `SvgIcons`
  `virtualType` with its own `iconPathPrefix` in `di.xml` (the Heroicons view models are
  the model), never in a theme.

## Rendering — name the variable after the project

Hyvä's docs and its few native `SvgIcons` templates name the variable `$hyvaicons`. In
**templates written for the project**, name it `$<project>Icons` in camelCase —
`$acmeIcons` for a project called Acme:

```php
<?php
declare(strict_types=1);

use Hyva\Theme\Model\ViewModelRegistry;
use Hyva\Theme\ViewModel\SvgIcons;

/** @var ViewModelRegistry $viewModels */

/** @var SvgIcons $acmeIcons */
$acmeIcons = $viewModels->require(SvgIcons::class);
?>
<?= $acmeIcons->renderHtml('acme-mark', 'text-primary', 24, 24, ['aria-hidden' => 'true']) ?>
```

This is a deliberate project convention, not a vendor rule — every native `SvgIcons`
template says `$hyvaicons`. Why diverge:

- `$hyvaicons` is all-lowercase and passes the Magento2 camelCase sniff only by accident;
  PSR-1/PSR-12 leave local variable naming to the project.
- The other icon view model is camelCase in every native template (`$lucideIcons`), so
  `$<project>Icons` reads as its sibling.
- The call site then says *this icon is ours, look in the theme root*.

Scope:

| Template | Variable |
|---|---|
| Written for the project | `$<project>Icons` for `SvgIcons` |
| Native template copied into the theme | keep `$hyvaicons` **verbatim** — a rename puts noise on every icon line of the override diff, whose whole point is to isolate the real delta |
| Any template using Lucide | `$lucideIcons` — already camelCase, matches every native template; a Lucide override is a file drop, so there is no call site to rename |

Prefer `renderHtml('kebab-name', $classes, $width, $height, $attributes)` over the magic
`kebabNameHtml()` form: one readable call, and the icon name stays greppable. Pass
`['aria-hidden' => 'true']` for decorative icons and `aria-label` for meaningful ones —
`renderHtml()` adds `role="img"` itself whenever `aria-hidden` is absent.

## After adding or overriding an icon

No static-content deploy is needed — the SVG is read from source. What holds the old
drawing is **cached HTML**:

```bash
bin/magento cache:clean block_html full_page
```

and Varnish if it fronts the store. When `hyva_theme_dev/cache/enable_svg_icon_caching` is
on, the rendered SVG is also stored in the default cache under the `HYVA_ICONS` tag, which
no cache type owns — `cache:clean <type>` cannot reach it; run `bin/magento cache:flush`. New Tailwind classes
passed to `renderHtml()` need a Tailwind rebuild, like any other class.

## Common mistakes

| Symptom / thought | Reality |
|---|---|
| Override "does not apply" | `Hyva_Theme/` segment missing from the path, a filename that is not byte-identical, or stale `block_html` / `full_page` cache |
| "I'll put the override in `web/svg/lucide/`" | Fallback step 3 — never reached for a shipped icon |
| "I'll put my custom icon in `lucide/` with the others" | Collides with the next Lucide release; use theme root `web/svg/` |
| "I'll make an `acmeSet/` folder under `Hyva_Theme/web/svg/` for shared icons" | Common parent theme's `web/svg/` — `Hyva_Theme/` is the override slot |
| "`$hyvaicons` is what the docs use" | In project templates, `$<project>Icons`. Only copied vendor templates keep `$hyvaicons` |
| "I'll rename `$hyvaicons` in the template I copied" | Leave it — an override mirrors the vendor file |
| "I need a static-content deploy" | The source file is read directly; clean the HTML caches |

## References

- `vendor/hyva-themes/magento2-theme-module/src/ViewModel/SvgIcons.php` — resolution order, cache tag
- `vendor/hyva-themes/magento2-theme-module/src/etc/di.xml` — `iconPathPrefix` of each icon view model
