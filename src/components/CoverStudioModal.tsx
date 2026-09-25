// ─── Cover Studio ──────────────────────────────────────────────────────────────
// Turns the loaded model into presentation-grade stills and decks: covers in
// twenty templates (Pinterest moodboards and colour stories, editorial covers,
// competition boards, project sheets), sized for a client deck, an A1 board, a
// Pinterest pin, a LinkedIn carousel or a story — exported as PNG, PDF or an
// editable PowerPoint, or shared straight from the phone with its caption.
//
// Same rule as the clip editor: the preview canvas is painted by renderSlide,
// the exact function the exporters call, so what you see is what you get.
// Lazy-loaded from CaptureToolbar; nothing here reaches the main bundle.
//
// Pieces: components/cover/ (panels, capture engine, exporters, undo history,
// persisted document) over lib/cover/ (templates, design layer, colour,
// photo finish, facts, captions, recipes — all pure and tested).

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { Modal } from './Modal'
import { useSceneStore } from '../stores/sceneStore'
import { useValidationStore } from '../stores/validationStore'
import { useCaptureStore } from '../stores/captureStore'
import { toast } from '../stores/toastStore'
import { appBus } from '../lib/event-bus'
import { createLogger } from '../lib/logger'
import { downloadBlob } from '../lib/diffStore'
import { COVER_FORMATS, isDeckFormat, platformOf } from '../lib/cover/formats'
import { paletteById } from '../lib/cover/palettes'
import { COVER_TEMPLATES, COVER_TEMPLATE_IDS, TEMPLATE_CATEGORIES, renderSlide, type CoverTemplateId, type TemplateCategory } from '../lib/cover/templates'
import { planDeck, specsForPlan, visibleSlides, type DeckOptions, type SlidePlan } from '../lib/cover/deck'
import { projectNameFromFile } from '../lib/cover/draw'
import { coverStats, physicalCategories } from '../lib/cover/stats'
import { derivePalette, extractSwatches, paletteFromSwatches } from '../lib/cover/color'
import { AUTO_FACT_IDS, autoFacts, customFacts, mergeFacts, type AutoFactId, type ModelMeasures } from '../lib/cover/facts'
import { qrMatrix } from '../lib/cover/qr'
import { buildCaption, type CaptionPlatform } from '../lib/cover/caption'
import { RECIPES, RECIPE_IDS, missingSteps, type RecipeId } from '../lib/cover/recipes'
import { GRADE_PRESETS } from '../lib/cover/grade'
import type { LightId } from '../lib/cover/lighting'
import type { LookId } from '../lib/cover/looks'
import type { CutMode } from '../lib/cover/cuts'
import type { CoverImage, CoverLabels, CoverPalette, CoverSpec, CoverStats } from '../lib/cover/types'
import type { ViewerAPI } from '../lib/viewer'
import { useHistory } from './cover/useHistory'
import { useCoverCapture, dataUrlToImage, type CaptureRes } from './cover/useCoverCapture'
import { useGradedShots } from './cover/useGradedShots'
import { buildPdf, buildPptx, buildZip, canShareFiles, renderToBlob, slideName, slug } from './cover/exporters'
import { readPersisted, readStyles, writePersisted, writeStyles, type CaptureState, type SavedStyle, type StudioDoc } from './cover/doc'
import DesignPanel from './cover/DesignPanel'
import ViewsPanel from './cover/ViewsPanel'
import ContentPanel from './cover/ContentPanel'
import SlidesPanel from './cover/SlidesPanel'
import { chip, cls } from './cover/ui'

const log = createLogger('CoverStudio')

type Tab = 'design' | 'views' | 'text' | 'slides'
const TABS: Tab[] = ['design', 'views', 'text', 'slides']
const NO_DECK: DeckOptions = { views: false, data: false, closing: false, project: false, statement: false, perSlide: 1 }
const RECIPE_ICON: Record<RecipeId, keyof typeof Icons> = {
  pinterest: 'Palette', carousel: 'Layers', post: 'Share', story: 'Film', client: 'Play', board: 'Ruler', sheet: 'FileIfc',
}

function today(lang: string): string {
  try { return new Date().toLocaleDateString(lang, { month: 'long', year: 'numeric' }) } catch { return String(new Date().getFullYear()) }
}

/** The film date stamp: 'YY MM DD, like a compact camera burns into the corner. */
function filmStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `'${p(d.getFullYear() % 100)} ${p(d.getMonth() + 1)} ${p(d.getDate())}`
}

