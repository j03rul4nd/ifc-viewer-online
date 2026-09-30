// ─── ids-writer.ts ────────────────────────────────────────────────────────────
// IdsDocument → buildingSMART IDS 1.0 XML. The inverse of ids-parser: whatever
// the app builds (EIR profiles, specs derived from a model) can leave as a
// standard .ids file that Solibri, BIMcollab or IfcTester open. Round-trip is
// pinned by ids-writer.test.ts (write → parseIds → same document).

import type {
  IdsCardinality, IdsDocument, IdsFacet, IdsRequirement, IdsSpecification, IdsValue,
} from './ids-types'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function valueXml(tag: string, v: IdsValue | undefined, ind: string): string {
  if (!v) return ''
  if ('simpleValue' in v) return `${ind}<ids:${tag}><ids:simpleValue>${esc(v.simpleValue)}</ids:simpleValue></ids:${tag}>\n`
  const r = v.restriction
  const inner: string[] = []
  for (const e of r.enumeration ?? []) inner.push(`<xs:enumeration value="${esc(e)}"/>`)
  if (r.pattern != null) inner.push(`<xs:pattern value="${esc(r.pattern)}"/>`)
  for (const k of ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive', 'minLength', 'maxLength', 'length'] as const) {
    if (r[k] != null) inner.push(`<xs:${k} value="${r[k]}"/>`)
  }
  const base = r.base ?? 'xs:string'
  return `${ind}<ids:${tag}>\n${ind}  <xs:restriction base="${esc(base)}">\n${inner.map((l) => `${ind}    ${l}`).join('\n')}\n${ind}  </xs:restriction>\n${ind}</ids:${tag}>\n`
}

function cardinalityAttr(c: IdsCardinality | undefined): string {
  return c ? ` cardinality="${c}"` : ''
}

function facetXml(f: IdsFacet, ind: string, req?: IdsRequirement): string {
  const card = req ? cardinalityAttr(req.cardinality) : ''
  const i2 = ind + '  '
  switch (f.kind) {
    case 'entity':
      return `${ind}<ids:entity>\n${valueXml('name', f.name, i2)}${valueXml('predefinedType', f.predefinedType, i2)}${ind}</ids:entity>\n`
    case 'attribute':
      return `${ind}<ids:attribute${card}>\n${valueXml('name', f.name, i2)}${valueXml('value', f.value, i2)}${ind}</ids:attribute>\n`
    case 'property': {
      const dt = f.dataType ? ` dataType="${esc(f.dataType)}"` : ''
      return `${ind}<ids:property${dt}${card}>\n${valueXml('propertySet', f.propertySet, i2)}${valueXml('baseName', f.baseName, i2)}${valueXml('value', f.value, i2)}${ind}</ids:property>\n`
    }
    case 'classification':
      return `${ind}<ids:classification${card}>\n${valueXml('value', f.value, i2)}${valueXml('system', f.system, i2)}${ind}</ids:classification>\n`
    case 'material':
      return `${ind}<ids:material${card}>\n${valueXml('value', f.value, i2)}${ind}</ids:material>\n`
    case 'partOf': {
      const rel = f.relation ? ` relation="${esc(f.relation)}"` : ''
      const ent = f.entity ? facetXml(f.entity, i2) : ''
      return `${ind}<ids:partOf${rel}${card}>\n${ent}${ind}</ids:partOf>\n`
    }
  }
}

function specXml(s: IdsSpecification): string {
  const attrs = [`name="${esc(s.name)}"`]
  attrs.push(`ifcVersion="${esc((s.ifcVersions?.length ? s.ifcVersions : ['IFC2X3', 'IFC4', 'IFC4X3_ADD2']).join(' '))}"`)
  if (s.identifier) attrs.push(`identifier="${esc(s.identifier)}"`)
  if (s.description) attrs.push(`description="${esc(s.description)}"`)
  if (s.instructions) attrs.push(`instructions="${esc(s.instructions)}"`)
  const occurs = s.cardinality === 'optional' ? ' minOccurs="0" maxOccurs="unbounded"'
    : s.cardinality === 'prohibited' ? ' minOccurs="0" maxOccurs="0"'
    : ' minOccurs="1" maxOccurs="unbounded"'
  const app = s.applicability.map((f) => facetXml(f, '        ')).join('')
  const reqs = s.requirements.map((r) => facetXml(r.facet, '        ', r)).join('')
  return `    <ids:specification ${attrs.join(' ')}>
      <ids:applicability${occurs}>
${app}      </ids:applicability>
${reqs ? `      <ids:requirements>\n${reqs}      </ids:requirements>\n` : ''}    </ids:specification>
`
}

export interface IdsInfo {
  title?: string
  author?: string
  description?: string
  version?: string
  date?: string // YYYY-MM-DD
  purpose?: string
  milestone?: string
}

export function writeIds(doc: IdsDocument, info: IdsInfo = {}): string {
  const title = info.title ?? doc.title ?? 'Untitled'
  // IDS 1.0 constrains author to an e-mail address; omit rather than write an invalid one.
  const author = info.author && /^[^@\s]+@[^@\s]+$/.test(info.author) ? `    <ids:author>${esc(info.author)}</ids:author>\n` : ''
  const opt = (tag: string, v?: string): string => (v ? `    <ids:${tag}>${esc(v)}</ids:${tag}>\n` : '')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
  <ids:info>
    <ids:title>${esc(title)}</ids:title>
${opt('description', info.description)}${author}${opt('version', info.version)}${opt('date', info.date)}${opt('purpose', info.purpose)}${opt('milestone', info.milestone)}  </ids:info>
  <ids:specifications>
${doc.specifications.map(specXml).join('')}  </ids:specifications>
</ids:ids>
`
}
