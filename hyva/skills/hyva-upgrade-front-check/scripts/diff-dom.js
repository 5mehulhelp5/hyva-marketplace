#!/usr/bin/env node
'use strict'
// Stage-2 semantic differ: compares two page snapshots (see capture-run.js for the producer)
// element inventory, Alpine/Magewire directives, console errors, failed requests.
// Class attributes are never diffed raw: Tailwind v4 renames are normalized away first via the
// hyva-tailwind-v4-migration skill's renamed-classes.tsv (single maintained source).
//
// Usage: diff-dom.js BEFORE.json AFTER.json [--renames PATH] [--out OUT.json]

const fs = require('fs')
const path = require('path')

const DEFAULT_RENAMES_TSV = path.resolve(
  __dirname,
  '../../hyva-tailwind-v4-migration/references/renamed-classes.tsv'
)

function loadRenameMap(tsvText) {
  const map = new Map()
  for (const line of String(tsvText).split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [name, replacement, , kind] = line.split('\t')
    if ((kind === 'rename' || kind === 'removed-decoration') && name && replacement) {
      map.set(name, replacement)
    }
  }
  return map
}

// Renames in the TSV can be CHAINED (v4 shifted size scales: shadow -> shadow-sm -> shadow-xs),
// so a single map application would leave the two sides on different links of the chain.
// Follow the chain to its fixpoint, capped to guard against an accidental cycle in the TSV.
function normalizeClasses(classes, map = new Map()) {
  return [...(classes || [])]
    .map((c) => {
      let cur = c
      for (let i = 0; i < 5 && map.has(cur); i++) cur = map.get(cur)
      return cur
    })
    .sort()
}

function normalizeDirective(name) {
  let n = name.startsWith('x-on:') ? '@' + name.slice(5) : name
  const dot = n.indexOf('.')
  if (dot > 0) n = n.slice(0, dot)
  return n
}

function keyOf(el) {
  if (el.testid) return `tid:${el.testid}`
  if (el.id) return `id:${el.id}`
  return `${el.tag}|${el.role || ''}|${el.name || ''}`
}

