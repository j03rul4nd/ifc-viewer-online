// Pins the home page's integrations section: every language says everything,
// statuses stay honest, "notify me" goes to the existing request form, and the
// snippets are coloured without losing a character.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { HOME_LANGS } from './home-copy'
import { INTEGRATIONS, INTEGRATIONS_COPY, INTEGRATION_ORDER, SNIPPET_ORDER, snippet } from './home-integrations'
import { highlight } from './highlight'
import { REQUEST_FEATURES } from '../../lib/feature-requests'

describe('integrations data', () => {
  it('lists each integration once, in order', () => {
    expect(new Set(INTEGRATION_ORDER).size).toBe(INTEGRATION_ORDER.length)
    expect(Object.keys(INTEGRATIONS).sort()).toEqual([...INTEGRATION_ORDER].sort())
  })

  it('offers "notify me" only for what is not out yet, and only with a known request answer', () => {
    for (const id of INTEGRATION_ORDER) {
      const { status, link } = INTEGRATIONS[id]
      expect(link.kind === 'notify', id).toBe(status === 'soon')
      if (link.kind === 'notify') expect(REQUEST_FEATURES as readonly string[], id).toContain(link.feature)
    }
  })

  it('keeps "coming soon" to at most three entries', () => {
    expect(INTEGRATION_ORDER.filter((id) => INTEGRATIONS[id].status === 'soon').length).toBeLessThanOrEqual(3)
  })
})

describe('integrations copy', () => {
  for (const l of HOME_LANGS) {
    it(`${l}: every string is filled in`, () => {
      const c = INTEGRATIONS_COPY[l]
      for (const k of ['nav', 'label', 'title', 'body', 'sdkTitle', 'codeLabel', 'comment1', 'comment2', 'comment3', 'wpNote', 'notify'] as const)
        expect(c[k].trim(), `${l}.${k}`).not.toBe('')
      for (const s of ['available', 'review', 'soon'] as const) expect(c.status[s].trim(), `${l}.status.${s}`).not.toBe('')
      for (const id of INTEGRATION_ORDER) {
        expect(c.items[id].value.trim(), `${l}.${id}.value`).not.toBe('')
        if (INTEGRATIONS[id].link.kind !== 'notify') expect(c.items[id].cta.trim(), `${l}.${id}.cta`).not.toBe('')
      }
    })
  }
})

describe('snippets', () => {
  const c = INTEGRATIONS_COPY.en
  for (const id of SNIPPET_ORDER) {
    it(`${id}: highlighting keeps every character`, () => {
      const code = snippet(id, c, 'https://www.ifcvieweronline.eu')
      expect(highlight(code).map((t) => t.text).join('')).toBe(code)
    })
  }

  it('colours the parts that matter', () => {
    const kinds = (code: string) => new Set(highlight(code).map((t) => t.kind))
    expect([...kinds(snippet('js', c, 'https://x'))]).toEqual(expect.arrayContaining(['tag', 'attr', 'string', 'keyword', 'comment']))
    expect(highlight('[ifc_viewer model="a.ifc"]').map((t) => t.kind)).toEqual(['tag', 'plain', 'attr', 'plain', 'string', 'tag'])
    // A string that contains "//" stays one string, not a comment.
    expect(highlight('"https://a.b/c"')).toEqual([{ kind: 'string', text: '"https://a.b/c"' }])
    // Keywords are whole words only.
    expect(highlight('important').map((t) => t.kind)).toEqual(['plain'])
  })

  it('uses the shortcode the WordPress plugin registers', () => {
    const php = readFileSync(path.resolve(__dirname, '../../../integrations/wordpress/bimo-ifc-viewer/bimo-ifc-viewer.php'), 'utf8')
    expect(php).toContain("add_shortcode( 'ifc_viewer'")
    expect(snippet('wordpress', c, '')).toMatch(/^\[ifc_viewer /)
  })
})
