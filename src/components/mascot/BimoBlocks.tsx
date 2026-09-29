import React from 'react'
import Bimo from './Bimo'
import { bimoCopy, type BimoCopy } from './bimo-copy'
import { emotionForScore, type BimoEmotion } from './bimo-face'
import './bimo.css'

// ─── Bimo blocks ─────────────────────────────────────────────────────────────
// Reader-facing blocks where the mascot does a job, not decoration:
//
//   BimoTip        — a short aside in Bimo's voice ("do this before export").
//   BimoQuiz       — check-your-understanding; Bimo reacts per answer.
//   BimoChecklist  — a procedure the reader ticks off; persists locally.
//   BimoFeedback   — "was this useful?" at the end of a post.
//
// Used by the blog (Blog.tsx → RenderBlock) and, BimoTip/BimoChecklist, by
// app surfaces. See docs/BLOG_COMPONENTS.md for when to use each.

type WithLang = { lang?: string }

// ── storage (per-viewer convenience only; never required) ────────────────────

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function writeJSON(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

// ── pure helpers (tested) ────────────────────────────────────────────────────

export function quizVerdict(right: number, total: number): keyof BimoCopy['verdict'] {
  if (total <= 0) return 'low'
  const r = right / total
  if (r >= 1) return 'perfect'
  if (r >= 0.7) return 'good'
  if (r >= 0.4) return 'ok'
  return 'low'
}

export function checklistEmotion(done: number, total: number): BimoEmotion {
  if (total <= 0 || done <= 0) return 'curious'
  if (done >= total) return 'excited'
  return emotionForScore((done / total) * 100) === 'sad' ? 'thinking' : emotionForScore((done / total) * 100)
}

// ── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#5E6AD2', '#8B93E8', '#FF8FB1', '#FFD66B', '#30A46C', '#A9B0FF']

export function Confetti({ fire }: { fire: number }) {
  if (!fire) return null
  return (
    <span key={fire} className="bimo-confetti" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 7) * 45}ms`,
            animationDuration: `${1.2 + ((i * 13) % 9) / 10}s`,
          }}
        />
      ))}
    </span>
  )
}

// ── BimoTip ──────────────────────────────────────────────────────────────────

export function BimoTip({ emotion = 'happy', title, children, lang = 'en' }: WithLang & {
  emotion?: BimoEmotion
  title?: string
  children: React.ReactNode
}) {
  const copy = bimoCopy(lang)
  const [mood, setMood] = React.useState<BimoEmotion>(emotion)
  React.useEffect(() => setMood(emotion), [emotion])
  return (
    <aside role="note" aria-label={title ?? copy.says} className="my-7 flex items-start gap-3 sm:gap-4">
      <Bimo emotion={mood} size={64} interactive label={copy.boop} onBoop={() => setMood('love')} />
      <div className="bimo-bubble min-w-0 flex-1 px-4 py-3.5 sm:px-5">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent-2)]">
          {title ?? copy.says}
        </p>
        <div className="text-[14.5px] leading-[1.72] text-[var(--text-dim)]">{children}</div>
      </div>
    </aside>
  )
}

// ── BimoQuiz ─────────────────────────────────────────────────────────────────

export type BimoQuizQuestion = {
  q: string
  options: string[]
  /** Index into options. */
  answer: number
  /** Why — shown after answering, right or wrong. */
  why?: React.ReactNode
}

export function BimoQuiz({ title, questions, lang = 'en' }: WithLang & { title?: string; questions: BimoQuizQuestion[] }) {
  const copy = bimoCopy(lang)
  const headingId = React.useId()
  const [idx, setIdx] = React.useState(0)
  const [picked, setPicked] = React.useState<number | null>(null)
  const [right, setRight] = React.useState(0)
  const [finished, setFinished] = React.useState(false)
  const [confetti, setConfetti] = React.useState(0)
  const [shakeKey, setShakeKey] = React.useState(0)
  const nextRef = React.useRef<HTMLButtonElement>(null)

  const total = questions.length
  const q = questions[idx]
  const answered = picked !== null
  const isRight = answered && picked === q?.answer

  const emotion: BimoEmotion = finished
    ? emotionForScore((right / Math.max(1, total)) * 100)
    : !answered ? 'thinking' : isRight ? 'happy' : 'sad'

  React.useEffect(() => { if (answered) nextRef.current?.focus({ preventScroll: true }) }, [answered])

  if (!q && !finished) return null

  const choose = (i: number) => {
    if (answered) return
    setPicked(i)
    if (i === q.answer) setRight((r) => r + 1)
    else setShakeKey((k) => k + 1)
  }
  const next = () => {
    if (idx + 1 >= total) {
      setFinished(true)
      if (quizVerdict(right, total) === 'perfect' || quizVerdict(right, total) === 'good') setConfetti((c) => c + 1)
      return
    }
    setIdx(idx + 1)
    setPicked(null)
  }
  const retry = () => { setIdx(0); setPicked(null); setRight(0); setFinished(false) }

  return (
    <section
      aria-labelledby={headingId}
      className="relative my-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 sm:px-6"
    >
      <Confetti fire={confetti} />
      <div className="flex items-start gap-4">
        <Bimo emotion={emotion} size={60} interactive label={copy.boop} />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-2)]">
            {title ?? 'Quiz'}
          </h2>
          {!finished && (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11.5px] font-mono text-[var(--text-faint,var(--text-dim))]">{copy.question(idx + 1, total)}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border)]" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                    style={{ width: `${((idx + (answered ? 1 : 0)) / total) * 100}%` }}
                  />
                </span>
              </div>
              <p className="mt-2.5 text-[15.5px] font-medium leading-[1.5] text-[var(--text)]">{q.q}</p>
            </>
          )}
        </div>
      </div>

      {!finished ? (
        <>
          <div role="radiogroup" aria-label={q.q} className="mt-4 grid gap-2" key={`${idx}-${shakeKey}`}>
            {q.options.map((opt, i) => {
              const state = !answered ? 'idle' : i === q.answer ? 'right' : i === picked ? 'wrong' : 'dim'
              const color = state === 'right' ? 'var(--ok)' : state === 'wrong' ? 'var(--danger)' : undefined
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={picked === i}
                  disabled={answered}
                  onClick={() => choose(i)}
                  className={`bimo-choice flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14.5px] leading-[1.5] ${state === 'wrong' ? 'bimo-shake-x' : ''} ${state === 'right' ? 'bimo-check-pop' : ''}`}
                  style={{
                    borderColor: color ? `color-mix(in srgb, ${color} 55%, var(--border))` : 'var(--border)',
                    background: color ? `color-mix(in srgb, ${color} 9%, var(--surface))` : 'var(--surface-2, var(--surface))',
                    color: state === 'dim' ? 'var(--text-dim)' : 'var(--text)',
                    opacity: state === 'dim' ? 0.6 : 1,
                  }}
                >
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[11px] font-bold font-mono"
                    style={{ borderColor: color ?? 'var(--border-strong, var(--border))', color: color ?? 'var(--text-dim)' }}
                    aria-hidden="true"
                  >
                    {state === 'right' ? '✓' : state === 'wrong' ? '✕' : String.fromCharCode(65 + i)}
                  </span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
          <div aria-live="polite" className="min-h-0">
            {answered && (
              <div className="bimo-bubble bimo-bubble-notail mt-4 px-4 py-3 text-[14px] leading-[1.65] text-[var(--text-dim)]" style={{ borderRadius: 12 }}>
                <strong style={{ color: isRight ? 'var(--ok)' : 'var(--warn)' }}>{isRight ? copy.correct : copy.notQuite}</strong>
                {q.why && <> {q.why}</>}
              </div>
            )}
          </div>
          {answered && (
            <div className="mt-4 flex justify-end">
              <button
                ref={nextRef}
                type="button"
                onClick={next}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-px active:scale-95"
              >
                {idx + 1 >= total ? copy.seeResult : copy.next} →
              </button>
            </div>
          )}
        </>
      ) : (
        <div aria-live="polite" className="mt-4 text-center">
          <p className="text-[28px] font-bold tracking-tight text-[var(--text)] bimo-check-pop">{copy.score(right, total)}</p>
          <p className="mt-1 text-[14.5px] text-[var(--text-dim)]">{copy.verdict[quizVerdict(right, total)]}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text)] transition-colors hover:border-[var(--accent-2)]"
          >
            ↻ {copy.retry}
          </button>
        </div>
      )}
    </section>
  )
}

// ── BimoChecklist ────────────────────────────────────────────────────────────

export type BimoChecklistItem = { label: React.ReactNode; hint?: React.ReactNode }

export function BimoChecklist({ id, title, items, lang = 'en', compact = false }: WithLang & {
  /** Stable key for persistence (e.g. `${slug}:export-checklist`). */
  id: string
  title?: string
  items: BimoChecklistItem[]
  compact?: boolean
}) {
  const copy = bimoCopy(lang)
  const storageKey = `bimo:checklist:${id}`
  const headingId = React.useId()
  const [done, setDone] = React.useState<boolean[]>(() => items.map(() => false))
  const [confetti, setConfetti] = React.useState(0)
  const [popped, setPopped] = React.useState<number | null>(null)

  React.useEffect(() => {
    const saved = readJSON<boolean[]>(storageKey, [])
    if (saved.length) setDone(items.map((_, i) => !!saved[i]))
  }, [storageKey, items.length])

  const count = done.filter(Boolean).length
  const total = items.length
  const pct = total ? count / total : 0

  const toggle = (i: number) => {
    const next = done.slice()
    next[i] = !next[i]
    setDone(next)
    setPopped(next[i] ? i : null)
    writeJSON(storageKey, next)
    if (next[i] && next.every(Boolean)) setConfetti((c) => c + 1)
  }
  const reset = () => { const z = items.map(() => false); setDone(z); writeJSON(storageKey, z) }

  const R = 17, C = 2 * Math.PI * R

  return (
    <section
      aria-labelledby={headingId}
      className={`relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] ${compact ? 'px-4 py-4' : 'my-8 px-5 py-5 sm:px-6'}`}
    >
      <Confetti fire={confetti} />
      <div className="flex items-center gap-3">
        <Bimo emotion={checklistEmotion(count, total)} size={compact ? 44 : 56} interactive label={copy.boop} />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-2)]">
            {title ?? 'Checklist'}
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-dim)]" aria-live="polite">
            {count === total && total > 0 ? copy.allDone : copy.done(count, total)}
          </p>
        </div>
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0 -rotate-90">
          <circle cx="22" cy="22" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="22" cy="22" r={R} fill="none" strokeWidth="4" strokeLinecap="round"
            stroke={pct >= 1 ? 'var(--ok)' : 'var(--accent)'}
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
            style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.34,1.56,.64,1), stroke .3s' }}
          />
        </svg>
      </div>

      <ul className="mt-4 space-y-1.5" role="list">
        {items.map((item, i) => (
          <li key={i}>
            <label
              className="bimo-choice group flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2 hover:bg-[var(--surface-2,transparent)]"
            >
              <input
                type="checkbox"
                checked={done[i] ?? false}
                onChange={() => toggle(i)}
                className="peer sr-only"
              />
              <span
                className={`mt-[2px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-2)] ${popped === i ? 'bimo-check-pop' : ''}`}
                style={{
                  borderColor: done[i] ? 'var(--ok)' : 'var(--border-strong, var(--border))',
                  background: done[i] ? 'var(--ok)' : 'transparent',
                }}
                aria-hidden="true"
              >
                {done[i] && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span
                  className="text-[14.5px] leading-[1.55] transition-colors"
                  style={{
                    color: done[i] ? 'var(--text-dim)' : 'var(--text)',
                    textDecorationLine: done[i] ? 'line-through' : 'none',
                    textDecorationColor: 'color-mix(in srgb, var(--text-dim) 50%, transparent)',
                  }}
                >
                  {item.label}
                </span>
                {item.hint && <span className="mt-0.5 block text-[13px] leading-[1.55] text-[var(--text-dim)]">{item.hint}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11.5px] text-[var(--text-dim)]">
        <span>{copy.savedLocally}</span>
        {count > 0 && (
          <button type="button" onClick={reset} className="rounded px-1.5 py-0.5 hover:text-[var(--text)]">
            ↻ {copy.reset}
          </button>
        )}
      </div>
    </section>
  )
}

// ── BimoFeedback ─────────────────────────────────────────────────────────────

type Vote = 'yes' | 'meh' | 'no'
const VOTE_EMOTION: Record<Vote, BimoEmotion> = { yes: 'love', meh: 'curious', no: 'sad' }

export function BimoFeedback({ id, lang = 'en', onVote }: WithLang & {
  /** Stable key (post slug) so a returning reader sees their answer. */
  id: string
  onVote?: (vote: Vote) => void
}) {
  const copy = bimoCopy(lang)
  const storageKey = `bimo:feedback:${id}`
  const [vote, setVote] = React.useState<Vote | null>(null)
  const [hover, setHover] = React.useState<Vote | null>(null)

  React.useEffect(() => { setVote(readJSON<Vote | null>(storageKey, null)) }, [storageKey])

  const cast = (v: Vote) => {
    setVote(v)
    writeJSON(storageKey, v)
    onVote?.(v)
  }

  const emotion: BimoEmotion = vote ? VOTE_EMOTION[vote] : hover ? VOTE_EMOTION[hover] : 'wave'
  const options: Array<{ v: Vote; label: string; icon: string }> = [
    { v: 'yes', label: copy.yes, icon: '♥' },
    { v: 'meh', label: copy.meh, icon: '~' },
    { v: 'no',  label: copy.no,  icon: '✕' },
  ]

  return (
    <section className="my-10 flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center sm:flex-row sm:text-left">
      <Bimo emotion={emotion} size={64} interactive label={copy.boop} />
      <div className="min-w-0 flex-1" aria-live="polite">
        {!vote ? (
          <>
            <p className="text-[15px] font-semibold text-[var(--text)]">{copy.helpful}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start" role="group" aria-label={copy.helpful}>
              {options.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => cast(o.v)}
                  onMouseEnter={() => setHover(o.v)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(o.v)}
                  onBlur={() => setHover(null)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--text)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent-2)] active:scale-95"
                >
                  <span aria-hidden="true" className="text-[var(--accent-2)]">{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="bimo-check-pop">
            <p className="text-[15px] font-semibold text-[var(--text)]">{copy.thanks[vote]}</p>
            <button
              type="button"
              onClick={() => { setVote(null); writeJSON(storageKey, null) }}
              className="mt-1.5 text-[12.5px] text-[var(--text-dim)] underline-offset-2 hover:text-[var(--text)] hover:underline"
            >
              {copy.undo}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
