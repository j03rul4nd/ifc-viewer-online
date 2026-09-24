// ─── Loading Center label keys ────────────────────────────────────────────────
// One typed map per engine enum, so an enum value can never reach the screen
// raw. Two guarantees stack here:
//
//   • compile time — each map `satisfies Record<Enum, …>`, so adding a phase,
//     status, wait reason, error code or discipline to lib/loading/types.ts
//     fails the build until it has a key here; and because the key type is a
//     template literal, the typed `t` rejects it until EN has the string;
//   • run time — src/locales/loading-parity.test.ts walks these same maps and
//     asserts every key exists in all ten locales, which the type system cannot
//     see (only EN is typed).
//
// The maps are also the only runtime list of the enum values: types.ts exports
// the unions as types, and `Object.keys(PHASE_KEYS)` is how the parity test
// enumerates them without a second hand-kept array to drift.

import type {
  CounterUnit, DisciplineId, JobStatus, LoadErrorCode, MemoryPressure, PhaseId, PriorityName, SourceKind, WaitReason,
} from '../../lib/loading/types'

/** Noun form, for checklists and "Failed · <phase>": "Geometry processing". */
export const PHASE_KEYS = {
  'download':     'phase.download',
  'identify':     'phase.identify',
  'cache-lookup': 'phase.cache-lookup',
  'geometry':     'phase.geometry',
  'properties':   'phase.properties',
  'relations':    'phase.relations',
  'serialize':    'phase.serialize',
  'cache-write':  'phase.cache-write',
  'attach':       'phase.attach',
  'setup':        'phase.setup',
  'read':         'phase.read',
  'stream':       'phase.stream',
  'index':        'phase.index',
  'fetch':        'phase.fetch',
  'decode':       'phase.decode',
  'place':        'phase.place',
} as const satisfies { [K in PhaseId]: `phase.${K}` }

/** Present-continuous form, for the live line: "Processing geometry". */
export const PHASE_ACTIVE_KEYS = {
  'download':     'phaseActive.download',
  'identify':     'phaseActive.identify',
  'cache-lookup': 'phaseActive.cache-lookup',
  'geometry':     'phaseActive.geometry',
  'properties':   'phaseActive.properties',
  'relations':    'phaseActive.relations',
  'serialize':    'phaseActive.serialize',
  'cache-write':  'phaseActive.cache-write',
  'attach':       'phaseActive.attach',
  'setup':        'phaseActive.setup',
  'read':         'phaseActive.read',
  'stream':       'phaseActive.stream',
  'index':        'phaseActive.index',
  'fetch':        'phaseActive.fetch',
  'decode':       'phaseActive.decode',
  'place':        'phaseActive.place',
} as const satisfies { [K in PhaseId]: `phaseActive.${K}` }

/**
 * Kind-specific wording, ONLY where the generic phase words read wrong for
 * that kind. A scan's `identify` checks nothing — it starts the reader chunk
 * and the viewer's point-cloud system — and its `decode` is the reader walking
 * millions of points, which "Decoding" undersells. A mesh reads right with the
 * generic words (three.js does decode it; it is placed in the scene), so it has
 * no entry. Partial on purpose: phaseKey / phaseActiveKey fall back to the
 * generic map for every phase not listed, so the maps stay a list of
 * exceptions rather than a second copy of the pipeline.
 */
export const POINTCLOUD_PHASE_KEYS = {
  'identify': 'phaseByKind.pointcloud.identify',
  'decode':   'phaseByKind.pointcloud.decode',
} as const satisfies { [K in PhaseId]?: `phaseByKind.pointcloud.${K}` }

export const POINTCLOUD_PHASE_ACTIVE_KEYS = {
  'identify': 'phaseActiveByKind.pointcloud.identify',
  'decode':   'phaseActiveByKind.pointcloud.decode',
} as const satisfies { [K in PhaseId]?: `phaseActiveByKind.pointcloud.${K}` }

type PhaseKey = (typeof PHASE_KEYS)[PhaseId] | (typeof POINTCLOUD_PHASE_KEYS)[keyof typeof POINTCLOUD_PHASE_KEYS]
type PhaseActiveKey =
  | (typeof PHASE_ACTIVE_KEYS)[PhaseId]
  | (typeof POINTCLOUD_PHASE_ACTIVE_KEYS)[keyof typeof POINTCLOUD_PHASE_ACTIVE_KEYS]

