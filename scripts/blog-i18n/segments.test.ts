import { describe, it, expect } from 'vitest'
import { BLOG_POSTS, type BlogPost } from '../../src/lib/blog-posts'
import { applySegments, checkSegments, extractSegments, relinkSections } from './segments'

describe('blog translation segments', () => {
  it('puts every English post back together exactly from its own segments', () => {
    // The whole pipeline rests on this: if extract → apply is not the
    // identity, a translation would change structure, not just words.
    for (const post of BLOG_POSTS) {
      expect(applySegments(post, extractSegments(post)), post.slug).toEqual(post)
    }
  })

  it('never offers code, slugs, URLs or image paths for translation', () => {
    for (const post of BLOG_POSTS) {
      const keys = Object.keys(extractSegments(post))
      expect(keys.some((k) => /\.(src|to|href|slug|poster|modelId|lang)$/.test(k)), post.slug).toBe(false)
      post.content.forEach((b, i) => {
        if (b.type === 'code') expect(keys.some((k) => k.startsWith(`content.${i}.`)), `${post.slug} code block ${i}`).toBe(false)
      })
    }
  })

  it('carries inline links and citations as tags a translator can move', () => {
    const post: BlogPost = {
      ...BLOG_POSTS[0],
      content: [{ type: 'p', text: ['See ', { text: 'the guide', to: 'ifc-quality-guide' }, ' and ', { cite: 'iso' }, ' plus ', { text: 'GUID', def: 'Global id' }] }],
    }
    const segs = extractSegments(post)
    expect(segs['content.0.text']).toBe('See <a to="ifc-quality-guide">the guide</a> and <cite id="iso"/> plus <t id="0">GUID</t>')
    expect(segs['content.0.text@def0']).toBe('Global id')

    const moved = { ...segs, 'content.0.text': '<t id="0">GUID</t>と<cite id="iso"/>については<a to="ifc-quality-guide">ガイド</a>を参照', 'content.0.text@def0': 'グローバルID' }
    const inBody = checkSegments(segs, moved, 'ja').filter((p) => p.key.startsWith('content.'))
    expect(inBody).toEqual([])
    expect(applySegments(post, moved).content[0]).toEqual({
      type: 'p',
      text: [{ text: 'GUID', def: 'グローバルID' }, 'と', { cite: 'iso' }, 'については', { text: 'ガイド', to: 'ifc-quality-guide' }, 'を参照'],
    })
  })

  it('reports a lost link, a changed target, an untranslated string and a missing key', () => {
    const src = { a: 'Read <a to="x">the full guide to this</a> before you export anything', b: 'Open the model in your browser today', c: 'Hello' }
    const problems = checkSegments(src, { a: '阅读<a to="y">完整指南</a>', b: 'Open the model in your browser today' }, 'zh')
    expect(problems.map((p) => `${p.key}:${p.problem.split(':')[0]}`)).toEqual(['a:inline tags changed', 'b:looks untranslated', 'c:missing'])
  })

  it('re-points a deep link at the translated heading in the same position', () => {
    const target: BlogPost = { ...BLOG_POSTS[0], slug: 't', content: [{ type: 'h2', text: 'Intro' }, { type: 'h2', text: 'The fix' }] }
    const linker: BlogPost = { ...BLOG_POSTS[0], slug: 'l', content: [{ type: 'related', to: 't', section: 'The fix' }, { type: 'related', to: 't', section: 'Gone' }] }
    const trTarget: BlogPost = { ...target, content: [{ type: 'h2', text: '简介' }, { type: 'h2', text: '修复方法' }] }
    const trLinker = structuredClone(linker)
    const dropped = relinkSections([trTarget, trLinker], new Map([['t', target], ['l', linker]]))
    expect(trLinker.content[0]).toEqual({ type: 'related', to: 't', section: '修复方法' })
    expect(trLinker.content[1]).toEqual({ type: 'related', to: 't' })
    expect(dropped).toEqual([{ slug: 'l', to: 't', section: 'Gone', reason: 'heading gone' }])
  })
})
