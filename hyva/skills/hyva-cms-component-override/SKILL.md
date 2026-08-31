---
name: hyva-cms-component-override
description: Customise an existing Hyvä CMS component — add or change fields, variants, option lists, labels, defaults, children or icon — by declaring a full override in etc/hyva_cms/components.json. Also use when reviewing, refactoring or code-reviewing existing customisations that reach for a plugin or DI substitution instead. Trigger phrases include "override hyva cms component", "add a variant to the banner/card/slider", "add a field to an existing cms component", "extend a hyva cms component", "customise hyva component", "new hyva cms variant", "hyva cms plugin".
---

# Hyvä CMS Component Override

## Overview

This skill covers customising a component that **already exists** — whichever module
declares it. For a brand-new component with no upstream counterpart, use the
`hyva-cms-component` skill instead.

**The mechanism is module-agnostic.** There is exactly one collector, no per-module schema
and no per-module registry: `Collector::execute()` walks every enabled module looking for
`etc/hyva_cms/components.json`. So overriding a menu component, a form component, a maps
component or a base CMS component is the same operation with the same rules — only the
module you sequence after changes.

Hyvä CMS has exactly one supported mechanism for this: **redeclare the whole component**
under the same key in a module that loads later. There is no partial override, no
inheritance, and no additive extension point. Hyvä states this is deliberate:
<https://docs.hyva.io/hyva-commerce/features/cms/overriding-existing-components.html>

Everything in this skill follows from that constraint.

## The hard constraint

`Hyva\CmsLiveviewEditor\Model\Component\Collector::execute()` walks
`ModuleListInterface::getAll()` — module sequence order — and for **every** module reads
`etc/hyva_cms/components.json`. For each component key it does:

```php
$this->components[$componentName] = $processedComponent;
```

**Assignment, not a merge.** The last module in sequence replaces the entry outright.
Fields you omit do not fall back to the upstream declaration — they cease to exist.

This is enforced by the schema too: `component-declaration.json` sets
`"additionalProperties": false` at component level, with no `extends`, `merge` or `patch`
key. The full property list is `label`, `disabled`, `hidden`, `category`, `template`,
`icon`, `children`, `content`, `design`, `advanced`, `custom_properties`,
`require_parent`, `context_flags`, `description`, `build_from` — always read the live
schema for the installed version rather than trusting a list:

```
vendor/hyva-themes/commerce-module-cms/src/liveview-editor/etc/hyva_cms/jsonschema/
├── component-declaration.json        # component-level properties
└── component-field-declaration.json  # field properties, types, validation attributes
```

## Who declares components

Any module can. Hyvä itself ships several producers beyond the base component set — a
menu builder, a form builder, a maps integration, a Magento-attributes bridge — and each
declares its components exactly the same way, including its own `includes` files and its
own `Model\Config\Source\*` classes. Third-party libraries and your own modules join the
same list.

Never assume the component you are overriding comes from `Hyva_CmsBase`. Find its
declaration first:

```bash
# every declaration file in the install
find vendor app/code -path '*/etc/hyva_cms/components.json'

# which files declare the key you care about
grep -rl '"my_component"' --include=components.json vendor app/code
```

Two things follow from a component coming from a module other than `Hyva_CmsBase`:

1. **Sequence after the declaring module**, not just after `Hyva_CmsBase` — see Step 3.
2. **Its `includes` and source models belong to that module**, so preserve
   `Hyva_MenuBuilder::etc/hyva_cms/…` style references verbatim and leave its
   `Hyva\MenuBuilder\Model\Config\Source\…` references pointing there unless you are
   changing that specific list.

When several modules declare the same key, the last one in sequence is what you are
actually overriding — that is the declaration to copy. `hyva-cms-components-dump` shows
the merged result if you need to confirm which one won.

## Decision table

Three artefacts, three rules. There is no judgement call to make.

