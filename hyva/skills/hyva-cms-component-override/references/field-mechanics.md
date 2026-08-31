# Field mechanics

What you need beyond "add a field": where values actually live, how conditional visibility
resolves, what changing a field's type does to stored content, and which field names are
reserved. All of it verified against `Hyva_CmsLiveviewEditor`; re-check against the
installed version before relying on an edge case.

## Where field values live

Stored content is a tree of component objects. Per `component.json`, each object has
`uid` and `component` required, `componentPath` and `children` reserved, and
`"additionalProperties": true` — **field values sit flat on the component object, keyed by
field name.**

The write path confirms it (`Magewire/Traits/Component::updateField()`):

```php
$item[$field] = $value;
```

No panel, no section, no nesting. Four consequences that answer most "can I…" questions:

| Change | Effect on saved content |
|---|---|
| Move a field between `content` / `design` / `advanced` | **Free.** Nothing to migrate — the panel is presentation only. |
| Rename a field | **Orphans the value.** The old key stays in stored content, unread by anything. No error. |
| Remove a field | Value stays in the database, permanently unread. |
| Add a field | Absent from existing content until an editor saves. See the `default_value` trap below. |

A field key must be unique across all three panels: `Collector::checkForDuplicateFields()`
collects keys from `content`, `design` and `advanced` together and throws
`"Duplicate field names found in <component> component"` on a collision — in developer mode
it is an exception, in production a logged error. So when relocating a field, move it;
never copy it.

## Child-only components

Two properties shape how a component can be placed, and feature modules lean on both
heavily — a form's field components are only ever children of a form, a menu's items only
ever children of a menu.

- **`require_parent: true`** keeps the component out of the top-level picker; it can only
  be added inside a parent that `accepts` it.
- **`template: false`** means the component has no template of its own — the parent renders
  its data directly. Child data is **flat**: read `$child['field_name']`, not
  `$child['content']['field_name']`, and use `$child['uid']` for
  `$block->getEditorAttrs('field_name', $childUid)`.

Both are component-level properties, and both survive a redeclaration only if you copy
them. Dropping `require_parent` from a form-field or menu-item component pushes it into the
top-level picker, where it renders without the parent context it needs.

## Reserved field names

`variants` is special-cased on write:

```php
if ($field === 'variants') {
    $item['componentPath'] = $value;
}
```

and `ComponentValidator::isValidVariantTemplate()` reads the allowlist from a hardcoded
path:

```php
$variants = $component['content']['variants']['options'] ?? [];
```

**A variant field must be named exactly `variants` and live in the `content` panel.**
Anything else is an ordinary select: it will not switch the rendered template, and it will
not be treated as a template allowlist. `uid`, `component`, `componentPath` and `children`
are reserved by the stored structure and must not be used as field names.

## Conditional visibility

`show_if` and `hide_if` are both objects of `fieldName: [values]`, and the referenced field
can be **any** field on the component — not just `variants`. Evaluated server-side by
`Model\Component\FieldVisibility::shouldFieldBeShown()`.

```json
"gradient_angle": {
  "type": "number",
  "label": "Gradient Angle",
  "show_if": { "use_gradient": [true] },
  "hide_if": { "variants": ["Vendor_Module::elements/banner/video-player.phtml"] }
}
```

### Semantics

- **`show_if` is AND across keys.** Every listed key must match one of its values or the
  field hides.
- **`hide_if` hides on the first match.** Any single key matching is enough — so multiple
  keys read as OR.
- **Both may be used on one field.** `show_if` is evaluated first, then `hide_if`.
- **Comparison is loose** (`in_array` without `true`). Don't lean on type distinctions
  between `"1"`, `1` and `true`.

### The default_value trap

A controlling field absent from stored content is backfilled from its declared
`default_value` before the comparison — `buildFieldDefaults()` collects defaults from all
three panels, so a condition can reference a field in a different panel than the one it
sits in.

But if the controlling field has **no** `default_value` and has never been saved:

- in `show_if`, the key is skipped (`continue`) — the dependent field **shows**;
- in `hide_if`, a non-null condition value is skipped — the dependent field **shows**.

So a boolean that gates a field must declare `"default_value": false`, or the gated field
appears on every component nobody has touched yet. This is exactly why `FieldVisibility`
backfills at all.

### Matching an empty value

`hide_if` treats `null` specially, and asymmetrically — only the **first** element of the
array is inspected for the null case:

```json
"caption": { "hide_if": { "image": [null] } }
```

hides `caption` when `image` is unset or null. `[null, "x"]` takes the null branch;
`["x", null]` does not. Put `null` first, or use a separate rule.

