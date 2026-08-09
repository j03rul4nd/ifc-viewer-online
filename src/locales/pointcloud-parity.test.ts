// ─── pointcloud locale key-parity test ────────────────────────────────────────
// Same guard the geo namespace has, for the same reason: these files are edited
// ten at a time and a missing key renders a raw string like "align.rung.local"
// into the panel. Two extra checks matter here specifically:
//   • every alignment rung, confidence level and colour mode the code can emit
//     must have a label, or the panel shows an enum value to the user;
//   • the honesty strings (the ones that say a placement is a guess) must exist
//     in all ten locales, since they are the only thing separating "aligned"
//     from "aligned, and here is how much you should trust it".

import { describe, it, expect } from 'vitest'
import enPc from './en/pointcloud.json'
import esPc from './es/pointcloud.json'
import dePc from './de/pointcloud.json'
import frPc from './fr/pointcloud.json'
import ptPc from './pt/pointcloud.json'
import itPc from './it/pointcloud.json'
import caPc from './ca/pointcloud.json'
import zhPc from './zh/pointcloud.json'
import jaPc from './ja/pointcloud.json'
import thPc from './th/pointcloud.json'

type Json = Record<string, unknown>

/** Maintenance marker on locales seeded from EN — not a UI string. */
const MARKER_KEY = '_status'

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (!prefix && k === MARKER_KEY) continue
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Json, key))
    else out[key] = String(v)
  }
  return out
}

function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

const EN = flatten(enPc as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(esPc as Json), de: flatten(dePc as Json), fr: flatten(frPc as Json),
  pt: flatten(ptPc as Json), it: flatten(itPc as Json), ca: flatten(caPc as Json),
  zh: flatten(zhPc as Json), ja: flatten(jaPc as Json), th: flatten(thPc as Json),
}

describe('pointcloud locale parity', () => {
  const enKeys = Object.keys(EN).sort()

  it('every locale has the same key set as EN', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      expect(Object.keys(dict).sort(), `key drift in ${lng}`).toEqual(enKeys)
    }
  })

  it('every locale uses the same interpolation params per key', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      for (const key of enKeys) {
        expect(paramsOf(dict[key] ?? ''), `params drift on ${lng}:${key}`).toEqual(paramsOf(EN[key]))
      }
    }
  })

  it('leaves no empty strings, which render as a blank control', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      for (const key of enKeys) {
        expect(dict[key]?.trim().length, `empty ${lng}:${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('labels every alignment rung and confidence level the aligner can emit', () => {
    for (const rung of ['map-conversion', 'shared-crs', 'geographic', 'local', 'manual']) {
      expect(EN[`align.rung.${rung}`], `missing rung label ${rung}`).toBeTruthy()
    }
    for (const level of ['exact', 'high', 'approximate', 'manual']) {
      expect(EN[`align.confidence.${level}`], `missing confidence label ${level}`).toBeTruthy()
    }
  })

  it('labels every colour mode the shader supports', () => {
    for (const mode of ['rgb', 'intensity', 'elevation', 'classification', 'flat']) {
      expect(EN[`display.mode.${mode}`], `missing colour mode label ${mode}`).toBeTruthy()
    }
  })

  it('carries every honesty disclaimer in all ten locales', () => {
    // Each of these tells the user that a placement is inferred rather than
    // measured. Losing one in a locale would let that language present a guess
    // as a survey result.
    const disclaimers = [
      'align.manualWarning',
      'align.reason.assumedSameCrs',
      'align.reason.geographicAnchor',
      'align.reason.sharedLocalFrame',
      'align.reason.noCommonReference',
      'align.reason.noElevationDatum',
      'status.truncated',
      // NOT here: an "extent is estimated" note. PLY and XYZ carry no bounding
      // box, so the header's is sampled — but the worker measures the exact box
      // while streaming and sends it with `done`, so by the time the panel shows
      // anything the bounds are measured, not estimated. A disclaimer that is no
      // longer true is worse than none.
    ]
    for (const key of disclaimers) {
      expect(EN[key], `missing disclaimer ${key} in en`).toBeTruthy()
      for (const [lng, dict] of Object.entries(LOCALES)) {
        expect(dict[key]?.trim().length, `missing disclaimer ${key} in ${lng}`).toBeGreaterThan(0)
      }
    }
  })

  it('explains every format it refuses, rather than saying only "unsupported"', () => {
    // 'laz', 'copc' and 'pcd' are deliberately absent: all three are decoded
    // now, so their refusal texts were deleted rather than left to rot into
    // lies. This list shrinking is the intended direction of travel.
    for (const key of ['e57', 'proprietary', 'unknown']) {
      expect(EN[`unsupported.${key}`], `missing refusal text for ${key}`).toBeTruthy()
    }
    // And the deleted ones must stay deleted in EVERY locale, or one language
    // goes on telling people to convert a file the viewer opens perfectly well.
    for (const gone of ['laz', 'copc', 'pcd']) {
      for (const [lng, dict] of Object.entries(LOCALES)) {
        expect(dict[`unsupported.${gone}`], `${lng} still refuses ${gone}`).toBeUndefined()
      }
    }
  })
})
