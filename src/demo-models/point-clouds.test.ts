// ─── demo point cloud registry guard ──────────────────────────────────────────
// The gallery reads its copy through the panel's `tDynamic` escape hatch, which
// falls back to the key itself rather than throwing. That is right for reader
// error codes (which are open-ended) and wrong here: a demo whose descriptionKey
// has no entry renders the literal string "demos.items.redRocks" into the card
// and nothing fails. So the coupling is checked here instead, in both
// directions — no demo without copy, and no copy without a demo.
//
// What this file deliberately does NOT do is fetch anything. The URLs, byte
// sizes, point counts, CRS codes and colour/classification flags were verified
// against the real files by decoding them (see the header of point-clouds.ts);
// re-checking them over the network would make the suite depend on GitHub being
// up and on nobody's corporate proxy, which is a worse trade than a stale number.

import { describe, it, expect } from 'vitest'
import { DEMO_POINT_CLOUDS, DEMO_SOURCES, formatDemoSize } from './point-clouds'
import { detectFormat } from '../lib/pointcloud/pc-format'
import enPointCloud from '../locales/en/pointcloud.json'

const ITEMS = (enPointCloud as { demos: { items: Record<string, string> } }).demos.items

/**
 * Hosts proven to send `Access-Control-Allow-Origin: *`, which is the whole
 * reason these can be fetched from the browser at all. `media.` is the Git LFS
 * blob host — `raw.` serves a 133-byte pointer file for an LFS-tracked path, so
 * swapping one for the other silently breaks the demo.
 */
const ALLOWED_HOSTS = ['raw.githubusercontent.com', 'media.githubusercontent.com']

describe('demo point clouds', () => {
  it('gives every demo a unique id and file name', () => {
    expect(new Set(DEMO_POINT_CLOUDS.map((d) => d.id)).size).toBe(DEMO_POINT_CLOUDS.length)
    expect(new Set(DEMO_POINT_CLOUDS.map((d) => d.fileName)).size).toBe(DEMO_POINT_CLOUDS.length)
  })

  it('has English copy for every demo, and no orphaned copy', () => {
    for (const demo of DEMO_POINT_CLOUDS) {
      expect(ITEMS[demo.descriptionKey], `no copy for ${demo.id}`).toBeTruthy()
    }
    const used = new Set(DEMO_POINT_CLOUDS.map((d) => d.descriptionKey))
    for (const key of Object.keys(ITEMS)) {
      expect(used.has(key), `copy "${key}" belongs to no demo`).toBe(true)
    }
  })

  it('fetches only over https from a CORS-enabled host', () => {
    for (const demo of DEMO_POINT_CLOUDS) {
      const url = new URL(demo.url)
      expect(url.protocol, demo.id).toBe('https:')
      expect(ALLOWED_HOSTS, demo.id).toContain(url.hostname)
      expect(new URL(demo.sourceUrl).protocol, demo.id).toBe('https:')
    }
  })

  it('names files the reader registry can actually route', () => {
    for (const demo of DEMO_POINT_CLOUDS) {
      expect(detectFormat(demo.fileName).ok, `${demo.id} (${demo.fileName})`).toBe(true)
      // The URL must end in the same file name, or the download and the parse
      // disagree about which format they are dealing with.
      expect(demo.url.endsWith(demo.fileName), demo.id).toBe(true)
    }
  })

  it('states a real size and point count for the progress bar and the chips', () => {
    for (const demo of DEMO_POINT_CLOUDS) {
      expect(demo.sizeBytes, demo.id).toBeGreaterThan(0)
      expect(demo.pointCount, demo.id).toBeGreaterThan(0)
      expect(demo.format.length, demo.id).toBeGreaterThan(0)
    }
  })

  it('credits every source exactly once', () => {
    const labels = new Map(DEMO_SOURCES.map((s) => [s.sourceUrl, s.sourceLabel]))
    expect(labels.size).toBe(DEMO_SOURCES.length)
    for (const demo of DEMO_POINT_CLOUDS) {
      expect(labels.get(demo.sourceUrl), `${demo.id} is credited to nobody`).toBe(demo.sourceLabel)
    }
  })

  it('keeps at least one coloured sample, which is what the gallery is for', () => {
    expect(DEMO_POINT_CLOUDS.filter((d) => d.hasColor).length).toBeGreaterThanOrEqual(1)
  })

  it('formats sizes in kB below a megabyte and MB above it', () => {
    expect(formatDemoSize(102_284)).toBe('100 kB')
    expect(formatDemoSize(10_188_197)).toBe('9.7 MB')
  })
})
