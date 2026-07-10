// ─── VerifyCertificateView ────────────────────────────────────────────────────
// Public /verify/<hash> page — the "verification" half of moat #1. Fetches the
// certificate from the Worker, renders it (all data is untrusted → plain JSX
// text nodes only, no dangerouslySetInnerHTML — same criterion as
// SharedReportView), and verifies the ECDSA signature LOCALLY with
// crypto.subtle against the public key served from /.well-known/. A "verified"
// state can only come from the browser's own check — never from a server field.
//
// Display honesty (R-5): always shows "N of 44 rules — profile X"; a partial /
// custom profile is visually distinct from a full default run. All states are
// text + icon, never colour alone (WCAG 1.4.1).

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import qrcode from 'qrcode-generator'
import { getCertificate, type ApiError, type CertificateEntry } from '../lib/cloud/api-client'
import { trackCertificateDeepVerified, trackCertificateVerifiedView } from '../lib/analytics'
import { payloadCanonicalBytes, sha256Hex, type CertifyPayloadV1 } from '../lib/certify/canonical'
import type { RuleDiff } from '../lib/certify/deep-verify'
import { RULE_COUNT } from '../types'

// ── Signature verification (exported for tests) ───────────────────────────────

export interface PublishedKey {
  kid: string
  alg: string
  spki_pem: string
  status: 'active' | 'retired'
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function base64UrlToBytes(b64u: string): Uint8Array {
  let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export type SignatureVerdict = 'valid' | 'invalid' | 'unknown_key'

/**
 * 100%-client-side signature check: never trusts the server. Retired keys
 * still verify (rotation must not orphan old certificates).
 */
export async function verifySignature(
  payload: CertifyPayloadV1,
  signatureB64u: string,
  keyId: string,
  keys: PublishedKey[],
): Promise<SignatureVerdict> {
  const entry = keys.find((k) => k.kid === keyId)
  if (!entry) return 'unknown_key'
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      pemToBytes(entry.spki_pem) as unknown as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(signatureB64u) as unknown as ArrayBuffer,
      payloadCanonicalBytes(payload) as unknown as ArrayBuffer,
    )
    return ok ? 'valid' : 'invalid'
  } catch {
    return 'invalid'
  }
}

// ── Display honesty (exported for tests) ──────────────────────────────────────

export interface CoverageInfo {
  checked: number
  total: number
  profileId: string
  /** true when fewer than the canonical rule count ran, or a custom profile. */
  partial: boolean
}

export function describeCoverage(payload: CertifyPayloadV1): CoverageInfo {
  const checked = payload.rules_result.length
  const profileId = /^profile:([^@]+)@/.exec(payload.ruleset_version)?.[1] ?? 'custom'
  return {
    checked,
    total: RULE_COUNT,
    profileId,
    partial: checked < RULE_COUNT || (profileId !== 'default' && profileId !== 'standard'),
  }
}

// ── Shareable verify URL + QR (exported for tests) ────────────────────────────

/** Canonical public URL of this verification page — what the QR encodes. */
export function buildVerifyUrl(origin: string, hash: string): string {
  return `${origin}/verify/${hash}`
}

/**
 * QR as plain JSX (one <path> from the module matrix) — same "no
 * dangerouslySetInnerHTML" criterion as the rest of this view, even though
 * the encoded text is our own URL. Quiet zone baked into the viewBox.
 */
