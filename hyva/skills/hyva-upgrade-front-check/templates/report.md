# Visual & functional regression -- {PROJECT} {FROM} -> {TO}

Legend: `OK` sous seuil / rien à signaler · `ATTENDU (documenté)` rapproché du worklist ·
`À REVOIR` à trancher · `[C]` vérifié par Claude · `[x]` validé par l'utilisateur

Seuil de diff pixel : {THRESHOLD}% · Avant : {BEFORE_URL} · Après : {AFTER_URL}
Manifest du run : voir `run-manifest.json` dans le workdir (la couverture exacte du run).

## {THEME}

### Étage 1+3 — diff pixel (default = full-page ; états = viewport)

| Gabarit | Viewport | État | % diff | Padding | Verdict | Note |
|---|---|---|---|---|---|---|

### Étage 2 — diff sémantique (DOM / console / réseau)

| Gabarit | Viewport | État | Éléments– | Directives– | Console+ | Réseau+ | Asym. | Verdict | Note |
|---|---|---|---|---|---|---|---|---|---|

> Colonnes : `Éléments–` disparus · `Directives–` perdues (ex. `@click`) · `Console+` nouvelles
> erreurs · `Réseau+` nouveaux échecs (404/500 d'assets) · `Asym.` état appliqué d'un seul côté.
> Les `classChanges` (informatif, après normalisation Tailwind) se listent dans la Note.