| What you are changing | Where it goes |
|---|---|
| Markup or styling only, no field change | Theme template override — `{themedir}/Vendor_Module/templates/elements/…` |
| Component shape: fields, options, defaults, labels, children, icon, category | Full redeclaration in your `etc/hyva_cms/components.json`, **same component key** |
| An option or variant list | Your own `Model/Config/Source/*` implementing `OptionSourceInterface`, referenced by FQCN string from your redeclaration |

## Never use a plugin — in any shape or form

A plugin cannot express this customisation correctly, and the CMS is not built to be
extended that way. **All** of the following are prohibited:

| Shape | Why it is wrong |
|---|---|
| `before`/`after`/`around` on `Collector::execute()` | Runs *after* the declaration is fully processed. `handleIncludes()` and `handleOptions()` have already resolved; an `options` FQCN string written at this point is never resolved into an array and reaches the editor as a raw class name. |
| `before`/`after`/`around` on `Collector::processComponentDefinition()` | Public only so plugins on `execute()` can re-run it to work around the above. Re-processing an already-processed declaration re-runs `checkForDuplicateFields()` and the include merge on mutated data. |
| Plugin on a `Model\Config\Source\*` option source | Splits one option list across two files, and only works while the consuming component still points at the upstream source class. The moment you redeclare that component the plugin goes dead silently — see the variant allowlist below. |
| DI `<preference>` swapping an option source | `Magento\Config\Model\Config\SourceFactory::create()` resolves through the ObjectManager, so a preference does take effect — globally, for every component and every module that references that class. Never scoped to your intent. |
| `virtualType` substituting an option source | `handleOptions()` matches on the literal string in the JSON. A virtual type is reachable only by naming it in the JSON, which is a redeclaration anyway — so use a real class. |
| Plugin on `Provider`, `ComponentValidator` or a `Block\Element` | Puts component shape or render-time security behind runtime interception, where nothing that reads `components.json` can see it. |

The general failure is the same in every case: **the declaration stops being readable.**
Anyone answering "what fields does this component have?" has to find and mentally execute
PHP interception on top of JSON. Owning the JSON is the whole point.

## The variant option list is a security allowlist

This is the concrete reason plugin-injected variants break in production.
`Hyva\CmsLiveviewEditor\Model\Security\ComponentValidator::isValidVariantTemplate()`
reads:

```php
$variants = $component['content']['variants']['options'] ?? [];
```

from the **resolved** declaration and requires the stored template path to appear as a
`value` in it. A variant template absent from the resolved options fails validation and
`logAndThrow()` fires — the component does not render. So the variant list is not merely
what the editor offers; it is what the frontend is permitted to render. It must be
declared, not injected.

## Workflow

### Step 1 — Confirm an override is actually needed

If nothing about the component's *shape* changes and you only need different markup or
classes, stop: copy the template into the theme and you are done. No declaration, no
fork, and upstream field changes still reach you.

```
app/design/frontend/<Vendor>/<theme>/Hyva_CmsBase/templates/elements/banner/default.phtml
```

Then follow *Template overrides: mirror the base* below — a theme override is the one
artefact with no schema to diff against, so discipline in the file itself is all the
upgrade signal you get.

### Step 2 — Locate the upstream declaration

Search rather than assume — see *Who declares components* above. The base component set
lives at:

```
vendor/hyva-themes/commerce-module-cms/src/components-base/etc/hyva_cms/components.json
```

but menu, form and other feature modules keep theirs under their own
`src/etc/hyva_cms/components.json`, and a component library or project module can declare
anywhere. Read the declaration that actually wins.

### Step 3 — Verify module sequence

Your module must load after **every module whose components it overrides**, in
`etc/module.xml`:

```xml
<module name="Vendor_Module">
    <sequence>
        <module name="Hyva_CmsBase"/>
        <module name="Hyva_CmsLiveviewEditor"/>
        <module name="Hyva_MenuBuilder"/>
        <!-- one entry per declaring module: form builder, maps, a component library, … -->
    </sequence>
</module>
```

