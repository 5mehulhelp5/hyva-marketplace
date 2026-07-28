'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { PNG } = require('pngjs')
const jpeg = require('jpeg-js')
const { diffScreenshots, decodeToRGBA } = require('./diff-screenshots')

function solidPng(width, height, [r, g, b]) {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = r
    png.data[i * 4 + 1] = g
    png.data[i * 4 + 2] = b
    png.data[i * 4 + 3] = 255
  }
  return png
}

test('identical images are classified OK with zero diff', () => {
  const before = solidPng(4, 4, [10, 20, 30])
  const after = solidPng(4, 4, [10, 20, 30])
  const result = diffScreenshots({ before, after })
  assert.equal(result.diffPixels, 0)
  assert.equal(result.verdict, 'OK')
})

test('a single differing pixel above the ratio threshold is classified REVIEW', () => {
  const before = solidPng(4, 4, [10, 20, 30])
  const after = solidPng(4, 4, [10, 20, 30])
  after.data[0] = 255 // flips pixel (0,0) -- 1/16 = 6.25% of pixels
  const result = diffScreenshots({ before, after, maxDiffRatio: 0.01 })
  assert.equal(result.diffPixels, 1)
  assert.equal(result.verdict, 'REVIEW')
})

test('an ignore region covering the differing pixel restores OK', () => {
  const before = solidPng(4, 4, [10, 20, 30])
  const after = solidPng(4, 4, [10, 20, 30])
  after.data[0] = 255
  const result = diffScreenshots({
    before,
    after,
    maxDiffRatio: 0.01,
    ignoreRegions: [[0, 0, 1, 1]],
  })
  assert.equal(result.diffPixels, 0)
  assert.equal(result.verdict, 'OK')
})

test('mismatched image sizes throw a clear error', () => {
  const before = solidPng(4, 4, [10, 20, 30])
  const after = solidPng(5, 4, [10, 20, 30])
  assert.throws(() => diffScreenshots({ before, after }), /size mismatch/)
})

function solidRaw(width, height, [r, g, b]) {
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

function tmpFile(name) {
  return path.join(os.tmpdir(), name)
}

test('decodeToRGBA decodes a JPEG file into RGBA with correct dimensions', () => {
  const encoded = jpeg.encode(solidRaw(8, 8, [120, 60, 200]), 90)
  const p = tmpFile('hvc-decode.jpg')
  fs.writeFileSync(p, encoded.data)
  try {
    const img = decodeToRGBA(p)
    assert.equal(img.width, 8)
    assert.equal(img.height, 8)
    assert.equal(img.data.length, 8 * 8 * 4)
  } finally {
    fs.unlinkSync(p)
  }
})

test('decodeToRGBA decodes a PNG by magic bytes, not by file extension', () => {
  const png = new PNG({ width: 5, height: 4 })
  const p = tmpFile('hvc-decode-png.bin') // deliberately NOT .png -> proves magic-byte dispatch
  fs.writeFileSync(p, PNG.sync.write(png))
  try {
    const img = decodeToRGBA(p)
    assert.equal(img.width, 5)
    assert.equal(img.height, 4)
  } finally {
    fs.unlinkSync(p)
  }
})

test('diffScreenshots on the same decoded JPEG yields zero diff / OK', () => {
  const encoded = jpeg.encode(solidRaw(16, 16, [30, 140, 90]), 90)
  const p = tmpFile('hvc-same.jpg')
  fs.writeFileSync(p, encoded.data)
  try {
    const result = diffScreenshots({ before: decodeToRGBA(p), after: decodeToRGBA(p) })
    assert.equal(result.diffPixels, 0)
    assert.equal(result.verdict, 'OK')
  } finally {
    fs.unlinkSync(p)
  }
})

test('decodeToRGBA throws on an unsupported (non-PNG/JPEG) format', () => {
  const p = tmpFile('hvc-bad.bin')
  fs.writeFileSync(p, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]))
  try {
    assert.throws(() => decodeToRGBA(p), /unsupported image format/)
  } finally {
    fs.unlinkSync(p)
  }
})

test('padToMatch pads the shorter image and counts padded rows as diff', () => {
  const before = solidPng(4, 4, [10, 20, 30])
  const after = solidPng(4, 6, [10, 20, 30])
  const result = diffScreenshots({ before, after, maxDiffRatio: 0.01, padToMatch: true })
  assert.equal(result.heightBefore, 4)
  assert.equal(result.heightAfter, 6)
  assert.equal(result.paddedRows, 2)
  assert.equal(result.diffPixels, 8) // 2 padded rows x 4 px of magenta vs real pixels
  assert.equal(result.verdict, 'REVIEW')
})

test('equal-size images report paddedRows 0', () => {
  const result = diffScreenshots({ before: solidPng(4, 4, [1, 2, 3]), after: solidPng(4, 4, [1, 2, 3]) })
  assert.equal(result.paddedRows, 0)
  assert.equal(result.heightBefore, 4)
  assert.equal(result.heightAfter, 4)
})

test('width mismatch throws even with padToMatch', () => {
  const before = solidPng(4, 4, [10, 20, 30])
  const after = solidPng(5, 4, [10, 20, 30])
  assert.throws(() => diffScreenshots({ before, after, padToMatch: true }), /size mismatch/)
})

test('height mismatch without padToMatch still throws', () => {
  const before = solidPng(4, 4, [10, 20, 30])
  const after = solidPng(4, 6, [10, 20, 30])
  assert.throws(() => diffScreenshots({ before, after }), /size mismatch/)
})
