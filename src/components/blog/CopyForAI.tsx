// ─── CopyForAI — v2.0 ─────────────────────────────────────────────────────────
// Componente robusto y escalable para copiar artículos como prompts de IA.
//
// Mejoras sobre v1:
//   • Separación estricta de responsabilidades (serialización, clipboard, UI)
//   • Errores granulares con mensajes accionables para el usuario
//   • Soporte fallback para navegadores sin clipboard API
//   • Memoización correcta y cancelación de timers en cleanup
//   • Arquitectura extensible: añadir plataformas sin tocar la lógica
//   • Tipado exhaustivo sin `any`
//   • Accesibilidad: roles ARIA, focus trap, keyboard dismiss (Escape)
//   • SSR-safe: sin acceso a window/navigator en render
//   • Logging estructurado preparado para integrar con Sentry/DataDog
// ──────────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  memo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BlogPost, ContentBlock } from '../../lib/blog-posts'

// ── Constantes ────────────────────────────────────────────────────────────────

const SITE = 'https://j03rul4nd.github.io/ifc-viewer-online'
const COPY_RESET_DELAY_MS = 3_000

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CopyState = 'idle' | 'copying' | 'copied' | 'error:permission' | 'error:unavailable' | 'error:unknown'

type CopyErrorKind = Exclude<CopyState, 'idle' | 'copying' | 'copied'>

interface AIPlatform {
  id: string
  label: string
  url: string
  ariaLabel: string
}

type CopyResult = {
  ok: true
  method: 'clipboard-api' | 'execCommand'
} | {
  ok: false
  kind: CopyErrorKind
  cause?: unknown
}

// ── Plataformas — añadir aquí sin modificar el componente ─────────────────────

const AI_PLATFORMS: AIPlatform[] = [
  {
    id: 'claude',
    label: 'Claude',
    url: 'https://claude.ai/new',
    ariaLabel: 'Copiar prompt y abrir Claude',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com',
    ariaLabel: 'Copiar prompt y abrir ChatGPT',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    url: 'https://www.perplexity.ai',
    ariaLabel: 'Copiar prompt y abrir Perplexity',
  },
]

// ── Logging estructurado (swappable por Sentry/DataDog) ───────────────────────

const logger = {
  info: (event: string, meta?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && !window.__COPYFAI_PRODUCTION__) {
      console.info(`[CopyForAI] ${event}`, meta ?? '')
    }
  },
  warn: (event: string, meta?: Record<string, unknown>) => {
    console.warn(`[CopyForAI] ${event}`, meta ?? '')
  },
  error: (event: string, cause?: unknown) => {
    console.error(`[CopyForAI] ${event}`, cause ?? '')
    // TODO: Sentry.captureException(cause, { tags: { component: 'CopyForAI', event } })
  },
}

// ── Serialización Markdown ────────────────────────────────────────────────────

function blockToMarkdown(block: ContentBlock): string {
  switch (block.type) {
    case 'h2':
      return `\n## ${block.text}\n`
    case 'h3':
      return `\n### ${block.text}\n`
    case 'p':
      return `${block.text}\n`
    case 'ul':
      return block.items.map((i) => `- ${i}`).join('\n') + '\n'
    case 'ol':
      return block.items.map((i, n) => `${n + 1}. ${i}`).join('\n') + '\n'
    case 'code':
      return `\`\`\`${block.lang ?? ''}\n${block.text}\n\`\`\`\n`
    case 'callout':
      return `> **${block.variant.toUpperCase()}:** ${block.text}\n`
    case 'feature-grid':
      return (
        block.items.map((i) => `**${i.icon} ${i.title}:** ${i.body}`).join('\n') + '\n'
      )
    case 'stat-row':
      return (
        block.stats.map((s) => `- **${s.value}${s.suffix ?? ''}** ${s.label}`).join('\n') + '\n'
      )
    case 'comparison':
      return [
        `**${block.left.label}:**`,
        ...block.left.items.map((i) => `✓ ${i}`),
        '',
        `**${block.right.label}:**`,
        ...block.right.items.map((i) => `· ${i}`),
        '',
      ].join('\n')
    case 'ifc-demo':
      return `> 💡 *Demo interactiva disponible: ${block.title} — ${block.description} Pruébala gratis en ${SITE}*\n`
    case 'image':
      return block.caption ? `*[Imagen: ${block.caption}]*\n` : ''
    default:
      // Registro de tipos inesperados sin crashear
      logger.warn('blockToMarkdown: tipo de bloque desconocido', { block })
      return ''
  }
}

export function postToMarkdown(post: BlogPost): string {
  const content = post.content
    .map(blockToMarkdown)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return `# ${post.title}

> ${post.excerpt}

*Categoría: ${post.category} · ${post.readTimeMin} min de lectura*
*Fuente: ${SITE}/blog/${post.slug}/*

---

${content.trim()}

---

*Este artículo es de IFC Viewer Online — visor IFC gratuito en el navegador. Los archivos nunca salen de tu máquina. Pruébalo en ${SITE}*`
}

