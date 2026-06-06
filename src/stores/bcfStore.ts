import { create } from 'zustand'
import { devtools, persist, createJSONStorage } from 'zustand/middleware'
import type { BcfTopic, BcfComment } from '../types'

interface BcfStore {
  topics:          BcfTopic[]
  isParsing:       boolean
  parseError:      string | null
  importedVersion: string | null

  setTopics:          (topics: BcfTopic[]) => void
  addTopics:          (topics: BcfTopic[]) => void
  addTopic:           (topic: BcfTopic) => void
  updateTopic:        (guid: string, patch: Partial<BcfTopic>) => void
  deleteTopic:        (guid: string) => void
  clearTopics:        () => void
  setIsParsing:       (v: boolean) => void
  setParseError:      (msg: string | null) => void
  addLocalComment:    (topicGuid: string, comment: Omit<BcfComment, 'guid' | 'local'>) => void
  removeLocalComment: (topicGuid: string, commentGuid: string) => void
}

export const useBcfStore = create<BcfStore>()(
  devtools(
    persist(
      (set) => ({
        topics:          [],
        isParsing:       false,
        parseError:      null,
        importedVersion: null,

        setTopics: (topics) =>
          set({ topics, parseError: null }, false, 'setTopics'),

        addTopics: (topics) =>
          set((s) => ({ topics: [...s.topics, ...topics] }), false, 'addTopics'),

        addTopic: (topic) =>
          set((s) => ({ topics: [...s.topics, topic] }), false, 'addTopic'),

        updateTopic: (guid, patch) =>
          set(
            (s) => ({ topics: s.topics.map((t) => (t.guid === guid ? { ...t, ...patch } : t)) }),
            false,
            `updateTopic:${guid}`,
          ),

        deleteTopic: (guid) =>
          set(
            (s) => ({ topics: s.topics.filter((t) => t.guid !== guid) }),
            false,
            `deleteTopic:${guid}`,
          ),

        clearTopics: () =>
          set({ topics: [], importedVersion: null, parseError: null }, false, 'clearTopics'),

        setIsParsing: (v) =>
          set({ isParsing: v }, false, `setIsParsing:${v}`),

        setParseError: (msg) =>
          set({ isParsing: false, parseError: msg }, false, 'setParseError'),

        addLocalComment: (topicGuid, comment) =>
          set(
            (s) => ({
              topics: s.topics.map((t) =>
                t.guid !== topicGuid
                  ? t
                  : { ...t, comments: [...t.comments, { ...comment, guid: crypto.randomUUID() }] },
              ),
            }),
            false,
            `addComment:${topicGuid}`,
          ),

        removeLocalComment: (topicGuid, commentGuid) =>
          set(
            (s) => ({
              topics: s.topics.map((t) =>
                t.guid !== topicGuid
                  ? t
                  : { ...t, comments: t.comments.filter((c) => c.guid !== commentGuid) },
              ),
            }),
            false,
            `removeComment:${topicGuid}`,
          ),
      }),
      {
        name:    'bcf-store-v1',
        storage: createJSONStorage(() => localStorage),
        // Strip snapshotBase64 to keep localStorage size manageable.
        // Camera data is preserved so "Navigate" still works after page reload.
        partialize: (state) => ({
          importedVersion: state.importedVersion,
          topics: state.topics.map((t) => ({
            ...t,
            viewpoints: t.viewpoints.map(({ snapshotBase64: _, ...vp }) => vp),
          })),
        }),
      },
    ),
    { name: 'BcfStore', enabled: import.meta.env.DEV },
  ),
)
