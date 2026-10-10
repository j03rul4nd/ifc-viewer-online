// ─── ifc-item-data.ts ─────────────────────────────────────────────────────────
// An element's IFC data — attributes, property sets, the type it is an
// occurrence of, units — read out of what @thatopen/fragments' getItemsData()
// returns. Pure (no three.js, no fragments runtime) so the real converter's
// output can be pinned in a test: scripts/ifc-item-data.test.ts converts the
// BESCOF fixtures with fragments' own IfcImporter and runs them through here.
//
// What fragments does with an IFC, which is not what the schema says:
//
//  • GlobalId is NOT an attribute. The importer lifts it into the item's guid,
//    and getItemsData reports it as `_guid`. Reading `GlobalId` gives nothing.
//  • IfcRelDefinesByType lands under the occurrence's `IsDefinedBy` — the same
//    key as its property sets — pointing straight at the type object (the
//    relationship entity itself is skipped). Nothing is ever filed under
//    `IsTypedBy`, which is where this code used to look.
//  • Every attribute that references another entity (a type's
//    `HasPropertySets`, a pset's `HasProperties`, a property's `Unit`) becomes
//    a relation named after the attribute, and is only expanded when the
//    request says so — by that name, or by inheriting its parent's setting.
//  • `attributesDefault: false` + a list keeps ONLY those attributes on EVERY
//    item of the tree, not just the element: with the old list a property
//    came back without its `NominalValue`, so every value read as null.
//
// IFC2x3 types the default importer does not store (IfcWindowStyle,
// IfcDoorStyle) and property shapes it skips are added to the conversion in
// ifc-importer-classes.ts; without them the relation points at nothing.

/** A single IFC attribute value from getItemsData() */
export interface IFCAttribute {
  type?: string
  value: string | number | boolean | null
}

export type IFCValue = string | number | boolean | null

/** One property of a property set. */
export interface IFCProperty {
  /** express ID of the IfcProperty entity */
  expressId: number
  name: string
  /** The value — for an enumerated / list / bounded property, its first one. */
  value: IFCValue
  /** IFC value type, e.g. `IFCTHERMALTRANSMITTANCEMEASURE`, `IFCLABEL`. */
  type?: string
  /**
   * Unit symbol (`mm`, `W/(m²·K)`): the property's own `Unit`, else the
   * project's unit for this measure. Absent when neither says.
   */
  unit?: string
  /** Every value an enumerated / list / bounded property holds (2 or more). */
  values?: IFCValue[]
  /**
   * Type properties only: the occurrence defines the same property in a set of
   * the same name, and its value is the one that applies (see
   * `effectivePropertySets`).
   */
  overridden?: boolean
}

/** A Property Set (Pset) with its contained properties */
export interface IFCPropertySet {
  /** express ID of the IfcPropertySet entity */
  expressId: number
  name: string
  properties: IFCProperty[]
}

/** A property as it applies to the element, and where it came from. */
export interface IFCEffectiveProperty extends IFCProperty {
  source: 'occurrence' | 'type'
}

/** Occurrence and type property sets merged — the occurrence's value wins. */
export interface IFCEffectivePropertySet {
  name: string
  properties: IFCEffectiveProperty[]
}

/** An Element Quantity Set (IfcElementQuantity) */
export interface IFCQuantitySet {
  expressId: number
  name: string
  quantities: Array<{
    expressId: number
    name: string
    value: number | null
    quantityType: 'Length' | 'Area' | 'Volume' | 'Count' | 'Weight' | 'Time' | 'Unknown'
    /** The quantity's own unit, else the project's for its kind. */
    unit?: string
  }>
}

/** A material associated to an element */
export interface IFCMaterial {
  name: string
  layerThickness?: number
}