## Changing a field's type

The `type` value is just a JSON property, but three of them change behaviour beyond the
input widget.

### select → multiselect

`Collector::handleOptions()` always calls:

```php
$sourceModel->toOptionArray($type == 'multiselect');
```

so your source model is told which it is — declare `toOptionArray(): array` with no
parameter and PHP discards the argument, or accept a `bool` if you want to branch.

More importantly the **stored shape changes**. `multiselect.phtml` writes an array:

```js
Array.from($event.target.selectedOptions).map(option => option.value)
```

while a `select` writes a scalar. The editor tolerates the old value on read
(`(array) $block->getData('value')` wraps a scalar), but **templates do not**: any
`$block->getData('x') === 'foo'` comparison silently stops matching. Audit every template
that reads the field, and treat the transition as a content migration.

### anything → variant

Only legal on a field named `variants` in `content` — see reserved names above.

### anything → custom_type

Requires `custom_type: "<name>"` alongside, and that name must be registered via
`Hyva\CmsLiveviewEditor\Model\CustomField`. Check what the install registers before
declaring one; the `hyva-cms-custom-field` skill covers adding one.

**Register `customTypes` in `etc/adminhtml/di.xml`, never `etc/di.xml`.** The editor runs
in adminhtml, and a global `customTypes` argument is *replaced, not merged*, as soon as any
module declares `customTypes` in the adminhtml scope. Declaring globally means your field
types vanish the moment another module registers one in adminhtml. Same-scope declarations
merge:

```xml
<type name="Hyva\CmsLiveviewEditor\Model\CustomField">
    <arguments>
        <argument name="customTypes" xsi:type="array">
            <item name="my_picker" xsi:type="array">
                <item name="template" xsi:type="string">Vendor_Module::liveview/field-types/my-picker.phtml</item>
                <item name="description" xsi:type="string">What this picker does.</item>
            </item>
        </argument>
    </arguments>
</type>
```

Note this is a DI *argument*, not a plugin — it is the sanctioned way to contribute a field
type and does not conflict with the no-plugin rule.

### Safe vs unsafe transitions

Safe, same stored shape: `text` ↔ `textarea` ↔ `url`, `richtext` ↔ `html`,
`select` ↔ `searchable_select`.

Unsafe, shape changes: anything ↔ `multiselect`, anything ↔ `image`, anything ↔ `link`,
anything ↔ `products` — these store arrays, not scalars.

## Other field properties worth knowing

- **`options: null`** disables the field's option list, per the schema comment. Useful for
  suppressing an inherited choice list without removing the field.
- **An individual option with `'value' => null` renders as disabled**, which is how a
  source model greys out a choice it must show but cannot allow — e.g. offering the current
  entity in a list of selectable entities without letting it be picked. Return it with a
  label explaining why:

  ```php
  $options[] = ['value' => null, 'label' => $this->escaper->escapeHtml(__('%1 (current)', $title))];
  ```
- **A source model may be dynamic.** Nothing requires a static array: inject a repository
  and build the list at runtime, which is how entity-picker fields work. Keep the option
  count bounded (a page-size cap) — the list renders in full in the editor panel.
- **`options` accepts `Class::method`** as well as a bare FQCN, matched by
  `^[A-Z][a-zA-Z0-9_\\]+(?:::[a-zA-Z][a-zA-Z0-9_]*)?$`.
- **`translate` is opt-in.** A field without `"translate": true` never appears in the
  translations panel. Redeclaring a component is the usual moment this gets dropped by
  accident — check it against the upstream declaration field by field.
- **`config` and `custom_properties`** exist at field level; read the live
  `component-field-declaration.json` for their shape, which is version-dependent.
- **Validation attributes** (`required`, `minlength`, `maxlength`, `min`, `max`, `pattern`,
  `placeholder`, `comment`) all live inside `attributes`, never as direct field properties.

## Field types

The authoritative list is the `enum` on `type` in the installed
`component-field-declaration.json`. As of writing: `boolean`, `color`, `date`, `datetime`,
`html`, `image`, `link`, `multiselect`, `number`, `preset`, `range`, `products`, `richtext`,
`select`, `searchable_select`, `text`, `text-align`, `textarea`, `url`, `variant`, `widget`,
`category_importer`, `category_selector`, `custom_type`.

Each has an editor template under
`vendor/hyva-themes/commerce-module-cms/src/liveview-editor/view/adminhtml/templates/liveview/field-types/`
— read the one you are unsure about to see exactly what shape it writes. The
`hyva-cms-component` skill's `references/field-types.md` documents them with examples;
prefer it over duplicating that material here.
