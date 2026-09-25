// ─── Every post in every language, eagerly ───────────────────────────────────
// For build scripts and tests: the static page generator, the cover builder
// and the SERP-budget checks need the whole library at once.
//
// The app must NOT import this file — it would put every translation in the
// main bundle. The app reaches the packs through loadBlogLanguage() in
// blog-posts.ts (guarded by blog-i18n.test.ts).

import { ALL_BLOG_POSTS, registerBlogPosts, type BlogPost } from '../blog-posts'
import { BLOG_POSTS_CA } from './ca'
import { BLOG_POSTS_DE_PACK } from './de'
import { BLOG_POSTS_ES_PACK } from './es'
import { BLOG_POSTS_FR_PACK } from './fr'
import { BLOG_POSTS_IT } from './it'
import { BLOG_POSTS_JA } from './ja'
import { BLOG_POSTS_PT } from './pt'
import { BLOG_POSTS_TH } from './th'
import { BLOG_POSTS_ZH } from './zh'

/**
 * The translated posts per language. For es/de/fr these sit beside the posts
 * written directly in that language (blog-posts.ts), which they don't repeat.
 */
export const TRANSLATED_POSTS: Record<string, BlogPost[]> = {
  es: BLOG_POSTS_ES_PACK,
  de: BLOG_POSTS_DE_PACK,
  fr: BLOG_POSTS_FR_PACK,
  pt: BLOG_POSTS_PT,
  it: BLOG_POSTS_IT,
  ca: BLOG_POSTS_CA,
  zh: BLOG_POSTS_ZH,
  ja: BLOG_POSTS_JA,
  th: BLOG_POSTS_TH,
}

// getBlogPost() & co. read the packs from here on, as they would after a load.
for (const [lang, posts] of Object.entries(TRANSLATED_POSTS)) registerBlogPosts(lang, posts)

export const EVERY_BLOG_POST: BlogPost[] = [...ALL_BLOG_POSTS, ...Object.values(TRANSLATED_POSTS).flat()]
