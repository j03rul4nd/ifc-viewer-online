// ─── Sound → clip ──────────────────────────────────────────────────────────────
// The TikTok way round: start from the SOUND, end with a clip of the model cut
// to it. One card, four steps, each one obvious:
//
//   1. Sound   — paste a TikTok link (or just paste anywhere in the studio).
//                Sounds already analysed in this browser skip step 2.
//   2. Beat    — the app listens while it plays: a TikTok tab on a computer,
//                the microphone on a phone; or a file; or tap along. The
//                waveform shows the beats and the drop, and a click moves it.
//   3. Style   — reveal on the drop, loop, before/after, POV, facts; length.
//   4. Generate — shots rendered to the sound's tempo, reveal on the drop,
//                ending on a bar. Then: export, and where to start the sound.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClipStudioStore } from '../../stores/clipStudioStore'
import { toast } from '../../stores/toastStore'
import { analyseSound, clipFromSound, currentModelFacts, type ReadySound } from '../../lib/capture/studio-actions'
import { canCapture, startCapture, type CaptureSource, type Recording } from '../../lib/capture/sound-capture'
import { enrichTikTokLink, formatStart, parseTikTokUrl, trendingSoundsUrl, type SoundLink } from '../../lib/capture/tiktok-link'
import { cutForSound, moveDrop, peaks, recallSound, recentSounds } from '../../lib/capture/sound-clip'
import { metaFromTaps, type MusicMeta } from '../../lib/capture/music-analysis'
import { TEMPLATE_IDS, type TemplateContext, type TemplateId } from '../../lib/capture/viral-templates'
import { BUILT_IN_RECIPES } from '../../lib/director/recipe'
import { NothingToPresentError } from '../../lib/director/generate'
import { useDirectorLabels } from './StudioDirector'

type Step = 'link' | 'beat' | 'style' | 'done'

const LENGTHS = [10, 15, 20, 30] as const

const isPhone = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/** Tempo detectors sometimes lock to half or double time; one click fixes it. */
function scaleTempo(m: MusicMeta, factor: 0.5 | 2): MusicMeta {
  const beatSec = m.beatSec / factor
  const next = { ...m, beatSec, bpm: 60 / beatSec, gridOffsetSec: m.gridOffsetSec % beatSec }
  return moveDrop(next, m.dropSec)
}