/** Structured data returned by getItemData() */
export interface IFCItemData {
  /** IFC class of the element, e.g. `IFCWINDOW`. */
  ifcClass: string | null
  /** IFC Name attribute */
  name: string | null
  /** IFC LongName attribute */
  longName: string | null
  /** IFC Description attribute */
  description: string | null
  /** IFC GlobalId attribute */
  globalId: string | null
  /** IFC ObjectType attribute */
  objectType: string | null
  /** IFC Tag attribute */
  tag: string | null
  /** Storey name from ContainedInStructure relation */
  storey: string | null
  /** The element's own property sets (IfcRelDefinesByProperties), quantities excluded */
  propertySets: IFCPropertySet[]
  /** IfcElementQuantity entries from IsDefinedBy */
  quantitySets: IFCQuantitySet[]
  /** Property sets of the element's type (IfcRelDefinesByType → HasPropertySets) */
  typeProperties: IFCPropertySet[]
  /** Name attribute of the element's type, e.g. "Ventana V-70 practicable" */
  typeName: string | null
  /** express ID of the type object */
  typeId: number | null
  /** IFC class of the type object, e.g. `IFCWINDOWTYPE`, `IFCWINDOWSTYLE` */
  typeClass: string | null
  /** GlobalId of the type object */
  typeGlobalId: string | null
  /** Type and occurrence property sets merged; the occurrence's value wins. */
  effectivePropertySets: IFCEffectivePropertySet[]
  /** Materials from HasAssociations */
  materials: IFCMaterial[]
  /** Raw data for debugging / future use */
  raw: Record<string, unknown>
}

// ─── What to ask fragments for ────────────────────────────────────────────────

type RelConfig = { attributes: boolean; relations: boolean }
const BOTH: RelConfig = { attributes: true, relations: true }
const NONE: RelConfig = { attributes: false, relations: false }

/**
 * Relations a property / unit tree needs, and the back-references that must
 * stay shut. An unlisted relation inherits its parent's setting, so the
 * shut ones are listed on purpose: each leads from the element to every
 * OTHER element that shares the thing (a type's `ObjectTypeOf`, a pset's
 * `DefinesOccurrence`, a material's `AssociatedTo`) — on a real model that
 * is thousands of items per click, and a cycle back to the element itself.
 */
const SHARED_RELATIONS: Record<string, RelConfig> = {
  HasProperties:        BOTH,  // a pset's properties (complex properties nest more)
  Quantities:           BOTH,  // an IfcElementQuantity's quantities
  Unit:                 BOTH,  // a property's / quantity's / unit element's unit
  Elements:             BOTH,  // a derived unit's factors
  EnumerationReference: NONE,  // the allowed values; the chosen ones are an attribute
  Dimensions:           NONE,
  ConversionFactor:     NONE,
  DefinesOccurrence:    NONE,
  ObjectTypeOf:         NONE,
  AssociatedTo:         NONE,
  RepresentationMaps:   NONE,
}

/** What getItemData / getElementsDetail ask fragments for (one definition). */
export const ITEM_DATA_CONFIG = {
  // Every attribute (the list is then an exclusion list): values live in
  // NominalValue, LengthValue, Exponent, UnitType… on the nested items.
  attributesDefault: true,
  attributes: [] as string[],
  relations: {
    ...SHARED_RELATIONS,
    // Property sets, quantity sets AND the type object (see the header).
    IsDefinedBy:          BOTH,
    // Where other importers file the type. Kept so either shape reads.
    IsTypedBy:            BOTH,
    // A type's property sets: an attribute, stored as a relation.
    HasPropertySets:      BOTH,
    ContainedInStructure: { attributes: true, relations: false },
    HasAssociations:      BOTH,
  },
}

/** What the project's unit assignment is read with (see parseProjectUnits). */
export const PROJECT_UNITS_CONFIG = {
  attributesDefault: true,
  attributes: [] as string[],
  relations: {
    ...SHARED_RELATIONS,
    UnitsInContext: BOTH,
    Units:          BOTH,
  },
}

// ─── Small readers ────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>

