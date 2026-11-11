import { describe, expect, it } from 'vitest'
import { normalizeConfig } from './config'
import { DEFAULT_FIELDS, emailHtml, trackingLink } from './email'
import { encodeGif } from './gif'
import { isUnfilled, linkParams, normalizePage, outgoing, parseProducts, shipmentFromLink } from './page-config'

const link = (esp: 'mailchimp' | 'hubspot' | 'sfmc' | 'pardot' | 'klaviyo', lookup = false) => trackingLink({ base: 'https://x.test/track/v1', brand: 'BR', esp, fields: DEFAULT_FIELDS, lookup, query: false })

describe('tracking link', () => {
  it('uses each platform’s tag', () => {
    expect(link('mailchimp')).toContain('id=*|TRACK_ID|*')
    expect(link('hubspot')).toContain('id={{ contact.track_id }}')
    expect(link('sfmc')).toContain('id=%%=UrlEncode(%%track_id%%)=%%')
    expect(link('pardot')).toContain('id={{Recipient.track_id__c}}')
    expect(link('klaviyo')).toContain('id={{ event.track_id }}')
  })
  it('carries only the reference when the status comes from a lookup', () => {
    const l = link('mailchimp', true)
    expect(l).toContain('p.html#b=BR&id=')
    expect(l).not.toContain('from=')
  })
})

describe('link data', () => {
  it('reads query and fragment, and ignores unfilled tags', () => {
    const p = linkParams('?utm_campaign=q4', '#id=A%201&from=shanghai&to={{ contact.to }}&eta=*|ETA|*')
    expect(p).toEqual({ utm_campaign: 'q4', id: 'A 1', from: 'shanghai' })
    expect(shipmentFromLink(p)).toBeNull()
    expect(isUnfilled('%%x%%')).toBe(true)
    expect(isUnfilled('SHA-1')).toBe(false)
  })
  it('builds a shipment from a filled link', () => {
    expect(shipmentFromLink(linkParams('', '#id=A&from=shanghai&to=rotterdam&status=transit&mode=air'))).toMatchObject({ id: 'A', mode: 'air', status: 'transit' })
  })
})

describe('brand kit', () => {
  it('refuses scripts in links', () => {
    const p = normalizePage({ ctaLabel: 'Buy', ctaUrl: 'javascript:alert(1)', reviewUrl: 'data:text/html,x', beacon: 'http://evil.test/', supportEmail: 'a@b.co?bcc=x@y.z', products: [{ title: 'A', url: 'javascript:1' }] })
    expect(p.cta).toBeUndefined(); expect(p.reviewUrl).toBeUndefined(); expect(p.beacon).toBeUndefined(); expect(p.supportEmail).toBeUndefined(); expect(p.products).toEqual([])
  })
  it('reads per-status messages and product lines', () => {
    const p = normalizePage({ messages: { delayed: { headline: 'Sorry', ctaLabel: 'Get 10%', ctaUrl: 'https://s.test/x' } }, products: 'Kit | 9 € | https://s.test/a.jpg | https://s.test/k\nbad line' })
    expect(p.messages.delayed).toMatchObject({ headline: 'Sorry', cta: { label: 'Get 10%', url: 'https://s.test/x' } })
    expect(p.products).toHaveLength(1)
    expect(parseProducts('a|b|c|https://s.test/1\n'.repeat(9))).toHaveLength(4)
  })
  it('fills placeholders and adds campaign tags without overwriting', () => {
    const page = normalizePage({ campaign: 'q4' })
    const u = new URL(outgoing('https://s.test/o/{id}?utm_source=mine', { id: 'A 1' }, {}, page, 'cta'))
    expect(u.pathname).toBe('/o/A%201')
    expect(u.searchParams.get('utm_source')).toBe('mine')
    expect(u.searchParams.get('utm_campaign')).toBe('q4')
    expect(u.searchParams.get('utm_content')).toBe('cta')
  })
})

describe('email block', () => {
  it('uses tables, the tags and an image per status', () => {
    const html = emailHtml({ cfg: normalizeConfig({ theme: { accent: '#e4002b' } }), link: 'https://x.test/p.html#a=1&b=2', imageBase: 'https://s.test/img', esp: 'mailchimp', fields: DEFAULT_FIELDS, words: { heading: 'H<i>', ref: 'R', eta: 'E', button: 'B', alt: 'A' } })
    expect(html).toContain('https://s.test/img/tracking-*|TRACK_STATUS|*.png')
    expect(html).toContain('bgcolor="#e4002b"')
    expect(html).toContain('#a=1&amp;b=2')
    expect(html).not.toContain('H<i>')
    expect(html).not.toContain('<script')
  })
})

describe('gif', () => {
  it('writes a valid header and decodes to the same size of stream end', () => {
    const data = new Uint8ClampedArray(4 * 16).fill(200)
    const bytes = encodeGif([{ width: 4, height: 4, data, colorSpace: 'srgb' } as ImageData], 10)
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
    expect(bytes[bytes.length - 1]).toBe(0x3b)
  })
})
