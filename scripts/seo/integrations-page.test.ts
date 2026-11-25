// Pins /integrations/ ×10: copy complete, SERP budget, honest statuses that
// agree with the home, structured data that parses, generated files fresh,
// sitemap and llms.txt aware, and no assistant/AI wording in the copy.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { INTEGRATIONS_LANGS, integrationsPath } from '../../src/lib/integrations/integrations-paths'
import { INTEGRATIONS, WORDPRESS_ORG, allIntegrationsHref } from '../../src/components/landing/home-integrations'
import { PAGE_INTEGRATIONS, PAGE_ORDER } from './integrations/integrations-data'
import { COPY } from './integrations/integrations-i18n'
import { renderIntegrationsPage, structuredData } from './generate-integrations-page'

const ROOT = path.resolve(__dirname, '..', '..')
const SITE = 'https://www.ifcvieweronline.eu'

const paths = (o: unknown, pre = ''): string[] =>
  typeof o === 'string' ? [pre] : Array.isArray(o) ? o.flatMap((v, i) => paths(v, `${pre}[${i}]`))
    : Object.entries(o as object).flatMap(([k, v]) => paths(v, pre ? `${pre}.${k}` : k))
const get = (o: unknown, p: string): unknown => p.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o)

describe('integrations page data', () => {
  it('agrees with the home on every shared status', () => {
    for (const id of ['wordpress', 'shopify', 'sdk', 'mcp'] as const) expect(PAGE_INTEGRATIONS[id].status, id).toBe(INTEGRATIONS[id].status)
    expect(INTEGRATIONS.wordpress.status).toBe('available')
    expect(INTEGRATIONS.shopify.status).toBe('review')
  })
  it('WordPress links to wordpress.org, Shopify to this page', () => {
    expect(WORDPRESS_ORG).toBe('https://wordpress.org/plugins/bimo-ifc-viewer/')
    expect(INTEGRATIONS.wordpress.link).toEqual({ kind: 'external', href: WORDPRESS_ORG })
    expect(PAGE_INTEGRATIONS.wordpress.href).toBe(WORDPRESS_ORG)
    const l = INTEGRATIONS.shopify.link
    expect(l.kind).toBe('page')
    if (l.kind === 'page') expect(l.href('es')).toBe('/es/integraciones/#shopify')
    expect(allIntegrationsHref('en')).toBe('/integrations/')
  })
})

describe('integrations copy ×10', () => {
  const enPaths = paths(COPY.en)
  it.each(INTEGRATIONS_LANGS)('%s has every string and fits the SERP budget', (lang) => {
    for (const p of enPaths) expect(get(COPY[lang], p), `${lang}: ${p}`).toSatisfy((v: unknown) => typeof v === 'string' && v.trim().length > 0)
    expect(paths(COPY[lang]).length).toBe(enPaths.length)
    expect(COPY[lang].meta.title.length, lang).toBeLessThanOrEqual(60)
    expect(COPY[lang].meta.description.length, lang).toBeLessThanOrEqual(160)
  })
  it.each(INTEGRATIONS_LANGS)('%s never mentions AI or an assistant brand', (lang) => {
    const text = paths(COPY[lang]).map((p) => get(COPY[lang], p) as string).join('\n')
    expect(text).not.toMatch(/\b(AI|IA|KI|LLM|Claude|ChatGPT|Copilot|Cursor)\b|人工智能|人工知能|ปัญญาประดิษฐ์/)
  })
})

describe('rendered page', () => {
  it.each(INTEGRATIONS_LANGS)('%s: head, sections and structured data', (lang) => {
    const html = renderIntegrationsPage(lang)
    expect(html).toContain(`<link rel="canonical" href="${SITE}${integrationsPath(lang)}" />`)
    expect(html.match(/<link rel="alternate" hreflang=/g)).toHaveLength(11)
    expect(html.match(/<h1>/g)).toHaveLength(1)
    for (const id of PAGE_ORDER) expect(html).toContain(`id="${id}"`)
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    expect(lds).toHaveLength(1)
    const graph = lds[0]['@graph'] as Array<Record<string, unknown>>
    expect(graph.filter((n) => n['@type'] === 'BreadcrumbList')).toHaveLength(1)
    const apps = graph.filter((n) => n['@type'] === 'SoftwareApplication')
    expect(apps).toHaveLength(PAGE_ORDER.length)
    for (const a of apps) {
      const id = String(a['@id']).split('#')[1] as keyof typeof PAGE_INTEGRATIONS
      expect(Boolean(a.offers), id).toBe(PAGE_INTEGRATIONS[id].free)
      if (a.offers) expect((a.offers as { price: string }).price).toBe('0')
    }
  })
  it('structured data is the same object the page embeds', () => {
    expect(renderIntegrationsPage('en')).toContain(JSON.stringify(structuredData('en')).slice(0, 40))
  })
})

describe('generated files', () => {
  it.each(INTEGRATIONS_LANGS)('%s: public file is fresh (run npm run seo:integrations)', (lang) => {
    const file = readFileSync(path.join(ROOT, 'public', integrationsPath(lang), 'index.html'), 'utf-8').replace(/\r\n/g, '\n')
    expect(file).toBe(renderIntegrationsPage(lang))
  })
  it('sitemap lists every language with its alternates', () => {
    const xml = readFileSync(path.join(ROOT, 'public/sitemap.xml'), 'utf-8')
    for (const l of INTEGRATIONS_LANGS) expect(xml).toContain(`<loc>${SITE}${integrationsPath(l)}</loc>`)
    expect(xml.match(/<!-- integrations:start/g)).toHaveLength(1)
  })
  it('llms.txt points at the page and the live plugin', () => {
    const txt = readFileSync(path.join(ROOT, 'public/llms.txt'), 'utf-8')
    expect(txt).toContain(`${SITE}/integrations/`)
    expect(txt).toContain(WORDPRESS_ORG)
  })
})
