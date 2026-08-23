// ─── blog code samples vs. the real SDK ───────────────────────────────────────
// A published sample that does not run is worse than no sample: the reader
// blames their own integration.
//
// The one on "the free online IFC editor" had been wrong for a while and
// nothing caught it. Every line of its first half was broken:
//
//   <script src=".../sdk/ifc-viewer-sdk.js">   the file does not exist. The host
//                                              serves the SPA's HTML with
//                                              nosniff, so the tag fails outright
//   viewer.loadUrl(url)                        the method is addFromUrl
//   viewer.loadBytes(bytes, name)              the method is add(name, bytes) —
//                                              the arguments are also swapped
//   viewer.on('element:selected')              the event is element-selected
//   report.healthScore                         the field is qualityScore
//
// So this asserts the property that would have caught all five: every SDK
// method and event a blog sample names must exist in the SDK source, and the
// script URLs must be files we actually ship.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const posts = readFileSync(resolve(root, 'src/lib/blog-posts.ts'), 'utf8')
const sdk = readFileSync(resolve(root, 'src/sdk/ifc-viewer-sdk.ts'), 'utf8')

/** Every `viewer.<name>(` in the published samples. */
function methodsUsed(): string[] {
  return [...posts.matchAll(/\bviewer\.([a-zA-Z][a-zA-Z0-9]*)\s*\(/g)]
    .map((m) => m[1])
    .filter((name, i, all) => all.indexOf(name) === i)
}

/** Every `viewer.on('<event>'` in the published samples. */
function eventsUsed(): string[] {
  return [...posts.matchAll(/\bviewer\.on\(\s*'([^']+)'/g)]
    .map((m) => m[1])
    .filter((name, i, all) => all.indexOf(name) === i)
}

/** Every SDK script URL the samples tell a reader to load. */
function sdkUrlsUsed(): string[] {
  return [...posts.matchAll(/ifcvieweronline\.eu(\/sdk\/[A-Za-z0-9._/-]+\.js)/g)]
    .map((m) => m[1])
    .filter((u, i, all) => all.indexOf(u) === i)
}

/**
 * Method names the SDK class declares.
 *
 * Collected by scanning lines rather than with one clever multiline pattern:
 * the first version of this guard used an escaped regex that a shell heredoc
 * quietly de-escaped into `^s{2}`, which matched nothing and reported every
 * real method as missing. Line-at-a-time has fewer places to go wrong, and the
 * vacuity test below catches it if it still does.
 */
const declared = new Set(
  sdk.split(/\r?\n/)
    .map((line) => /^ {2}(?:async )?([a-zA-Z][a-zA-Z0-9]*)\s*[(<]/.exec(line)?.[1])
    .filter((name): name is string => !!name),
)

describe('blog SDK samples', () => {
  it('is actually reading both sides, so no assertion below is vacuous', () => {
    // Both halves matter. A broken blog matcher makes every check pass with an
    // empty list; a broken SDK matcher makes every check fail. The first
    // version of this guard had the second bug and only noticed because it
    // failed loudly. This makes either one impossible to miss.
    expect(methodsUsed().length).toBeGreaterThan(0)
    expect(eventsUsed().length).toBeGreaterThan(0)
    expect(declared.size).toBeGreaterThan(20)
    // Spot-check across the API surface rather than trusting the count alone.
    for (const known of ['add', 'addFromUrl', 'whenReady', 'openPanel', 'getPanels']) {
      expect(declared.has(known), `SDK scan missed ${known}`).toBe(true)
    }
  })

  it('calls only methods the SDK has', () => {
    const missing = methodsUsed().filter((name) => !declared.has(name))
    expect(missing, 'blog samples call SDK methods that do not exist').toEqual([])
  })

  it('listens only for events the SDK emits', () => {
    const missing = eventsUsed().filter((ev) => !sdk.includes(`'${ev}'`))
    expect(missing, 'blog samples listen for events the SDK never sends').toEqual([])
  })

  it('points at SDK files we actually ship', () => {
    // The original failure: a script tag whose URL returns the SPA's HTML.
    const missing = sdkUrlsUsed().filter((u) => !existsSync(resolve(root, 'public' + u)))
    expect(missing, 'blog samples link SDK files that are not in public/').toEqual([])
  })

  it('loads the SDK as a module, since that is what it is', () => {
    // A bare <script src> cannot import an ES module, and it fails quietly
    // enough that a reader will not know why nothing happened.
    for (const url of sdkUrlsUsed()) {
      const escaped = url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
      const bareTag = new RegExp(`<script(?![^>]*type="module")[^>]*src="[^"]*${escaped}"`)
      expect(bareTag.test(posts), `${url} is loaded with a non-module script tag`).toBe(false)
    }
  })
})