function isObj(v: unknown): v is Raw {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** String value of an IFC attribute (`{ value }`), or null. */
export function attrStr(attr: unknown): string | null {
  if (!isObj(attr)) return null
  if ('value' in attr && (typeof attr.value === 'string' || attr.value === null)) {
    return attr.value as string | null
  }
  return null
}

function attrNum(attr: unknown): number | null {
  if (!isObj(attr)) return null
  return typeof attr.value === 'number' && Number.isFinite(attr.value) ? attr.value : null
}

function attrValue(attr: unknown): IFCValue {
  if (!isObj(attr) || !('value' in attr)) return null
  const v = attr.value
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null ? v : null
}

function attrType(attr: unknown): string | undefined {
  return isObj(attr) && typeof attr.type === 'string' && attr.type !== 'UNDEFINED' ? attr.type : undefined
}

function category(item: Raw): string | null {
  const c = attrStr(item._category)
  return c ? c.toUpperCase() : null
}

function localId(item: Raw): number {
  const fromFragments = attrNum(item._localId)
  if (fromFragments !== null) return fromFragments
  return typeof item.expressID === 'number' ? item.expressID : 0
}

function list(v: unknown): Raw[] {
  return Array.isArray(v) ? v.filter(isObj) : []
}

/** GlobalId: fragments reports it as `_guid`; a raw web-ifc line as `GlobalId`. */
function guidOf(item: Raw): string | null {
  return attrStr(item.GlobalId) ?? attrStr(item._guid)
}

/** Every IfcTypeObject subclass is named …Type or …Style (IFC2x3 windows/doors). */
function isTypeObject(item: Raw): boolean {
  const cls = category(item)
  if (cls) return /(TYPE|STYLE)$/.test(cls) && cls !== 'IFCRELDEFINESBYTYPE'
  // No category (another importer's shape): a type carries HasPropertySets.
  return 'HasPropertySets' in item && !('HasProperties' in item)
}

// ─── Units ────────────────────────────────────────────────────────────────────

/** Unit type (`LENGTHUNIT`, `THERMALTRANSMITTANCEUNIT`…) → symbol, from the project. */
export type ProjectUnits = Partial<Record<string, string>>

const SI_PREFIX: Record<string, string> = {
  EXA: 'E', PETA: 'P', TERA: 'T', GIGA: 'G', MEGA: 'M', KILO: 'k', HECTO: 'h', DECA: 'da',
  DECI: 'd', CENTI: 'c', MILLI: 'm', MICRO: 'µ', NANO: 'n', PICO: 'p', FEMTO: 'f', ATTO: 'a',
}

const SI_NAME: Record<string, string> = {
  METRE: 'm', SQUARE_METRE: 'm²', CUBIC_METRE: 'm³', GRAM: 'g', SECOND: 's', KELVIN: 'K',
  DEGREE_CELSIUS: '°C', RADIAN: 'rad', STERADIAN: 'sr', WATT: 'W', PASCAL: 'Pa', NEWTON: 'N',
  JOULE: 'J', HERTZ: 'Hz', AMPERE: 'A', VOLT: 'V', OHM: 'Ω', LUX: 'lx', LUMEN: 'lm',
  CANDELA: 'cd', MOLE: 'mol', COULOMB: 'C', FARAD: 'F', HENRY: 'H', SIEMENS: 'S', TESLA: 'T',
  WEBER: 'Wb', BECQUEREL: 'Bq', GRAY: 'Gy', SIEVERT: 'Sv',
}

/** Named derived units, for when the factors were not stored. */
const DERIVED_UNIT: Record<string, string> = {
  THERMALTRANSMITTANCEUNIT: 'W/(m²·K)', THERMALCONDUCTANCEUNIT: 'W/(m·K)',
  HEATFLUXDENSITYUNIT: 'W/m²', MASSDENSITYUNIT: 'kg/m³', VOLUMETRICFLOWRATEUNIT: 'm³/s',
  MASSFLOWRATEUNIT: 'kg/s', LINEARVELOCITYUNIT: 'm/s', LINEARFORCEUNIT: 'N/m',
  PLANARFORCEUNIT: 'N/m²', ACCELERATIONUNIT: 'm/s²', SPECIFICHEATCAPACITYUNIT: 'J/(kg·K)',
  THERMALRESISTANCEUNIT: 'm²·K/W', SOUNDPOWERLEVELUNIT: 'dB', SOUNDPRESSURELEVELUNIT: 'dB',
}

const CONVERSION_UNIT: Record<string, string> = {
  DEGREE: '°', INCH: 'in', FOOT: 'ft', YARD: 'yd', MILE: 'mi', 'SQUARE INCH': 'in²',
  'SQUARE FOOT': 'ft²', 'CUBIC INCH': 'in³', 'CUBIC FOOT': 'ft³', POUND: 'lb', GALLON: 'gal',
  LITRE: 'l', LITER: 'l', ACRE: 'ac', HOUR: 'h', MINUTE: 'min', DAY: 'd',
}

/** Measure type → the unit type the project assigns it. */
const MEASURE_UNIT_TYPE: Record<string, string> = {
  IFCLENGTHMEASURE: 'LENGTHUNIT', IFCPOSITIVELENGTHMEASURE: 'LENGTHUNIT',
  IFCNONNEGATIVELENGTHMEASURE: 'LENGTHUNIT', IFCAREAMEASURE: 'AREAUNIT',
  IFCVOLUMEMEASURE: 'VOLUMEUNIT', IFCMASSMEASURE: 'MASSUNIT',
  IFCPLANEANGLEMEASURE: 'PLANEANGLEUNIT', IFCPOSITIVEPLANEANGLEMEASURE: 'PLANEANGLEUNIT',
  IFCTIMEMEASURE: 'TIMEUNIT', IFCTHERMODYNAMICTEMPERATUREMEASURE: 'THERMODYNAMICTEMPERATUREUNIT',
  IFCTHERMALTRANSMITTANCEMEASURE: 'THERMALTRANSMITTANCEUNIT',
  IFCTHERMALCONDUCTIVITYMEASURE: 'THERMALCONDUCTANCEUNIT', IFCPOWERMEASURE: 'POWERUNIT',
  IFCPRESSUREMEASURE: 'PRESSUREUNIT', IFCFORCEMEASURE: 'FORCEUNIT', IFCENERGYMEASURE: 'ENERGYUNIT',
  IFCFREQUENCYMEASURE: 'FREQUENCYUNIT', IFCELECTRICCURRENTMEASURE: 'ELECTRICCURRENTUNIT',
  IFCELECTRICVOLTAGEMEASURE: 'ELECTRICVOLTAGEUNIT', IFCILLUMINANCEMEASURE: 'ILLUMINANCEUNIT',
  IFCLUMINOUSFLUXMEASURE: 'LUMINOUSFLUXUNIT', IFCMASSDENSITYMEASURE: 'MASSDENSITYUNIT',
  IFCVOLUMETRICFLOWRATEMEASURE: 'VOLUMETRICFLOWRATEUNIT', IFCLINEARVELOCITYMEASURE: 'LINEARVELOCITYUNIT',
  IFCHEATFLUXDENSITYMEASURE: 'HEATFLUXDENSITYUNIT', IFCMASSFLOWRATEMEASURE: 'MASSFLOWRATEUNIT',
  IFCSOUNDPOWERLEVELMEASURE: 'SOUNDPOWERLEVELUNIT', IFCSOUNDPRESSURELEVELMEASURE: 'SOUNDPRESSURELEVELUNIT',
  IFCMONETARYMEASURE: 'MONETARYUNIT',
}

const QUANTITY_UNIT_TYPE: Record<string, string> = {
  Length: 'LENGTHUNIT', Area: 'AREAUNIT', Volume: 'VOLUMEUNIT', Weight: 'MASSUNIT', Time: 'TIMEUNIT',
}

const SUPERSCRIPT: Record<string, string> = { '-': '⁻', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', 0: '⁰' }

function withExponent(symbol: string, exp: number): string {
  if (exp === 1) return symbol
  return symbol + String(exp).split('').map((c) => SUPERSCRIPT[c] ?? c).join('')
}

/** `W·m⁻²·K⁻¹` as a reader writes it: `W/(m²·K)`. */
function composeDerived(factors: Array<{ symbol: string; exp: number }>): string | null {
  if (factors.length === 0 || factors.some((f) => !f.symbol || !Number.isFinite(f.exp) || f.exp === 0)) return null
  const num = factors.filter((f) => f.exp > 0).map((f) => withExponent(f.symbol, f.exp))
  const den = factors.filter((f) => f.exp < 0).map((f) => withExponent(f.symbol, -f.exp))
  const top = num.length ? num.join('·') : '1'
  if (den.length === 0) return top
  return den.length === 1 ? `${top}/${den[0]}` : `${top}/(${den.join('·')})`
}

function unitTypeOf(unit: Raw): string | null {
  const t = attrStr(unit.UnitType)
  if (t) return t.toUpperCase()
  return category(unit) === 'IFCMONETARYUNIT' ? 'MONETARYUNIT' : null
}

/** The symbol of an IfcSIUnit / IfcConversionBasedUnit / IfcDerivedUnit / IfcMonetaryUnit. */
export function unitSymbol(unit: unknown): string | null {
  if (!isObj(unit)) return null
  const cls = category(unit)
  const name = attrStr(unit.Name)

  if (cls === 'IFCMONETARYUNIT' || 'Currency' in unit) {
    return attrStr(unit.Currency) ?? null
  }
  if (cls === 'IFCDERIVEDUNIT' || 'Elements' in unit) {
    const factors = list(unit.Elements).map((el) => ({
      symbol: unitSymbol(list(el.Unit)[0] ?? el.Unit) ?? '',
      exp: attrNum(el.Exponent) ?? NaN,
    }))
    const composed = composeDerived(factors)
    if (composed) return composed
    const type = unitTypeOf(unit)
    if (type === 'USERDEFINED') return attrStr(unit.UserDefinedType)
    return type ? DERIVED_UNIT[type] ?? null : null
  }
  if (!name) return null
  const upper = name.toUpperCase()
  const si = cls === 'IFCCONVERSIONBASEDUNIT' ? undefined : SI_NAME[upper]
  // A conversion-based unit names itself ('DEGREE', 'FOOT', or anything the
  // author typed): show the usual symbol, else the name as written.
  if (!si) return CONVERSION_UNIT[upper] ?? name
  const prefix = attrStr(unit.Prefix)
  return (prefix ? SI_PREFIX[prefix.toUpperCase()] ?? '' : '') + si
}

/**
 * The project's unit assignment (IfcProject → UnitsInContext → Units), as
 * unit type → symbol. A measure that names no unit is in these: a
 * ThermalTransmittance of 1.2 in a project that assigns W/(m²·K) is
 * 1.2 W/(m²·K). Read with PROJECT_UNITS_CONFIG.
 */
export function parseProjectUnits(project: unknown): ProjectUnits {
  const out: ProjectUnits = {}
  if (!isObj(project)) return out
  for (const assignment of list(project.UnitsInContext)) {
    for (const unit of list(assignment.Units)) {
      const type = unitTypeOf(unit)
      const symbol = unitSymbol(unit)
      if (type && symbol && !(type in out)) out[type] = symbol
    }
  }
  return out
}

function propertyUnit(prop: Raw, valueType: string | undefined, units: ProjectUnits): string | undefined {
  const own = unitSymbol(list(prop.Unit)[0] ?? prop.Unit)
  if (own) return own
  const unitType = valueType ? MEASURE_UNIT_TYPE[valueType.toUpperCase()] : undefined
  return (unitType && units[unitType]) || undefined
}

// ─── Property sets ────────────────────────────────────────────────────────────

/**
 * Values of every IfcSimpleProperty shape, first one first: single
 * (NominalValue), enumerated (EnumerationValues), list (ListValues), bounded
 * (SetPoint / Upper / Lower). Fragments stores a list attribute as one value
 * holding the array, with the type of its first member.
 */
function propertyValues(prop: Raw): { values: IFCValue[]; type?: string } {
  const values: IFCValue[] = []
  let type: string | undefined
  const take = (attr: unknown): void => {
    if (!isObj(attr) || !('value' in attr)) return
    type ??= attrType(attr)
    const v = attr.value
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean' || x === null) values.push(x)
        else if (isObj(x) && 'value' in x) values.push(attrValue(x))
      }
    } else {
      values.push(attrValue(attr))
    }
  }
  take(prop.NominalValue)
  take(prop.EnumerationValues)
  take(prop.ListValues)
  take(prop.SetPointValue)
  take(prop.UpperBoundValue)
  take(prop.LowerBoundValue)
  return { values, type }
}