function normalizeMessage(text) {
  return String(text)
    .replace(/https?:\/\/[^/\s"')]+/g, '') // drop scheme+host, keep the path
    .replace(/\?[^\s"')]*/g, '') // drop query strings (cache busters)
    .replace(/\b[a-f0-9]{8,}\b/gi, '*') // collapse hashes/ids
    .trim()
}

function errorSet(snapshot) {
  const set = new Set()
  for (const m of snapshot.console || []) {
    if (m.type === 'error') set.add(`error:${normalizeMessage(m.text)}`)
  }
  for (const e of snapshot.pageErrors || []) set.add(`pageerror:${normalizeMessage(e)}`)
  return set
}

// A `requestfailed` event (recorded as status 0 by capture-run.js) fires not only for real network
// failures (DNS, connection refused, TLS) but also for benign, often NON-DETERMINISTIC cancellations
// -- a prefetch dropped, a navigation superseded, a fetch aborted by the app -- surfaced as
// net::ERR_ABORTED. Those must not drive a REVIEW the way a 4xx/5xx or a real network error does, or a
// prefetch cancelled on only one side would flip the verdict. status 0 + ERR_ABORTED => informational;
// every other failed request (any HTTP status, or a non-abort network error) stays verdict-driving.
function isBenignAbort(r) {
  return r.status === 0 && /ERR_ABORTED/i.test(r.errorText || '')
}

function requestKey(r) {
  let key
  try {
    key = new URL(r.url).pathname
  } catch {
    key = String(r.url).split('?')[0]
  }
  return `${key} (${r.status})`
}

function requestSet(snapshot, predicate) {
  const set = new Set()
  for (const r of snapshot.failedRequests || []) {
    if (predicate && !predicate(r)) continue
    set.add(requestKey(r))
  }
  return set
}

function diffSets(before, after) {
  return [...after].filter((x) => !before.has(x)).sort()
}

function aggregate(elements, renameMap) {
  const map = new Map()
  for (const el of elements || []) {
    const k = keyOf(el)
    let e = map.get(k)
    if (!e) {
      e = {
        count: 0,
        directives: new Set(),
        classes: new Set(),
        sample: { tag: el.tag, name: el.name, visible: el.visible },
      }
      map.set(k, e)
    }
    e.count++
    for (const d of Object.keys(el.directives || {})) e.directives.add(normalizeDirective(d))
    for (const c of normalizeClasses(el.classes, renameMap)) e.classes.add(c)
    e.sample.visible = e.sample.visible || el.visible
  }
  return map
}

function diffSnapshots(before, after, { renameMap = new Map() } = {}) {
  const beforeApplied = before.stateApplied !== false
  const afterApplied = after.stateApplied !== false
  const stateAsymmetry = beforeApplied === afterApplied ? null : { before: beforeApplied, after: afterApplied }

  const a = aggregate(before.elements, renameMap)
  const b = aggregate(after.elements, renameMap)
  const removedElements = []
  const addedElements = []
  const directiveChanges = []
  const classChanges = []

  for (const [k, e] of a) {
    const o = b.get(k)
    if (!o) {
      removedElements.push({ key: k, beforeCount: e.count, afterCount: 0, sample: e.sample })
      continue
    }
    if (o.count < e.count) {
      removedElements.push({ key: k, beforeCount: e.count, afterCount: o.count, sample: e.sample })
    }
    const lost = [...e.directives].filter((d) => !o.directives.has(d)).sort()
    const gained = [...o.directives].filter((d) => !e.directives.has(d)).sort()
    if (lost.length || gained.length) directiveChanges.push({ key: k, lost, gained })
    const removed = [...e.classes].filter((c) => !o.classes.has(c)).sort()
    const added = [...o.classes].filter((c) => !e.classes.has(c)).sort()
    if (removed.length || added.length) classChanges.push({ key: k, removed, added })
  }
  for (const [k, o] of b) {
    const e = a.get(k)
    if (!e) addedElements.push({ key: k, beforeCount: 0, afterCount: o.count, sample: o.sample })
    else if (o.count > e.count) addedElements.push({ key: k, beforeCount: e.count, afterCount: o.count, sample: o.sample })
  }

  const newConsoleErrors = diffSets(errorSet(before), errorSet(after))
  const realFailure = (r) => !isBenignAbort(r)
  const newFailedRequests = diffSets(requestSet(before, realFailure), requestSet(after, realFailure))
  const newAbortedRequests = diffSets(requestSet(before, isBenignAbort), requestSet(after, isBenignAbort))

  const verdict =
    stateAsymmetry ||
    removedElements.length ||
    directiveChanges.some((c) => c.lost.length) ||
    newConsoleErrors.length ||
    newFailedRequests.length
      ? 'REVIEW'
      : 'OK'

  return {
    verdict,
    stateAsymmetry,
    removedElements,
    addedElements,
    directiveChanges,
    classChanges,
    newConsoleErrors,
    newFailedRequests,
    newAbortedRequests,
    classesNormalized: renameMap.size > 0,
  }
}

function main(argv) {
  const args = argv.slice(2)
  const positionals = []
  let renamesPath = null
  let outPath = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--renames') { renamesPath = args[++i]; continue }
    if (args[i] === '--out') { outPath = args[++i]; continue }
    positionals.push(args[i])
  }
  const [beforePath, afterPath] = positionals
  if (!beforePath || !afterPath) {
    console.error('Usage: diff-dom.js BEFORE.json AFTER.json [--renames PATH] [--out OUT.json]')
    process.exit(2)
  }
  let renameMap = new Map()
  const tsv = renamesPath || DEFAULT_RENAMES_TSV
  if (fs.existsSync(tsv)) renameMap = loadRenameMap(fs.readFileSync(tsv, 'utf8'))
  const result = diffSnapshots(
    JSON.parse(fs.readFileSync(beforePath, 'utf8')),
    JSON.parse(fs.readFileSync(afterPath, 'utf8')),
    { renameMap }
  )
  const json = JSON.stringify(result)
  if (outPath) fs.writeFileSync(outPath, json)
  console.log(json)
}

module.exports = { loadRenameMap, normalizeClasses, normalizeDirective, keyOf, diffSnapshots }

if (require.main === module) {
  main(process.argv)
}
