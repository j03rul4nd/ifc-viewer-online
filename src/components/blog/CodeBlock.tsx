// ─── Blog code block ──────────────────────────────────────────────────────────
// Renders code with custom IFC/STEP syntax highlighting and a copy button.
// No external library — lightweight regex tokenizer handles the patterns
// that actually appear in BIM blog posts (IFC STEP, plain config text).

import React, { useState, useCallback } from 'react'

// ── Tokenizer ─────────────────────────────────────────────────────────────────

interface Token { type: string; value: string }

const RULES: Array<{ type: string; pattern: RegExp }> = [
  { type: 'comment',   pattern: /^(\/\/[^\n]*)/ },
  { type: 'comment',   pattern: /^(\/\*[\s\S]*?\*\/)/ },
  { type: 'entity-id', pattern: /^(#\d+)/ },
  { type: 'ifc-class', pattern: /^([A-Z][A-Z0-9_]{4,})(?=[\s(,;$])/ },
  { type: 'enum',      pattern: /^(\.[A-Z][A-Z0-9_]*\.)/ },
  { type: 'string',    pattern: /^('(?:[^'\\]|\\.)*')/ },
  { type: 'number',    pattern: /^(-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?)/ },
  { type: 'punct',     pattern: /^([()=,;])/ },
  { type: 'null',      pattern: /^(\$)/ },
]

function tokenize(code: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  while (pos < code.length) {
    const slice = code.slice(pos)
    let matched = false
    for (const { type, pattern } of RULES) {
      const m = slice.match(pattern)
      if (m) {
        tokens.push({ type, value: m[1] })
        pos += m[1].length
        matched = true
        break
      }
    }
    if (!matched) {
      // Whitespace / unknown — merge with last plain token or create new one
      const last = tokens[tokens.length - 1]
      if (last && last.type === 'plain') last.value += code[pos]
      else tokens.push({ type: 'plain', value: code[pos] })
      pos++
    }
  }
  return tokens
}

const TOKEN_STYLE: Record<string, string> = {
  'comment':   'text-[var(--text-faint)] italic',
  'entity-id': 'text-[#818cf8]',           // indigo — entity references
  'ifc-class': 'text-[#fbbf24]',           // amber — IFC class names
  'enum':      'text-[#34d399]',           // green — enum values (.NOTDEFINED.)
  'string':    'text-[#6ee7b7]',           // teal — string literals
  'number':    'text-[#fb923c]',           // orange — numbers
  'punct':     'text-[#94a3b8]',           // slate — punctuation
  'null':      'text-[#94a3b8]',           // slate — null ($)
  'plain':     'text-[var(--text)]',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  code: string
  lang?: string
}

const LANG_LABEL: Record<string, string> = {
  ifc:    'IFC STEP',
  step:   'IFC STEP',
  text:   'TEXT',
  bash:   'BASH',
  json:   'JSON',
  yaml:   'YAML',
  config: 'CONFIG',
}

export default function CodeBlock({ code, lang = 'text' }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available (HTTP context) — silent fail
    }
  }, [code])

  const useHighlight = lang === 'ifc' || lang === 'step'
  const lines = code.split('\n')
  const label = LANG_LABEL[lang] ?? lang.toUpperCase()
  const multiline = lines.length > 3

  return (
    <div className="my-6 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface-2)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[rgba(0,0,0,0.2)]">
        <span className="text-[10.5px] font-mono font-bold tracking-[0.1em] text-[var(--text-faint)]">
          {label}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono
                     text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.06)]
                     transition-all active:scale-95"
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 6l3 3 5-5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <path d="M9 3V2a1 1 0 00-1-1H2a1 1 0 00-1 1v6a1 1 0 001 1h1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <div className="overflow-x-auto">
        <pre className="p-4 text-[12.5px] sm:text-[13px] font-mono leading-[1.75]">
          {multiline ? (
            lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none w-[2.5em] shrink-0 text-right pr-4 text-[var(--text-faint)] opacity-40 text-[11px]">
                  {i + 1}
                </span>
                <code className="flex-1">
                  {useHighlight
                    ? tokenize(line).map((tok, j) => (
                        <span key={j} className={TOKEN_STYLE[tok.type] ?? TOKEN_STYLE.plain}>
                          {tok.value}
                        </span>
                      ))
                    : <span className="text-[var(--text)]">{line}</span>
                  }
                </code>
              </div>
            ))
          ) : (
            <code className="text-[var(--text)]">
              {useHighlight
                ? tokenize(code).map((tok, j) => (
                    <span key={j} className={TOKEN_STYLE[tok.type] ?? TOKEN_STYLE.plain}>
                      {tok.value}
                    </span>
                  ))
                : code
              }
            </code>
          )}
        </pre>
      </div>
    </div>
  )
}