export function SoundToClip({ run, busy, canRender }: {
  run: (fn: (signal: AbortSignal) => Promise<void>) => Promise<void>
  busy: boolean
  canRender: boolean
}) {
  const { t, i18n } = useTranslation('capture')
  const labels = useDirectorLabels()
  const offset = useClipStudioStore((s) => s.project.audio.offsetSec)

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('link')
  const [url, setUrl] = useState('')
  const [link, setLink] = useState<SoundLink | null>(null)
  const [sound, setSound] = useState<ReadySound | null>(null)
  const [wave, setWave] = useState<Float32Array | null>(null)
  const [remembered, setRemembered] = useState(false)
  const [recording, setRecording] = useState<{ source: CaptureSource; rec: Recording } | null>(null)
  const [tapping, setTapping] = useState<{ t0: number; taps: number[]; drop: number | null } | null>(null)
  const [style, setStyle] = useState<TemplateId>('dropReveal')
  const [length, setLength] = useState<number>(15)
  const [embed, setEmbed] = useState(true)
  const [wordCaptions, setWordCaptions] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const latest = useRef('')

  // ── 1. Sound ───────────────────────────────────────────────────────────────
  const takeLink = useCallback(async (v: string) => {
    setUrl(v)
    latest.current = v
    const parsed = parseTikTokUrl(v)
    setLink(parsed)
    setSound(null); setWave(null); setRemembered(false)
    if (!parsed) return
    setOpen(true)
    const known = recallSound(parsed)
    if (known) {
      setSound({ link: parsed, name: parsed.title ?? known.link.title ?? t('studio.tiktok.untitled'), music: known.music, buffer: null })
      setRemembered(true)
      setStep('style')
    } else {
      setStep('beat')
    }
    const rich = await enrichTikTokLink(parsed)
    if (latest.current === v) setLink(rich)
  }, [t])

  // Paste a TikTok link anywhere in the studio and the flow opens with it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, [contenteditable="true"]')) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (parseTikTokUrl(text)) { e.preventDefault(); void takeLink(text) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [takeLink])

  // ── 2. Beat ────────────────────────────────────────────────────────────────
  const name = link?.title ?? t('studio.tiktok.untitled')

  const fromBlob = async (blob: Blob, trim: boolean, clean: boolean) => {
    const { buffer, music, mono } = await analyseSound(blob, trim)
    setSound({ link, name, music, buffer: clean ? buffer : null })
    setEmbed(clean)
    setWave(peaks(mono, 240))
    setStep('style')
  }

  const record = async (source: CaptureSource) => {
    let rec: Recording
    try {
      rec = await startCapture(source)
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      if (code === 'NO_AUDIO') toast(t('studio.tiktok.noTabAudio'), 'warning')
      else if (!(e instanceof DOMException && e.name === 'NotAllowedError')) toast(t('studio.sound.failed', { reason: code }), 'error')
      return
    }
    setRecording({ source, rec })
    try {
      await fromBlob(await rec.done, true, source === 'tab')
    } catch (e) {
      toast(t('studio.sound.failed', { reason: e instanceof Error ? e.message : String(e) }), 'error')
    } finally {
      setRecording(null)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try { await fromBlob(file, false, true) } catch (e) {
      toast(t('studio.sound.failed', { reason: e instanceof Error ? e.message : String(e) }), 'error')
    }
  }

  const tapNow = () => (performance.now() - (tapping?.t0 ?? 0)) / 1000
  const tapMeta = tapping ? metaFromTaps(tapping.taps, tapping.drop) : null
  const finishTaps = () => {
    if (!tapMeta) return
    setSound({ link, name, music: tapMeta, buffer: null })
    setEmbed(false)
    setTapping(null)
    setStep('style')
  }

  const editMusic = (fn: (m: MusicMeta) => MusicMeta) => setSound((s) => (s ? { ...s, music: fn(s.music) } : s))

  // ── 3–4. Style and generate ────────────────────────────────────────────────
  const templateLabels = (): TemplateContext['labels'] => {
    const f = currentModelFacts()
    const facts = [
      f.elementCount ? t('studio.templates.fact.elements', { n: f.elementCount.toLocaleString() }) : null,
      typeof f.healthScore === 'number' ? t('studio.templates.fact.health', { n: Math.round(f.healthScore) }) : null,
    ].filter((x): x is string => !!x)
    return {
      waitForIt: t('studio.templates.copy.waitForIt'), before: t('studio.templates.copy.before'), after: t('studio.templates.copy.after'),
      pov: t('studio.templates.copy.pov'), facts, factsTitle: t('studio.templates.copy.factsTitle', { n: facts.length }),
    }
  }

  const generate = () => {
    if (!sound) return
    const base = BUILT_IN_RECIPES.find((r) => r.id === 'tiktok')
    if (!base) return
    const ready: ReadySound = { ...sound, buffer: embed ? sound.buffer : null }
    void run(async (signal) => {
      try {
        await clipFromSound(ready, style, { ...base, targetSec: length }, i18n.language, labels, templateLabels(), signal, wordCaptions)
        setStep('done')
        toast(t('studio.flow.generated'), 'success')
      } catch (e) {
        if (e instanceof NothingToPresentError) { toast(t('studio.needModel'), 'warning'); return }
        throw e
      }
    })
  }

  const cut = useMemo(() => (sound ? cutForSound(sound.music, length) : null), [sound, length])
  const recent = useMemo(() => (open && step === 'link' ? recentSounds().slice(0, 4) : []), [open, step])
  const reset = () => { setStep('link'); setUrl(''); setLink(null); setSound(null); setWave(null); setRemembered(false) }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button type="button" className="studio-flow-cta" onClick={() => setOpen(true)}>
        <span className="text-[20px]" aria-hidden="true">🎵</span>
        <span className="flex min-w-0 flex-col text-left">
          <span className="text-[13px] font-semibold">{t('studio.flow.cta')}</span>
          <span className="text-[11px] text-[var(--text-faint)]">{t('studio.flow.ctaHint')}</span>
        </span>
      </button>
    )
  }

  const steps: Step[] = ['link', 'beat', 'style', 'done']
  const stepIdx = steps.indexOf(step)

  return (
    <section className="studio-flow flex flex-col gap-2.5" aria-label={t('studio.flow.cta')}>
      <div className="flex items-center justify-between">
        <h3 className="studio-h">🎵 {t('studio.flow.cta')}</h3>
        <button type="button" className="studio-link" onClick={() => { reset(); setOpen(false) }}>{t('studio.cancel')}</button>
      </div>
      <ol className="studio-flow-steps" aria-label={t('studio.flow.progress')}>
        {steps.map((s, i) => (
          <li key={s} data-state={i < stepIdx ? 'done' : i === stepIdx ? 'current' : 'todo'} aria-current={i === stepIdx ? 'step' : undefined}>
            {t(`studio.flow.steps.${s}`)}
          </li>
        ))}
      </ol>

      {/* 1 · Sound */}
      <input className="studio-input" type="url" inputMode="url" placeholder={t('studio.tiktok.placeholder')} value={url}
        onChange={(e) => { void takeLink(e.target.value) }} disabled={busy} />
      {url && !link && <p className="text-[11px] text-[var(--warn)]">{t('studio.tiktok.invalid')}</p>}
      {link && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-2,rgba(127,127,127,.08))] p-2">
          {link.cover ? <img src={link.cover} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-black/30 text-[18px]" aria-hidden="true">♪</span>}
          <div className="min-w-0 flex-1 text-[12px]">
            <div className="truncate font-medium">{name}</div>
            <div className="truncate text-[11px] text-[var(--text-faint)]">
              {sound ? `${Math.round(sound.music.bpm)} BPM · ${t('studio.sound.drop', { sec: sound.music.dropSec.toFixed(1) })}` : link.author ? `@${link.author}` : 'TikTok'}
              {remembered && ` · ${t('studio.flow.remembered')}`}
            </div>
          </div>
          <a className="studio-link shrink-0" href={link.url} target="_blank" rel="noopener noreferrer">{t('studio.tiktok.open')}</a>
        </div>
      )}
      {step === 'link' && (
        <>
          <a className="studio-btn justify-center" href={trendingSoundsUrl(navigator.language.split('-')[1] ?? 'ES')} target="_blank" rel="noopener noreferrer">🔥 {t('studio.tiktok.trending')}</a>
          {recent.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--text-faint)]">{t('studio.flow.recent')}</span>
              {recent.map((r) => (
                <button key={r.link.url} type="button" className="studio-chip justify-between" onClick={() => void takeLink(decodeURI(r.link.url))}>
                  <span className="truncate">{r.link.title ?? t('studio.tiktok.untitled')}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--text-faint)]">{Math.round(r.music.bpm)} BPM</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.flow.pasteHint')}</p>
        </>
      )}

      {/* 2 · Beat */}
      {step === 'beat' && link && !recording && !tapping && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] font-medium">{t('studio.flow.beatQ')}</p>
          {(isPhone() ? (['mic', 'tab'] as const) : (['tab', 'mic'] as const)).filter(canCapture).map((src, i) => (
            <button key={src} type="button" className={`studio-btn ${i === 0 ? 'studio-btn--accent' : ''}`} disabled={busy} onClick={() => void record(src)}>
              {src === 'tab' ? `🎧 ${t('studio.tiktok.captureTab')}` : `🎤 ${t('studio.tiktok.captureMic')}`}
            </button>
          ))}
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className="studio-btn justify-center" disabled={busy} onClick={() => fileRef.current?.click()}>📁 {t('studio.flow.haveFile')}</button>
            <button type="button" className="studio-btn justify-center" disabled={busy} onClick={() => setTapping({ t0: performance.now(), taps: [], drop: null })}>⏱ {t('studio.flow.tap')}</button>
          </div>
          <input ref={fileRef} type="file" accept="audio/*,video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t(isPhone() ? 'studio.flow.beatHintPhone' : 'studio.flow.beatHintDesktop')}</p>
        </div>
      )}
      {recording && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] p-2.5">
          <span className="studio-flow-rec text-[12px] font-medium">{t(recording.source === 'tab' ? 'studio.tiktok.recordingTab' : 'studio.tiktok.recordingMic')}</span>
          <button type="button" className="studio-btn studio-btn--accent" onClick={() => recording.rec.stop()}>{t('studio.tiktok.stopRecording')}</button>
        </div>
      )}
      {tapping && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.tiktok.tapHint')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className="studio-btn studio-btn--accent h-14 justify-center text-[15px]" onPointerDown={() => setTapping((s) => s && { ...s, taps: [...s.taps, tapNow()] })}>
              {t('studio.tiktok.tap')} ({tapping.taps.length})
            </button>
            <button type="button" className="studio-btn h-14 justify-center text-[15px]" aria-pressed={tapping.drop !== null} onPointerDown={() => setTapping((s) => s && { ...s, drop: tapNow() })}>💥 {t('studio.tiktok.drop')}</button>
          </div>
          <span className="font-mono text-[11px] text-[var(--text-dim)]">{tapMeta ? `${Math.round(tapMeta.bpm)} BPM` : t('studio.tiktok.keepTapping')}</span>
          <div className="flex gap-1.5">
            <button type="button" className="studio-btn flex-1" onClick={() => setTapping(null)}>{t('studio.cancel')}</button>
            <button type="button" className="studio-btn studio-btn--accent flex-1" disabled={!tapMeta || tapping.drop === null} onClick={finishTaps}>{t('studio.flow.next')}</button>
          </div>
        </div>
      )}

      {/* 3 · Style (with the beat, editable) */}
      {step === 'style' && sound && cut && (
        <div className="flex flex-col gap-2">
          <BeatStrip music={sound.music} wave={wave} cut={cut} onDrop={(sec) => editMusic((m) => moveDrop(m, sec))} label={t('studio.flow.waveHint')} />
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="whitespace-nowrap text-[var(--text-dim)]">{t('studio.flow.tempo', { bpm: Math.round(sound.music.bpm) })}</span>
            <button type="button" className="studio-chip" onClick={() => editMusic((m) => scaleTempo(m, 0.5))} title={t('studio.flow.halfHint')}>½×</button>
            <button type="button" className="studio-chip" onClick={() => editMusic((m) => scaleTempo(m, 2))} title={t('studio.flow.doubleHint')}>2×</button>
            <button type="button" className="studio-link ml-auto" onClick={() => setStep('beat')}>{t('studio.flow.relisten')}</button>
          </div>

          <span className="text-[11.5px] text-[var(--text-dim)]">{t('studio.flow.styleQ')}</span>
          <div className="grid grid-cols-1 gap-1">
            {TEMPLATE_IDS.map((id) => (
              <button key={id} type="button" className="studio-flow-option" aria-pressed={style === id} onClick={() => setStyle(id)}>
                <span className="font-medium">{t(`studio.templates.${id}.name`)}</span>
                <span className="text-[11px] text-[var(--text-faint)]">{t(`studio.templates.${id}.hint`)}</span>
              </button>
            ))}
          </div>

          <span className="text-[11.5px] text-[var(--text-dim)]">{t('studio.flow.length')}</span>
          <div className="flex gap-1">
            {LENGTHS.map((l) => (
              <button key={l} type="button" className="studio-chip flex-1 justify-center" aria-pressed={length === l} onClick={() => setLength(l)}>{l}s</button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">
            {t('studio.flow.window', { from: formatStart(cut.offsetSec), len: cut.durationSec.toFixed(0), drop: cut.dropAtSec.toFixed(1) })}
          </p>

          <label className="flex items-start gap-2 text-[11.5px] text-[var(--text-dim)]">
            <input type="checkbox" className="mt-0.5" checked={wordCaptions} onChange={(e) => setWordCaptions(e.target.checked)} />
            <span>{t('studio.beatCaptions.label')}<br /><span className="text-[11px] text-[var(--text-faint)]">{t('studio.beatCaptions.hint')}</span></span>
          </label>

          {sound.buffer && (
            <label className="flex items-start gap-2 text-[11.5px] text-[var(--text-dim)]">
              <input type="checkbox" className="mt-0.5" checked={embed} onChange={(e) => setEmbed(e.target.checked)} />
              <span>{t('studio.flow.embed')}<br /><span className="text-[11px] text-[var(--text-faint)]">{t('studio.flow.embedHint')}</span></span>
            </label>
          )}

          <button type="button" className="studio-btn studio-btn--accent h-11 justify-center text-[14px]" disabled={busy || !canRender} onClick={generate}>
            ✨ {t('studio.flow.generate')}
          </button>
          {!canRender && <p className="text-[11px] text-[var(--warn)]">{t('studio.needModel')}</p>}
        </div>
      )}

      {/* 4 · Done */}
      {step === 'done' && sound && (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] p-2.5 text-[12px] leading-relaxed">
            {embed && sound.buffer ? t('studio.flow.doneEmbedded') : t('studio.tiktok.howTo', { start: formatStart(offset), bpm: Math.round(sound.music.bpm) })}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className="studio-btn justify-center" onClick={() => setStep('style')}>{t('studio.flow.tryStyle')}</button>
            <button type="button" className="studio-btn justify-center" onClick={reset}>{t('studio.flow.another')}</button>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * The sound as a strip: waveform (when we heard it), the beat grid, the
 * window the clip uses, and the drop — click to move the drop.
 */
function BeatStrip({ music, wave, cut, onDrop, label }: {
  music: MusicMeta
  wave: Float32Array | null
  cut: { offsetSec: number; durationSec: number }
  onDrop: (sec: number) => void
  label: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const span = Math.max(music.durationSec, cut.offsetSec + cut.durationSec, 1)

  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth, h = c.clientHeight
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const x = (sec: number) => (sec / span) * w
    const css = getComputedStyle(c)
    const accent = css.getPropertyValue('--accent').trim() || '#7c83ff'
    const faint = css.getPropertyValue('--text-faint').trim() || '#888'
    // Window the clip uses.
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.18
    ctx.fillRect(x(cut.offsetSec), 0, x(cut.durationSec), h)
    // Beats (bars stronger).
    for (let t = music.gridOffsetSec, k = 0; t < span; t += music.beatSec, k++) {
      ctx.fillStyle = faint
      ctx.globalAlpha = k % 4 === 0 ? 0.55 : 0.18
      ctx.fillRect(x(t), 0, 1, h)
    }
    ctx.globalAlpha = 1
    // Waveform.
    if (wave) {
      ctx.fillStyle = css.getPropertyValue('--text').trim() || '#ddd'
      ctx.globalAlpha = 0.7
      const colW = (x(music.durationSec)) / wave.length
      for (let i = 0; i < wave.length; i++) {
        const bh = Math.max(1, wave[i] * (h - 8))
        ctx.fillRect(i * colW, (h - bh) / 2, Math.max(1, colW - 0.5), bh)
      }
      ctx.globalAlpha = 1
    }
    // Drop.
    ctx.fillStyle = '#ff4d6d'
    ctx.fillRect(x(music.dropSec) - 1, 0, 2, h)
    ctx.beginPath(); ctx.arc(x(music.dropSec), 6, 4, 0, Math.PI * 2); ctx.fill()
  }, [music, wave, cut, span])

  return (
    <canvas
      ref={ref}
      className="h-14 w-full cursor-crosshair rounded-md bg-black/25"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(music.durationSec)}
      aria-valuenow={Math.round(music.dropSec * 10) / 10}
      tabIndex={0}
      title={label}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onDrop(((e.clientX - r.left) / r.width) * span)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); onDrop(music.dropSec - music.beatSec) }
        if (e.key === 'ArrowRight') { e.preventDefault(); onDrop(music.dropSec + music.beatSec) }
      }}
    />
  )
}
