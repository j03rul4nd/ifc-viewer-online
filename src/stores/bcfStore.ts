import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { BcfTopic, BcfComment } from '../types'

interface BcfStore {
  topics:      BcfTopic[]
  isParsing:   boolean
  parseError:  string | null
  /** BCF version of the last imported file */
  importedVersion: string | null

  setTopics:       (topics: BcfTopic[]) => void
  addTopics:       (topics: BcfTopic[]) => void
  clearTopics:     () => void
  setIsParsing:    (v: boolean) => void
  setParseError:   (msg: string | null) => void

  /** Append a local (session-only) comment to a topic. */
  addLocalComment: (topicGuid: string, comment: Omit<BcfComment, 'guid' | 'local'>) => void
  /** Remove a local comment from a topic. */
  removeLocalComment: (topicGuid: string, commentGuid: string) => void
}

export const useBcfStore = create<BcfStore>()(
  devtools(
    (set) => ({
      topics:          [],
      isParsing:       false,
      parseError:      null,
      importedVersion: null,

      setTopics: (topics) =>
        set({ topics, parseError: null }, false, 'setTopics'),

      addTopics: (topics) =>
        set((s) => ({ topics: [...s.topics, ...topics] }), false, 'addTopics'),

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
              t.guid !== topicGuid ? t : {
                ...t,
                comments: [
                  ...t.comments,
                  { ...comment, guid: crypto.randomUUID(), local: true },
                ],
              },
            ),
          }),
          false,
          `addLocalComment:${topicGuid}`,
        ),

      removeLocalComment: (topicGuid, commentGuid) =>
        set(
          (s) => ({
            topics: s.topics.map((t) =>
              t.guid !== topicGuid ? t : {
                ...t,
                comments: t.comments.filter((c) => c.guid !== commentGuid),
              },
            ),
          }),
          false,
          `removeLocalComment:${topicGuid}`,
        ),
    }),
    { name: 'BcfStore', enabled: import.meta.env.DEV },
  ),
)
