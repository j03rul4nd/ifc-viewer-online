// ─── Topic store ──────────────────────────────────────────────────────────────
// Device-local topics over any scene item (src/lib/topics.ts). Persisted
// synchronously to 'ifcv.topics.v1' = { v: 1, topics, members }. Memberships
// outlive an item's removal: reload the same file and its topics come back.
//
// SceneGroupTree sits in the entry chunk and reads this store: no three/proj4.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  MAX_MEMBER_KEYS, MAX_TOPICS, MAX_TOPIC_NAME, newTopicId, nextTopicColor, parseTopicState,
  type Topic, type TopicState,
} from '../lib/topics'

export const LS_TOPICS = 'ifcv.topics.v1'

function readStored(): TopicState {
  try { return parseTopicState(localStorage.getItem(LS_TOPICS)) } catch { return { topics: [], members: {} } }
}

function persist(state: TopicState): void {
  try {
    localStorage.setItem(LS_TOPICS, JSON.stringify({ v: 1, topics: state.topics, members: state.members }))
  } catch { /* quota / private mode */ }
}

interface TopicStore extends TopicState {
  createTopic: (
    init: { name: string; color?: number; source?: Topic['source']; date?: string },
    itemKeys?: string[],
  ) => string | null
  renameTopic: (id: string, name: string) => void
  recolorTopic: (id: string, color: number) => void
  deleteTopic: (id: string) => void
  setMembership: (itemKeys: readonly string[], topicId: string, member: boolean) => void
  resetTopics: () => void
}

function capMembers(members: Record<string, string[]>): Record<string, string[]> {
  const keys = Object.keys(members)
  if (keys.length <= MAX_MEMBER_KEYS) return members
  // Object key order is insertion order: drop the oldest inserted.
  const out: Record<string, string[]> = {}
  for (const k of keys.slice(keys.length - MAX_MEMBER_KEYS)) out[k] = members[k]
  return out
}

export const useTopicStore = create<TopicStore>()(
  devtools(
    (set, get) => {
      const commit = (next: TopicState, action: string): void => {
        persist(next)
        set(next, false, action)
      }
      return {
        ...readStored(),

        createTopic: (init, itemKeys = []) => {
          const s = get()
          const name = init.name.trim().slice(0, MAX_TOPIC_NAME)
          if (!name || s.topics.length >= MAX_TOPICS) return null
          const topic: Topic = {
            id: newTopicId(), name,
            color: init.color ?? nextTopicColor(s.topics),
            source: init.source ?? 'user',
            ...(init.date ? { date: init.date } : {}),
          }
          const members = { ...s.members }
          for (const k of itemKeys) members[k] = [...(members[k] ?? []).filter((x) => x !== topic.id), topic.id]
          commit({ topics: [...s.topics, topic], members: capMembers(members) }, 'createTopic')
          return topic.id
        },

        renameTopic: (id, name) => {
          const clean = name.trim().slice(0, MAX_TOPIC_NAME)
          if (!clean) return
          const s = get()
          commit({ topics: s.topics.map((t) => (t.id === id ? { ...t, name: clean } : t)), members: s.members }, 'renameTopic')
        },

        recolorTopic: (id, color) => {
          const s = get()
          const c = Math.min(0xFFFFFF, Math.max(0, Math.round(color)))
          commit({ topics: s.topics.map((t) => (t.id === id ? { ...t, color: c } : t)), members: s.members }, 'recolorTopic')
        },

        deleteTopic: (id) => {
          const s = get()
          const members: Record<string, string[]> = {}
          for (const [k, list] of Object.entries(s.members)) {
            const rest = list.filter((x) => x !== id)
            if (rest.length) members[k] = rest
          }
          commit({ topics: s.topics.filter((t) => t.id !== id), members }, 'deleteTopic')
        },

        setMembership: (itemKeys, topicId, member) => {
          const s = get()
          if (!s.topics.some((t) => t.id === topicId)) return
          const members = { ...s.members }
          let changed = false
          for (const k of itemKeys) {
            const list = members[k] ?? []
            const has = list.includes(topicId)
            if (member && !has) { members[k] = [...list, topicId]; changed = true }
            if (!member && has) {
              const rest = list.filter((x) => x !== topicId)
              if (rest.length) members[k] = rest
              else delete members[k]
              changed = true
            }
          }
          if (changed) commit({ topics: s.topics, members: capMembers(members) }, 'setMembership')
        },

        resetTopics: () => commit({ topics: [], members: {} }, 'resetTopics'),
      }
    },
    { name: 'TopicStore', enabled: import.meta.env.DEV },
  ),
)
