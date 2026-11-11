// ─── Email kit ───────────────────────────────────────────────────────────────
// An email cannot run the widget, so it carries an image and a personal link.
// Tags stay unencoded except where the platform documents an encoder: wrapping a
// tag in a filter is what several platforms get wrong inside tracked links.
import { onColor, PALETTES, type TrackerConfig } from './config'

export type Esp = 'mailchimp' | 'hubspot' | 'sfmc' | 'pardot' | 'klaviyo' | 'other'
export const ESP_TAG: Record<Esp, { text: (f: string) => string; url: (f: string) => string }> = {
  mailchimp: { text: f => `*|${f.toUpperCase()}|*`, url: f => `*|${f.toUpperCase()}|*` },
  hubspot: { text: f => `{{ contact.${f} }}`, url: f => `{{ contact.${f} }}` },
  sfmc: { text: f => `%%${f}%%`, url: f => `%%=UrlEncode(%%${f}%%)=%%` },
  pardot: { text: f => `{{Recipient.${f}__c}}`, url: f => `{{Recipient.${f}__c}}` },
  klaviyo: { text: f => `{{ event.${f} }}`, url: f => `{{ event.${f} }}` },
  other: { text: f => `{{${f}}}`, url: f => `{{${f}}}` },
}
export const LINK_FIELDS = ['id', 'from', 'to', 'mode', 'status', 'etd', 'eta'] as const
export type LinkField = typeof LINK_FIELDS[number]
export type FieldNames = Record<LinkField, string>
export const DEFAULT_FIELDS: FieldNames = { id: 'track_id', from: 'track_from', to: 'track_to', mode: 'track_mode', status: 'track_status', etd: 'track_etd', eta: 'track_eta' }

export function trackingLink(o: { base: string; brand?: string; kit?: string; esp: Esp; fields: FieldNames; lookup: boolean; query: boolean; campaign?: string }): string {
  const tag = ESP_TAG[o.esp].url
  const send: readonly LinkField[] = o.lookup ? ['id'] : LINK_FIELDS
  const parts = [o.kit ? `k=${encodeURIComponent(o.kit)}` : `b=${o.brand ?? ''}`, ...send.map(f => `${f}=${tag(o.fields[f])}`)]
  if (o.campaign) parts.push(`utm_campaign=${encodeURIComponent(o.campaign)}`)
  return `${o.base.replace(/\/?$/, '/')}p.html${o.query ? '?' : '#'}${parts.join('&')}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export interface EmailWords { heading: string; ref: string; eta: string; button: string; alt: string }

/** Table layout and inline styles: the only thing every mail client agrees on. */
export function emailHtml(o: { cfg: TrackerConfig; link: string; imageBase: string; esp: Esp; fields: FieldNames; words: EmailWords }): string {
  const t = ESP_TAG[o.esp].text, th = o.cfg.theme, dark = th.preset === 'dark'
  const pal = PALETTES[dark ? 'dark' : 'light'], accent = th.accent ?? pal.accent, bg = th.panel ?? pal.panel, fg = th.text ?? pal.text, font = (th.font ?? 'Arial, Helvetica, sans-serif').replace(/"/g, "'")
  const img = `${o.imageBase.replace(/\/?$/, '/')}tracking-${t(o.fields.status)}.png`
  const logo = o.cfg.logo ? `<tr><td style="padding:20px 24px 0"><img src="${esc(o.cfg.logo)}" alt="${esc(o.cfg.title ?? '')}" height="32" style="display:block;height:32px;border:0"></td></tr>` : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${bg};color:${fg};font-family:${font};border-radius:${th.radius}px">
${logo}<tr><td style="padding:20px 24px 12px;font-size:22px;line-height:28px;font-weight:bold">${esc(o.words.heading)}</td></tr>
<tr><td style="padding:0 24px 16px;font-size:15px;line-height:22px">${esc(o.words.ref)}: <b>${t(o.fields.id)}</b><br>${t(o.fields.from)} &rarr; ${t(o.fields.to)}<br>${esc(o.words.eta)}: <b>${t(o.fields.eta)}</b></td></tr>
<tr><td><a href="${esc(o.link)}"><img src="${esc(img)}" width="600" alt="${esc(o.words.alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>
<tr><td style="padding:20px 24px 24px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${accent}" style="border-radius:6px"><a href="${esc(o.link)}" style="display:inline-block;padding:13px 24px;color:${onColor(accent)};font-size:15px;font-weight:bold;text-decoration:none">${esc(o.words.button)}</a></td></tr></table></td></tr>
</table></td></tr></table>`
}
