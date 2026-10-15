import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fillStoryText, parseStory, pickText } from './scene-story'
import { validateSceneDoc } from './scene-doc'

const SCENES = join(dirname(fileURLToPath(import.meta.url)), '../../../public/scenes')
const LANGS = ['en', 'es', 'ca', 'de', 'fr', 'it', 'pt', 'ja', 'zh', 'th']

describe('scene story', () => {
  it('keeps valid steps, per-language text, cameras and known bindings', () => {
    const warnings: string[] = []
    const story = parseStory({ steps: [
      { title: { en: 'A bike station', es: 'Una estación' }, text: { en: 'Now: {value} bikes', es: 'Ahora: {value} bicis' }, binding: 'docks' },
      { title: 'Overview', text: 'The square', camera: { position: [1, 2, 3], target: [0, 0, 0] } },
    ] }, new Set(['docks']), warnings)
    expect(warnings).toEqual([])
    expect(story?.steps).toHaveLength(2)
    expect(story?.steps[0].binding).toBe('docks')
    expect(story?.steps[1].camera?.position).toEqual([1, 2, 3])
  })

  it('drops what it cannot use and says where', () => {
    const warnings: string[] = []
    const story = parseStory({ steps: [
      { title: 'No text' },
      { title: 'Bad camera', text: 'x', camera: { position: [1, 2] , target: [0, 0, 0] } },
      { title: 'Unknown binding', text: 'x', binding: 'nope' },
    ] }, new Set(['docks']), warnings)
    expect(story?.steps.map((s) => s.title)).toEqual(['Bad camera', 'Unknown binding'])
    expect(story?.steps[0].camera).toBeUndefined()
    expect(story?.steps[1].binding).toBeUndefined()
    expect(warnings.join(' ')).toMatch(/steps\[0\].*title and a text/)
    expect(warnings.join(' ')).toMatch(/steps\[1\]\.camera/)
    expect(warnings.join(' ')).toMatch(/steps\[2\]\.binding/)
    expect(parseStory({ nope: 1 }, new Set(), [])).toBeUndefined()
  })

  it('picks the language, then its base, then English', () => {
    const t = { en: 'Hello', es: 'Hola', pt: 'Olá' }
    expect(pickText(t, 'es')).toBe('Hola')
    expect(pickText(t, 'pt-BR')).toBe('Olá')
    expect(pickText(t, 'ja')).toBe('Hello')
    expect(pickText('Same everywhere', 'de')).toBe('Same everywhere')
  })

  it('quotes the live value, or waits for it', () => {
    expect(fillStoryText('Now: {value} bikes', '9')).toBe('Now: 9 bikes')
    expect(fillStoryText('Now: {value} bikes', null)).toBe('Now: … bikes')
  })

  it('travels in a scene document', () => {
    const res = validateSceneDoc({
      format: 'ifc-viewer-scene', v: 1, meta: { title: 't' }, models: [{ url: '/m.ifc' }], view: {},
      twin: { sources: [{ id: 's', url: 'https://x/feed', mapping: { listPath: 'a', idField: 'id' } }], bindings: [{ id: 'b', sourceId: 's', deviceId: '1', targets: [], rules: [] }] },
      story: { steps: [{ title: 'One', text: 'Two {value}', binding: 'b' }] },
    })
    expect(res.ok && res.doc.story?.steps[0].binding).toBe('b')
  })

  // The published scenes carry their tours: every step must survive the
  // parser, in every blog language, and point somewhere.
  it.each(['barcelona-placa-catalunya', 'helsinki-rautatientori', 'tokyo-tochomae', 'tokyo-waseda'])('the %s tour is whole', (name) => {
    const res = validateSceneDoc(JSON.parse(readFileSync(join(SCENES, `${name}.scene.json`), 'utf-8')))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings).toEqual([])
    const steps = res.doc.story?.steps ?? []
    expect(steps.length).toBeGreaterThanOrEqual(4)
    for (const step of steps) {
      for (const lang of LANGS) {
        expect(typeof step.title === 'object' && step.title[lang], `${lang} title`).toBeTruthy()
        expect(typeof step.text === 'object' && step.text[lang], `${lang} text`).toBeTruthy()
      }
      expect(step.camera ?? step.binding).toBeTruthy()
    }
    // What the tour, the explorer and the legend name — bindings and their
    // rules — reads in the same languages (twin/localize.ts).
    for (const b of res.doc.twin?.bindings ?? []) {
      for (const item of [b, ...b.rules]) {
        for (const lang of LANGS.filter((l) => l !== 'en')) expect(item.names?.[lang], `${item.name} → ${lang}`).toBeTruthy()
      }
    }
  })
})
