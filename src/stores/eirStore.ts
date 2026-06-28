// ─── eirStore ─────────────────────────────────────────────────────────────────
// Reactive list of EIR profiles + persistence, backed by a ValidationProfileProvider
// (default: localStorage + built-ins). The store owns no validation logic — it is
// a thin reactive cache over the provider so the editor and loader stay in sync.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { EirProfile, ValidationProfileProvider } from '../lib/eir'
import { defaultProfileProvider } from '../lib/eir'

interface EirStore {
  provider: ValidationProfileProvider
  profiles: EirProfile[]
  loaded: boolean
  /** Whether the profile editor modal is open. */
  editorOpen: boolean

  /** (Re)load the profile list from the provider. */
  load: () => Promise<void>
  /** Create/overwrite a profile, then refresh the list. */
  save: (profile: EirProfile) => Promise<void>
  /** Delete a profile by id, then refresh the list. */
  remove: (id: string) => Promise<void>
  setEditorOpen: (open: boolean) => void
}

export const useEirStore = create<EirStore>()(
  devtools(
    (set, get) => ({
      provider: defaultProfileProvider,
      profiles: [],
      loaded: false,
      editorOpen: false,

      load: async () => {
        const profiles = await get().provider.listProfiles()
        set({ profiles, loaded: true }, false, 'eir/load')
      },

      save: async (profile) => {
        await get().provider.saveProfile(profile)
        await get().load()
      },

      remove: async (id) => {
        await get().provider.deleteProfile(id)
        await get().load()
      },

      setEditorOpen: (open) => set({ editorOpen: open }, false, 'eir/editorOpen'),
    }),
    { name: 'EirStore', enabled: import.meta.env.DEV },
  ),
)
