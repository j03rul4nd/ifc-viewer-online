import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ── Tailwind class merge ───────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ── Colors ────────────────────────────────────────────────────────────────────

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) + amt)
  const g = Math.min(255, ((n >> 8)  & 255) + amt)
  const b = Math.min(255, ( n        & 255) + amt)
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

// ── Numbers ───────────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1)
}

export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k     = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i     = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[Math.min(i, sizes.length - 1)]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1_000)  return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1_000)
  return `${m}m ${s}s`
}

export function formatCount(n: number, singular: string, plural?: string): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : (plural ?? `${singular}s`)}`
}

export function truncate(str: string, maxLength: number, suffix = '…'): string {
  return str.length <= maxLength ? str : str.slice(0, maxLength - suffix.length) + suffix
}

// ── Functions ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function noop(): void {}

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => { fn(...args) }, delayMs)
  }
}

export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  intervalMs: number,
): (...args: Parameters<T>) => void {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= intervalMs) { last = now; fn(...args) }
  }
}

export function once<T>(fn: () => T): () => T {
  let called = false
  let cached: T
  return () => {
    if (!called) { called = true; cached = fn() }
    return cached
  }
}

// ── Async ─────────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Run a promise with a timeout. Rejects with a TimeoutError if it takes too long. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)), ms),
    ),
  ])
}

// ── Objects ───────────────────────────────────────────────────────────────────

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const set = new Set<string>(keys as string[])
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !set.has(k))) as Omit<T, K>
}

// ── Arrays ────────────────────────────────────────────────────────────────────

export function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item)
    ;(acc[k] ??= []).push(item)
    return acc
  }, {})
}

export function unique<T>(items: T[], keyFn?: (item: T) => unknown): T[] {
  if (!keyFn) return [...new Set(items)]
  const seen = new Set<unknown>()
  return items.filter((item) => {
    const k = keyFn(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}