Getting this wrong is silent: your declaration is simply overwritten by the module that
loads later, and the editor shows the upstream component as if you had changed nothing.
Add the corresponding Composer packages to `require` as well — at minimum
`hyva-themes/commerce-module-cms`, plus the package providing each overridden component.

### Step 4 — Copy the declaration verbatim, then edit

Copy the whole component under the **same key** into your
`etc/hyva_cms/components.json`. Then make your change. Do not retype it from memory and
do not drop fields you think are unused — an omitted field is a deleted field, and any
content already saved against it becomes unreachable.

Keep every upstream `includes` reference exactly as it was (see next section) — that is
what keeps the copy small.

### Step 5 — Own the option lists you changed

Any option list you alter needs your own source model, referenced by FQCN string from
your declaration. Lists you did not touch keep pointing at the upstream class.

### Step 6 — Add templates for new variants

New variant templates live in your module:
`view/frontend/templates/elements/<component>/<variant>.phtml`. The `template` property
pattern is `^[A-Z][a-zA-Z0-9_]+_[A-Z][a-zA-Z0-9_]+::[a-zA-Z0-9/_-]+\.phtml$`.

### Step 7 — Flush and verify

Run `bin/magento cache:flush` (`Provider` caches the resolved component set), then in the
editor confirm: the component still appears, every previously saved field still holds its
value, and the new variant renders on the frontend — not just in the picker, which is
where the allowlist bites.

## Template overrides: mirror the base

Where a template lives is decided by the `Module::path` identifier in the declaration, not
by whether you are overriding. Which module's `view/frontend/templates/` is searched
follows the identifier; a theme can shadow any of them at
`{theme}/{Module_Name}/templates/{path}`.

| Case | Template lives in |
|---|---|
| New component | your module — `app/code/…/view/frontend/templates/elements/…` |
| Existing component, markup only, same identifier | theme — `app/design/…/<Module>/templates/elements/…` |
| Existing component, new variant (new identifier) | your module |
| Existing component redeclared, reusing the upstream identifier | nowhere — the declaration still points upstream |

Do not declare a new variant under someone else's identifier. Magento's fallback would
resolve `Hyva_CmsBase::elements/banner/my-variant.phtml` from your theme even though no
such file exists upstream — and then an upgrade shipping a real file there collides with
yours. New template, new identifier, your module.

### The rule is provenance, not quality

**A vendor override mirrors the vendor file. Only the feature's own delta may differ.**

This is stricter than "write good code", deliberately. The whole value of a theme override
is that it keeps diffing cleanly against upstream for as long as it exists, and no local
improvement is worth losing that. A refactor that is genuinely better than vendor's still
does not belong in an override — it belongs in the new templates you write, where you own
the file outright.

In an override, keep:

- vendor's variable names, and their **meaning** — never rebind a vendor name to a
  different type, which turns a familiar line into a silent trap for the next reader;
- vendor's ordering and block structure;
- vendor's local logic, unless you are replacing it with vendor's own newer API — see below.

Add the feature additively, in bounded blocks, with a one-line comment saying why the
block exists.

