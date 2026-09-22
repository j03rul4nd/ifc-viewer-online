// ─── Tools a reader can use from an article ─────────────────────────────────
// Articles explain a problem; most of them have a tool on this site that
// solves it. This is the catalogue of those tools — only pages that really
// exist — with the terms that say when one is relevant to a post.
//
// Used by the `tool` block (author picks one) and by the end-of-article
// recommendations (matched from the post's keywords, title and category).

import type { BlogPost } from './blog-posts'

export type ToolId = 'viewer' | 'validator' | 'guid-fixer' | 'fix-guides' | 'embed' | 'sdk' | 'handbook' | 'bim-handbook'

interface ToolCopy { name: string; action: string; blurb: string }

export interface BlogTool {
  id: ToolId
  icon: 'viewer' | 'check' | 'wrench' | 'code' | 'book' | 'share'
  /** Path per language; `en` is the fallback. */
  href: Partial<Record<string, string>> & { en: string }
  terms: string[]
  copy: Partial<Record<string, ToolCopy>> & { en: ToolCopy }
}

export const BLOG_TOOLS: BlogTool[] = [
  {
    id: 'validator', icon: 'check',
    href: { en: '/ifc-validator/', es: '/es/ifc-validador/', de: '/de/ifc-validator-online/', fr: '/fr/validateur-ifc-en-ligne/' },
    terms: ['validat', 'health score', 'quality', 'check', 'rule', 'deliver', 'acceptance', 'qa', 'validación', 'calidad', 'prüf', 'qualité'],
    copy: {
      en: { name: 'IFC Validator', action: 'Validate a model', blurb: '44 quality rules and a Health Score, in your browser — the file is never uploaded.' },
      es: { name: 'Validador IFC', action: 'Validar un modelo', blurb: '44 reglas de calidad y un Health Score en tu navegador; el archivo nunca se sube.' },
      de: { name: 'IFC-Validator', action: 'Modell prüfen', blurb: '44 Qualitätsregeln und ein Health Score im Browser — die Datei wird nie hochgeladen.' },
      fr: { name: 'Validateur IFC', action: 'Valider un modèle', blurb: '44 règles qualité et un Health Score dans le navigateur — le fichier n’est jamais envoyé.' },
    },
  },
  {
    id: 'guid-fixer', icon: 'wrench',
    href: { en: '/tools/fix-duplicate-guids/' },
    terms: ['guid', 'globalid', 'duplicate'],
    copy: {
      en: { name: 'Duplicate GUID fixer', action: 'Fix duplicate GUIDs', blurb: 'Find and repair duplicate GlobalIds that break BCF and model comparison.' },
      es: { name: 'Reparador de GUID duplicados', action: 'Reparar GUID duplicados', blurb: 'Encuentra y corrige GlobalIds duplicados que rompen BCF y la comparación de modelos.' },
    },
  },
  {
    id: 'fix-guides', icon: 'wrench',
    href: { en: '/fix/', es: '/es/fix/', de: '/de/fix/', fr: '/fr/fix/' },
    terms: ['fix', 'error', 'repair', 'broken', 'export', 'revit', 'missing', 'coordinates', 'corregir', 'errores', 'fehler', 'erreur'],
    copy: {
      en: { name: 'Fix guides', action: 'Browse fixes', blurb: 'One page per validation rule: what it means, why it fails, how to fix it in your authoring tool.' },
      es: { name: 'Guías de corrección', action: 'Ver correcciones', blurb: 'Una página por regla: qué significa, por qué falla y cómo corregirlo en tu software.' },
      de: { name: 'Korrekturleitfäden', action: 'Lösungen ansehen', blurb: 'Eine Seite pro Regel: Bedeutung, Ursache und Korrektur im Autorenwerkzeug.' },
      fr: { name: 'Guides de correction', action: 'Voir les corrections', blurb: 'Une page par règle : signification, cause et correction dans votre logiciel.' },
    },
  },
  {
    id: 'viewer', icon: 'viewer',
    href: { en: '/' },
    terms: ['viewer', 'view', 'open', 'properties', 'point cloud', 'lidar', 'video', 'map', 'terrain', 'visor', 'nube de puntos'],
    copy: {
      en: { name: 'IFC Viewer', action: 'Open the viewer', blurb: 'Open IFC files in the browser: properties, sections, point clouds, map context.' },
      es: { name: 'Visor IFC', action: 'Abrir el visor', blurb: 'Abre IFC en el navegador: propiedades, secciones, nubes de puntos y mapa.' },
      de: { name: 'IFC-Viewer', action: 'Viewer öffnen', blurb: 'IFC im Browser öffnen: Eigenschaften, Schnitte, Punktwolken, Kartenkontext.' },
      fr: { name: 'Visionneuse IFC', action: 'Ouvrir la visionneuse', blurb: 'Ouvrez vos IFC dans le navigateur : propriétés, coupes, nuages de points, carte.' },
    },
  },
  {
    id: 'embed', icon: 'share',
    href: { en: '/embed/' },
    terms: ['embed', 'share', 'present', 'client', 'website', 'iframe', 'compartir', 'presentación'],
    copy: {
      en: { name: 'Embed builder', action: 'Build an embed', blurb: 'Put a live, read-only IFC model on any page — for clients, tenders or docs.' },
      es: { name: 'Generador de embeds', action: 'Crear un embed', blurb: 'Pon un modelo IFC en vivo en cualquier página: clientes, licitaciones o documentación.' },
    },
  },
  {
    id: 'sdk', icon: 'code',
    href: { en: '/sdk/', es: '/sdk/es/', de: '/sdk/de/', fr: '/sdk/fr/' },
    terms: ['sdk', 'api', 'developer', 'javascript', 'integrat', 'cde', 'web-ifc', 'fragments', 'desarrollador'],
    copy: {
      en: { name: 'Viewer SDK', action: 'Read the SDK docs', blurb: 'Embed the viewer in your CDE or app and drive it with postMessage.' },
      es: { name: 'SDK del visor', action: 'Ver la documentación', blurb: 'Integra el visor en tu CDE o app y contrólalo con postMessage.' },
    },
  },
  {
    id: 'handbook', icon: 'book',
    href: { en: '/ebook/' },
    terms: ['delivery', 'iso 19650', 'bep', 'eir', 'acceptance', 'handover', 'transmittal', 'entrega'],
    copy: {
      en: { name: 'The IFC Delivery Handbook', action: 'Get the free PDF', blurb: 'How to check, prove and hand over IFC models that get accepted the first time.' },
      es: { name: 'The IFC Delivery Handbook', action: 'Descargar el PDF gratis', blurb: 'Cómo comprobar, demostrar y entregar modelos IFC que se aceptan a la primera (en inglés).' },
    },
  },
  {
    id: 'bim-handbook', icon: 'book',
    href: { en: '/ebook/bim-information-management/' },
    terms: ['information management', 'cde', 'information requirements', 'aim', 'pim', 'gestión de la información'],
    copy: {
      en: { name: 'The BIM Information Handbook', action: 'Get the free PDF', blurb: 'Information requirements, CDE workflow and ISO 19650 roles, in practice.' },
      es: { name: 'The BIM Information Handbook', action: 'Descargar el PDF gratis', blurb: 'Requisitos de información, flujo CDE y roles ISO 19650 en la práctica (en inglés).' },
    },
  },
]

export function toolById(id: string): BlogTool | undefined {
  return BLOG_TOOLS.find((t) => t.id === id)
}

export function toolCopy(tool: BlogTool, lang: string): ToolCopy {
  return tool.copy[lang.slice(0, 2)] ?? tool.copy.en
}

export function toolHref(tool: BlogTool, lang: string): string {
  return tool.href[lang.slice(0, 2)] ?? tool.href.en
}

/** Tools whose terms appear in the post's keywords, title or category. */
export function toolsForPost(post: BlogPost, limit = 3): BlogTool[] {
  const hay = [post.title, post.category, ...(post.keywords ?? [])].join(' ').toLowerCase()
  return BLOG_TOOLS
    .map((t) => ({ t, hits: t.terms.filter((term) => hay.includes(term)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((x) => x.t)
}
