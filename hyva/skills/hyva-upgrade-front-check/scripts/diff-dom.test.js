'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadRenameMap, normalizeClasses, normalizeDirective, keyOf, diffSnapshots } = require('./diff-dom')

function el(over = {}) {
  return {
    tag: 'button', role: null, type: 'button', id: null, name: 'Ajouter au panier',
    testid: null, href: null, classes: [], visible: true, directives: {}, ...over,
  }
}

function snap(elements, over = {}) {
  return {
    template: 'home', viewport: 'desktop', state: 'default', side: 'before',
    url: 'https://x.test/', stateApplied: true, stateSkipReason: null,
    console: [], pageErrors: [], failedRequests: [], elements, elementsTruncated: false, ...over,
  }
}

test('identical snapshots yield OK with empty findings', () => {
  const a = snap([el({ id: 'cta', directives: { '@click': 'go()' } })])
  const b = snap([el({ id: 'cta', directives: { '@click': 'go()' } })], { side: 'after' })
  const r = diffSnapshots(a, b, {})
  assert.equal(r.verdict, 'OK')
  assert.equal(r.removedElements.length, 0)
  assert.equal(r.directiveChanges.length, 0)
  assert.equal(r.newConsoleErrors.length, 0)
})

test('a removed button is REVIEW', () => {
  const a = snap([el({ id: 'cta' }), el({ id: 'other', name: 'Autre' })])
  const b = snap([el({ id: 'other', name: 'Autre' })], { side: 'after' })
  const r = diffSnapshots(a, b, {})
  assert.equal(r.verdict, 'REVIEW')
  assert.equal(r.removedElements.length, 1)
  assert.equal(r.removedElements[0].key, 'id:cta')
})

test('a lost @click directive is REVIEW, with x-on: canonicalized to @', () => {
  const a = snap([el({ id: 'cta', directives: { 'x-on:click.prevent': 'go()' } })])
  const b = snap([el({ id: 'cta', directives: {} })], { side: 'after' })
  const r = diffSnapshots(a, b, {})
  assert.equal(r.verdict, 'REVIEW')
  assert.deepEqual(r.directiveChanges, [{ key: 'id:cta', lost: ['@click'], gained: [] }])
})

test('renamed Tailwind classes are normalized away; unexplained drift stays informational', () => {
  const tsv = '# comment\nshadow-sm\tshadow-xs\tauto-safe\trename\n'
  const map = loadRenameMap(tsv)
  const a = snap([el({ id: 'cta', classes: ['shadow-sm', 'p-4'] })])
  const b = snap([el({ id: 'cta', classes: ['shadow-xs', 'p-6'] })], { side: 'after' })
  const r = diffSnapshots(a, b, { renameMap: map })
  assert.equal(r.verdict, 'OK') // class drift alone never flips the verdict
  assert.deepEqual(r.classChanges, [{ key: 'id:cta', removed: ['p-4'], added: ['p-6'] }])
  assert.equal(r.classesNormalized, true)
})

test('a new console error is REVIEW; identical errors on both sides are not', () => {
  const err = { type: 'error', text: 'Alpine Expression Error at https://x.test/foo.js?v=abc12345' }
  const same = diffSnapshots(snap([], { console: [err] }), snap([], { console: [err], side: 'after' }), {})
  assert.equal(same.verdict, 'OK')
  const fresh = diffSnapshots(snap([]), snap([], { console: [err], side: 'after' }), {})
  assert.equal(fresh.verdict, 'REVIEW')
  assert.equal(fresh.newConsoleErrors.length, 1)
})

test('console normalization ignores host and query-string differences', () => {
  const a = snap([], { console: [{ type: 'error', text: 'boom at https://before.x.test/js/app.js?v=1111aaaa' }] })
  const b = snap([], { console: [{ type: 'error', text: 'boom at https://x.test/js/app.js?v=2222bbbb' }], side: 'after' })
  assert.equal(diffSnapshots(a, b, {}).newConsoleErrors.length, 0)
})

