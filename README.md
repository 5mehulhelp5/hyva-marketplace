# Hyvä Plugin Marketplace

Public Claude Code plugin marketplace maintained by Blackbird Agency. It repackages the open-source [hyva-themes/hyva-ai-tools](https://github.com/hyva-themes/hyva-ai-tools) project as a ready-to-use plugin, with our own Hyvä (Magento 2) skills added on top.

- **Marketplace**: `synolia-hyva`
- **Repo**: `blackbird-agency/hyva-marketplace`

## Available plugins

| Plugin | Content |
|--------|---------|
| `hyva` | Hyvä theme skills: Alpine/UI/CMS components, child theme, Tailwind, Playwright, module scaffolding, media image rendering, SVG icons, global JS and Alpine stores |

## Installation

### Enable plugins per project

In the project's `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "hyva@synolia-hyva": true
  }
}
```

## Origin & attribution

Built on the open-source [hyva-themes/hyva-ai-tools](https://github.com/hyva-themes/hyva-ai-tools), repackaged as a Claude Code plugin and extended with skills and tooling of our own.

Maintained by [Blackbird Agency](https://github.com/blackbird-agency) as an independent distribution. It is not affiliated with, endorsed by, or officially maintained by Hyvä / Hyvä Themes; the name "Hyvä" only indicates compatibility with the theme. Full credit to the original authors; see the upstream repository for its license and terms.
