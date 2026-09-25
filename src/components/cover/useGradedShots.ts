// ─── Photo finish, applied to the shots ───────────────────────────────────────
// The tone half of the grade is baked into each shot's pixels once per
// setting (full resolution — the export uses the same bitmaps) and cached by
// shot and setting, so dragging a slider regrades only after it settles and
// flipping back to a previous setting is instant. The vignette and grain are
// drawn per frame by the templates, not here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gradePixels, hasTone, toneKey, type Grade } from '../../lib/cover/grade'
import type { CoverImage, CoverShot } from '../../lib/cover/types'

const DEBOUNCE_MS = 180

async function gradeImage(image: CoverImage, g: Grade): Promise<CoverImage> {
  const c = document.createElement('canvas')
  c.width = image.width
  c.height = image.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return image
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  gradePixels(data, g)
  ctx.putImageData(data, 0, 0)
  return createImageBitmap(c)
}

export function useGradedShots(shots: CoverShot[], grade: Grade): { shots: CoverShot[]; pending: boolean; ready: () => Promise<CoverShot[]> } {
  // shot id → tone key → graded image (the last few settings per shot).
  const cache = useRef(new Map<string, Map<string, CoverImage>>())
  // What each shot showed last, so a slider drag keeps the previous grade on
  // screen until the new one lands instead of flashing the raw capture.
  const shown = useRef(new Map<string, CoverImage>())
  const [version, setVersion] = useState(0)
  const [pending, setPending] = useState(false)
  const key = hasTone(grade) ? toneKey(grade) : ''

  const gradeAll = useCallback(async (list: CoverShot[], g: Grade, k: string): Promise<CoverShot[]> => {
    if (!k) return list
    const result: CoverShot[] = []
    for (const s of list) {
      let perShot = cache.current.get(s.id)
      if (!perShot) { perShot = new Map(); cache.current.set(s.id, perShot) }
      let img = perShot.get(k)
      if (!img) {
        img = await gradeImage(s.image, g)
        perShot.set(k, img)
        while (perShot.size > 3) perShot.delete(perShot.keys().next().value as string)
      }
      result.push({ ...s, image: img })
    }
    return result
  }, [])

  const latest = useRef({ shots, grade, key })
  latest.current = { shots, grade, key }

  useEffect(() => {
    const ids = new Set(shots.map((s) => s.id))
    for (const id of [...cache.current.keys()]) if (!ids.has(id)) { cache.current.delete(id); shown.current.delete(id) }
    if (!key || shots.every((s) => cache.current.get(s.id)?.has(key))) { setPending(false); return }
    let alive = true
    setPending(true)
    const timer = setTimeout(() => {
      void gradeAll(shots, grade, key).then(() => {
        if (!alive) return
        setVersion((v) => v + 1)
        setPending(false)
      })
    }, DEBOUNCE_MS)
    return () => { alive = false; clearTimeout(timer) }
    // `grade` is represented by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, key, gradeAll])

  const display = useMemo(() => {
    if (!key) { shown.current.clear(); return shots }
    return shots.map((s) => {
      const img = cache.current.get(s.id)?.get(key) ?? shown.current.get(s.id) ?? s.image
      shown.current.set(s.id, img)
      return img === s.image ? s : { ...s, image: img }
    })
    // `version` bumps when a regrade lands in the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, key, version])

  /** The graded shots for an export, waiting for any regrade in flight. */
  const ready = useCallback(() => {
    const { shots: s, grade: g, key: k } = latest.current
    return gradeAll(s, g, k)
  }, [gradeAll])

  return { shots: display, pending, ready }
}
