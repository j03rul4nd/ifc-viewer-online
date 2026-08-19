// ─── Tests — capture export preferences ───────────────────────────────────────
// The store itself is thin; what needs guarding is the persistence parser. A
// stale or hand-edited blob must never push an option the UI does not offer
// (an unlisted fps would render an empty <select>, an unlisted height would
// silently change every export).

import { describe, it, expect } from 'vitest'
import { parseStoredPrefs, DEFAULT_PREFS } from './captureStore'
import { MIN_WINDOW_SECONDS, MAX_WINDOW_SECONDS } from '../lib/capture/replay-buffer-core'

describe('parseStoredPrefs', () => {
  it('round-trips a full, valid preference set', () => {
    const prefs = {
      seconds: 22, fps: 15, height: 720, aspect: 'square' as const,
      fit: 'crop' as const, padStyle: 'dark' as const,
    }
    expect(parseStoredPrefs(JSON.stringify(prefs))).toEqual(prefs)
  })

  it('reads prefs written before fit/padStyle existed', () => {
    // Anyone who used the toolkit before the editor shipped has a v1 blob;
    // it must load rather than reset every other choice they made.
    const legacy = JSON.stringify({ seconds: 22, fps: 15, height: 720, aspect: 'square' })
    expect(parseStoredPrefs(legacy)).toEqual({
      seconds: 22, fps: 15, height: 720, aspect: 'square',
      fit: DEFAULT_PREFS.fit, padStyle: DEFAULT_PREFS.padStyle,
    })
  })

  it('preserves an explicit source-resolution choice (null height)', () => {
    expect(parseStoredPrefs('{"height":null}').height).toBeNull()
  })

  it('falls back to defaults for missing, malformed or non-object values', () => {
    for (const raw of [null, '', 'not json', '[]', '"str"', 'null']) {
      expect(parseStoredPrefs(raw)).toEqual(DEFAULT_PREFS)
    }
  })

  it('fills every missing field from the defaults', () => {
    expect(parseStoredPrefs('{}')).toEqual(DEFAULT_PREFS)
  })

  it('rejects options the UI does not offer', () => {
    const rogue = JSON.stringify({ fps: 60, height: 4320, aspect: 'panorama' })
    expect(parseStoredPrefs(rogue)).toEqual({ ...DEFAULT_PREFS })
  })

  it('clamps a stored duration into the recordable range', () => {
    expect(parseStoredPrefs('{"seconds":999}').seconds).toBe(MAX_WINDOW_SECONDS)
    expect(parseStoredPrefs('{"seconds":0}').seconds).toBe(MIN_WINDOW_SECONDS)
  })

  it('ignores wrong-typed fields instead of trusting them', () => {
    expect(parseStoredPrefs('{"seconds":"15","fps":"10"}')).toEqual(DEFAULT_PREFS)
  })
})