test('a new failed request is REVIEW, keyed by pathname', () => {
  const b = snap([], { failedRequests: [{ url: 'https://x.test/static/frontend/x.js?v=1', status: 404 }], side: 'after' })
  const r = diffSnapshots(snap([]), b, {})
  assert.equal(r.verdict, 'REVIEW')
  assert.deepEqual(r.newFailedRequests, ['/static/frontend/x.js (404)'])
})

test('a benign ERR_ABORTED (cancelled prefetch) on after is informational, not REVIEW', () => {
  const b = snap([], {
    failedRequests: [{ url: 'https://x.test/prefetch.js?v=1', status: 0, errorText: 'net::ERR_ABORTED' }],
    side: 'after',
  })
  const r = diffSnapshots(snap([]), b, {})
  assert.equal(r.verdict, 'OK')
  assert.deepEqual(r.newFailedRequests, [])
  assert.deepEqual(r.newAbortedRequests, ['/prefetch.js (0)'])
})

test('a real status-0 network failure (connection refused) on after is REVIEW', () => {
  const b = snap([], {
    failedRequests: [{ url: 'https://x.test/api/cart', status: 0, errorText: 'net::ERR_CONNECTION_REFUSED' }],
    side: 'after',
  })
  const r = diffSnapshots(snap([]), b, {})
  assert.equal(r.verdict, 'REVIEW')
  assert.deepEqual(r.newFailedRequests, ['/api/cart (0)'])
  assert.deepEqual(r.newAbortedRequests, [])
})

test('identical aborted requests on both sides cancel out', () => {
  const req = { url: 'https://x.test/prefetch.js', status: 0, errorText: 'net::ERR_ABORTED' }
  const r = diffSnapshots(snap([], { failedRequests: [req] }), snap([], { failedRequests: [req], side: 'after' }), {})
  assert.equal(r.verdict, 'OK')
  assert.deepEqual(r.newAbortedRequests, [])
})

test('state asymmetry (applied before, skipped after) is REVIEW', () => {
  const a = snap([el({ id: 'cta' })])
  const b = snap([el({ id: 'cta' })], { side: 'after', stateApplied: false, stateSkipReason: 'selector not found: #cta' })
  const r = diffSnapshots(a, b, {})
  assert.equal(r.verdict, 'REVIEW')
  assert.deepEqual(r.stateAsymmetry, { before: true, after: false })
})

test('keyOf priority: testid, then id, then tag|role|name', () => {
  assert.equal(keyOf(el({ testid: 't1', id: 'i1' })), 'tid:t1')
  assert.equal(keyOf(el({ id: 'i1' })), 'id:i1')
  assert.equal(keyOf(el({ role: 'button', name: 'Go' })), 'button|button|Go')
})

test('normalizeDirective strips modifiers and canonicalizes x-on:', () => {
  assert.equal(normalizeDirective('@click.prevent.stop'), '@click')
  assert.equal(normalizeDirective('x-on:click.prevent'), '@click')
  assert.equal(normalizeDirective('x-data'), 'x-data')
})

test('normalizeClasses applies the map and sorts', () => {
  const map = new Map([['shadow-sm', 'shadow-xs']])
  assert.deepEqual(normalizeClasses(['z-10', 'shadow-sm'], map), ['shadow-xs', 'z-10'])
})

test('normalizeClasses follows rename CHAINS to a fixpoint (shadow -> shadow-sm -> shadow-xs)', () => {
  // The real TSV contains chained renames (v4 shifted the whole size scale down one notch).
  // Both sides must converge to the same terminal name, whatever their starting point.
  const map = new Map([['shadow', 'shadow-sm'], ['shadow-sm', 'shadow-xs']])
  assert.deepEqual(normalizeClasses(['shadow'], map), ['shadow-xs'])
  assert.deepEqual(normalizeClasses(['shadow-sm'], map), ['shadow-xs'])
})
