import { describe, it, expect, beforeEach } from 'vitest'
import { LS_TOPICS, useTopicStore } from './topicStore'
import { MAX_TOPICS, parseTopicState } from '../lib/topics'

beforeEach(() => {
  localStorage.clear()
  useTopicStore.setState({ topics: [], members: {} })
})

const st = () => useTopicStore.getState()

describe('topicStore', () => {
  it('persists a new topic with its members', () => {
    const id = st().createTopic({ name: 'Survey A' }, ['cloud:a'])!
    const reloaded = parseTopicState(localStorage.getItem(LS_TOPICS))
    expect(reloaded.topics.map((t) => t.id)).toEqual([id])
    expect(reloaded.members['cloud:a']).toEqual([id])
  })

  it('is many-to-many and idempotent', () => {
    const a = st().createTopic({ name: 'A' })!
    const b = st().createTopic({ name: 'B' })!
    st().setMembership(['cloud:x'], a, true)
    st().setMembership(['cloud:x'], b, true)
    st().setMembership(['cloud:x'], b, true)
    expect(st().members['cloud:x']).toEqual([a, b])
    st().setMembership(['cloud:x'], a, false)
    st().setMembership(['cloud:x'], a, false)
    expect(st().members['cloud:x']).toEqual([b])
  })

  it('strips memberships when a topic is deleted', () => {
    const a = st().createTopic({ name: 'A' }, ['cloud:x'])!
    st().deleteTopic(a)
    expect(st().topics).toEqual([])
    expect(st().members).toEqual({})
  })

  it('refuses topics past the cap', () => {
    for (let i = 0; i < MAX_TOPICS; i++) expect(st().createTopic({ name: `T${i}` })).not.toBeNull()
    expect(st().createTopic({ name: 'one too many' })).toBeNull()
  })

  it('trims and caps names', () => {
    const a = st().createTopic({ name: 'A' })!
    st().renameTopic(a, `   ${'x'.repeat(60)}   `)
    expect(st().topics[0].name).toHaveLength(40)
  })

  it('boots empty from a corrupt stored value', () => {
    localStorage.setItem(LS_TOPICS, '{broken')
    expect(parseTopicState(localStorage.getItem(LS_TOPICS))).toEqual({ topics: [], members: {} })
  })
})