const KIND_PHASE_KEYS: Partial<Record<SourceKind, Partial<Record<PhaseId, PhaseKey>>>> = {
  pointcloud: POINTCLOUD_PHASE_KEYS,
}
const KIND_PHASE_ACTIVE_KEYS: Partial<Record<SourceKind, Partial<Record<PhaseId, PhaseActiveKey>>>> = {
  pointcloud: POINTCLOUD_PHASE_ACTIVE_KEYS,
}

/** Noun label key of a phase as THIS kind of job runs it ("Point reading" for a scan's decode). */
export function phaseKey(kind: SourceKind, id: PhaseId): PhaseKey {
  return KIND_PHASE_KEYS[kind]?.[id] ?? PHASE_KEYS[id]
}

/** Live-line label key of a phase as THIS kind of job runs it ("Reading points"). */
export function phaseActiveKey(kind: SourceKind, id: PhaseId): PhaseActiveKey {
  return KIND_PHASE_ACTIVE_KEYS[kind]?.[id] ?? PHASE_ACTIVE_KEYS[id]
}

export const STATUS_KEYS = {
  queued:    'status.queued',
  held:      'status.held',
  running:   'status.running',
  waiting:   'status.waiting',
  loaded:    'status.loaded',
  failed:    'status.failed',
  cancelled: 'status.cancelled',
  unloading: 'status.unloading',
  removed:   'status.removed',
} as const satisfies { [K in JobStatus]: `status.${K}` }

/**
 * `wait.anchor` takes {{name}} (the anchor job's display name). `wait.budget`
 * is a scan held at its header until another whole-file scan releases its
 * share of the resident-point budget — it says so, rather than "Waiting".
 */
export const WAIT_KEYS = {
  'slot':        'wait.slot',
  'memory':      'wait.memory',
  'exclusive':   'wait.exclusive',
  'anchor':      'wait.anchor',
  'attach-lane': 'wait.attach-lane',
  'backoff':     'wait.backoff',
  'viewer':      'wait.viewer',
  'budget':      'wait.budget',
} as const satisfies { [K in WaitReason]: `wait.${K}` }

/** User-facing, actionable. `error.http` takes {{status}}. */
export const ERROR_KEYS = {
  'invalid-file':       'error.invalid-file',
  'unsupported':        'error.unsupported',
  'read-failed':        'error.read-failed',
  'network':            'error.network',
  'http':               'error.http',
  'parse':              'error.parse',
  'worker-crash':       'error.worker-crash',
  'worker-init':        'error.worker-init',
  'out-of-memory':      'error.out-of-memory',
  'cache-corrupt':      'error.cache-corrupt',
  'scene':              'error.scene',
  'gpu':                'error.gpu',
  'viewer-unavailable': 'error.viewer-unavailable',
  'timeout':            'error.timeout',
  'cancelled':          'error.cancelled',
  'unknown':            'error.unknown',
} as const satisfies { [K in LoadErrorCode]: `error.${K}` }

/**
 * Kind-neutral twins of the generic error sentences, for every row that is not
 * an IFC model. The `error.*` sentences were written for the IFC pipeline —
 * "not a readable IFC model", "the IFC engine could not start", "re-export the
 * model", "convert the file again" — and a scan or a mesh whose failure carries
 * no domain `detailKey` (a download that came back empty, a refused URL scheme,
 * a runner key nobody translated yet) would print them under a .laz. Partial on
 * purpose, like the phase overrides: only the codes whose sentence speaks of
 * IFC, a model, its schema or the conversion — plus read-failed, whose "the
 * file" is one file where a glTF or an OBJ reads several. The rest ("the
 * download failed", "HTTP 404", "the 3D viewer was not ready") already read
 * right for any file, and errorKey falls back to them. The parity test holds
 * every IFC-worded sentence to having a twin here.
 */
export const ERROR_GENERIC_KEYS = {
  'invalid-file':  'errorGeneric.invalid-file',
  'unsupported':   'errorGeneric.unsupported',
  'read-failed':   'errorGeneric.read-failed',
  'parse':         'errorGeneric.parse',
  'worker-init':   'errorGeneric.worker-init',
  'out-of-memory': 'errorGeneric.out-of-memory',
  'cache-corrupt': 'errorGeneric.cache-corrupt',
  'scene':         'errorGeneric.scene',
} as const satisfies { [K in LoadErrorCode]?: `errorGeneric.${K}` }

