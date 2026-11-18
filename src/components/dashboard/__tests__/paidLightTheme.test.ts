// Paid pages (dashboard, admin, auth, call booking) style themselves with the
// semantic tokens (--text-muted, --warning, --success, --bg-surface…) that only
// [data-theme="light"] defines in light. `.lp-light` alone re-derives the short
// aliases, so every wrapper that adds lp-light must also set data-theme.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

const PAGES = [
  'components/dashboard/DashboardView.tsx',
  'components/dashboard/AdminView.tsx',
  'components/dashboard/FeedbackAdminView.tsx',
  'components/account/AuthPage.tsx',
  'components/account/CallBookingView.tsx',
]

describe('paid UI light theme', () => {
  it.each(PAGES)('%s pairs every lp-light wrapper with data-theme', (p) => {
    const lines = read(p).split('\n').filter((l) => /<div className=/.test(l) && /lp-light|\{chrome\}|\$\{chrome\}/.test(l))
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l).toMatch(/data-theme=\{/)
  })

  it('light theme defines the semantic tokens the paid UI reads', () => {
    const css = read('index.css')
    const block = css.slice(css.indexOf('[data-theme="light"] {'))
    const body = block.slice(0, block.indexOf('}'))
    for (const tok of ['--text-muted', '--warning', '--success', '--bg-surface', '--border-subtle', '--border-control', '--accent-contrast'])
      expect(body).toContain(`${tok}:`)
  })

  it('paid UI carries no hard-coded status hex fallbacks', () => {
    for (const p of ['components/dashboard/AdminFinance.tsx', 'components/dashboard/AdminMiddleware.tsx'])
      expect(read(p)).not.toMatch(/var\(--(ok|warn|danger), #/)
  })
})
