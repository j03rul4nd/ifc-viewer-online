// ─── Turn a translated language into its post pack ───────────────────────────
//
//   node --experimental-strip-types --import ./scripts/ebook/ts-hook.mjs \
//     scripts/blog-i18n/apply.ts <workDir> <lang> [--partial]
//
// Reads <workDir>/<lang>/*.json (see extract.ts), refuses any post that
// check.ts would flag, and writes src/lib/blog-i18n/<lang>.ts: every English
// post, same slug and structure, with the translated text. --partial writes
// only the posts that are finished (for previewing mid-translation).
//
// A translated post keeps its English slug under the language prefix
// (/ja/blog/<slug>/): every internal link, related block and reference in the
// source then resolves to the same article in the same language, with no
// mapping table to maintain — and ASCII slugs survive being shared in chat
// apps, where percent-encoded CJK paths do not.

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { BLOG_POSTS, type BlogPost } from '../../src/lib/blog-posts'
import { applySegments, relinkSections } from './segments'
import { postProblems, readManifest, readSegments } from './work'

/** The category label per language; the slug (and so the topic hub) is shared. */
const CATEGORY: Record<string, Record<string, string>> = {
  zh: { validation: '验证', 'export-fixes': '导出修复', tools: '工具与对比', delivery: '交付与 ISO 19650', privacy: '隐私与安全', 'digital-twins': '数字孪生' },
  ja: { validation: '検証', 'export-fixes': 'エクスポートの修正', tools: 'ツールと比較', delivery: '納品とISO 19650', privacy: 'プライバシーとセキュリティ', 'digital-twins': 'デジタルツイン' },
  th: { validation: 'การตรวจสอบ', 'export-fixes': 'แก้ไขการส่งออก', tools: 'เครื่องมือและการเปรียบเทียบ', delivery: 'การส่งมอบและ ISO 19650', privacy: 'ความเป็นส่วนตัวและความปลอดภัย', 'digital-twins': 'ดิจิทัลทวิน' },
}
const LANG_NAME: Record<string, string> = { zh: '中文（简体）', ja: '日本語', th: 'ภาษาไทย' }

const [workDir, lang, ...flags] = process.argv.slice(2)
if (!workDir || !CATEGORY[lang]) throw new Error('usage: apply.ts <workDir> <zh|ja|th> [--partial]')
const partial = flags.includes('--partial')

const manifest = new Map(readManifest(workDir).map((m) => [m.slug, m]))
const out: BlogPost[] = []
const skipped: string[] = []
for (const source of BLOG_POSTS) {
  const entry = manifest.get(source.slug)
  if (!entry) throw new Error(`${source.slug} is not in the manifest — re-run extract.ts`)
  const problems = postProblems(workDir, lang, entry)
  if (problems === null || problems.length > 0) {
    if (!partial) {
      throw new Error(`${source.slug}: ${problems === null ? 'not translated yet' : problems.map((p) => `${p.key} ${p.problem}`).join('; ')}`)
    }
    skipped.push(source.slug)
    continue
  }
  const post = applySegments(source, readSegments(workDir, lang, entry.slug, entry.parts)!)
  post.lang = lang
  post.category = CATEGORY[lang][source.categorySlug] ?? source.category
  post.translationKey = source.translationKey ?? source.slug
  // The translated keywords are what a local reader searches for; the English
  // ones stay too, because related-post ranking and tool matching compare
  // keywords across posts, and those English terms are shared by all of them.
  post.keywords = [...new Set([...(post.keywords ?? []), ...(source.keywords ?? [])])]
  if (post.keywords.length === 0) delete post.keywords
  if (post.seoTitle === post.title) delete post.seoTitle
  if (post.seoDescription === post.excerpt) delete post.seoDescription
  out.push(post)
}

const dropped = relinkSections(out, new Map(BLOG_POSTS.map((p) => [p.slug, p])))

// ── Write it as readable TypeScript ─────────────────────────────────────────
// Small objects stay on one line, the way blog-posts.ts is written — which
// also keeps `{ value: 44, …, label: '… rules' }` greppable by rule-count.test.

const IDENT = /^[A-Za-z_$][\w$]*$/
function toTs(value: unknown, indent: string): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const inner = indent + '  '
  const entries = Array.isArray(value)
    ? value.map((v) => toTs(v, inner))
    : Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${toTs(v, inner)}`)
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{ ', ' }']
  const flat = entries.length === 0 ? (Array.isArray(value) ? '[]' : '{}') : `${open}${entries.join(', ')}${close}`
  if (flat.length + indent.length <= 110 && !flat.includes('\n')) return flat
  return `${open.trim()}\n${entries.map((e) => `${inner}${e},`).join('\n')}\n${indent}${close.trim()}`
}

const name = `BLOG_POSTS_${lang.toUpperCase()}`
const file = path.resolve('src/lib/blog-i18n', `${lang}.ts`)
writeFileSync(file, `// ─── Blog posts — ${LANG_NAME[lang]} ───────────────────────────────────────────────
// The English library (blog-posts.ts) in ${LANG_NAME[lang]}: same slugs, same blocks,
// links and code, translated text. Built by scripts/blog-i18n/apply.ts from
// segment translations; wording can be edited here directly.
//
// Loaded on demand by loadBlogLanguage() in blog-posts.ts — never import this
// file from app code, or the whole pack lands in the main bundle.

import type { BlogPost } from '../blog-posts'

export const ${name}: BlogPost[] = ${toTs(out, '')}
`)

console.log(`[blog-i18n] ${lang}: ${out.length} posts → ${path.relative(process.cwd(), file)}`)
if (skipped.length) console.log(`  not ready (${skipped.length}): ${skipped.join(', ')}`)
for (const d of dropped) console.log(`  ${d.slug}: related link to ${d.to} lost its section "${d.section}" (${d.reason})`)
if (!partial && dropped.length) throw new Error('a complete pack must keep every section link')
