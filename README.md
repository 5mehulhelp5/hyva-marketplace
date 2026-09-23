# Hyvä Plugin Marketplace

Public Claude Code plugin marketplace maintained by Blackbird Agency. It repackages the open-source [hyva-themes/hyva-ai-tools](https://github.com/hyva-themes/hyva-ai-tools) project as a ready-to-use plugin. The skills are an unmodified mirror of upstream.

- **Marketplace**: `synolia-hyva`
- **Repo**: `blackbird-agency/hyva-marketplace`

## Available plugins

| Plugin | Content |
|--------|---------|
| `hyva` | Hyvä theme skills: Alpine/UI/CMS components, child theme, Tailwind, Playwright, module scaffolding, media image rendering |

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

## Keeping in sync with upstream

`hyva/skills/` is an exact mirror of upstream's `skills/` directory — never edit or add skills there, the next sync would erase them.

```bash
./sync-upstream.sh          # sync from upstream main
./sync-upstream.sh v1.2.0   # or from a given branch/tag
```

The script prints the upstream commit it synced from and the changed files; review the diff, then commit.

## Origin & attribution

Built on the open-source [hyva-themes/hyva-ai-tools](https://github.com/hyva-themes/hyva-ai-tools), repackaged as a Claude Code plugin.

Maintained by [Blackbird Agency](https://github.com/blackbird-agency) as an independent distribution. It is not affiliated with, endorsed by, or officially maintained by Hyvä / Hyvä Themes; the name "Hyvä" only indicates compatibility with the theme. Full credit to the original authors; see the upstream repository for its license and terms.
