// ─── Discipline + batch-name inference ────────────────────────────────────────
// Federated projects arrive as one file per discipline, and the file name is the
// only thing that says which is which before the model is parsed (the IFC header
// rarely does; IfcProject is shared by every discipline of a project). Office
// conventions differ but converge on a small vocabulary — ISO 19650 role codes
// (A, S, M, E, P…), English/Spanish/Catalan/French/German/Italian/Portuguese
// words and their abbreviations — so a token table covers most real files.
//
// This is a LABEL, never a decision: nothing is grouped, filtered or hidden by
// it. A wrong guess costs a wrong badge; no guess costs no badge.

import type { DisciplineId } from './types'

// Whole-token matches (case-insensitive) → discipline. Order matters only for
// the multi-token rule below (the first recognised token wins).
const TOKENS: Record<string, DisciplineId> = {
  // Architecture
  arc: 'architecture', arch: 'architecture', archi: 'architecture', arq: 'architecture',
  ark: 'architecture', architecture: 'architecture', architectural: 'architecture',
  arquitectura: 'architecture', architektur: 'architecture', architettura: 'architecture',
  arquitetura: 'architecture', archit: 'architecture',
  // Structure
  str: 'structure', stru: 'structure', struc: 'structure', struct: 'structure',
  structure: 'structure', structural: 'structure', structures: 'structure',
  est: 'structure', estr: 'structure', estructura: 'structure', estructural: 'structure',
  estrutura: 'structure', tragwerk: 'structure', twp: 'structure', strutture: 'structure',
  strutturale: 'structure', structurel: 'structure',
  // MEP (combined services)
  mep: 'mep', mepf: 'mep', inst: 'mep', instalaciones: 'mep', installations: 'mep',
  services: 'mep', tga: 'mep', impianti: 'mep', bs: 'mep', mec: 'mep', mech: 'mep',
  mechanical: 'mep',
  // HVAC
  hvac: 'hvac', cvc: 'hvac', clima: 'hvac', climatizacion: 'hvac', clim: 'hvac',
  hlk: 'hvac', vent: 'hvac', ventilation: 'hvac', cvac: 'hvac',
  // Plumbing
  plu: 'plumbing', plb: 'plumbing', plumbing: 'plumbing', fon: 'plumbing',
  fontaneria: 'plumbing', saneamiento: 'plumbing', sanitary: 'plumbing',
  drainage: 'plumbing',
  // Electrical
  ele: 'electrical', elec: 'electrical', elect: 'electrical', electrical: 'electrical',
  electricidad: 'electrical', elt: 'electrical', elektro: 'electrical', electrique: 'electrical',
  // Fire
  fire: 'fire', fp: 'fire', pci: 'fire', incendios: 'fire', sprinkler: 'fire',
  sprinklers: 'fire', brandschutz: 'fire', ssi: 'fire',
  // Landscape
  land: 'landscape', landscape: 'landscape', lan: 'landscape', paisaje: 'landscape',
  paisajismo: 'landscape', paysage: 'landscape', landschaft: 'landscape', lnd: 'landscape',
  // Site
  site: 'site', sit: 'site', sitio: 'site', parcela: 'site', plot: 'site', topo: 'site',
  topography: 'site', topografia: 'site', terrain: 'site',
  // Civil / infrastructure
  civ: 'civil', civil: 'civil', infra: 'civil', road: 'civil', roads: 'civil',
  urb: 'civil', urbanizacion: 'civil', bridge: 'civil', puente: 'civil',
  // Interior
  int: 'interior', interior: 'interior', interiors: 'interior', interiorismo: 'interior',
  fitout: 'interior',
  // Furniture
  fur: 'furniture', furn: 'furniture', furniture: 'furniture', ffe: 'furniture',
  mob: 'furniture', mobiliario: 'furniture', mobilier: 'furniture', mobili: 'furniture',
  // Coordination / federated
  coord: 'coordination', coordination: 'coordination', fed: 'coordination',
  federated: 'coordination', federado: 'coordination', clash: 'coordination',
}

// ISO 19650 single-letter role codes are only trusted as a standalone token
// surrounded by other tokens ("PRJ-XX-ZZ-M3-A-0001") — a lone "A" at the start
// of "A_House.ifc" is far more likely an article or a version letter.
const ROLE_CODES: Record<string, DisciplineId> = {
  a: 'architecture', s: 'structure', m: 'mep', e: 'electrical', p: 'plumbing',
  l: 'landscape', c: 'civil', f: 'fire', i: 'interior', h: 'hvac',
}

function tokensOf(fileName: string): string[] {
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')                 // extension
    .replace(/([a-z])([A-Z])/g, '$1 $2')          // camelCase → camel Case
    .normalize('NFD').replace(/\p{M}/gu, '')       // strip accents
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Best-guess discipline from a file name, or null when nothing recognisable. */
export function inferDiscipline(fileName: string): DisciplineId | null {
  const tokens = tokensOf(fileName)
  for (const t of tokens) {
    const hit = TOKENS[t]
    if (hit) return hit
  }
  // ISO 19650-style codes need at least 4 tokens to be believable.
  if (tokens.length >= 4) {
    for (let i = 1; i < tokens.length - 1; i++) {
      const hit = ROLE_CODES[tokens[i]]
      if (hit) return hit
    }
  }
  return null
}

/** True when a token names a discipline (so batch naming can drop it). */
function isDisciplineToken(token: string): boolean {
  return token in TOKENS || (token.length === 1 && token in ROLE_CODES)
}

// ISO 19650 container-name fields that carry no identity for a human: volume /
// level placeholders ("ZZ", "XX", "00") and information-type codes ("M3" model,
// "DR" drawing, "M2"). "BCN-IVO-ZZ-XX-M3-A-0002" is project BCN by
// originator IVO — the rest of the shared prefix is filler.
const ISO_FILLER = new Set(['zz', 'xx', '00', 'm2', 'm3', 'dr'])

function isNameFiller(token: string): boolean {
  return isDisciplineToken(token) || ISO_FILLER.has(token)
}

/**
 * A human name for files submitted together.
 *   ["Hotel_Vela_ARC.ifc", "Hotel_Vela_STR.ifc", "Hotel_Vela_MEP.ifc"] → "Hotel Vela"
 *   ["BCN-IVO-ZZ-XX-M3-A-0002.ifc", "BCN-IVO-ZZ-XX-M3-S-0002.ifc"]      → "BCN IVO"
 *   ["Tower-STR.ifc"]                                                    → "Tower"
 * Returns null when the files share nothing meaningful (the caller then
 * falls back to a count, e.g. "4 models").
 */
export function inferBatchName(fileNames: readonly string[]): string | null {
  if (fileNames.length === 0) return null
  const split = fileNames.map((n) =>
    n.replace(/\.[a-z0-9]+$/i, '').split(/[_\-.\s]+/).filter(Boolean),
  )
  if (split.length === 1) {
    const kept = split[0].filter((t) => !isDisciplineToken(t.toLowerCase()))
    const name = (kept.length > 0 ? kept : split[0]).join(' ').trim()
    return name || null
  }
  // Longest common token prefix, compared case-insensitively.
  const prefix: string[] = []
  const first = split[0]
  for (let i = 0; i < first.length; i++) {
    const tok = first[i].toLowerCase()
    if (split.every((s) => s[i]?.toLowerCase() === tok)) prefix.push(first[i])
    else break
  }
  const kept = prefix.filter((t) => !isNameFiller(t.toLowerCase()))
  const name = kept.join(' ').trim()
  return name.length >= 2 ? name : null
}
