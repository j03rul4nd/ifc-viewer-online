// ─── ModelRegistry ────────────────────────────────────────────────────────────
// Central in-memory registry for per-model non-serialisable data.
//
// WHY this exists instead of extending Zustand stores:
//   • ArrayBuffer and Map<number,string> are non-serialisable — they cannot be
//     reliably diff'd, devtools-logged, or persisted by Zustand middleware.
//   • The viewer owns the actual Three.js objects; the registry owns per-model
//     metadata that multiple subsystems (validator, export, sidebar) need to
//     read without going through the viewer API.
//   • Every entry is indexed by the same `modelId` string used in sceneStore,
//     so cross-referencing between stores is a single lookup.
//
// Lifecycle:
//   register()    — called by loader.ts after viewer.loadFragments() succeeds.
//   unregister()  — called when a model is explicitly removed from the scene.
//   clear()       — called on navigate-to-landing (full reset).

import { createLogger } from './logger'

const log = createLogger('ModelRegistry')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModelRegistryEntry {
  /** Stable scene-level ID. Same string used in sceneStore / validationStore. */
  modelId:       string
  /** Original filename for display and debugging. */
  fileName:      string
  /** Original IFC bytes — needed by the validator worker and IFC exporter.
   *  May be an empty ArrayBuffer if the model was loaded from OPFS cache
   *  without a persisted IFC backup (legacy entries). Callers must size-check. */
  ifcBuffer:     ArrayBuffer
  /** OPFS cache key used to persist and retrieve the fragment binary. */
  opfsCacheKey:  string
  /** Map from IFC express ID → raw IFC type string (e.g. "IFCWALL").
   *  Populated by viewer.ts during setupLoadedModel.
   *  Lets the validator and UI resolve element types without re-querying the viewer. */
  expressIDToType: ReadonlyMap<number, string>
  loadedAt: number
}

// ── Internal store ────────────────────────────────────────────────────────────

const _registry = new Map<string, ModelRegistryEntry>()

// ── Public API ────────────────────────────────────────────────────────────────

export const modelRegistry = {

  /**
   * Register a newly loaded model.
   * Overwrites any previous entry with the same modelId (model reload path).
   */
  register(entry: ModelRegistryEntry): void {
    if (_registry.has(entry.modelId)) {
      log.warn(`Overwriting registry entry for "${entry.modelId}"`)
    }
    _registry.set(entry.modelId, entry)
    log.debug(`Registered "${entry.modelId}" (${_registry.size} total)`)
  },

  /**
   * Remove a model's registry entry.
   * Call AFTER the viewer has disposed the model geometry to avoid dangling refs.
   */
  unregister(modelId: string): void {
    const removed = _registry.delete(modelId)
    if (removed) {
      log.debug(`Unregistered "${modelId}" (${_registry.size} remaining)`)
    } else {
      log.warn(`unregister: unknown modelId "${modelId}"`)
    }
  },

  /**
   * Get the registry entry for a specific model.
   * Returns null (not throws) when the model is not registered.
   */
  get(modelId: string): ModelRegistryEntry | null {
    return _registry.get(modelId) ?? null
  },

  /** All registered entries, sorted oldest-first. */
  getAll(): ModelRegistryEntry[] {
    return [..._registry.values()].sort((a, b) => a.loadedAt - b.loadedAt)
  },

  /** Model IDs in load order (oldest first). */
  ids(): string[] {
    return modelRegistry.getAll().map((e) => e.modelId)
  },

  /**
   * Resolve an express ID to its IFC type and the owning model.
   * Searches ALL registered models — use when you don't know which model owns an ID.
   * Returns null if the ID is not found in any model.
   */
  findByExpressId(expressId: number): { type: string; modelId: string } | null {
    for (const entry of _registry.values()) {
      const type = entry.expressIDToType.get(expressId)
      if (type !== undefined) return { type, modelId: entry.modelId }
    }
    return null
  },

  /**
   * Get the IFC buffer for a specific model.
   * Returns null when the model is not registered or the buffer is empty (cache-only load).
   */
  getBuffer(modelId: string): ArrayBuffer | null {
    const entry = _registry.get(modelId)
    if (!entry) return null
    if (entry.ifcBuffer.byteLength === 0) return null
    return entry.ifcBuffer
  },

  /**
   * Get the expressID→type map for a specific model.
   * Returns null when the model is not registered.
   */
  getTypeMap(modelId: string): ReadonlyMap<number, string> | null {
    return _registry.get(modelId)?.expressIDToType ?? null
  },

  /** Number of currently registered models. */
  size(): number {
    return _registry.size
  },

  /**
   * Flush all entries. Called on navigate-to-landing (full scene reset).
   * Does NOT dispose Three.js geometry — the viewer is responsible for that.
   */
  clear(): void {
    _registry.clear()
    log.debug('Registry cleared')
  },
}
