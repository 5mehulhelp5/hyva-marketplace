'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadManifest, artifactStem, DEFAULT_VIEWPORTS } = require('./capture-run')

function writeManifest(obj) {
  const p = path.join(os.tmpdir(), `hvc-manifest-${process.pid}.json`)
  fs.writeFileSync(p, JSON.stringify(obj))
  return p
}

const MINIMAL = {
  before: { baseUrl: 'https://b.test' },
  after: { baseUrl: 'https://a.test' },
  pages: [{ template: 'home', path: '/' }],
}

test('loadManifest accepts a minimal manifest and applies defaults', () => {
  const p = writeManifest(MINIMAL)
  try {
    const m = loadManifest(p)
    assert.deepEqual(Object.keys(m.viewports).sort(), ['desktop', 'mobile'])
    assert.deepEqual(m.dismiss, [])
    assert.equal(m.viewports.desktop.width, DEFAULT_VIEWPORTS.desktop.width)
  } finally {
    fs.unlinkSync(p)
  }
})

test('loadManifest rejects a missing before.baseUrl', () => {
  const p = writeManifest({ ...MINIMAL, before: {} })
  try {
    assert.throws(() => loadManifest(p), /missing before\.baseUrl/)
  } finally {
    fs.unlinkSync(p)
  }
})

test('loadManifest rejects empty pages', () => {
  const p = writeManifest({ ...MINIMAL, pages: [] })
  try {
    assert.throws(() => loadManifest(p), /non-empty pages/)
  } finally {
    fs.unlinkSync(p)
  }
})

test('loadManifest rejects a state without steps', () => {
  const p = writeManifest({ ...MINIMAL, pages: [{ template: 'home', path: '/', states: [{ name: 'x' }] }] })
  try {
    assert.throws(() => loadManifest(p), /needs "name" and non-empty "steps"/)
  } finally {
    fs.unlinkSync(p)
  }
})

test('artifactStem builds the canonical file stem', () => {
  assert.equal(artifactStem('home', 'desktop', 'default', 'before'), 'home__desktop__default__before')
  assert.equal(artifactStem('product', 'mobile', 'minicart-open', 'after'), 'product__mobile__minicart-open__after')
})