async function loadFonts(): Promise<void> {
  if (!('fonts' in document)) return
  await Promise.allSettled([
    "400 32px 'Geist'", "500 32px 'Geist'", "600 32px 'Geist'", "700 32px 'Geist'",
    "400 32px 'Geist Mono'", "500 32px 'Geist Mono'",
    "400 32px 'Instrument Serif'", "italic 400 32px 'Instrument Serif'",
  ].map((f) => document.fonts.load(f)))
}

/** Five colours from the hero, sampled on a small copy (it's the palette, not the pixels). */
function sampleSwatches(image: CoverImage | undefined): string[] {
  if (!image || !image.width) return []
  try {
    const s = Math.min(1, 96 / Math.max(image.width, image.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(image.width * s))
    c.height = Math.max(1, Math.round(image.height * s))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return []
    ctx.drawImage(image, 0, 0, c.width, c.height)
    return extractSwatches(ctx.getImageData(0, 0, c.width, c.height), 5)
  } catch {
    return []
  }
}

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onClose: () => void
}

export default function CoverStudioModal({ viewerApiRef, onClose }: Props) {
  const { t, i18n } = useTranslation('capture')
  const models = useSceneStore((s) => s.models)
  const score = useValidationStore((s) => s.result?.qualityScore ?? null)
  const watermark = useCaptureStore((s) => s.watermark)

  const initial = useMemo(readPersisted, [])
  const history = useHistory<StudioDoc>(() => ({
    ...initial.doc,
    text: { ...initial.doc.text, title: projectNameFromFile(models[0]?.fileName ?? ''), date: initial.doc.text.date || today(i18n.language) },
    // A score below the honesty bar (70, same as the badge) starts hidden.
    design: { ...initial.doc.design, showScore: initial.doc.design.showScore && (score === null || score >= 70) },
    shots: [],
  }))
  const { doc, update, silently, undo, redo, canUndo, canRedo } = history

  const [capture, setCapture] = useState<CaptureState>(initial.capture)
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logo)
  const [logo, setLogo] = useState<CoverImage | null>(null)
  const [focusCat, setFocusCat] = useState<string | null>(null)
  const [cut, setCut] = useState<CutMode>('none')
  const [cutAt, setCutAt] = useState(0.45)
  const [spread, setSpread] = useState(1)
  const [tab, setTab] = useState<Tab>('design')
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all')
  const [slideKey, setSlideKey] = useState('cover')
  const [fontsReady, setFontsReady] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [recipeBusy, setRecipeBusy] = useState<RecipeId | null>(null)
  const [styles, setStyles] = useState<SavedStyle[]>(readStyles)
  const [measures, setMeasures] = useState<ModelMeasures>({ storeys: null, box: null })
  const [captionOpen, setCaptionOpen] = useState(false)
  const [captionPlatform, setCaptionPlatform] = useState<CaptionPlatform>(platformOf(initial.doc.format))
  const [captionText, setCaptionText] = useState('')
  const [shareable] = useState(canShareFiles)

  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const thumbRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const deckThumbRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  // Pixel size of a 1× capture (the viewer's drawing buffer), for the resolution hint.
  const [shotPx] = useState(() => {
    const c = viewerApiRef.current?.getCanvas()
    return c && c.width > 0 ? { w: c.width, h: c.height } : null
  })

  useEffect(() => { void loadFonts().then(() => setFontsReady(true)) }, [])
  useEffect(() => { writePersisted(doc, capture, logoUrl) }, [doc, capture, logoUrl])
  useEffect(() => {
    let alive = true
    if (!logoUrl) { setLogo(null); return }
    void dataUrlToImage(logoUrl).then((img) => { if (alive) setLogo(img) }).catch(() => setLogo(null))
    return () => { alive = false }
  }, [logoUrl])

  // ── Derived: shots, palette, numbers ─────────────────────────────────────────
  const graded = useGradedShots(doc.shots, doc.design.grade)
  const heroImage = graded.shots[0]?.image
  const swatches = useMemo(() => sampleSwatches(heroImage), [heroImage])
  const imagePalettes = useMemo(() => (swatches.length ? { light: paletteFromSwatches(swatches), dark: paletteFromSwatches(swatches, true) } : null), [swatches])

  const palette: CoverPalette = useMemo(() => {
    if (doc.paletteId === 'custom') return derivePalette(doc.custom)
    if (doc.paletteId === 'image') return imagePalettes?.light ?? paletteById('paper')
    if (doc.paletteId === 'image-dark') return imagePalettes?.dark ?? paletteById('noir')
    return paletteById(doc.paletteId)
  }, [doc.paletteId, doc.custom, imagePalettes])
  const stockPalette = !['custom', 'image', 'image-dark'].includes(doc.paletteId)

  const categories = useMemo(() => physicalCategories(models), [models])
  const focus = categories.find((c) => c.id === focusCat) ?? null

  const stats = useMemo<CoverStats>(() => coverStats(models, doc.design.showScore ? score : null), [models, score, doc.design.showScore])

  const factLabels = useMemo(() => Object.fromEntries(AUTO_FACT_IDS.map((id) => [id, t(`cover.fact.${id}`)])) as Record<AutoFactId, string>, [t])
  const allAuto = useMemo(() => autoFacts(measures, stats, { storeys: true, height: true, size: true, elements: true, score: true }, factLabels, i18n.language, doc.design.showScore), [measures, stats, factLabels, i18n.language, doc.design.showScore])
  const autoValues = useMemo(() => {
    const out: Partial<Record<AutoFactId, string>> = {}
    for (const id of AUTO_FACT_IDS) {
      const f = allAuto.find((x) => x.label === factLabels[id])
      if (f) out[id] = f.value
    }
    return out
  }, [allAuto, factLabels])
  const facts = useMemo(() => mergeFacts(
    customFacts(doc.facts),
    autoFacts(measures, stats, doc.autoFacts, factLabels, i18n.language, doc.design.showScore),
  ), [doc.facts, doc.autoFacts, measures, stats, factLabels, i18n.language, doc.design.showScore])

  const qr = useMemo(() => (doc.design.showQr ? qrMatrix(doc.text.website) : null), [doc.design.showQr, doc.text.website])

  const labels = useMemo<CoverLabels>(() => ({
    client: t('cover.label.client'), location: t('cover.label.location'), date: t('cover.label.date'),
    studio: t('cover.label.studio'), elements: t('cover.label.elements'), categories: t('cover.label.categories'),
    models: t('cover.label.models'), score: t('cover.label.score'), sheet: t('cover.label.sheet'),
    contents: t('cover.label.contents'), thanks: t('cover.label.thanks'),
    concept: t('cover.label.concept'), ofModel: t('cover.label.ofModel'),
    facts: t('cover.label.facts'), palette: t('cover.label.palette'), project: t('cover.label.project'),
    scan: t('cover.label.scan'), stamp: filmStamp(),
  }), [t])

  // ── Capture ──────────────────────────────────────────────────────────────────
  const cap = useCoverCapture(viewerApiRef, {
    palette, look: capture.look, focusCat, focusLabel: focus?.label ?? null, cut, cutAt, spread,
    res: capture.res, light: capture.light, sunAzimuth: capture.sunAzimuth,
  }, t)

  // The spatial tree (storeys) can land after the studio opens: measure again when it does.
  const spatialTrees = useValidationStore((s) => s.spatialTrees)
  useEffect(() => {
    let alive = true
    void cap.measure().then((m) => { if (alive) setMeasures(m) })
    return () => { alive = false }
  }, [models, spatialTrees, cap.measure])

  const addShots = useCallback((shots: StudioDoc['shots']) => {
    if (shots.length) update((d) => ({ ...d, shots: [...d.shots, ...shots] }))
  }, [update])

  // First open: grab the current view so the templates are never empty. It
  // isn't an undo step — undoing it would leave the studio blank.
  const seedId = useRef<string | null>(null)
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    void cap.captureCurrent().then((shots) => {
      if (!shots.length) return
      seedId.current = shots[0].id
      silently((d) => ({ ...d, shots: [...shots, ...d.shots] }))
    })
  }, [cap, silently])

  // ── Specs ────────────────────────────────────────────────────────────────────
  const fmt = COVER_FORMATS[doc.format]
  const content = useMemo(() => ({ ...doc.text, logo }), [doc.text, logo])
  const baseSpec = useMemo<Omit<CoverSpec, 'kind' | 'index' | 'total' | 'shots'>>(() => ({
    width: fmt.width, height: fmt.height, palette, content, stats, labels, watermark,
    focus: focus ? { label: focus.label, count: focus.count } : null,
    facts, swatches, qr, design: doc.design,
  }), [fmt, palette, content, stats, labels, watermark, focus, facts, swatches, qr, doc.design])

  const shotIds = useMemo(() => doc.shots.map((s) => s.id), [doc.shots])
  const plan = useMemo(() => planDeck(shotIds, doc.mode === 'deck' ? doc.deck : NO_DECK), [shotIds, doc.mode, doc.deck])
  const hiddenSet = useMemo(() => new Set(doc.hidden), [doc.hidden])
  const visible = useMemo(() => visibleSlides(plan, hiddenSet), [plan, hiddenSet])
  const specs = useMemo(() => specsForPlan(baseSpec, graded.shots, visible), [baseSpec, graded.shots, visible])
  // Hidden slides still show (greyed) in the strip, numbered as if they were in.
  const specByKey = useMemo(() => {
    const m = new Map<string, CoverSpec>()
    specsForPlan(baseSpec, graded.shots, plan).forEach((s, i) => m.set(plan[i].key, s))
    visible.forEach((p, i) => m.set(p.key, specs[i]))
    return m
  }, [baseSpec, graded.shots, plan, visible, specs])
  const current = specByKey.get(slideKey) ?? specs[0]

  useEffect(() => { if (!specByKey.has(slideKey)) setSlideKey('cover') }, [specByKey, slideKey])

  // ── Painting ─────────────────────────────────────────────────────────────────
  const paint = useCallback((canvas: HTMLCanvasElement | null, spec: CoverSpec, tpl: CoverTemplateId, maxSide: number) => {
    if (!canvas) return
    const s = Math.min(1, maxSide / Math.max(spec.width, spec.height))
    const w = Math.round(spec.width * s)
    const h = Math.round(spec.height * s)
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(s, 0, 0, s, 0, 0)
    renderSlide(ctx, tpl, spec)
  }, [])

  useEffect(() => {
    if (current) paint(previewRef.current, current, doc.template, 1400)
  }, [current, doc.template, paint, fontsReady])

  const shownTemplates = useMemo(() => COVER_TEMPLATE_IDS.filter((id) => category === 'all' || COVER_TEMPLATES[id].category === category), [category])

  // Gallery thumbnails lag the edit a beat: twenty renders per keystroke would
  // make typing a title stutter.
  useEffect(() => {
    const cover = specs[0]
    if (!cover) return
    const timer = setTimeout(() => {
      for (const id of shownTemplates) {
        const own = id === doc.template || !stockPalette ? palette : paletteById(COVER_TEMPLATES[id].defaultPalette)
        paint(thumbRefs.current[id], { ...cover, palette: own }, id, 240)
      }
    }, 120)
    return () => clearTimeout(timer)
  }, [specs, doc.template, palette, stockPalette, paint, fontsReady, shownTemplates])

  useEffect(() => {
    if (doc.mode !== 'deck') return
    const timer = setTimeout(() => {
      for (const p of plan) {
        const s = specByKey.get(p.key)
        if (s) paint(deckThumbRefs.current[p.key] ?? null, s, doc.template, 200)
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [doc.mode, plan, specByKey, doc.template, paint, fontsReady])

  // ── Actions ──────────────────────────────────────────────────────────────────
  const setCaptureField = <K extends keyof CaptureState>(k: K, v: CaptureState[K]) => setCapture((c) => ({ ...c, [k]: v }))

  const pickTemplate = (id: CoverTemplateId) => update((d) => ({
    ...d, template: id,
    // A stock palette follows the template; the user's own colours stay.
    paletteId: stockPalette ? COVER_TEMPLATES[id].defaultPalette : d.paletteId,
  }))

  const pickMode = (m: StudioDoc['mode']) => {
    update((d) => ({ ...d, mode: m }))
    setSlideKey('cover')
  }

  const applyRecipe = async (id: RecipeId) => {
    if (recipeBusy || cap.busy) return
    const r = RECIPES[id]
    const tpl = COVER_TEMPLATES[r.template]
    update((d) => ({
      ...d,
      format: r.format, template: r.template, mode: r.mode,
      paletteId: r.palette ?? (stockPalette ? tpl.defaultPalette : d.paletteId),
      deck: r.deck ? { ...d.deck, ...r.deck } : d.deck,
      design: { ...d.design, ...(r.design ?? {}), grade: r.grade ? GRADE_PRESETS[r.grade] : d.design.grade },
    }))
    setSlideKey('cover')
    const light: LightId = r.light ?? capture.light
    if (r.light) setCapture((c) => ({ ...c, light: r.light!, sunAzimuth: null }))
    // Only the automatic first capture is replaced; the user's own shots stay.
    const onlySeed = doc.shots.length === 1 && doc.shots[0].id === seedId.current
    const have = onlySeed ? 0 : doc.shots.length
    const want = r.mode === 'deck' ? r.steps.length : tpl.shots
    const steps = missingSteps(r, have, want)
    if (!steps.length) return
    setRecipeBusy(id)
    try {
      const shots = await cap.captureSteps(steps, light)
      if (shots.length) update((d) => ({ ...d, shots: onlySeed ? shots : [...d.shots, ...shots] }))
      if (onlySeed && shots.length) seedId.current = null
    } finally {
      setRecipeBusy(null)
    }
  }

  const onLogo = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') setLogoUrl(reader.result) }
    reader.readAsDataURL(file)
  }

  const saveStyle = (name: string) => {
    const s: SavedStyle = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name,
      template: doc.template, paletteId: doc.paletteId, custom: doc.custom, format: doc.format,
      design: doc.design, light: capture.light, sunAzimuth: capture.sunAzimuth,
    }
    const next = [s, ...styles.filter((x) => x.name !== name)]
    setStyles(next)
    writeStyles(next)
    toast(t('cover.styleSaved'), 'success')
  }
  const applyStyle = (s: SavedStyle) => {
    update((d) => ({
      ...d, template: s.template, paletteId: s.paletteId, custom: s.custom, format: s.format,
      // The project's own switches (score, QR) stay as they are.
      design: { ...s.design, showScore: d.design.showScore, showQr: d.design.showQr },
    }))
    setCapture((c) => ({ ...c, light: s.light, sunAzimuth: s.sunAzimuth }))
  }
  const deleteStyle = (id: string) => {
    const next = styles.filter((x) => x.id !== id)
    setStyles(next)
    writeStyles(next)
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  const baseName = `${slug(doc.text.title)}-${doc.format}`

  /** Specs at full quality: waits for any photo-finish regrade still running. */
  const exportSpecs = useCallback(async (): Promise<CoverSpec[]> => specsForPlan(baseSpec, await graded.ready(), visible), [baseSpec, graded, visible])

  const currentIndex = Math.max(0, visible.findIndex((p) => p.key === slideKey))

  const run = async (fn: () => Promise<void>) => {
    if (exporting || cap.busy) return
    setExporting(true)
    try { await fn() } catch (e) {
      log.error('cover export failed:', e)
      toast(t('cover.exportFailed'), 'error')
    } finally { setExporting(false) }
  }

  const exportPng = () => run(async () => {
    const all = await exportSpecs()
    const s = all[currentIndex] ?? all[0]
    if (!s) return
    await downloadBlob(await renderToBlob(s, doc.template, 'image/png'), slideName(baseName, s, all.length > 1, 'png'))
    appBus.emit('capture:exported', { format: 'png', target: 'download' })
    toast(t('cover.exported'), 'success')
  })

  const copyPng = () => run(async () => {
    const all = await exportSpecs()
    const s = all[currentIndex] ?? all[0]
    if (!s) return
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await renderToBlob(s, doc.template, 'image/png') })])
    appBus.emit('capture:exported', { format: 'png', target: 'clipboard' })
    toast(t('cover.copied'), 'success')
  })

  const exportZip = () => run(async () => {
    await downloadBlob(await buildZip(await exportSpecs(), doc.template, baseName), `${baseName}.zip`)
    appBus.emit('capture:exported', { format: 'png', target: 'download' })
    toast(t('cover.exported'), 'success')
  })

  const exportPdf = () => run(async () => {
    await downloadBlob(await buildPdf(await exportSpecs(), doc.template, doc.text.title), `${baseName}.pdf`)
    appBus.emit('capture:exported', { format: 'pdf', target: 'download' })
    toast(t('cover.exported'), 'success')
  })

  const exportPptx = () => run(async () => {
    await downloadBlob(await buildPptx(await exportSpecs(), doc.template, doc.text.title, i18n.language), `${baseName}.pptx`)
    appBus.emit('capture:exported', { format: 'pptx', target: 'download' })
    toast(t('cover.exported'), 'success')
  })

  const makeCaption = useCallback((platform: CaptionPlatform) => buildCaption(
    { ...doc.text, facts },
    platform,
    { by: (studio) => t('cover.captionBy', { studio }), for: (client) => t('cover.captionFor', { client }) },
  ), [doc.text, facts, t])

  const openCaption = () => {
    const platform = platformOf(doc.format)
    setCaptionPlatform(platform)
    setCaptionText(makeCaption(platform))
    setCaptionOpen((v) => !v)
  }

  const share = () => run(async () => {
    const all = await exportSpecs()
    const s = all[currentIndex] ?? all[0]
    if (!s) return
    const file = new File([await renderToBlob(s, doc.template, 'image/png')], slideName(baseName, s, all.length > 1, 'png'), { type: 'image/png' })
    const text = captionOpen ? captionText : makeCaption(platformOf(doc.format))
    try {
      await navigator.share({ files: [file], title: doc.text.title, text })
      appBus.emit('capture:exported', { format: 'png', target: 'share' })
    } catch (e) {
      // The user closing the share sheet is not an error.
      if ((e as DOMException)?.name !== 'AbortError') toast(t('cover.shareFailed'), 'error')
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (typing || !(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ── UI ───────────────────────────────────────────────────────────────────────
  const busy = !!cap.busy || !!recipeBusy
  const wantShots = COVER_TEMPLATES[doc.template].shots
  const deckSocial = doc.mode === 'deck' && !isDeckFormat(doc.format)

  const panel = (() => {
    switch (tab) {
      case 'design':
        return <DesignPanel doc={doc} update={update} imagePalettes={imagePalettes} score={score}
          styles={styles} onSaveStyle={saveStyle} onApplyStyle={applyStyle} onDeleteStyle={deleteStyle} />
      case 'views':
        return <ViewsPanel doc={doc} update={update} busy={cap.busy} shotPx={shotPx}
          res={capture.res} setRes={(r: CaptureRes) => setCaptureField('res', r)}
          light={capture.light} setLight={(l: LightId) => setCapture((c) => ({ ...c, light: l, sunAzimuth: null }))}
          sunAzimuth={capture.sunAzimuth} setSunAzimuth={(a) => setCaptureField('sunAzimuth', a)}
          look={capture.look} setLook={(l: LookId) => setCaptureField('look', l)}
          categories={categories} focusCat={focusCat} setFocusCat={setFocusCat}
          cut={cut} setCut={setCut} cutAt={cutAt} setCutAt={setCutAt} spread={spread} setSpread={setSpread}
          onCurrent={() => void cap.captureCurrent().then(addShots)}
          onAuto={() => void cap.captureAuto().then(addShots)}
          onPack={() => void cap.capturePack().then(addShots)}
          onCut={() => void cap.captureCut().then(addShots)}
          onExplode={() => void cap.captureExploded().then(addShots)}
          onPlans={() => void cap.capturePlans().then(addShots)}
          onFrameFocus={() => void cap.frameFocus()} />
      case 'text':
        return <ContentPanel doc={doc} update={update} autoValues={autoValues} logoUrl={logoUrl} onLogo={onLogo} onLogoRemove={() => setLogoUrl(null)} />
      case 'slides':
        return <SlidesPanel doc={doc} update={update} plan={plan} selected={slideKey} onSelect={setSlideKey} onDeck={() => pickMode('deck')} />
    }
  })()

  // The shared Modal owns the layer, focus, Escape and outside-click; the
  // studio brings its own chrome (bare) because its header carries the mode
  // switch and undo, and it needs the full viewport.
  return (
    <Modal open onClose={onClose} title={t('cover.title')} description={t('cover.subtitle')} size="full" bare
      className="max-w-[1440px] !bg-[var(--surface)] !rounded-[12px]">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-[52px] border-b border-[var(--border)] shrink-0">
          <Icons.Sparkles size={16} />
          <div className="min-w-0 hidden sm:block">
            <div className="text-[14px] font-semibold text-[var(--text)] leading-tight">{t('cover.title')}</div>
            <div className="text-[11.5px] text-[var(--text-dim)] truncate">{t('cover.subtitle')}</div>
          </div>
          <div className="sm:ml-4 flex rounded-[8px] border border-[var(--border)] p-0.5">
            {(['cover', 'deck'] as StudioDoc['mode'][]).map((m) => (
              <button key={m} onClick={() => pickMode(m)} className={`px-3 h-[26px] rounded-[6px] text-[12px] font-medium ${doc.mode === m ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
                {t(m === 'cover' ? 'cover.modeCover' : 'cover.modeDeck')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <button className={cls.icon} onClick={undo} disabled={!canUndo} title={`${t('cover.undo')} (Ctrl+Z)`} aria-label={t('cover.undo')}><Icons.Reset size={15} style={{ transform: 'scaleX(-1)' }} /></button>
            <button className={cls.icon} onClick={redo} disabled={!canRedo} title={`${t('cover.redo')} (Ctrl+Shift+Z)`} aria-label={t('cover.redo')}><Icons.Reset size={15} /></button>
          </div>
          {(busy || exporting || graded.pending) && (
            <span className="text-[11.5px] text-[var(--text-dim)] truncate">
              {exporting ? t('cover.exporting') : recipeBusy ? t('cover.recipeBusy') : cap.busy ? t('cover.autoShotsBusy') : t('cover.grading')}
            </span>
          )}
          <button onClick={onClose} className="ml-auto p-1.5 rounded-[6px] text-[var(--text-dim)] hover:bg-[var(--surface-2)]" title={t('cover.close')} aria-label={t('cover.close')}>
            <Icons.X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* Quick start + templates */}
          <aside className="lg:w-[250px] shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] p-3 lg:overflow-y-auto">
            <div className={cls.section}>{t('cover.quick')}</div>
            <div className="flex lg:grid lg:grid-cols-2 gap-1.5 overflow-x-auto pb-1 mb-3">
              {RECIPE_IDS.map((id) => {
                const Icon = Icons[RECIPE_ICON[id]] as ComponentType<{ size?: number }>
                return (
                  <button key={id} onClick={() => void applyRecipe(id)} disabled={busy}
                    title={t(`cover.recipeHint.${id}`)}
                    className="shrink-0 w-[132px] lg:w-auto text-left rounded-[8px] border border-[var(--border)] px-2 py-1.5 hover:border-[var(--accent)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                    <div className="flex items-start gap-1.5 text-[12px] font-medium text-[var(--text)] leading-tight">
                      <span className="text-[var(--accent)] mt-[1px] shrink-0"><Icon size={13} /></span>
                      <span className="min-w-0">{recipeBusy === id ? t('cover.recipeBusy') : t(`cover.recipe.${id}`)}</span>
                    </div>
                    <div className="text-[10.5px] text-[var(--text-dim)] tabular-nums mt-0.5">{COVER_FORMATS[RECIPES[id].format].ratio}</div>
                  </button>
                )
              })}
            </div>
            <div className={cls.section}>{t('cover.templates')}</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {(['all', ...TEMPLATE_CATEGORIES] as const).map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`${chip(category === c)} h-[24px] px-2 text-[11px]`}>{t(`cover.cat.${c}`)}</button>
              ))}
            </div>
            <div className="flex lg:grid lg:grid-cols-2 gap-2 overflow-x-auto pb-1">
              {shownTemplates.map((id) => (
                <button key={id} onClick={() => pickTemplate(id)} className={`shrink-0 w-[112px] lg:w-auto text-left rounded-[8px] p-1 border ${doc.template === id ? 'border-[var(--accent)]' : 'border-transparent hover:border-[var(--border)]'}`}>
                  <canvas ref={(el) => { thumbRefs.current[id] = el }} className="w-full h-auto rounded-[4px] block bg-[var(--surface-2)]" />
                  <div className="text-[11px] mt-1 px-0.5 text-[var(--text)] truncate">{t(`cover.tpl.${id}`)}</div>
                </button>
              ))}
            </div>
          </aside>

          {/* Preview */}
          <main className="flex-1 min-w-0 min-h-[320px] flex flex-col bg-[var(--bg)]">
            <div className="flex-1 min-h-0 flex items-center justify-center p-4 lg:p-6">
              <canvas ref={previewRef} className="max-w-full max-h-full w-auto h-auto shadow-[0_20px_60px_rgba(0,0,0,0.35)] rounded-[3px]" style={{ aspectRatio: `${fmt.width} / ${fmt.height}` }} />
            </div>
            {doc.shots.length === 0 && !busy && <div className="text-center text-[12px] text-[var(--text-dim)] pb-2">{t('cover.noShots')}</div>}
            {doc.shots.length > 0 && doc.shots.length < wantShots && doc.mode === 'cover' && (
              <div className="text-center text-[12px] text-[var(--text-dim)] pb-2">{t('cover.needsMore', { count: wantShots })}</div>
            )}
            {doc.mode === 'deck' && (
              <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 flex gap-2 overflow-x-auto">
                {plan.map((p: SlidePlan) => {
                  const off = p.kind !== 'cover' && hiddenSet.has(p.key)
                  return (
                    <div key={p.key} className={`relative shrink-0 rounded-[5px] p-0.5 border ${p.key === slideKey ? 'border-[var(--accent)]' : 'border-transparent'} ${off ? 'opacity-35' : ''}`}>
                      <button onClick={() => setSlideKey(p.key)} className="block" title={t(`cover.slide.${p.kind}`)}>
                        <canvas ref={(el) => { deckThumbRefs.current[p.key] = el }} className="h-[64px] w-auto block rounded-[3px]" />
                      </button>
                      {p.kind !== 'cover' && (
                        <button onClick={() => update((d) => ({ ...d, hidden: off ? d.hidden.filter((k) => k !== p.key) : [...d.hidden, p.key] }))}
                          className="absolute top-1 right-1 p-0.5 rounded-[4px] bg-black/60 text-white" title={t(off ? 'cover.slideShow' : 'cover.slideHide')} aria-label={t(off ? 'cover.slideShow' : 'cover.slideHide')}>
                          {off ? <Icons.EyeOff size={11} /> : <Icons.Eye size={11} />}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </main>

          {/* Controls */}
          <aside className="lg:w-[350px] shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col lg:min-h-0">
            <div className="flex border-b border-[var(--border)] shrink-0" role="tablist">
              {TABS.map((id) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`flex-1 h-[38px] text-[12px] font-medium border-b-2 -mb-px ${tab === id ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                  {t(`cover.tab.${id}`)}{id === 'views' && doc.shots.length ? <span className="ml-1 text-[10.5px] opacity-60 tabular-nums">{doc.shots.length}</span> : null}
                </button>
              ))}
            </div>
            {/* Phones: the whole studio scrolls as one column, so the panel takes its natural height. */}
            <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto p-4">{panel}</div>
          </aside>
        </div>

        {/* Caption */}
        {captionOpen && (
          <div className="shrink-0 border-t border-[var(--border)] px-4 py-3 bg-[var(--surface)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-[12px] font-semibold text-[var(--text)]">{t('cover.captionTitle')}</div>
              <div className="flex gap-1">
                {(['pinterest', 'instagram', 'linkedin'] as CaptionPlatform[]).map((pl) => (
                  <button key={pl} onClick={() => { setCaptionPlatform(pl); setCaptionText(makeCaption(pl)) }} className={`${chip(captionPlatform === pl)} h-[24px] px-2 text-[11px]`}>{t(`cover.platform.${pl}`)}</button>
                ))}
              </div>
              <span className="text-[11px] text-[var(--text-dim)] hidden md:inline">{t('cover.captionHint')}</span>
              <button className={`${cls.btnSm} ml-auto`} onClick={() => { void navigator.clipboard.writeText(captionText).then(() => toast(t('cover.captionCopied'), 'success')) }}><Icons.Copy size={12} />{t('cover.captionCopy')}</button>
            </div>
            <textarea className={`${cls.input} h-[110px] py-1.5 resize-y font-mono text-[11.5px]`} value={captionText} onChange={(e) => setCaptionText(e.target.value)} aria-label={t('cover.captionTitle')} />
          </div>
        )}

        {/* Export bar */}
        <div className="shrink-0 border-t border-[var(--border)] px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-[var(--text-dim)] tabular-nums">{fmt.width}×{fmt.height}px{specs.length > 1 ? ` · ${t('cover.slideCount', { count: specs.length })}` : ''}</span>
          {deckSocial && <span className="text-[11.5px] text-[var(--text-dim)] hidden md:inline">· {t('cover.carouselHint')}</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            <button className={cls.btn} onClick={openCaption} aria-pressed={captionOpen}><Icons.TypeTool size={13} />{t('cover.postText')}</button>
            {shareable && <button className={cls.btn} onClick={() => void share()} disabled={exporting || busy}><Icons.Share size={13} />{t('cover.share')}</button>}
            <button className={cls.btn} onClick={() => void copyPng()} disabled={exporting || busy}><Icons.Copy size={13} />{t('cover.copy')}</button>
            <button className={cls.btn} onClick={() => void exportPng()} disabled={exporting || busy}><Icons.Download size={13} />{t('cover.exportPng')}</button>
            {specs.length > 1 && <button className={cls.btn} onClick={() => void exportZip()} disabled={exporting || busy}>{t('cover.exportZip')}</button>}
            <button className={deckSocial ? cls.primary : cls.btn} onClick={() => void exportPdf()} disabled={exporting || busy}>{t('cover.exportPdf')}</button>
            <button className={deckSocial ? cls.btn : cls.primary} onClick={() => void exportPptx()} disabled={exporting || busy}>{t('cover.exportPptx')}</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