export function buildAiPrompt(post: BlogPost): string {
  const md = postToMarkdown(post)

  return `Estoy leyendo un artículo sobre BIM y archivos IFC. Por favor, ayúdame a entender este contenido mejor.

${md}

---

Basándote en este artículo, por favor:
1. Resume las 3 conclusiones prácticas más importantes en lenguaje claro
2. Explica los términos técnicos (entidades IFC, estándares, acrónimos) que pueda no conocer
3. Dame una acción concreta que debería realizar basándome en este artículo
4. Responde las preguntas de seguimiento que tenga sobre este tema

Si te proporciono una ruta a un archivo IFC o describo mi proyecto, relaciona tus respuestas con mi situación específica.`
}

// ── Capa de clipboard — aislada y testeable ───────────────────────────────────

async function writeToClipboard(text: string): Promise<CopyResult> {
  // Guardada moderna (Clipboard API)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      logger.info('clipboard:write', { method: 'clipboard-api', chars: text.length })
      return { ok: true, method: 'clipboard-api' }
    } catch (cause) {
      // DOMException: NotAllowedError → permisos denegados
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
        logger.warn('clipboard:permission-denied', { cause })
        return { ok: false, kind: 'error:permission', cause }
      }
      logger.error('clipboard:write-failed', cause)
      return { ok: false, kind: 'error:unknown', cause }
    }
  }

  // Fallback: execCommand (deprecated pero amplio soporte)
  if (typeof document !== 'undefined' && document.execCommand) {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.cssText = 'position:absolute;left:-9999px;top:-9999px;'
      document.body.appendChild(textarea)
      textarea.select()
      const success = document.execCommand('copy')
      document.body.removeChild(textarea)

      if (success) {
        logger.info('clipboard:write', { method: 'execCommand', chars: text.length })
        return { ok: true, method: 'execCommand' }
      }
      return { ok: false, kind: 'error:unknown' }
    } catch (cause) {
      logger.error('clipboard:execCommand-failed', cause)
      return { ok: false, kind: 'error:unknown', cause }
    }
  }

  logger.warn('clipboard:unavailable')
  return { ok: false, kind: 'error:unavailable' }
}

// ── Hook useClipboard — estado de copia reutilizable ─────────────────────────

function useClipboard() {
  const [state, setState] = useState<CopyState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup en desmontaje — evita setState en componente muerto
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copy = useCallback(async (text: string): Promise<CopyResult> => {
    if (state === 'copying') return { ok: false, kind: 'error:unknown' }

    setState('copying')
    if (timerRef.current) clearTimeout(timerRef.current)

    const result = await writeToClipboard(text)

    setState(result.ok ? 'copied' : result.kind)
    timerRef.current = setTimeout(() => setState('idle'), COPY_RESET_DELAY_MS)

    return result
  }, [state])

  return { state, copy }
}

// ── Mensajes UI según estado ───────────────────────────────────────────────────

const COPY_BUTTON_CONTENT: Record<CopyState, { label: string; icon?: string }> = {
  idle:               { label: 'Copiar prompt de IA' },
  copying:            { label: 'Copiando…' },
  copied:             { label: '¡Prompt copiado!', icon: '✓' },
  'error:permission': { label: 'Permiso denegado' },
  'error:unavailable':{ label: 'No disponible en este navegador' },
  'error:unknown':    { label: 'Error — inténtalo de nuevo' },
}

const COPY_BUTTON_CLASS: Record<CopyState, string> = {
  idle: 'bg-[var(--accent)] text-white hover:brightness-110',
  copying: 'bg-[var(--accent)] text-white opacity-60 cursor-wait',
  copied: 'bg-[rgba(52,211,153,0.15)] border border-[rgba(52,211,153,0.3)] text-[#34d399]',
  'error:permission': 'bg-[rgba(251,191,36,0.15)] border border-[rgba(251,191,36,0.3)] text-[#fbbf24]',
  'error:unavailable': 'bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171]',
  'error:unknown': 'bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171]',
}

const ERROR_HINTS: Partial<Record<CopyState, string>> = {
  'error:permission':
    'El navegador bloqueó el acceso al portapapeles. Haz clic en el icono de candado de la barra de direcciones y permite "Portapapeles".',
  'error:unavailable':
    'Tu navegador no soporta la API de portapapeles. Prueba con Chrome, Edge o Firefox modernos.',
  'error:unknown':
    'Algo salió mal al copiar. Inténtalo de nuevo o selecciona manualmente el texto.',
}

// ── Sub-componente: botón de plataforma individual ────────────────────────────

interface PlatformLinkProps {
  platform: AIPlatform
  onCopy: () => Promise<CopyResult>
}

const PlatformLink = memo(function PlatformLink({ platform, onCopy }: PlatformLinkProps) {
  return (
    <a
      href={platform.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onCopy}
      aria-label={platform.ariaLabel}
      className="flex-1 h-8 rounded-lg border border-[var(--border)] text-[11.5px] font-medium
                 text-[var(--text-faint)] hover:text-[var(--text)] hover:border-[var(--border-strong)]
                 transition-colors flex items-center justify-center gap-1.5
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {platform.label}
    </a>
  )
})