function readProperties(holder: Raw, units: ProjectUnits, prefix = ''): IFCProperty[] {
  const out: IFCProperty[] = []
  for (const prop of list(holder.HasProperties)) {
    const name = attrStr(prop.Name)
    if (!name) continue
    // An IfcComplexProperty groups more properties: flatten as "Group / Name".
    if (Array.isArray(prop.HasProperties)) {
      out.push(...readProperties(prop, units, `${prefix}${name} / `))
      continue
    }
    const { values, type } = propertyValues(prop)
    const unit = propertyUnit(prop, type, units)
    out.push({
      expressId: localId(prop),
      name: prefix + name,
      value: values[0] ?? null,
      ...(type ? { type } : {}),
      ...(unit ? { unit } : {}),
      ...(values.length > 1 ? { values } : {}),
    })
  }
  return out
}

/** Property sets among `IsDefinedBy` / `HasPropertySets` entries (quantity sets and types skipped). */
export function formatPsets(entries: unknown, units: ProjectUnits = {}): IFCPropertySet[] {
  const result: IFCPropertySet[] = []
  for (const pset of list(entries)) {
    if (!Array.isArray(pset.HasProperties)) continue
    const name = attrStr(pset.Name)
    if (!name) continue
    result.push({ expressId: localId(pset), name, properties: readProperties(pset, units) })
  }
  return result
}

