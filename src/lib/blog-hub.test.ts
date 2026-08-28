import { describe, expect, it } from 'vitest'
import { BLOG_POSTS, BLOG_POSTS_ES } from './blog-posts'
import {
  blogPostMatchesQuery,
  filterBlogPosts,
  getBlogHubCopy,
  normaliseBlogSearch,
  sortBlogPosts,
} from './blog-hub'

describe('blog hub discovery', () => {
  it('normalises accents and case for Spanish searches', () => {
    expect(normaliseBlogSearch('  VÍDEO + Validación  ')).toBe('video + validacion')
  })

  it('matches meaningful query tokens across post metadata', () => {
    const post = BLOG_POSTS.find((candidate) => candidate.slug === 'ifc-guids-changing-every-export')!
    expect(blogPostMatchesQuery(post, 'Why do IFC GUIDs change?')).toBe(true)
    expect(blogPostMatchesQuery(post, 'LiDAR terrain')).toBe(false)
  })

  it('matches Spanish queries without requiring accents', () => {
    const post = BLOG_POSTS_ES.find((candidate) => candidate.slug === 'ifc-video-terreno-3d-seguimiento-obra')!
    expect(blogPostMatchesQuery(post, 'video terreno')).toBe(true)
  })

  it('returns all six English spatial guides for the spatial journey', () => {
    const spatial = getBlogHubCopy('en').journeys.find((journey) => journey.id === 'spatial')!
    const results = filterBlogPosts(BLOG_POSTS, { journey: spatial })
    expect(results.map((post) => post.slug)).toEqual(expect.arrayContaining([
      'ifc-point-cloud-browser-scan-to-bim',
      'real-time-lidar-web-digital-twin-mcap',
      'ifc-video-3d-terrain-construction-progress',
      'warehouse-ifc-moving-lidar-digital-twin',
      '4d-construction-progress-ifc-temporal-point-cloud',
      'utility-tunnel-ifc-mobile-lidar-inspection',
    ]))
    expect(results).toHaveLength(6)
  })

  it('filters by category and sorts short reads first', () => {
    const results = filterBlogPosts(BLOG_POSTS, { category: 'validation', sort: 'shortest' })
    expect(results.length).toBeGreaterThan(1)
    expect(results.every((post) => post.categorySlug === 'validation')).toBe(true)
    expect(results.map((post) => post.readTimeMin)).toEqual(
      [...results.map((post) => post.readTimeMin)].sort((a, b) => a - b),
    )
  })

  it('defaults to newest-first without mutating the source list', () => {
    const firstBefore = BLOG_POSTS[0]
    const sorted = sortBlogPosts(BLOG_POSTS, 'newest')
    expect(sorted[0].date >= sorted[sorted.length - 1].date).toBe(true)
    expect(BLOG_POSTS[0]).toBe(firstBefore)
    expect(sorted).not.toBe(BLOG_POSTS)
  })
})
