// ─── useSketchPersistence ─────────────────────────────────────────────────────
// Loading, saving, thumbnails and the channel between windows. Heavy work waits
// for idle time and never runs during a stroke.

import { useEffect } from 'react'
import { activePage, forgetImage, replacePresent, setPageThumb, startHistory } from '../../lib/sketch/document'
import { SKETCH_CHANNEL, type HandoffMessage } from '../../lib/sketch/handoff'
import { decodeSketchLink } from '../../lib/sketch/share-link'
import { SaveQueue } from '../../lib/sketch/save-queue'
import { deleteImage, loadBrand, loadContext, loadDoc, loadImages, saveDoc } from '../../lib/sketch/storage'
import type { SketchDoc } from '../../lib/sketch/types'
import { useSketchStore } from '../../stores/sketchStore'
import { applyOrbit, fitAll, placeReference, showContext } from './actions'

const store = useSketchStore
const SAVE_DELAY_MS = 700
const THUMB_DELAY_MS = 900

type Message = HandoffMessage | 'saved'

const whenIdle = (work: () => void): void => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(work, { timeout: 2000 })
  else setTimeout(work, 200)
}

/** `handoff`: read once from the URL by the studio. */
export function useSketchPersistence(handoff: 'none' | 'waiting' | 'ready', tx: (key: string) => string, mode: 'edit' | 'audience' | 'link' = 'edit'): void {
  useEffect(() => {
    const readOnly = mode !== 'edit'
    store.getState().set({ readOnly })
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SKETCH_CHANNEL)
    const queue = new SaveQueue<SketchDoc>(async (doc) => (readOnly ? true : saveDoc(doc)), (ok) => {
      if (readOnly) return
      store.getState().set({ saveFailed: !ok })
      if (ok) channel?.postMessage('saved' satisfies Message)
    })
    let alive = true
    let loaded = false
    let saveTimer = 0
    let thumbTimer = 0
    store.getState().set({ preparing: handoff === 'waiting' })

    // A link's sketch stays out of the reader's own: their saved work is not touched.
    const initial = mode === 'link'
      ? decodeSketchLink(location.hash.match(/s=([\w-]+)/)?.[1] ?? '')
      : loadDoc()
    void loadBrand().then((brand) => { if (alive && brand) store.getState().set({ brand }) })
    void Promise.all([initial, loadImages()]).then(([doc, images]) => {
      if (!alive) return
      if (doc) store.getState().set({ history: startHistory(doc) })
      else if (mode === 'link') store.getState().flash(tx('meeting.badLink'))
      // A link carries no camera, so frame what it brought.
      if (doc && mode === 'link') {
        if (store.getState().engine) fitAll()
        else {
          const stop = store.subscribe((s) => {
            if (!s.engine) return
            stop()
            fitAll()
          })
        }
      }
      store.getState().set({ images })
      loaded = true
    })
    // A viewer tab still preparing the model will announce it on the channel.
    const adopt = (announce: boolean) => {
      void loadContext().then((items) => { if (alive && items.length) void showContext(items, announce, tx) })
    }
    const waitEngine = store.subscribe((s, prev) => {
      if (s.engine && !prev.engine && handoff !== 'waiting') adopt(handoff === 'ready')
    })
    if (store.getState().engine && handoff !== 'waiting') adopt(handoff === 'ready')

    const unsubscribe = store.subscribe((s, prev) => {
      if (s.history.present === prev.history.present || !loaded) return
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => queue.push(store.getState().history.present), SAVE_DELAY_MS)
      const before = activePage(prev.history.present)
      const after = activePage(s.history.present)
      if (before.layers === after.layers && before.id === after.id && s.history.present.paper === prev.history.present.paper) return
      window.clearTimeout(thumbTimer)
      thumbTimer = window.setTimeout(() => whenIdle(() => {
        const { engine, drawing, history } = store.getState()
        if (!engine || drawing || !alive) return
        const id = activePage(history.present).id
        const thumb = engine.thumbnail()
        store.getState().set({ history: replacePresent(store.getState().history, setPageThumb(store.getState().history.present, id, thumb)) })
      }), THUMB_DELAY_MS)
    })

    // The system may close a window in Split View without warning: write on the way out.
    const onHide = () => { if (document.visibilityState === 'hidden' && loaded) queue.push(store.getState().history.present) }
    document.addEventListener('visibilitychange', onHide)

    // The presenter's camera, page and laser go to the audience window.
    const presenting = channel ? store.subscribe((s, prev) => {
      if (!s.meeting || readOnly) return
      if (s.orbit === prev.orbit && s.laser === prev.laser && s.history.present.activePageId === prev.history.present.activePageId) return
      channel.postMessage({ type: 'view', orbit: s.orbit, pageId: s.history.present.activePageId, laser: s.laser } satisfies Message)
    }) : () => undefined

    if (channel) {
      channel.onmessage = (e: MessageEvent<Message>) => {
        const s = store.getState()
        if (mode === 'link') return
        if (mode === 'audience' && e.data !== 'saved') {
          if (e.data.type === 'view') {
            const { orbit, pageId, laser } = e.data
            applyOrbit(orbit)
            s.set({ laser })
            if (s.history.present.activePageId !== pageId) s.touch((doc) => ({ ...doc, activePageId: pageId }))
          }
          return
        }
        if (e.data === 'saved') {
          if (s.drawing) return
          void Promise.all([loadDoc(), loadImages()]).then(([doc, images]) => {
            if (!alive) return
            if (doc) store.getState().set({ history: replacePresent(store.getState().history, doc) })
            store.getState().set({ images })
          })
          return
        }
        switch (e.data.type) {
          case 'context-ready':
          case 'context-failed':
            // Once is enough: a second window of the studio may have asked as well.
            if (!s.preparing) return
            s.set({ preparing: false })
            if (e.data.type === 'context-ready') adopt(true)
            else s.flash(tx(e.data.reason === 'too-big' ? 'context.tooBig' : 'context.failed'))
            break
          case 'view':
          case 'outbox':
            break
          case 'images-changed':
            void loadImages().then((images) => { if (alive) store.getState().set({ images }) })
            break
          case 'place': {
            const image = s.images.find((i) => i.id === (e.data as { imageId: string }).imageId)
            if (image) placeReference(image, tx)
            break
          }
          case 'forget':
            void deleteImage(e.data.imageId)
            s.edit((doc) => forgetImage(doc, (e.data as { imageId: string }).imageId))
            break
        }
      }
      if (handoff === 'waiting') channel.postMessage({ type: 'context-ask' } satisfies Message)
    }

    return () => {
      alive = false
      waitEngine()
      presenting()
      unsubscribe()
      window.clearTimeout(saveTimer)
      window.clearTimeout(thumbTimer)
      document.removeEventListener('visibilitychange', onHide)
      if (loaded) queue.push(store.getState().history.present)
      void queue.flushed().then(() => channel?.close())
    }
  }, [handoff, mode, tx])
}