Always fine, never worth flagging: a leading `\` on global functions,
`declare(strict_types=1)`, PSR spacing, PHPDoc, line wrapping, and dropping the upstream
copyright header — once the file is an override it is no longer that file. All mechanical,
all instantly recognisable in a diff.

Not fine: renaming a variable for taste, or reordering statements.

### Whose abstraction? — the one distinction that matters

Replacing vendor's inline logic is judged by **who owns the replacement**, not by whether
it reads better:

| Replacement | Verdict | Why |
|---|---|---|
| Vendor's own API — an `Element` method, a Hyvä view model | **Adopt it** | Convergence. Vendor is migrating its own templates onto it, so when upstream modernises the file it will look like yours — the future diff *shrinks*. |
| Your project's abstraction — your view model, your helper | **Leave vendor's lines alone** | Divergence. The next reader has to leave the file to understand a line vendor wrote plainly, and every upstream touch conflicts. |

Vendor templates are not uniformly modern. Some still hand-roll what a newer `Element`
method now does; check the block class for an existing method before assuming inline logic
is the intended way. Grep vendor's own templates — if several already call it, adopting it
is following upstream, not diverging from it.

Your project abstractions are not banned, only misplaced. Use them freely in the templates
you own.

### In your own templates

`app/code/…` templates you introduced — new components, new variants — are yours. Extract,
name and structure them however your standards say. Reach for the shared view models there.
That is the place where "better than vendor" pays off without costing an upgrade diff.

## Includes: the one sanctioned inheritance

`includes` is the only partial-reuse mechanism Hyvä supports, and upstream components use
it. In `Collector::handleIncludes()`, included fields are added **first, skipping any key
the component declares itself**, then the component's own fields are appended. Two
consequences worth knowing:

1. Keeping an upstream include costs one line and inherits its fields as they evolve.
2. **To change one included field, keep the include and redeclare just that key** — yours
   wins, and takes its position from your declaration order.

```json
"design": {
  "includes": ["Hyva_CmsBase::etc/hyva_cms/default_design.json"],
  "background_color": { "type": "color", "label": "Backdrop" }
},
"advanced": {
  "includes": "Hyva_CmsBase::etc/hyva_cms/default_advanced.json"
}
```

Both a string and an array of strings are accepted. For field groups repeated across
components **you own**, publish your own include file
(`Vendor_Module::etc/hyva_cms/<group>.json`) and list it — that is the DRY tool, and it
replaces any urge to write a shared abstract PHP class.

## Option source models

```php
<?php

declare(strict_types=1);

namespace Vendor\Module\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magento\Framework\Escaper;

class BannerVariants implements OptionSourceInterface
{
    public const VARIANT_DEFAULT = 'Hyva_CmsBase::elements/banner/default.phtml';

    public const VARIANT_VIDEO_PLAYER = 'Vendor_Module::elements/banner/video-player.phtml';

    public function __construct(
        private readonly Escaper $escaper
    ) {
    }

    /**
     * @return array<int, array{value: string, label: string, icon?: string}>
     */
    public function toOptionArray(): array
    {
        return [
            [
                'value' => self::VARIANT_DEFAULT,
                'label' => $this->escaper->escapeHtml(__('Default')),
                'icon' => 'Hyva_CmsBase::images/components/banner.svg',
            ],
            [
                'value' => self::VARIANT_VIDEO_PLAYER,
                'label' => $this->escaper->escapeHtml(__('Video Player')),
                'icon' => 'Hyva_CmsBase::images/components/film.svg',
            ],
        ];
    }
}
```

Referenced from the declaration as a **double-escaped FQCN string**:

```json
"variants": {
  "type": "variant",
  "label": "Variant",
  "options": "Vendor\\Module\\Model\\Config\\Source\\BannerVariants"
}
```

Mechanics of `Collector::handleOptions()`, worth knowing:

- Only a **string** `options` is resolved. An array is passed through untouched.
- Resolution happens through `Magento\Config\Model\Config\SourceFactory::create()`, so
  constructor arguments must be resolvable by the ObjectManager.
- `Class::method` syntax is supported for a non-standard method name.
- It always invokes `toOptionArray($type === 'multiselect')`. Declare
  `toOptionArray(): array` with no parameter — PHP discards the extra argument on
  userland methods.
- A missing class is logged and yields `[]`. A missing method throws only in developer
  mode. **In production a typo degrades silently to an empty option list**, so verify in
  developer mode.

### Copy upstream values, never inherit them

Do not `extends` the upstream source class, and do not DI-preference it. Copy the values
you keep into your own class.

Extending re-opens exactly the implicit-inheritance problem the redeclaration closes:
your option list becomes a two-file read, and an upstream addition silently starts
appearing in a component whose shape you own — including template paths you have never
rendered against, which the allowlist will happily permit.

### Source model or inline array?

- **Source model** when a value is referenced from PHP or `.phtml` — every variant list
  qualifies, since templates and `hide_if` branch on those strings. Put them in
  `public const`.
- **Inline array** for a short, static, presentational list read by nobody but the
  editor.

`hide_if` / `show_if` in JSON cannot reference a PHP constant, so variant strings are
necessarily duplicated between the constants and the conditional rules. Guard it with a
test that asserts every `hide_if.variants` value resolves to a declared template.

Conditions are not variant-specific — they key on any field, across panels, with
`show_if` AND-ing and `hide_if` hiding on first match. See
`references/field-mechanics.md` for the semantics and the `default_value` trap.

## Retiring a component

Only when a component genuinely goes away — never as a way to introduce a replacement key
for a component you are merely customising, which would orphan saved content.

```json
{ "old_component": { "disabled": true } }
```

Existing content keeps rendering **only** if the template stays reachable through
`ComponentValidator`, which takes a string or an array of strings:

```xml
<type name="Hyva\CmsLiveviewEditor\Model\Security\ComponentValidator">
    <arguments>
        <argument name="legacyComponents" xsi:type="array">
            <item name="old_component" xsi:type="string">Vendor_Module::elements/old.phtml</item>
        </argument>
    </arguments>