type ErrorKey =
  | (typeof ERROR_KEYS)[LoadErrorCode]
  | (typeof ERROR_GENERIC_KEYS)[keyof typeof ERROR_GENERIC_KEYS]

const ERROR_GENERIC: Partial<Record<LoadErrorCode, ErrorKey>> = ERROR_GENERIC_KEYS

/**
 * The generic sentence key of an error code as THIS kind of job failed with
 * it: the IFC wording for a model, the kind-neutral twin for anything else
 * when the IFC one would name the wrong thing. `error.http` (and its
 * {{status}}) is the same for every kind.
 */
export function errorKey(kind: SourceKind, code: LoadErrorCode): ErrorKey {
  if (kind === 'ifc') return ERROR_KEYS[code]
  return ERROR_GENERIC[code] ?? ERROR_KEYS[code]
}

export const DISCIPLINE_KEYS = {
  architecture: 'discipline.architecture',
  structure:    'discipline.structure',
  mep:          'discipline.mep',
  hvac:         'discipline.hvac',
  plumbing:     'discipline.plumbing',
  electrical:   'discipline.electrical',
  fire:         'discipline.fire',
  landscape:    'discipline.landscape',
  site:         'discipline.site',
  civil:        'discipline.civil',
  interior:     'discipline.interior',
  furniture:    'discipline.furniture',
  coordination: 'discipline.coordination',
} as const satisfies { [K in DisciplineId]: `discipline.${K}` }

/** Badge text — three to five letters, localised (ARC in EN, ARQ in ES). */
export const DISCIPLINE_SHORT_KEYS = {
  architecture: 'disciplineShort.architecture',
  structure:    'disciplineShort.structure',
  mep:          'disciplineShort.mep',
  hvac:         'disciplineShort.hvac',
  plumbing:     'disciplineShort.plumbing',
  electrical:   'disciplineShort.electrical',
  fire:         'disciplineShort.fire',
  landscape:    'disciplineShort.landscape',
  site:         'disciplineShort.site',
  civil:        'disciplineShort.civil',
  interior:     'disciplineShort.interior',
  furniture:    'disciplineShort.furniture',
  coordination: 'disciplineShort.coordination',
} as const satisfies { [K in DisciplineId]: `disciplineShort.${K}` }

export const PRIORITY_KEYS = {
  critical:   'priority.critical',
  high:       'priority.high',
  normal:     'priority.normal',
  low:        'priority.low',
  background: 'priority.background',
} as const satisfies { [K in PriorityName]: `priority.${K}` }

export const PRESSURE_KEYS = {
  normal:   'resources.pressureLevel.normal',
  elevated: 'resources.pressureLevel.elevated',
  critical: 'resources.pressureLevel.critical',
} as const satisfies { [K in MemoryPressure]: `resources.pressureLevel.${K}` }

/**
 * Counter units other than bytes (bytes print as "12.1 / 48.0 MB" with no
 * word). Plural keys: called with `count` and a pre-formatted `value`.
 */
export const COUNTER_KEYS = {
  classes:  'counter.classes',
  entities: 'counter.entities',
  items:    'counter.items',
  points:   'counter.points',
  files:    'counter.files',
} as const satisfies { [K in Exclude<CounterUnit, 'bytes'>]: `counter.${K}` }

/**
 * Every map above, for the parity test. Plural maps are listed separately
 * because their keys exist in the JSON only with a `_one`/`_other` suffix.
 */
export const LABEL_MAPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  phase: PHASE_KEYS,
  phaseActive: PHASE_ACTIVE_KEYS,
  phasePointcloud: POINTCLOUD_PHASE_KEYS,
  phaseActivePointcloud: POINTCLOUD_PHASE_ACTIVE_KEYS,
  status: STATUS_KEYS,
  wait: WAIT_KEYS,
  error: ERROR_KEYS,
  errorGeneric: ERROR_GENERIC_KEYS,
  discipline: DISCIPLINE_KEYS,
  disciplineShort: DISCIPLINE_SHORT_KEYS,
  priority: PRIORITY_KEYS,
  pressure: PRESSURE_KEYS,
}

export const PLURAL_LABEL_MAPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  counter: COUNTER_KEYS,
}
