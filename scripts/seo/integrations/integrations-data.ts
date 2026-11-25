// ── /integrations/ data ───────────────────────────────────────────────────────
// Status and links per integration. Status must be true on the day it ships
// (checked 2026-11-25): WordPress live on wordpress.org (1.2.0); Shopify app
// submitted to the App Store, in review; SDK, embed and MCP server live.
// Home statuses (src/components/landing/home-integrations.ts) must agree; a
// test pins that.

const WORDPRESS_ORG = 'https://wordpress.org/plugins/bimo-ifc-viewer/'

export type PageIntegrationId = 'wordpress' | 'shopify' | 'sdk' | 'embed' | 'mcp'
export type PageStatus = 'available' | 'review'

export interface PageIntegration {
  id: PageIntegrationId
  status: PageStatus
  /** Free to use today: JSON-LD gets an offer at price 0. */
  free: boolean
  /** Main call to action (absolute or site-relative). */
  href: string
  /** schema.org applicationCategory / operatingSystem. */
  category: string
  os: string
}

const GH = 'https://github.com/j03rul4nd/ifc-viewer-online/tree/main'

export const PAGE_ORDER: PageIntegrationId[] = ['wordpress', 'shopify', 'sdk', 'embed', 'mcp']

export const PAGE_INTEGRATIONS: Record<PageIntegrationId, PageIntegration> = {
  wordpress: { id: 'wordpress', status: 'available', free: true, href: WORDPRESS_ORG, category: 'WebApplication', os: 'WordPress' },
  // The app is in review; the CTA points at the free sections that work today.
  shopify: { id: 'shopify', status: 'review', free: false, href: `${GH}/integrations/shopify`, category: 'BusinessApplication', os: 'Shopify' },
  sdk: { id: 'sdk', status: 'available', free: true, href: '/sdk/', category: 'DeveloperApplication', os: 'Web browser' },
  embed: { id: 'embed', status: 'available', free: true, href: '/embed/', category: 'WebApplication', os: 'Web browser' },
  mcp: { id: 'mcp', status: 'available', free: true, href: `${GH}/mcp`, category: 'DeveloperApplication', os: 'Windows, macOS, Linux' },
}
