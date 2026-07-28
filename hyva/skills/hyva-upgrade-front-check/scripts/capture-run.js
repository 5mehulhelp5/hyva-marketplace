#!/usr/bin/env node
'use strict'
// Runs INSIDE the ephemeral Playwright container started by run-capture-container.sh (official
// mcr.microsoft.com/playwright image: browsers preinstalled, PLAYWRIGHT_BROWSERS_PATH preset).
// Do NOT run this via `warden env exec php-fpm` -- that container has no browser; only the
// pure-function exports are php-fpm-testable.
//
// For each page x viewport (x state), on both sides (before/after):
//   stage 1: deterministic screenshot -- full-page for the "default" state (no scroll blind
//            spots), viewport-sized for interaction states (full-page scroll-stitching would
//            distort open overlays/fixed elements)
//   stage 2: structured DOM/console/network snapshot (JSON) -- schema consumed by diff-dom.js
// Artifacts land in --out, which must sit under the mounted project tree (var/...).
//
// Usage: node capture-run.js --manifest run-manifest.json --out var/<workdir>/captures

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const DEFAULT_VIEWPORTS = {
  mobile: { width: 375, height: 812, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
}

const FREEZE_CSS = [
  '*, *::before, *::after {',
  '  animation-play-state: paused !important;',
  '  animation-duration: 0s !important;',
  '  transition-duration: 0s !important;',
  '  caret-color: transparent !important;',
  '}',
  'html { overflow-y: scroll !important; scrollbar-gutter: stable both-edges !important; }',
].join('\n')

function loadManifest(file) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const side of ['before', 'after']) {
    if (!m[side] || typeof m[side].baseUrl !== 'string' || !m[side].baseUrl) {
      throw new Error(`manifest: missing ${side}.baseUrl`)
    }
  }
  if (!Array.isArray(m.pages) || m.pages.length === 0) {
    throw new Error('manifest: non-empty pages[] required')
  }
  for (const p of m.pages) {
    if (!p.template || typeof p.path !== 'string') {
      throw new Error('manifest: each page needs "template" and "path"')
    }
    for (const st of p.states || []) {
      if (!st.name || !Array.isArray(st.steps) || st.steps.length === 0) {
        throw new Error(`manifest: state in "${p.template}" needs "name" and non-empty "steps"`)
      }
    }
  }
  m.viewports = m.viewports || DEFAULT_VIEWPORTS
  m.dismiss = m.dismiss || []
  return m
}

function artifactStem(template, viewport, state, side) {
  return `${template}__${viewport}__${state}__${side}`
}

async function runSteps(page, steps) {
  for (const step of steps || []) {
    const loc = page.locator(step.selector).first()
    if ((await loc.count()) === 0) {
      if (step.optional) continue
      return { applied: false, reason: `selector not found: ${step.selector}` }
    }
    try {
      if (step.action === 'click') await loc.click({ timeout: 5000 })
      else if (step.action === 'hover') await loc.hover({ timeout: 5000 })
      else if (step.action === 'focus') await loc.focus({ timeout: 5000 })
      else if (step.action === 'fill') await loc.fill(step.value || '', { timeout: 5000 })
      else if (step.action === 'press') await loc.press(step.value || 'Enter', { timeout: 5000 })
      else return { applied: false, reason: `unknown action: ${step.action}` }
    } catch (err) {
      if (step.optional) continue
      return { applied: false, reason: `${step.action} failed on ${step.selector}: ${err.message}` }
    }
    if (step.waitMs) await page.waitForTimeout(step.waitMs)
  }
  return { applied: true, reason: null }
}

// Real settle, identical on both sides (spec v2 §6b): timed modals get their window (dismissed
// right after via manifest.dismiss), a full scroll pass triggers lazy-loading, then fonts and
// every <img> must be complete (capped so one stuck asset cannot hang the run).
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? 0 : new Promise((res) => { img.onload = img.onerror = res })
        )
      ),
      new Promise((r) => setTimeout(r, 8000)),
    ])
  )
  await page.waitForTimeout(300)
}