</type>
```

Without it, pages holding that component throw. Note that `disabled: true` is also the
one legitimate reason to declare a component key with no other properties.

## Upgrade discipline

Owning a declaration means upstream changes to it no longer reach you, and nothing warns
you. Redeclare deliberately and as little as possible: fewer forks, less drift.

On every Hyvä CMS or component-library upgrade:

1. `git diff` the previous and new upstream `components.json`.
2. For each component you redeclare, diff it against the new upstream version. Port new
   fields, changed defaults, `hide_if` rules and comments consciously.
3. Do the same for every option source you copied values from.
4. Re-check that every template path in your declarations still resolves — upstream
   variant templates get moved and renamed.
5. Flush the cache and load one page per redeclared component in developer mode, so a
   silently-emptied option list surfaces as an exception.

Keep the list of redeclared components in the module's README so step 2 has an input.

## Checklist before you finish

1. Same component key as upstream — no new key, no prefix.
2. Every upstream field present, unless its removal is intentional and content-migrated.
3. Every upstream `includes` reference preserved.
4. Option lists you changed point at your own classes; the rest still point upstream.
5. No plugin, `preference` or `virtualType` on any `Hyva\Cms*` class, in any shape.
6. New variant templates exist and appear in the resolved variant options.
7. Field validation lives in `attributes`, not as direct field properties.
8. Default values use `default_value`, not `default`.
9. `children` is declared at component root level, never as a field `type`.
10. A field key appears in only one of `content` / `design` / `advanced` — relocating means
    moving, never copying.
11. A variant field is named exactly `variants` and sits in `content`; nothing else
    switches the rendered template.
12. Theme overrides mirror the vendor file — feature delta only, no renames, no reordering,
    no extraction, however much better it would be.
13. `translate: true` preserved on every field that had it upstream.
14. Labels wrapped in `__()` and added to `i18n/*.csv`.
15. Cache flushed; verified in developer mode, frontend included.

## Resources

### references/worked-example.md

End-to-end example: adding a Video Player variant to the upstream `banner` component —
the redeclaration, the two source models, the template, and the exact file tree with
add/modify/delete markers.

### references/field-mechanics.md

Where field values are actually stored, and what that means for moving a field between
panels, renaming it, removing it or changing its type. Also the full `show_if` / `hide_if`
semantics, the reserved `variants` field name, and the `default_value` trap that makes a
gated field appear on untouched content.

Read this whenever the change is more than adding a field: conditional visibility, panel
moves, type changes, or anything touching content that already exists.

### references/anti-patterns.md

Each prohibited shape with the code that makes it fail, plus the migration recipe for a
codebase that already uses plugins. Read this when reviewing existing customisations or
when tempted by an "additive" shortcut.
