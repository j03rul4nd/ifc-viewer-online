// ─── EIR profile providers ────────────────────────────────────────────────────
// Implementations of ValidationProfileProvider (the storage seam). The default
// is browser localStorage; the built-in starter profiles are served read-only by
// composing a provider in front of them. A future REST / GraphQL / CDE provider
// only implements the same interface — neither the engine nor the editor change.

import type { EirProfile, ValidationProfileProvider } from './eir-types'
import { eirProfileSchema } from './eir-schema'
import { BUILTIN_EIR_PROFILES } from './eir-profiles'

const STORAGE_KEY = 'ifc-eir:profiles'

function readAll(): EirProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Drop anything that no longer matches the schema instead of throwing.
    return parsed.flatMap((p) => {
      const r = eirProfileSchema.safeParse(p)
      return r.success ? [r.data as EirProfile] : []
    })
  } catch {
    return []
  }
}

function writeAll(profiles: EirProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {
    /* quota / unavailable — non-fatal */
  }
}

/**
 * Profiles persisted in localStorage. `listProfiles` also surfaces the read-only
 * built-ins (so a fresh install isn't empty); saving a built-in id forks it into
 * a user copy on next save with a new id (the editor handles that).
 */
export class LocalStorageProfileProvider implements ValidationProfileProvider {
  listProfiles(): Promise<EirProfile[]> {
    return Promise.resolve([...BUILTIN_EIR_PROFILES, ...readAll()])
  }

  loadProfile(id: string): Promise<EirProfile> {
    const all = [...BUILTIN_EIR_PROFILES, ...readAll()]
    const found = all.find((p) => p.id === id)
    return found
      ? Promise.resolve(found)
      : Promise.reject(new Error(`EIR profile not found: ${id}`))
  }

  saveProfile(profile: EirProfile): Promise<void> {
    const user = readAll()
    const idx = user.findIndex((p) => p.id === profile.id)
    if (idx >= 0) user[idx] = profile
    else user.push(profile)
    writeAll(user)
    return Promise.resolve()
  }

  deleteProfile(id: string): Promise<void> {
    writeAll(readAll().filter((p) => p.id !== id))
    return Promise.resolve()
  }
}

/** True for ids served from the read-only built-in set (not user-editable). */
export function isBuiltinProfile(id: string): boolean {
  return BUILTIN_EIR_PROFILES.some((p) => p.id === id)
}

/** The app-wide default provider instance. */
export const defaultProfileProvider: ValidationProfileProvider = new LocalStorageProfileProvider()
