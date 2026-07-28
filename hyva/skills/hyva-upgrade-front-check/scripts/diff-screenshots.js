#!/usr/bin/env node
'use strict'

const fs = require('fs')
const { PNG } = require('pngjs')
const jpeg = require('jpeg-js')
const pixelmatch = require('pixelmatch')

const DEFAULT_MAX_DIFF_RATIO = 0.01 // 1% of pixels differing -> classified REVIEW

function applyIgnoreRegions(png, regions) {
  for (const [x0, y0, w, h] of regions) {
    for (let y = y0; y < y0 + h && y < png.height; y++) {
      for (let x = x0; x < x0 + w && x < png.width; x++) {
        const idx = (png.width * y + x) << 2
        png.data[idx] = 0
        png.data[idx + 1] = 0
        png.data[idx + 2] = 0
        png.data[idx + 3] = 255
      }
    }
  }
}

// Pad an RGBA image with magenta rows to reach targetHeight. Magenta is deliberately loud:
// padded area always shows as diff, so a page that grew/shrank flags itself.
function padToHeight(img, targetHeight) {
  if (img.height >= targetHeight) return img
  const data = Buffer.alloc(img.width * targetHeight * 4)
  data.set(img.data.subarray(0, img.width * img.height * 4))
  for (let i = img.width * img.height; i < img.width * targetHeight; i++) {
    data[i * 4] = 255
    data[i * 4 + 1] = 0
    data[i * 4 + 2] = 255
    data[i * 4 + 3] = 255
  }
  return { width: img.width, height: targetHeight, data }
}

function diffScreenshots({ before, after, maxDiffRatio = DEFAULT_MAX_DIFF_RATIO, ignoreRegions = [], padToMatch = false }) {
  const heightBefore = before.height
  const heightAfter = after.height
  if (before.width !== after.width || (before.height !== after.height && !padToMatch)) {
    throw new Error(
      `size mismatch: before is ${before.width}x${before.height}, after is ${after.width}x${after.height}`
    )
  }
  let paddedRows = 0
  if (before.height !== after.height) {
    const target = Math.max(before.height, after.height)
    paddedRows = Math.abs(before.height - after.height)
    before = padToHeight(before, target)
    after = padToHeight(after, target)
  }
  const { width, height } = before
  applyIgnoreRegions(before, ignoreRegions)
  applyIgnoreRegions(after, ignoreRegions)
  const diffPng = new PNG({ width, height })
  const diffPixels = pixelmatch(before.data, after.data, diffPng.data, width, height, {
    threshold: 0.1,
    includeAA: false,
  })
  const totalPixels = width * height
  const diffRatio = diffPixels / totalPixels
  const verdict = diffRatio > maxDiffRatio ? 'REVIEW' : 'OK'
  return { width, height, diffPixels, totalPixels, diffRatio, verdict, heightBefore, heightAfter, paddedRows, diffPng }
}

// Decode a PNG or JPEG file into a { width, height, data } RGBA object that pixelmatch can consume.
// Dispatch by MAGIC BYTES (not file extension): the Playwright container captures PNG, but JPEG is
// accepted defensively (hand-supplied captures) and the on-disk name is not guaranteed. Pure JS
// (pngjs + jpeg-js) -- no native/Chromium dependency, no lossy JPEG->PNG conversion step.
function decodeToRGBA(file) {
  const buf = fs.readFileSync(file)
  const isPng =
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (isPng) {
    return PNG.sync.read(buf)
  }
  if (isJpeg) {
    const { width, height, data } = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true })
    return { width, height, data }
  }
  throw new Error(`unsupported image format for ${file} (expected PNG or JPEG)`)
}

function parseIgnoreRegions(values) {
  return (values || []).map((v) => v.split(',').map(Number))
}

function main(argv) {
  const args = argv.slice(2)
  const positionals = []
  let maxDiffRatio = DEFAULT_MAX_DIFF_RATIO
  let padToMatch = false
  const ignore = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold') { maxDiffRatio = Number(args[++i]); continue }
    if (args[i] === '--ignore') { ignore.push(args[++i]); continue }
    if (args[i] === '--pad-to-match') { padToMatch = true; continue }
    positionals.push(args[i])
  }
  const [beforePath, afterPath, diffOutPath] = positionals
  if (!beforePath || !afterPath) {
    console.error('Usage: diff-screenshots.js BEFORE AFTER [DIFF_OUT.png] [--threshold N] [--ignore x,y,w,h]... [--pad-to-match]  (BEFORE/AFTER: PNG or JPEG)')
    process.exit(2)
  }
  const result = diffScreenshots({
    before: decodeToRGBA(beforePath),
    after: decodeToRGBA(afterPath),
    maxDiffRatio,
    ignoreRegions: parseIgnoreRegions(ignore),
    padToMatch,
  })
  if (diffOutPath) {
    fs.writeFileSync(diffOutPath, PNG.sync.write(result.diffPng))
  }
  const { diffPng, ...summary } = result
  console.log(JSON.stringify(summary))
}

module.exports = { diffScreenshots, applyIgnoreRegions, decodeToRGBA, padToHeight }

if (require.main === module) {
  main(process.argv)
}
