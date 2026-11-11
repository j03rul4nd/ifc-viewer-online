// ─── /sketch?pane=refs ────────────────────────────────────────────────────────
// The references alone, for the other side of a Split View or a second monitor.
// It owns no document: it shares the image library and asks the studio to act.

import { useCallback, useEffect, useRef, useState } from 'react'
import { newId } from '../../lib/sketch/document'
import { SKETCH_CHANNEL, type HandoffMessage } from '../../lib/sketch/handoff'
import { loadImages, readImageFile, saveImage } from '../../lib/sketch/storage'
import type { ReferenceImage } from '../../lib/sketch/types'
import { ImageList } from './ReferencePane'
import type { Tx } from './SketchStudio'

const CHROME = { '--sk-panel': '#FAF6F2', '--sk-line': 'rgba(50,35,25,.14)', '--sk-text': '#241C16', '--sk-dim': '#6D5F55', '--sk-active': '#241C16', '--sk-on-active': '#FAF6F2', '--sk-soft': 'rgba(50,35,25,.07)' } as React.CSSProperties

export default function ReferenceWindow({ tx }: { tx: Tx }) {
  const [images, setImages] = useState<ReferenceImage[]>([])
  const channel = useRef<BroadcastChannel | null>(null)
  const post = (message: HandoffMessage) => channel.current?.postMessage(message)

  useEffect(() => {
    document.title = tx('refs.label')
    const c = new BroadcastChannel(SKETCH_CHANNEL)
    channel.current = c
    void loadImages().then(setImages)
    c.onmessage = (e: MessageEvent<HandoffMessage | 'saved'>) => {
      if (e.data === 'saved' || e.data.type === 'images-changed') void loadImages().then(setImages)
    }
    return () => { channel.current = null; c.close() }
  }, [tx])

  const add = useCallback(async (files: Iterable<File>) => {
    for (const file of files) {
      const image = file.type.startsWith('image/') ? await readImageFile(file, newId()) : null
      if (image && (await saveImage(image))) setImages((list) => [...list, image])
    }
    channel.current?.postMessage({ type: 'images-changed' } satisfies HandoffMessage)
  }, [])

  return (
    <div className="absolute inset-0" style={{ ...CHROME, background: 'var(--sk-panel)', color: 'var(--sk-text)' }}>
      <ImageList
        tx={tx} images={images} placed={[]} onAdd={add}
        onPlace={(image) => post({ type: 'place', imageId: image.id })}
        onDelete={(image) => {
          setImages((list) => list.filter((i) => i.id !== image.id))
          post({ type: 'forget', imageId: image.id })
        }}
      />
    </div>
  )
}