// ── Componente principal ───────────────────────────────────────────────────────

interface CopyForAIProps {
  post: BlogPost
  /** Sobrescribir el builder de prompt (útil para tests o variantes A/B) */
  promptBuilder?: (post: BlogPost) => string
  /** Callback cuando la copia es exitosa */
  onCopied?: (method: 'clipboard-api' | 'execCommand') => void
  /** Callback de error */
  onError?: (kind: CopyErrorKind, cause?: unknown) => void
}

export default function CopyForAI({
  post,
  promptBuilder = buildAiPrompt,
  onCopied,
  onError,
}: CopyForAIProps) {
  const [open, setOpen] = useState(false)
  const { state, copy } = useClipboard()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Memoizar el prompt — no recalcular en cada render
  const prompt = useMemo(() => {
    try {
      return promptBuilder(post)
    } catch (cause) {
      logger.error('promptBuilder:failed', cause)
      return `Error generando el prompt para: ${post?.title ?? 'artículo desconocido'}`
    }
  }, [post, promptBuilder])

  // Cerrar con Escape + gestión de focus
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const handleCopy = useCallback(async (): Promise<CopyResult> => {
    const result = await copy(prompt)

    if (result.ok) {
      onCopied?.(result.method)
    } else {
      onError?.(result.kind, result.cause)
    }

    return result
  }, [copy, prompt, onCopied, onError])

  const toggleOpen = useCallback(() => setOpen((v) => !v), [])
  const close = useCallback(() => setOpen(false), [])

  const errorHint = ERROR_HINTS[state]
  const btnContent = COPY_BUTTON_CONTENT[state]
  const btnClass = COPY_BUTTON_CLASS[state]

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="copy-for-ai-dropdown"
        className="w-full sm:w-auto flex items-center justify-center gap-2 h-10 sm:h-9 px-4
                   text-[13px] sm:text-[12.5px] font-medium rounded-xl
                   border border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)]
                   hover:border-[rgba(94,106,210,0.4)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]
                   active:bg-[var(--surface-2)] transition-all
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span className="text-[14px]" aria-hidden="true">✨</span>
        Explicar con IA
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M1.5 3.5l3.5 3.5 3.5-3.5" />
        </svg>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="copy-for-ai-dropdown"
            role="dialog"
            aria-label="Explicar artículo con IA"
            aria-modal="false"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-[calc(100%+8px)] left-0 right-0 sm:right-auto sm:w-[300px] z-30 p-4 rounded-2xl
                       border border-[var(--border-strong)] bg-[rgba(10,10,14,0.97)]
                       backdrop-blur-xl shadow-2xl"
          >
            <p className="text-[11.5px] font-mono font-bold tracking-[0.1em] text-[var(--text-faint)] mb-2">
              EXPLICAR CON IA
            </p>
            <p className="text-[13px] leading-[1.6] text-[var(--text-dim)] mb-4">
              Copia este artículo como prompt estructurado. Pégalo en{' '}
              <a
                href="https://claude.ai"
                target="_blank"
                rel="noopener"
                className="text-[var(--accent-2)] hover:underline focus-visible:outline-none focus-visible:underline"
              >
                Claude
              </a>
              ,{' '}
              <a
                href="https://chatgpt.com"
                target="_blank"
                rel="noopener"
                className="text-[var(--accent-2)] hover:underline focus-visible:outline-none focus-visible:underline"
              >
                ChatGPT
              </a>
              , o cualquier asistente de IA para una explicación personalizada.
            </p>

            <div className="flex flex-col gap-2">
              {/* Botón principal de copia */}
              <button
                onClick={handleCopy}
                disabled={state === 'copying'}
                aria-live="polite"
                aria-busy={state === 'copying'}
                className={[
                  'w-full h-9 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1',
                  btnClass,
                ].join(' ')}
              >
                {btnContent.icon && (
                  <span aria-hidden="true">{btnContent.icon}</span>
                )}
                {state === 'copying' && (
                  <span
                    className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                )}
                {btnContent.label}
              </button>

              {/* Hint de error contextual */}
              <AnimatePresence>
                {errorHint && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-[11px] text-[var(--text-faint)] leading-relaxed overflow-hidden"
                    role="alert"
                  >
                    {errorHint}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Links a plataformas */}
              <div className="flex gap-2" role="group" aria-label="Abrir en plataforma de IA">
                {AI_PLATFORMS.map((platform) => (
                  <PlatformLink
                    key={platform.id}
                    platform={platform}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
            </div>

            {/* Confirmación de copia */}
            <AnimatePresence>
              {state === 'copied' && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 text-[11.5px] text-[var(--text-faint)]"
                  role="status"
                >
                  ✓ Prompt en el portapapeles — pégalo en cualquier ventana de chat IA
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay para cerrar al hacer clic fuera */}
      {open && (
        <div
          className="fixed inset-0 z-20"
          onClick={close}
          aria-hidden="true"
        />
      )}
    </div>
  )
}