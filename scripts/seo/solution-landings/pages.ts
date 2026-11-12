// The two solution pages written by scripts/seo/generate-solution-landings.ts
// (doc 24 §4, points 2 and 4): where each lives, which captures it shows and
// where every statement about another vendor or the market comes from.

import type { Lang, Solution, SourceKey } from './types'

export const SITE = 'https://www.ifcvieweronline.eu'
export const LANGS: Lang[] = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
export const SOLUTIONS: Solution[] = ['contractors', 'engineering']
export const LASTMOD = '2026-11-12'

/**
 * Every source with the day it was read. Re-read the page before changing a
 * claim and move its date. Vendor pages were read on 2026-11-12.
 */
export const SOURCES: Record<SourceKey, { url: string; label: string; read: string }> = {
  ukbimPartC: { url: 'https://ukbimframework.org/wp-content/uploads/2021/02/Guidance-Part-C_Facilitating-the-common-data-environment-workflow-and-technical-solutions_Edition-1.pdf', label: 'UK BIM Framework, Guidance Part C', read: '2026-11-11' },
  skanska: { url: 'https://www.solibri.com/articles/skanska-uk-nurtures-e2-80-a8supply-chain-collaboration', label: 'solibri.com, Skanska UK case', read: '2026-10-28' },
  cmTier2: { url: 'https://constructionmanagement.co.uk/satellite-bim5-platf4orms-t6heir-way-tier-2/', label: 'Construction Management', read: '2026-10-28' },
  bimCorner: { url: 'https://bimcorner.com/the-ifc-data-validation-nightmare-that-cost-me-weeks-and-what-helped/', label: 'BIM Corner', read: '2026-11-11' },
  catenda: { url: 'https://catenda.com/pricing', label: 'catenda.com/pricing', read: '2026-11-12' },
  dalux: { url: 'https://www.dalux.com/dalux-box/', label: 'dalux.com/dalux-box', read: '2026-11-12' },
  acc: { url: 'https://construction.autodesk.com/pricing/', label: 'construction.autodesk.com/pricing', read: '2026-11-12' },
  bimcollab: { url: 'https://www.bimcollab.com/pricing', label: 'bimcollab.com/pricing', read: '2026-11-12' },
  solibri: { url: 'https://www.solibri.com/pricing', label: 'solibri.com/pricing', read: '2026-11-12' },
}
/** Vendor names that may only appear where the section lists its sources. */
export const VENDORS = /catenda|dalux|autodesk|bimcollab|solibri/i

/** Path of each page, without slashes at the ends. */
export const SLUGS: Record<Solution, Record<Lang, string>> = {
  contractors: { en: 'for-contractors', es: 'es/para-constructoras', de: 'de/fuer-bauunternehmen', fr: 'fr/pour-entreprises-generales', pt: 'pt/para-construtoras', it: 'it/per-imprese-di-costruzione', ca: 'ca/per-a-constructores', zh: 'zh/for-contractors', ja: 'ja/for-contractors', th: 'th/for-contractors' },
  engineering: { en: 'for-engineering', es: 'es/para-ingenierias', de: 'de/fuer-ingenieurbueros', fr: 'fr/pour-bureaux-etudes', pt: 'pt/para-engenharias', it: 'it/per-studi-di-ingegneria', ca: 'ca/per-a-enginyeries', zh: 'zh/for-engineering', ja: 'ja/for-engineering', th: 'th/for-engineering' },
}

/** The plan each page opens on /pricing/ (?role=). */
export const ROLE: Record<Solution, 'receive' | 'team'> = { contractors: 'receive', engineering: 'team' }

// ── Captures ────────────────────────────────────────────────────────────────
// Real captures of the paid workspace, built dark on sample data, from
// docs-planning/capturas/ (Spanish interface, left menu cropped), encoded with
// PIL to .jpg (indexed, IPTC rights) + .webp renditions.

export const IMAGE_DIR = 'images/solutions/'

export interface Shot { file: string; width: number; height: number; webp: number[] }
const s = (file: string, width: number, height: number, webp: number[]): Shot => ({ file, width, height, webp })

export const HERO: Record<Solution, Shot> = {
  contractors: s('reception-site-overview-estimated-savings', 1600, 1406, [800, 1600]),
  engineering: s('team-dashboard-project-health', 1600, 1265, [800, 1600]),
}

/** One capture per step of the flow section, in order. */
export const FLOW: Record<Solution, Shot[]> = {
  contractors: [
    s('reception-requirements-link-for-subcontractors', 1138, 1000, [800, 1138]),
    s('reception-supplier-page-what-to-fix', 1600, 1406, [800, 1600]),
    s('reception-review-queue-before-after', 1600, 1406, [800, 1600]),
    s('reception-return-reason-elements-3d', 1600, 1406, [800, 1600]),
    s('clash-trend-estimated-cost', 800, 491, [800]),
    s('client-project-page-progress', 1138, 900, [800, 1138]),
    s('reception-site-management-report', 1600, 1406, [800, 1600]),
  ],
  engineering: [
    s('rules-geometry-relations-issue', 1138, 1000, [800, 1138]),
    s('rules-company-library-approval', 1138, 1000, [800, 1138]),
    s('clash-ignore-rules-tower', 800, 491, [800]),
    s('team-issue-suggested-fix', 1600, 1265, [800, 1600]),
    s('team-publish-gate-history', 1600, 1265, [800, 1600]),
    s('client-updates-send-by-phase', 1138, 900, [800, 1138]),
  ],
}

/** The preview-feature blog posts (same slug in every language). */
export const POSTS = {
  postReception: 'review-subcontractor-ifc-models',
  postClash: 'ifc-clash-detection-browser',
  postBatch: 'batch-validate-ifc-files',
} as const

export const IMAGE_CREDIT = 'IFC Viewer Online'
export const IMAGE_COPYRIGHT = '© 2026 IFC Viewer Online'

/** [text](key) targets. */
export const LINK_KEYS = ['viewer', 'pricing', 'contractors', 'engineering', 'postReception', 'postClash', 'postBatch', 'validator', 'fix'] as const
