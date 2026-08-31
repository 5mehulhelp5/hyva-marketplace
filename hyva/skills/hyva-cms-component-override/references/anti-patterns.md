# Anti-patterns and migration

Every shape below is a real attempt to customise a component *additively*. All of them
break, and the ways they break are worth knowing — they are what you will find in a
codebase that predates the rule, and what a reviewer needs to be able to argue against.

## 1. Plugin on `Collector::execute()`

```php
// PROHIBITED
public function afterExecute(Collector $subject, array $result): array
{
    $result['banner']['content']['variants']['options'] =
        \Vendor\Module\Model\Config\Source\BannerVariants::class;

    return $result;
}
```

**Why it fails.** `Collector::execute()` calls `processComponentDefinition()` per
component, which runs `handleIncludes()` then `handleOptions()`. By the time an
`afterExecute` plugin sees the array, every `options` entry has already been resolved from
FQCN string to option array. Writing a class-name string back in produces a field whose
options are the literal string — the editor renders an empty or broken select, and
`ComponentValidator::isValidVariantTemplate()` iterating it finds no `value` key and
rejects every variant.

**The tell-tale workaround.** Codebases that hit this discover
`processComponentDefinition()` is public and call it again:

```php
// PROHIBITED — and a strong smell that the whole approach is wrong
return $subject->processComponentDefinition($component, 'banner', 'Vendor_Module');
```

That re-runs the include merge and `checkForDuplicateFields()` over already-processed,
already-mutated data. It happens to work today. It depends on `handleIncludes()` being
idempotent after `includes` has been unset, which is incidental, undocumented and free to
change in a patch release.

## 2. Plugin on an option source

```php
// PROHIBITED
public function afterToOptionArray(BannerVariants $subject, array $result): array
{
    $result[] = ['value' => '…/banner/inline.phtml', 'label' => __('Inline')];

    return $result;
}
```

**Why it fails.** It works — right up until someone redeclares `banner`. The
redeclaration points `variants.options` at a project source model, upstream
`Hyva\CmsBase\Model\Config\Source\BannerVariants` is no longer instantiated for that
field, and the plugin stops contributing. Silently: no error, no log.

The visible symptom is the worst kind. Content already saved against the injected variant
keeps rendering, because the template path lives in the database — but the variant is gone
from the picker, so editors cannot reproduce or re-select it, and nobody connects that to a
plugin that no longer runs.

**Compounding problem.** One such plugin is often attached to several `<type>` nodes to
share a couple of options across components. That couples components that have no
relationship, and the first redeclaration of any of them makes the sharing partial.

## 3. DI `<preference>` on an option source

```xml
<!-- PROHIBITED -->
<preference for="Hyva\CmsBase\Model\Config\Source\BannerVariants"
            type="Vendor\Module\Model\Config\Source\BannerVariants"/>
```

**Why it fails.** It does take effect — `SourceFactory::create()` resolves through the
ObjectManager. That is the problem: a preference is global. Every component, every module
and every third-party extension referencing that class gets your list, forever, with no
way to scope it. And it is invisible from the declaration: the JSON still names the
upstream class.

## 4. `virtualType` on an option source

```xml
<!-- POINTLESS -->
<virtualType name="vendor_banner_variants"
             type="Hyva\CmsBase\Model\Config\Source\BannerVariants"/>
```

**Why it fails.** `handleOptions()` resolves the literal string from the JSON. A virtual
type is reachable only by naming it there — and if you are editing the JSON, you are
redeclaring the component, so declare a real class with a real name instead.

## 5. Plugin on `Provider`, `ComponentValidator` or `Block\Element`

**Why it fails.** These are the read and enforcement paths, not declaration. Intercepting
`Provider` puts component shape behind a cached runtime call. Intercepting
`ComponentValidator` weakens the render-time allowlist that exists to stop arbitrary
template paths being rendered from stored content — never do this to make a variant work;
the variant belongs in the declaration.

## 6. A shared abstract PHP base class for "component extensions"

```php
// PROHIBITED
abstract class AbstractComponentFields
{
    abstract protected function componentName(): string;
    abstract protected function extend(array $component, Collector $subject): array;
}
```

A tidy-looking base class for a family of plugins is still the plugin approach, and it
makes the problem worse: it lowers the cost of adding the next one, so the declaration
drifts further from the JSON with every component.

The legitimate DRY tool is a shared **include file**:

```json
"design": {
  "includes": [
    "Hyva_CmsBase::etc/hyva_cms/default_design.json",
    "Vendor_Module::etc/hyva_cms/brand_design.json"
  ]
}
```

Declarative, visible from the component, and it composes with upstream includes.

## Migration recipe

For a codebase that already has plugins. Work one component at a time — each is
self-contained, and the change is mechanical.

1. **Pick a component and find everything acting on it.** Grep `etc/di.xml` for plugins on
   `Collector` and on every `Hyva\CmsBase\Model\Config\Source\*` the component references.
2. **Copy the upstream declaration** into your `components.json` under the same key,
   preserving `includes`.
3. **Replay each plugin by hand into the JSON.** Field insertions become fields in the
   right position; `attributes.comment` additions become comments; template or icon
   overrides become properties. Read the plugin, do not run it.
4. **Convert injected options into your own source model**, copying the upstream values
   plus the injected ones, and repoint `options` at it.
5. **Delete the plugin classes, their `di.xml` nodes and their unit tests.** Do not leave
   them: a plugin left in place after redeclaration is dead code that still runs on every
   request and can silently re-add a field you deliberately removed.
6. **Watch out for shared plugins.** An option-source plugin wired to several `<type>`
   nodes must keep the nodes for components you have not migrated yet. Note it, and
   remove the node only as each component is redeclared.
7. **Verify** in developer mode: every previously saved value still resolves, every
   variant still renders on the frontend, no exception from `ComponentValidator`.
8. **Record the component** in the module README as redeclared, so upgrade diffs have an
   input.

### Order of migration

Do the components with the most plugin surface first — they carry the most risk and
teach the pattern fastest. Components customised only by a theme template override need
no migration at all.
