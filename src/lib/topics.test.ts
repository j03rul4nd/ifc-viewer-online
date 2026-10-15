import { describe, it, expect } from 'vitest'
import {
  TOPIC_PALETTE, fileDateSuggestions, itemKey, membershipState, nextTopicColor, parseTopicState,
  primaryTopicColor, topicsOf, type Topic, type TopicState,
} from './topics'

const t = (id: string, color: number, extra: Partial<Topic> = {}): Topic => ({ id, name: id, color, source: 'user', ...extra })

describe('topics', () => {
  it('builds kind-prefixed item keys', () => {
    expect(itemKey('cloud', 'url:x')).toBe('cloud:url:x')
  })

  it('parses forgivingly', () => {
    expect(parseTopicState('{bad')).toEqual({ topics: [], members: {} })
    expect(parseTopicState(JSON.stringify({ v: 2, topics: [t('a', 1)] }))).toEqual({ topics: [], members: {} })
    const s = parseTopicState(JSON.stringify({
      v: 1,
      topics: [t('a', 1), t('a', 2), { id: 'b' }, t('c', 3)],
      members: { k1: ['a', 7, 'zz'], k2: 'a', k3: ['zz'] },
    }))
    expect(s.topics.map((x) => x.id)).toEqual(['a', 'c'])
    expect(s.members).toEqual({ k1: ['a'] })
  })

  it('follows topic order', () => {
    const s: TopicState = { topics: [t('a', 1), t('b', 2)], members: { k: ['b', 'a'] } }
    expect(topicsOf(s, 'k').map((x) => x.id)).toEqual(['a', 'b'])
    expect(primaryTopicColor(s, 'k')).toBe(1)
    expect(primaryTopicColor(s, 'none')).toBeNull()
  })

  it('reports membership as all, some or none', () => {
    const s: TopicState = { topics: [t('a', 1)], members: { k1: ['a'] } }
    expect(membershipState(s, ['k1'], 'a')).toBe('all')
    expect(membershipState(s, ['k1', 'k2'], 'a')).toBe('some')
    expect(membershipState(s, ['k2'], 'a')).toBe('none')
  })

  it('suggests one topic per file date, skipping covered items', () => {
    const s: TopicState = { topics: [t('d', 1, { source: 'fileDate', date: '2026-01-02' })], members: { k4: ['d'] } }
    const out = fileDateSuggestions([
      { key: 'k1', fileDate: '2026-01-01' }, { key: 'k2', fileDate: '2026-01-01' }, { key: 'k3', fileDate: '2026-01-02' },
      { key: 'k4', fileDate: '2026-01-02' }, { key: 'k5', fileDate: null }, { key: 'k6' },
    ], s)
    expect(out).toEqual([{ date: '2026-01-01', keys: ['k1', 'k2'] }, { date: '2026-01-02', keys: ['k3'] }])
  })

  it('cycles the palette', () => {
    expect(nextTopicColor([])).toBe(TOPIC_PALETTE[0])
    expect(nextTopicColor([t('a', TOPIC_PALETTE[0])])).toBe(TOPIC_PALETTE[1])
    const full = TOPIC_PALETTE.map((c, i) => t(`t${i}`, c))
    expect(nextTopicColor(full)).toBe(TOPIC_PALETTE[0])
  })
})