function QrSvg({ text, label }: { text: string; label: string }) {
  const { size, d } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let path = ''
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++)
        if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`
    return { size: n, d: path }
  }, [text])
  return (
    <svg
      viewBox={`-3 -3 ${size + 6} ${size + 6}`}
      width={112}
      height={112}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="rounded-md shrink-0"
    >
      <rect x={-3} y={-3} width={size + 6} height={size + 6} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const HEX64 = /^[0-9a-f]{64}$/

interface VerifyCertificateViewProps {
  hash: string
  onNavigateToLanding: () => void
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; code: ApiError['code'] }
  | { phase: 'loaded'; certificates: CertificateEntry[] }

type VerifyState = 'idle' | 'checking' | SignatureVerdict

/** Deep verification (F1.5): drop the actual file → local re-hash → optional engine re-run. */
type DeepState =
  | { phase: 'idle' }
  | { phase: 'hashing' }
  | { phase: 'read_error' }
  | { phase: 'mismatch' }
  | { phase: 'match'; buffer: ArrayBuffer }
  | { phase: 'rerunning'; buffer: ArrayBuffer; progress: number }
  | { phase: 'reproduced'; comparedCount: number; notReevaluated: number; score: number }
  | { phase: 'differs'; diffs: RuleDiff[]; notReevaluated: number; score: number }
  | { phase: 'rerun_error'; buffer: ArrayBuffer }

const STATUS_ICON: Record<'pass' | 'fail' | 'warning', { glyph: string; color: string }> = {
  pass: { glyph: '✓', color: 'var(--ok, #4caf82)' },
  fail: { glyph: '✕', color: 'var(--danger, #e5534b)' },
  warning: { glyph: '!', color: '#F5A623' },
}

export default function VerifyCertificateView({ hash, onNavigateToLanding }: VerifyCertificateViewProps) {
  const { t } = useTranslation('verify')
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [verify, setVerify] = useState<VerifyState>('idle')
  const [deep, setDeep] = useState<DeepState>({ phase: 'idle' })

  const fetchCert = useCallback(async () => {
    if (!HEX64.test(hash)) {
      // Clearly invalid → no pointless request.
      setLoad({ phase: 'error', code: 'not_found' })
      return
    }
    setLoad({ phase: 'loading' })
    const r = await getCertificate(hash)
    if (r.ok) setLoad({ phase: 'loaded', certificates: r.value.certificates })
    else setLoad({ phase: 'error', code: r.error.code })
  }, [hash])

  useEffect(() => { void fetchCert() }, [fetchCert])

  const handleVerify = async (entry: CertificateEntry) => {
    setVerify('checking')
    let verdict: SignatureVerdict = 'unknown_key'
    try {
      const base = (import.meta.env.BASE_URL as string | undefined) ?? '/'
      const res = await fetch(`${base}.well-known/ifcvieweronline-keys.json`)
      const doc = (await res.json()) as { keys: PublishedKey[] }
      verdict = await verifySignature(entry.payload, entry.signature, entry.key_id, doc.keys ?? [])
    } catch {
      verdict = 'unknown_key'
    }
    setVerify(verdict)
    trackCertificateVerifiedView({
      signature_result: verdict === 'valid' && entry.status === 'revoked' ? 'revoked' : verdict,
    })
  }

  const verifyUrl = buildVerifyUrl(window.location.origin, hash)

  // ── Deep verification handlers (F1.5 — all local, zero network) ────────────

  const handleDroppedFile = async (file: File, entry: CertificateEntry) => {
    setDeep({ phase: 'hashing' })
    let buffer: ArrayBuffer
    try {
      buffer = await file.arrayBuffer()
    } catch {
      setDeep({ phase: 'read_error' })
      return
    }
    const digest = await sha256Hex(buffer)
    const matches = digest === entry.payload.file_hash_sha256.toLowerCase()
    trackCertificateDeepVerified({ level: 'hash', result: matches ? 'match' : 'mismatch' })
    setDeep(matches ? { phase: 'match', buffer } : { phase: 'mismatch' })
  }

  const handleRerun = async (buffer: ArrayBuffer, entry: CertificateEntry) => {
    setDeep({ phase: 'rerunning', buffer, progress: 0 })
    try {
      // Lazy import: the worker + comparison code only loads when someone
      // actually re-runs — /verify stays light for plain lookups.
      const { rerunAndCompare } = await import('../lib/certify/deep-verify')
      const out = await rerunAndCompare(buffer, entry.payload, (progress) => {
        setDeep((d) => (d.phase === 'rerunning' ? { ...d, progress } : d))
      })
      trackCertificateDeepVerified({ level: 'rerun', result: out.reproduced ? 'match' : 'mismatch' })
      setDeep(
        out.reproduced
          ? { phase: 'reproduced', comparedCount: out.comparedCount, notReevaluated: out.notReevaluated.length, score: out.recomputedScore }
          : { phase: 'differs', diffs: out.diffs, notReevaluated: out.notReevaluated.length, score: out.recomputedScore },
      )
    } catch {
      setDeep({ phase: 'rerun_error', buffer })
    }
  }

  return (
    <div className="min-h-full w-full flex justify-center px-4 py-10 bg-[var(--bg,#0b0b0f)] text-[var(--text,#e8e8ee)] print:bg-white print:text-black print:py-2">
      <div className="w-full max-w-[640px] flex flex-col gap-4">
        {/* Header */}
        <div>
          <button onClick={onNavigateToLanding} className="print:hidden text-[12px] text-[var(--text-muted,#9a9aa5)] hover:text-[var(--text)] transition-colors">
            ← {t('backToApp')}
          </button>
          <h1 className="text-[20px] font-semibold mt-2">{t('title')}</h1>
          <p className="text-[12px] text-[var(--text-muted,#9a9aa5)] mt-1">{t('subtitle')}</p>
        </div>

        {load.phase === 'loading' && (
          <p role="status" className="text-[13px] text-[var(--text-muted,#9a9aa5)]">{t('loading')}</p>
        )}

        {load.phase === 'error' && (
          <div className="rounded-xl border border-[var(--border,#2a2a33)] p-4 flex flex-col gap-2">
            <p className="text-[13px]">
              {load.code === 'not_found' ? `∅ ${t('notFound')}` : `⚠ ${t('networkError')}`}
            </p>
            {load.code !== 'not_found' && (
              <button onClick={() => void fetchCert()} className="self-start h-7 px-3 rounded-lg text-[12px] font-medium border border-[var(--border,#2a2a33)] hover:border-[var(--accent,#5E6AD2)] transition-colors">
                {t('retry')}
              </button>
            )}
          </div>
        )}

        {load.phase === 'loaded' && load.certificates.map((entry, idx) => {
          const coverage = describeCoverage(entry.payload)
          // CertificateStatus enum is `valid | revoked` (Worker schema).
          const revoked = entry.status === 'revoked'
          const isFirst = idx === 0
          return (
            <div key={`${entry.key_id}-${idx}`} className="rounded-xl border border-[var(--border,#2a2a33)] overflow-hidden">
              {/* Revoked banner */}
              {revoked && (
                <div className="px-4 py-2 text-[12px] font-semibold" style={{ background: 'rgba(229,83,75,0.12)', color: 'var(--danger, #e5534b)' }}>
                  ✕ {t('revokedBanner')}
                </div>
              )}
              {/* Partial / custom profile banner — visually distinct from a full default run */}
              {coverage.partial && (
                <div className="px-4 py-2 text-[12px] font-medium" style={{ background: 'rgba(245,166,35,0.10)', color: '#F5A623' }}>
                  ! {t('partialBanner', { profile: coverage.profileId })}
                </div>
              )}

              <div className="p-4 flex flex-col gap-3">
                {/* Score + coverage (display honesty) */}
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div>
                    <span className="text-[32px] font-bold leading-none">{entry.payload.health_score}</span>
                    <span className="text-[13px] text-[var(--text-muted,#9a9aa5)]"> /100 · {t('healthScore')}</span>
                  </div>
                  <span className="text-[12px] text-[var(--text-muted,#9a9aa5)]">
                    {t('coverage', { checked: coverage.checked, total: coverage.total, profile: coverage.profileId })}
                  </span>
                </div>

                {/* Metadata */}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                  <dt className="text-[var(--text-muted,#9a9aa5)]">{t('issuedAt')}</dt>
                  <dd className="font-mono">{entry.payload.validated_at}</dd>
                  <dt className="text-[var(--text-muted,#9a9aa5)]">{t('validator')}</dt>
                  <dd className="font-mono">{entry.payload.validator_version}</dd>
                  <dt className="text-[var(--text-muted,#9a9aa5)]">{t('ruleset')}</dt>
                  <dd className="font-mono break-all">{entry.payload.ruleset_version}</dd>
                  <dt className="text-[var(--text-muted,#9a9aa5)]">{t('fileHash')}</dt>
                  <dd className="font-mono break-all">{entry.payload.file_hash_sha256}</dd>
                </dl>

                {/* Rule results */}
                <div className="rounded-lg border border-[var(--border,#2a2a33)] max-h-[300px] overflow-y-auto print:max-h-none print:overflow-visible">
                  {entry.payload.rules_result.map((r) => {
                    const icon = STATUS_ICON[r.status]
                    return (
                      <div key={r.rule_id} className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border,#2a2a33)] last:border-b-0">
                        <span className="w-4 text-center font-bold text-[11px]" style={{ color: icon.color }} aria-hidden>{icon.glyph}</span>
                        <span className="flex-1 font-mono text-[11px] truncate">{r.rule_id}</span>
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: icon.color }}>{t(`ruleStatus.${r.status}`)}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Local signature verification — only on the first (most recent) cert */}
                {isFirst && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => void handleVerify(entry)}
                      disabled={verify === 'checking'}
                      className="print:hidden h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
                      style={{ background: 'var(--accent, #5E6AD2)', color: 'white' }}
                    >
                      {verify === 'checking' ? t('verifying') : t('verifyBtn')}
                    </button>
                    {/* aria-live so screen readers announce the verdict of the async check */}
                    <span role="status" aria-live="polite">
                      {verify === 'valid' && !revoked && (
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--ok, #4caf82)' }}>✓ {t('verified')}</span>
                      )}
                      {verify === 'valid' && revoked && (
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--danger, #e5534b)' }}>✕ {t('validButRevoked')}</span>
                      )}
                      {verify === 'invalid' && (
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--danger, #e5534b)' }}>✕ {t('invalidSignature')}</span>
                      )}
                      {verify === 'unknown_key' && (
                        <span className="text-[12px] font-semibold" style={{ color: '#F5A623' }}>! {t('unknownKey')}</span>
                      )}
                    </span>
                  </div>
                )}

                {/* Printable share block: QR of this page + canonical URL (F1.1) */}
                {isFirst && (
                  <div className="flex items-center gap-4 rounded-lg border border-[var(--border,#2a2a33)] p-3">
                    <QrSvg text={verifyUrl} label={t('qrAlt')} />
                    <div className="min-w-0 flex flex-col gap-1.5">
                      <p className="text-[11px] text-[var(--text-muted,#9a9aa5)]">{t('qrCaption')}</p>
                      <p className="font-mono text-[10px] break-all leading-snug">{verifyUrl}</p>
                      <button
                        onClick={() => window.print()}
                        className="print:hidden self-start h-7 px-3 rounded-lg text-[12px] font-medium border border-[var(--border,#2a2a33)] hover:border-[var(--accent,#5E6AD2)] transition-colors"
                      >
                        🖨 {t('printBtn')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Deep verification (F1.5): drop the actual file → local hash → optional re-run */}
                {isFirst && (
                  <div className="rounded-lg border border-[var(--border,#2a2a33)] p-3 flex flex-col gap-2 print:hidden">
                    <p className="text-[12px] font-semibold">{t('deepTitle')}</p>

                    {(deep.phase === 'idle' || deep.phase === 'mismatch' || deep.phase === 'read_error' ||
                      deep.phase === 'reproduced' || deep.phase === 'differs') && (
                      <label
                        className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-[var(--border,#2a2a33)] hover:border-[var(--accent,#5E6AD2)] transition-colors px-3 py-4 cursor-pointer text-center"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const file = e.dataTransfer.files?.[0]
                          if (file) void handleDroppedFile(file, entry)
                        }}
                      >
                        <span className="text-[12px]">{t('deepHint')}</span>
                        <span className="text-[11px] text-[var(--text-muted,#9a9aa5)]">{t('deepPrivacy')}</span>
                        <input
                          type="file"
                          accept=".ifc"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) void handleDroppedFile(file, entry)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}

                    {/* Deep-verify outcome — announced to screen readers */}
                    <div role="status" aria-live="polite" className="flex flex-col gap-2">
                      {deep.phase === 'hashing' && (
                        <p className="text-[12px] text-[var(--text-muted,#9a9aa5)]">{t('deepHashing')}</p>
                      )}
                      {deep.phase === 'read_error' && (
                        <p className="text-[12px] font-semibold" style={{ color: '#F5A623' }}>! {t('deepReadError')}</p>
                      )}
                      {deep.phase === 'mismatch' && (
                        <div>
                          <p className="text-[12px] font-semibold" style={{ color: 'var(--danger, #e5534b)' }}>✕ {t('deepMismatch')}</p>
                          <p className="text-[11px] text-[var(--text-muted,#9a9aa5)] mt-1">{t('deepMismatchExplain')}</p>
                        </div>
                      )}
                      {(deep.phase === 'match' || deep.phase === 'rerunning' || deep.phase === 'rerun_error') && (
                        <div>
                          <p className="text-[12px] font-semibold" style={{ color: 'var(--ok, #4caf82)' }}>✓ {t('deepMatch')}</p>
                          <p className="text-[11px] text-[var(--text-muted,#9a9aa5)] mt-1">{t('deepMatchExplain')}</p>
                        </div>
                      )}
                      {deep.phase === 'reproduced' && (
                        <div>
                          <p className="text-[12px] font-semibold" style={{ color: 'var(--ok, #4caf82)' }}>✓ {t('deepMatch')}</p>
                          <p className="text-[12px] font-semibold mt-1" style={{ color: 'var(--ok, #4caf82)' }}>
                            ✓ {t('rerunReproduced', { count: deep.comparedCount })}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted,#9a9aa5)] mt-1">
                            {t('rerunScore', { score: deep.score })}
                            {deep.notReevaluated > 0 && ` · ${t('rerunNotReevaluated', { count: deep.notReevaluated })}`}
                          </p>
                        </div>
                      )}
                      {deep.phase === 'differs' && (
                        <div>
                          <p className="text-[12px] font-semibold" style={{ color: '#F5A623' }}>
                            ! {t('rerunDiffers', { count: deep.diffs.length })}
                          </p>
                          <div className="rounded-lg border border-[var(--border,#2a2a33)] max-h-[160px] overflow-y-auto mt-1">
                            {deep.diffs.map((d) => (
                              <div key={d.rule_id} className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border,#2a2a33)] last:border-b-0 text-[11px]">
                                <span className="flex-1 font-mono truncate">{d.rule_id}</span>
                                <span className="text-[var(--text-muted,#9a9aa5)]">{t('rerunCertified')}: {t(`ruleStatus.${d.certified}`)}</span>
                                <span>{t('rerunNow')}: {t(`ruleStatus.${d.recomputed}`)}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-[var(--text-muted,#9a9aa5)] mt-1">
                            {t('rerunScore', { score: deep.score })}
                            {deep.notReevaluated > 0 && ` · ${t('rerunNotReevaluated', { count: deep.notReevaluated })}`}
                          </p>
                        </div>
                      )}
                      {deep.phase === 'rerunning' && (
                        <p className="text-[12px] text-[var(--text-muted,#9a9aa5)]">{t('rerunRunning', { percent: deep.progress })}</p>
                      )}
                      {deep.phase === 'rerun_error' && (
                        <p className="text-[12px] font-semibold" style={{ color: '#F5A623' }}>! {t('rerunError')}</p>
                      )}
                    </div>

                    {(deep.phase === 'match' || deep.phase === 'rerun_error') && (
                      <div className="flex flex-col gap-1">
                        {coverage.partial && (
                          <p className="text-[11px] text-[var(--text-muted,#9a9aa5)]">! {t('rerunPartialNote')}</p>
                        )}
                        <button
                          onClick={() => void handleRerun(deep.buffer, entry)}
                          className="self-start h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors"
                          style={{ background: 'var(--accent, #5E6AD2)', color: 'white' }}
                        >
                          {t('rerunBtn')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Honest copy (R-5): what each verification level does and does not prove */}
                <p className="text-[10px] text-[var(--text-muted,#9a9aa5)] leading-snug">{t('honesty')}</p>
                <p className="text-[10px] text-[var(--text-muted,#9a9aa5)] leading-snug">{t('levels')}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