/** IfcElementQuantity entries among `IsDefinedBy`. */
export function formatQuantities(isDefinedBy: unknown, units: ProjectUnits = {}): IFCQuantitySet[] {
  const result: IFCQuantitySet[] = []
  for (const e of list(isDefinedBy)) {
    if (!Array.isArray(e.Quantities)) continue // only IfcElementQuantity
    const name = attrStr(e.Name)
    if (!name) continue
    const quantities: IFCQuantitySet['quantities'] = []
    for (const q of list(e.Quantities)) {
      const qName = attrStr(q.Name)
      if (!qName) continue
      let value: number | null = null
      let quantityType: IFCQuantitySet['quantities'][number]['quantityType'] = 'Unknown'
      if ((value = attrNum(q.LengthValue)) !== null)       quantityType = 'Length'
      else if ((value = attrNum(q.AreaValue)) !== null)    quantityType = 'Area'
      else if ((value = attrNum(q.VolumeValue)) !== null)  quantityType = 'Volume'
      else if ((value = attrNum(q.CountValue)) !== null)   quantityType = 'Count'
      else if ((value = attrNum(q.WeightValue)) !== null)  quantityType = 'Weight'
      else if ((value = attrNum(q.TimeValue)) !== null)    quantityType = 'Time'
      const unitType = QUANTITY_UNIT_TYPE[quantityType]
      const unit = unitSymbol(list(q.Unit)[0] ?? q.Unit) ?? (unitType ? units[unitType] : undefined)
      quantities.push({ expressId: localId(q), name: qName, value, quantityType, ...(unit ? { unit } : {}) })
    }
    result.push({ expressId: localId(e), name, quantities })
  }
  return result
}

