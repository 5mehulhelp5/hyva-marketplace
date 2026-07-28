# Capture determinism checklist (Playwright container)

Implemented by `scripts/capture-run.js`, launched via `scripts/run-capture-container.sh` inside
the pinned official Playwright image. Everything below is applied IDENTICALLY on "before" and
"after" -- determinism is what makes a pixel diff meaningful. This file explains the mechanism so
failures can be diagnosed; the mechanism itself lives in code.

## 1. Pinned rendering
The browser comes from the pinned image tag (see `run-capture-container.sh`), NOT from anything
installed on the host: identical rendering across machines and across runs. The image tag version
and the `playwright-core` version in `scripts/package.json` MUST stay equal (browser builds are
version-coupled) -- bump both together.

## 2. Viewports
| Key | Size | Emulation |
|---|---|---|
| mobile | 375 x 812 | `isMobile: true`, `hasTouch: true` |
| desktop | 1440 x 900 | none |
| (custom) | manifest `viewports` | any Playwright context option subset: `width height deviceScaleFactor isMobile hasTouch` |

One browser context per viewport; `ignoreHTTPSErrors: true` (self-signed `.test` certs);
`deviceScaleFactor` defaults to 1.

## 3. Freeze (injected right after navigation, before settle)
`addStyleTag` with: animations paused and zero-duration, transitions zero-duration, caret hidden,
and `html { overflow-y: scroll; scrollbar-gutter: stable both-edges }` so the scrollbar can never
appear on one side only and shift the captured width between before and after.

## 4. Real settle before the first capture
In order: `networkidle` (15 s cap) → fixed 2 s window so TIMED overlays (newsletter/promo modals)
get their chance to fire → full scroll pass (triggers lazy-loading) then back to top →
`document.fonts.ready` → every `<img>` complete (8 s cap so one stuck asset cannot hang the run)
→ final 300 ms. Failure modes this prevents: a hero image still blank on one side; a timed modal
appearing between the two captures.

## 5. Overlay dismissal
`manifest.dismiss` steps run after settle, identically on both sides (e.g. decline the cookie
banner). Keep every dismiss step `optional: true` -- absence must not fail a capture. If an
overlay cannot be dismissed reliably, guarantee the SAME state on both sides instead (both open
counts as equal and cancels out of the diff).

## 6. What gets captured
- State `default`: **full-page** screenshot (`fullPage: true`) -- no scroll-checkpoint blind spots.
- Interaction states: **viewport** screenshot -- full-page scroll-stitching distorts open
  overlays/fixed elements; the interesting content (open minicart, menu) is in-viewport.
- Every capture also writes the stage-2 snapshot JSON (elements, directives, console, failed
  requests) regardless of screenshot success, so `diff-dom.js` can flag state asymmetry.

## 7. Naming and handoff
`<template>__<viewport>__<state>__<side>.png|json` in the `--out` directory, which MUST live
under the project tree (`var/...`): the project is bind-mounted into the capture container and
into php-fpm, so the differs (running via `warden env exec php-fpm node`) read the same files.
Never use host `/tmp` (separate filesystem from the containers).
Ownership matters too: the launcher runs the container as the HOST user (`--user`, `HOME=/tmp`)
so the php-fpm-side differs can write heatmaps next to the captures — a root-owned capture dir
produces `EACCES` at the diff step.

## 8. Size discipline
Full-page heights may legitimately differ between before/after when content changed -- diff with
`--pad-to-match` (padded rows show as loud magenta diff). A WIDTH mismatch is always a capture
bug (viewport/scrollbar drift): fix the capture, re-shoot, never diff around it.
