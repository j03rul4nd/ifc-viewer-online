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
  CounterUnit, DisciplineId, JobStatus, LoadErrorCode, MemoryPressure, PhaseId, PriorityName, WaitReason,
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

/** `wait.anchor` takes {{name}} (the anchor job's display name). */
export const WAIT_KEYS = {
  'slot':        'wait.slot',
  'memory':      'wait.memory',
  'exclusive':   'wait.exclusive',
  'anchor':      'wait.anchor',
  'attach-lane': 'wait.attach-lane',
  'backoff':     'wait.backoff',
  'viewer':      'wait.viewer',
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
  status: STATUS_KEYS,
  wait: WAIT_KEYS,
  error: ERROR_KEYS,
  discipline: DISCIPLINE_KEYS,
  disciplineShort: DISCIPLINE_SHORT_KEYS,
  priority: PRIORITY_KEYS,
  pressure: PRESSURE_KEYS,
}

export const PLURAL_LABEL_MAPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  counter: COUNTER_KEYS,
}