// ─── The type ─────────────────────────────────────────────────────────────────

export interface ResolvedType {
  typeId: number | null
  typeName: string | null
  typeClass: string | null
  typeGlobalId: string | null
  psets: IFCPropertySet[]
}

const NO_TYPE: ResolvedType = { typeId: null, typeName: null, typeClass: null, typeGlobalId: null, psets: [] }

/**
 * The element's type object: under `IsTypedBy` when an importer files it
 * there, else the type among `IsDefinedBy` (fragments). An occurrence has at
 * most one type (IfcRelDefinesByType is 1:n), so the first one is it.
 */
export function resolveType(raw: Raw, units: ProjectUnits = {}): ResolvedType {
  const candidates = [...list(raw.IsTypedBy), ...list(raw.IsDefinedBy).filter(isTypeObject)]
  const t = candidates[0]
  if (!t) return NO_TYPE
  return {
    typeId: localId(t) || null,
    typeName: attrStr(t.Name),
    typeClass: category(t),
    typeGlobalId: guidOf(t),
    psets: formatPsets(t.HasPropertySets, units),
  }
}

// ─── Occurrence over type ─────────────────────────────────────────────────────

/**
 * Type and occurrence property sets merged by set and property name, the
 * occurrence's value winning — IFC's rule: a type's property applies to every
 * occurrence that does not define it itself. Sets keep the occurrence's order,
 * then the type's; within a set, the occurrence's properties come first.
 */
