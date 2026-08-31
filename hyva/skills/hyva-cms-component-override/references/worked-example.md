# Worked example — adding a Video Player variant to `banner`

The upstream `banner` component (`Hyva_CmsBase`) ships three variants: Default, Split and
Text. This adds a fourth, Video Player, in a module called `Vendor_Module`.

It is the smallest realistic override, and it shows the shape of the cost: the first
variant on a component pays for the redeclaration; every variant after it is one constant,
one label and one template.

## File tree

```
app/code/Vendor/Module/
├── etc/
│   ├── module.xml                                      M   sequence: Hyva_CmsBase, Hyva_CmsLiveviewEditor
│   └── hyva_cms/
│       └── components.json                             M   full `banner` redeclaration
├── Model/
│   └── Config/
│       └── Source/
│           ├── BannerVariants.php                      A   4 variants, upstream values copied
│           └── BannerLinkAppearances.php               A   only if the appearance list changes
├── view/
│   └── frontend/
│       └── templates/
│           └── elements/
│               └── banner/
│                   └── video-player.phtml              A
├── i18n/
│   ├── fr_FR.csv                                       M   "Video Player" + new field labels
│   └── de_DE.csv                                       M
└── Test/
    └── Unit/
        └── Etc/
            └── ComponentDeclarationTest.php            A   asserts every variant template resolves
```

Nothing under `Plugin/`. Nothing added to `etc/di.xml` — a redeclaration needs no DI.

## Step 1 — Copy the upstream declaration

From `vendor/hyva-themes/commerce-module-cms/src/components-base/etc/hyva_cms/components.json`,
copy the entire `banner` entry into your `etc/hyva_cms/components.json` under the same key.

Verbatim, including `description`, `category`, `icon`, `children.config.accepts`, all
content fields, all design fields, and both `includes` lines. Only then start editing.

## Step 2 — Repoint the variant list

```json
"variants": {
  "type": "variant",
  "label": "Variant",
  "options": "Vendor\\Module\\Model\\Config\\Source\\BannerVariants"
}
```

`link_appearance` keeps pointing at
`Hyva\\CmsBase\\Model\\Config\\Source\\BannerLinkAppearances` unless you are also changing
the appearance list — in which case it gets its own class the same way, and
`BannerLinkAppearances.php` above becomes necessary.

## Step 3 — Declare the new fields

Video fields, hidden on every non-video variant. These use **core field types only**, so
the example works on a plain Hyvä CMS install with no additional modules:

```json
"video_url": {
  "type": "url",
  "label": "Video URL",
  "attributes": {
    "required": true,
    "comment": "Direct URL to an MP4 or WebM file."
  },
  "hide_if": {
    "variants": [
      "Hyva_CmsBase::elements/banner/default.phtml",
      "Hyva_CmsBase::elements/banner/split.phtml",
      "Hyva_CmsBase::elements/banner/text.phtml"
    ]
  }
},
"autoplay":      { "type": "boolean", "label": "Autoplay",      "default_value": true,  "hide_if": { "variants": [ "…" ] } },
"loop":          { "type": "boolean", "label": "Loop",          "default_value": true,  "hide_if": { "variants": [ "…" ] } },
"show_controls": { "type": "boolean", "label": "Show controls", "default_value": false, "hide_if": { "variants": [ "…" ] } }
```

If the project provides an uploader-style custom field type, swap `"type": "url"` for
`"type": "custom_type"` plus `"custom_type": "<name>"` and whatever attributes that type
expects. Check what is registered before assuming — custom field types are contributed
per project via `Hyva\CmsLiveviewEditor\Model\CustomField`, and the `hyva-cms-custom-field`
skill covers declaring one. Nothing else in this example changes.

### Reuse the inherited fields instead of adding parallel ones

`banner` already carries `image`, `desktop_image` and `loading`. Adding a `video_poster`
field beside them would be the obvious move and the wrong one: it duplicates a field the
component already has, and content saved in `image` becomes meaningless on the new
variant instead of being carried over.

Reuse `image` as the poster. In the redeclaration, leave the field where it is and change
only its `attributes.comment` so editors know what it does on this variant:

```json
"image": {
  "type": "image",
  "label": "Image",
  "attributes": {
    "comment": "On the Video Player variant this image is used as the video poster."
  },
  "hide_if": {
    "variants": ["Hyva_CmsBase::elements/banner/text.phtml"]
  }
}
```

Then hide only what the variant genuinely cannot use — add the Video Player path to the
existing `hide_if.variants` of `desktop_image` (one poster is enough) and `loading` (a
`poster` attribute takes no loading strategy). `image` itself stays visible.

This is the cheapest kind of override there is: an inherited field, one attribute changed,
its saved content still valid on every variant including the new one.

## Step 4 — Keep the includes