// Runs in the page. Collects interactive elements AND any element carrying Alpine/Magewire
// attributes -- read from raw attributes because CSS cannot select names like "@click".
function extractElements() {
  const INTERACTIVE = { a: 1, button: 1, input: 1, select: 1, textarea: 1, form: 1 }
  const out = []
  const all = document.getElementsByTagName('*')
  for (let i = 0; i < all.length && out.length < 5000; i++) {
    const el = all[i]
    const tag = el.tagName.toLowerCase()
    const directives = {}
    for (const attr of el.attributes) {
      if (/^(x-|@|wire:)/.test(attr.name)) directives[attr.name] = String(attr.value).slice(0, 120)
    }
    const isInteractive = INTERACTIVE[tag] === 1 || el.getAttribute('role') !== null
    if (!isInteractive && Object.keys(directives).length === 0) continue
    const r = el.getBoundingClientRect()
    out.push({
      tag,
      role: el.getAttribute('role'),
      type: el.getAttribute('type'),
      id: el.id || null,
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      testid: el.getAttribute('data-testid'),
      href: el.hasAttribute('href') ? (el.getAttribute('href') || '').split('?')[0] : null,
      classes: (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).sort(),
      visible: r.width > 0 && r.height > 0,
      directives,
    })
  }
  return { elements: out, truncated: out.length >= 5000 }
}

async function captureOne(context, manifest, pageDef, vpName, side, st, outDir) {
  const baseUrl = manifest[side].baseUrl.replace(/\/$/, '')
  const url = pageDef.path.startsWith('/') ? baseUrl + pageDef.path : `${baseUrl}/${pageDef.path}`
  const page = await context.newPage()
  const consoleMsgs = []
  const pageErrors = []
  const failedRequests = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMsgs.push({ type: msg.type(), text: msg.text().slice(0, 500) })
    }
  })
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err).slice(0, 500)))
  page.on('response', (resp) => {
    if (resp.status() >= 400) failedRequests.push({ url: resp.url(), status: resp.status() })
  })
  page.on('requestfailed', (req) =>
    failedRequests.push({ url: req.url(), status: 0, errorText: (req.failure() && req.failure().errorText) || '' })
  )
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.addStyleTag({ content: FREEZE_CSS })
    await settle(page)
    await runSteps(page, manifest.dismiss) // dismiss steps should all be optional:true
    let applied = { applied: true, reason: null }
    if (st.steps) {
      applied = await runSteps(page, st.steps)
      await page.waitForTimeout(st.settleMs || 800)
    }
    const stem = artifactStem(pageDef.template, vpName, st.name, side)
    if (applied.applied) {
      await page.screenshot({ path: path.join(outDir, `${stem}.png`), fullPage: !st.steps })
    }
    const snap = await page.evaluate(extractElements)
    fs.writeFileSync(
      path.join(outDir, `${stem}.json`),
      JSON.stringify({
        template: pageDef.template,
        viewport: vpName,
        state: st.name,
        side,
        url,
        stateApplied: applied.applied,
        stateSkipReason: applied.reason,
        console: consoleMsgs,
        pageErrors,
        failedRequests,
        elements: snap.elements,
        elementsTruncated: snap.truncated,
      })
    )
    console.log(`${applied.applied ? 'ok  ' : 'SKIP'} ${stem}${applied.reason ? ' -- ' + applied.reason : ''}`)
  } finally {
    await page.close()
  }
}

async function main(argv) {
  const args = argv.slice(2)
  let manifestPath = null
  let outDir = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest') manifestPath = args[++i]
    else if (args[i] === '--out') outDir = args[++i]
  }
  if (!manifestPath || !outDir) {
    console.error('Usage: capture-run.js --manifest run-manifest.json --out <dir under the mounted project>')
    process.exit(2)
  }
  const manifest = loadManifest(manifestPath)
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  try {
    for (const [vpName, vp] of Object.entries(manifest.viewports)) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor || 1,
        isMobile: !!vp.isMobile,
        hasTouch: !!vp.hasTouch,
        ignoreHTTPSErrors: true,
      })
      for (const pageDef of manifest.pages) {
        const states = [{ name: 'default', steps: null }, ...(pageDef.states || [])]
        for (const side of ['before', 'after']) {
          for (const st of states) {
            await captureOne(context, manifest, pageDef, vpName, side, st, outDir)
          }
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

module.exports = { loadManifest, artifactStem, DEFAULT_VIEWPORTS }

if (require.main === module) {
  main(process.argv).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