export function mergeEffectivePropertySets(
  occurrence: IFCPropertySet[], type: IFCPropertySet[],
): IFCEffectivePropertySet[] {
  const merged = new Map<string, Map<string, IFCEffectiveProperty>>()
  const add = (sets: IFCPropertySet[], source: 'occurrence' | 'type'): void => {
    for (const set of sets) {
      let props = merged.get(set.name)
      if (!props) { props = new Map(); merged.set(set.name, props) }
      for (const p of set.properties) {
        if (props.has(p.name)) continue // first writer wins: the occurrence goes first
        const { overridden: _overridden, ...rest } = p
        props.set(p.name, { ...rest, source })
      }
    }
  }
  add(occurrence, 'occurrence')
  add(type, 'type')
  return [...merged].map(([name, props]) => ({ name, properties: [...props.values()] }))
}

/** Mark every type property the occurrence redefines (same set, same name). */
export function markOverridden(type: IFCPropertySet[], occurrence: IFCPropertySet[]): IFCPropertySet[] {
  const own = new Set(occurrence.flatMap((s) => s.properties.map((p) => `${s.name}\u0000${p.name}`)))
  if (own.size === 0) return type
  return type.map((s) => ({
    ...s,
    properties: s.properties.map((p) => (own.has(`${s.name}\u0000${p.name}`) ? { ...p, overridden: true } : p)),
  }))
}

// ─── Storey, materials ────────────────────────────────────────────────────────

function extractStorey(containedInStructure: unknown): string | null {
  // fragments resolves the relation to the IfcBuildingStorey itself.
  for (const s of list(containedInStructure)) {
    const name = attrStr(s.Name)
    if (name) return name
  }
  return null
}

export function parseAssociations(hasAssociations: unknown): IFCMaterial[] {
  const result: IFCMaterial[] = []
  const addMaterial = (obj: unknown, layerThickness?: number): void => {
    const o = list(obj)[0] ?? (isObj(obj) ? obj : null)
    if (!o) return
    const name = attrStr(o.Name)
    if (name) result.push({ name, ...(layerThickness !== undefined ? { layerThickness } : {}) })
  }
  for (const e of list(hasAssociations)) {
    // IfcMaterial directly
    if (attrStr(e.Name) && !Array.isArray(e.MaterialLayers) && !Array.isArray(e.Materials) && !Array.isArray(e.MaterialConstituents)) {
      addMaterial(e)
      continue
    }
    // IfcMaterialLayerSetUsage → ForLayerSet → MaterialLayers[]
    for (const ls of [...list(e.ForLayerSet), ...(isObj(e.ForLayerSet) ? [e.ForLayerSet] : []), ...(Array.isArray(e.MaterialLayers) ? [e] : [])]) {
      for (const l of list(ls.MaterialLayers)) {
        const t = attrNum(l.LayerThickness)
        addMaterial(l.Material, t ?? undefined)
      }
    }
    // IfcMaterialList → Materials[]
    for (const m of list(e.Materials)) addMaterial(m)
    // IfcMaterialConstituentSet → MaterialConstituents[]
    for (const mc of list(e.MaterialConstituents)) addMaterial(mc.Material)
  }
  return result
}

// ─── The element ──────────────────────────────────────────────────────────────

/** One getItemsData() record → IFCItemData. `units` from parseProjectUnits. */
export function parseItemData(raw: Raw, units: ProjectUnits = {}): IFCItemData {
  const propertySets = formatPsets(raw.IsDefinedBy, units)
  const type = resolveType(raw, units)
  return {
    ifcClass:       category(raw),
    name:           attrStr(raw.Name),
    longName:       attrStr(raw.LongName),
    description:    attrStr(raw.Description),
    globalId:       guidOf(raw),
    objectType:     attrStr(raw.ObjectType),
    tag:            attrStr(raw.Tag),
    storey:         extractStorey(raw.ContainedInStructure),
    propertySets,
    quantitySets:   formatQuantities(raw.IsDefinedBy, units),
    typeProperties: markOverridden(type.psets, propertySets),
    typeName:       type.typeName,
    typeId:         type.typeId,
    typeClass:      type.typeClass,
    typeGlobalId:   type.typeGlobalId,
    effectivePropertySets: mergeEffectivePropertySets(propertySets, type.psets),
    materials:      parseAssociations(raw.HasAssociations),
    raw,
  }
}