```json
"design": {
  "includes": ["Hyva_CmsBase::etc/hyva_cms/default_design.json"],
  "text_color":        { … },
  "content_alignment": { "type": "select", "label": "Content Alignment",
                         "options": "Hyva\\CmsBase\\Model\\Config\\Source\\ContentAlignment" },
  "…":                 { … }
},
"advanced": {
  "includes": "Hyva_CmsBase::etc/hyva_cms/default_advanced.json"
}
```

`advanced` stays one line and still yields `classes` and `block_id`. `design` still
inherits `background_color`. Upstream `options` references you did not change stay
upstream.

## Step 5 — The source model

```php
<?php

declare(strict_types=1);

namespace Vendor\Module\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magento\Framework\Escaper;

class BannerVariants implements OptionSourceInterface
{
    public const VARIANT_DEFAULT = 'Hyva_CmsBase::elements/banner/default.phtml';

    public const VARIANT_SPLIT = 'Hyva_CmsBase::elements/banner/split.phtml';

    public const VARIANT_TEXT = 'Hyva_CmsBase::elements/banner/text.phtml';

    public const VARIANT_VIDEO_PLAYER = 'Vendor_Module::elements/banner/video-player.phtml';

    public function __construct(
        private readonly Escaper $escaper
    ) {
    }

    /**
     * @return array<int, array{value: string, label: string, icon: string}>
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
                'value' => self::VARIANT_SPLIT,
                'label' => $this->escaper->escapeHtml(__('Split')),
                'icon' => 'Hyva_CmsBase::images/components/columns.svg',
            ],
            [
                'value' => self::VARIANT_TEXT,
                'label' => $this->escaper->escapeHtml(__('Text')),
                'icon' => 'Hyva_CmsBase::images/components/text.svg',
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

The three upstream values are **copied**, not inherited. Their template paths still point
at `Hyva_CmsBase` — you are reusing upstream templates, which is fine; what you own is the
list.

## Step 6 — The variant template

`view/frontend/templates/elements/banner/video-player.phtml`

```php
<?php

declare(strict_types=1);

use Hyva\CmsLiveviewEditor\Block\Element;
use Hyva\Theme\Model\ViewModelRegistry;
use Magento\Framework\Escaper;

/** @var Element $block */
/** @var Escaper $escaper */
/** @var ViewModelRegistry $viewModels */

$title = (string) ($block->getData('title') ?: '');
$videoUrl = (string) ($block->getData('video_url') ?: '');
$poster = $block->resolveImageSrc($block->getData('image') ?: []);
$posterUrl = !empty($poster['src']) ? $block->getImagePath($poster['src']) : '';
$autoplay = (bool) $block->getData('autoplay');
$loop = (bool) $block->getData('loop');
$showControls = (bool) $block->getData('show_controls');
?>
<div <?= /** @noEscape */ $block->getEditorAttrs() ?> class="relative w-full">
    <?php if ($videoUrl): ?>
        <video class="w-full object-cover"
               <?php if ($posterUrl): ?>poster="<?= $escaper->escapeUrl($posterUrl) ?>"<?php endif; ?>
               <?= $autoplay ? 'autoplay muted playsinline' : '' ?>
               <?= $loop ? 'loop' : '' ?>
               <?= $showControls ? 'controls' : '' ?>>
            <source src="<?= $escaper->escapeUrl($videoUrl) ?>">
        </video>
    <?php endif; ?>
    <?php if ($title): ?>
        <h2 <?= /** @noEscape */ $block->getEditorAttrs('title') ?>>
            <?= $escaper->escapeHtml($title) ?>
        </h2>
    <?php endif; ?>
</div>
```

`getEditorAttrs()` on the root element and on each editable field is required for live
editing.

An `image` field stores an array with a `src` key. Call
`Element::resolveImageSrc()` first — it re-derives `src` from `imageOptions.id` via the
image-asset resolver, which is what keeps an edited or optimised asset pointing at the
current file rather than the originally saved path. Then `Element::getImagePath()` turns
the path into a URL: a full URL is returned unchanged, anything else gets the media base
URL prepended.
For an image rendered as an actual `<img>` rather than a `poster` attribute, use
`Hyva\Theme\ViewModel\Media::getResponsivePictureHtml()` with
`$block->getResponsiveImageData($image)`; the `hyva-render-media-image` skill covers it.

## Step 7 — The guard test

```php
public static function declaredTemplates(): array
{
    return [
        'banner default'      => [BannerVariants::VARIANT_DEFAULT],
        'banner split'        => [BannerVariants::VARIANT_SPLIT],
        'banner text'         => [BannerVariants::VARIANT_TEXT],
        'banner video player' => [BannerVariants::VARIANT_VIDEO_PLAYER],
    ];
}
```

Resolve each `Module::path` identifier across theme → your module → upstream module and
assert the file exists. This is what catches an upstream template that moved during an
upgrade, and it is cheap enough to extend every time you add a variant.

## What the next variant costs

One `public const`, one entry in `toOptionArray()`, one template, one row in
`declaredTemplates()`, and its path added to the relevant `hide_if` lists. The
redeclaration is already paid for.
