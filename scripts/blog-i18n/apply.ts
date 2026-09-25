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
import { ALL_BLOG_POSTS, BLOG_POSTS, type BlogPost } from '../../src/lib/blog-posts'
import { applySegments, relinkSections, retargetLinks } from './segments'
import { postProblems, readManifest, readSegments } from './work'

/** The category label per language; the slug (and so the topic hub) is shared. */
const CATEGORY: Record<string, Record<string, string>> = {
  zh: { validation: '验证', 'export-fixes': '导出修复', tools: '工具与对比', delivery: '交付与 ISO 19650', privacy: '隐私与安全', 'digital-twins': '数字孪生' },
  ja: { validation: '検証', 'export-fixes': 'エクスポートの修正', tools: 'ツールと比較', delivery: '納品とISO 19650', privacy: 'プライバシーとセキュリティ', 'digital-twins': 'デジタルツイン' },
  th: { validation: 'การตรวจสอบ', 'export-fixes': 'แก้ไขการส่งออก', tools: 'เครื่องมือและการเปรียบเทียบ', delivery: 'การส่งมอบและ ISO 19650', privacy: 'ความเป็นส่วนตัวและความปลอดภัย', 'digital-twins': 'ดิจิทัลทวิน' },
  // es/de/fr reuse the labels their hand-written posts already carry.
  es: { validation: 'Validación', 'export-fixes': 'Corregir exportaciones', tools: 'Herramientas y comparativas', delivery: 'Entrega e ISO 19650', privacy: 'Privacidad y seguridad', 'digital-twins': 'Gemelos digitales' },
  de: { validation: 'Validierung', 'export-fixes': 'Exportfehler beheben', tools: 'Werkzeuge & Vergleiche', delivery: 'Übergabe & ISO 19650', privacy: 'Datenschutz & Sicherheit', 'digital-twins': 'Digitale Zwillinge' },
  fr: { validation: 'Validation', 'export-fixes': 'Corriger les exports', tools: 'Outils & comparatifs', delivery: 'Livraison & ISO 19650', privacy: 'Confidentialité & sécurité', 'digital-twins': 'Jumeaux numériques' },
  pt: { validation: 'Validação', 'export-fixes': 'Correção de exportações', tools: 'Ferramentas e comparativos', delivery: 'Entrega e ISO 19650', privacy: 'Privacidade e segurança', 'digital-twins': 'Gêmeos digitais' },
  it: { validation: 'Validazione', 'export-fixes': 'Correggere le esportazioni', tools: 'Strumenti e confronti', delivery: 'Consegna e ISO 19650', privacy: 'Privacy e sicurezza', 'digital-twins': 'Gemelli digitali' },
  ca: { validation: 'Validació', 'export-fixes': 'Corregir exportacions', tools: 'Eines i comparatives', delivery: 'Lliurament i ISO 19650', privacy: 'Privadesa i seguretat', 'digital-twins': 'Bessons digitals' },
}
const LANG_NAME: Record<string, string> = {
  zh: '中文（简体）', ja: '日本語', th: 'ภาษาไทย',
  es: 'español', de: 'Deutsch', fr: 'français', pt: 'português (Brasil)', it: 'italiano', ca: 'català',
}
/** es/de/fr export beside their hand-written arrays in blog-posts.ts; the name says which is which. */
const EXPORT_NAME: Record<string, string> = { es: 'BLOG_POSTS_ES_PACK', de: 'BLOG_POSTS_DE_PACK', fr: 'BLOG_POSTS_FR_PACK' }

const [workDir, lang, ...flags] = process.argv.slice(2)
if (!workDir || !CATEGORY[lang]) throw new Error(`usage: apply.ts <workDir> <${Object.keys(CATEGORY).join('|')}> [--partial]`)
const partial = flags.includes('--partial')

// A language may already have hand-written versions of some English posts
// (Spanish, German, French): those stay, get no translation, and every link
// to their English slug is pointed at the hand-written one.
const key = (p: BlogPost) => p.translationKey ?? p.slug
const written = ALL_BLOG_POSTS.filter((p) => p.lang === lang)
const writtenFor = new Map<string, string>()
for (const source of BLOG_POSTS) {
  const own = written.find((p) => key(p) === key(source))
  if (own) writtenFor.set(source.slug, own.slug)
}

const manifest = new Map(readManifest(workDir).map((m) => [m.slug, m]))
const out: BlogPost[] = []
const skipped: string[] = []
for (const source of BLOG_POSTS) {
  if (writtenFor.has(source.slug)) continue
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
  retargetLinks(post, writtenFor)
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

const name = EXPORT_NAME[lang] ?? `BLOG_POSTS_${lang.toUpperCase()}`
const file = path.resolve('src/lib/blog-i18n', `${lang}.ts`)
const note = writtenFor.size
  ? `\n// Not here: the ${writtenFor.size} posts this language already has hand-written in\n// blog-posts.ts (${[...writtenFor.values()].join(', ')}); links go to those.`
  : ''
writeFileSync(file, `// ─── Blog posts — ${LANG_NAME[lang]} ───────────────────────────────────────────────
// The English library (blog-posts.ts) in ${LANG_NAME[lang]}: same slugs, same blocks,
// links and code, translated text. Built by scripts/blog-i18n/apply.ts from
// segment translations; wording can be edited here directly.${note}
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
