// ─── Blog topics ─────────────────────────────────────────────────────────────
// A topic is a category that has earned its own page: /blog/topic/<slug>/.
//
// Why pages and not only a filter: a filter exists only in JavaScript, so a
// search engine sees one undifferentiated list and no page that is ABOUT
// "IFC validation". A topic hub is that page — an intro, the guide to start
// with, every article in the topic, and the tools that solve its problems —
// and every article links up to it from its breadcrumb.
//
// A category only becomes a hub with MIN_TOPIC_POSTS articles in that
// language: a hub with one article is a thin page that competes with the
// article itself.

import type { BlogPost } from './blog-posts'
import { linkedSlugs } from './blog-related'

export const MIN_TOPIC_POSTS = 3

export interface TopicCopy {
  /** Page title (H1) — what someone searching the topic would type. */
  title: string
  /** One or two sentences: what the topic covers and who it helps. */
  intro: string
}

/** Written per language; a category without copy here never becomes a hub. */
const TOPIC_COPY: Record<string, Record<string, TopicCopy>> = {
  en: {
    validation: {
      title: 'IFC validation and model checking',
      intro: 'How to check an IFC model before it is delivered — schema, quality rules, IDS and the Health Score — and how to read what the checks report.',
    },
    'export-fixes': {
      title: 'Fixing broken IFC exports',
      intro: 'The export problems that get models rejected — changing or duplicate GUIDs, missing properties, wrong coordinates, oversized files — traced to their cause in Revit and other tools.',
    },
    tools: {
      title: 'IFC tools, viewers and formats compared',
      intro: 'Which viewer, checker or editor fits the job, which file format and IFC version to deliver, and how to open or read IFC without desktop software.',
    },
    delivery: {
      title: 'IFC delivery and ISO 19650',
      intro: 'Turning model quality into an agreed routine: ISO 19650 checks, BEP clauses, acceptance criteria and what to hand over with a model.',
    },
    privacy: {
      title: 'Privacy and security for BIM models',
      intro: 'What happens to a model when a tool processes it: NDA projects, GDPR, IT-security questions for vendors, and browser versus cloud processing.',
    },
    'digital-twins': {
      title: 'IFC digital twins: point clouds, LiDAR, video and maps',
      intro: 'Combining IFC with point clouds, temporal LiDAR, construction video and 3D maps in the browser — each guide with a working demo you can open.',
    },
  },
  es: {
    'digital-twins': {
      title: 'Gemelos digitales IFC: nubes de puntos, LiDAR, vídeo y mapas',
      intro: 'Cómo combinar IFC con nubes de puntos, LiDAR temporal, vídeo de obra y mapas 3D en el navegador; cada guía incluye una demo que puedes abrir.',
    },
  },
  zh: {
    validation: {
      title: 'IFC 验证与模型检查',
      intro: '如何在交付前检查 IFC 模型——模式、质量规则、IDS 和 Health Score——以及如何解读检查报告。',
    },
    'export-fixes': {
      title: '修复出错的 IFC 导出',
      intro: '导致模型被退回的导出问题：GUID 变化或重复、属性缺失、坐标错误、文件过大——在 Revit 等软件中追溯其根源。',
    },
    tools: {
      title: 'IFC 工具、查看器与格式对比',
      intro: '哪款查看器、检查工具或编辑器适合你的工作，应交付哪种文件格式和 IFC 版本，以及如何不借助桌面软件打开或读取 IFC。',
    },
    delivery: {
      title: 'IFC 交付与 ISO 19650',
      intro: '把模型质量变成约定好的例行流程：ISO 19650 检查、BEP 条款、验收标准，以及随模型一起移交的内容。',
    },
    privacy: {
      title: 'BIM 模型的隐私与安全',
      intro: '工具处理模型时会发生什么：保密项目、GDPR、面向供应商的 IT 安全问题，以及浏览器处理与云端处理的对比。',
    },
    'digital-twins': {
      title: 'IFC 数字孪生：点云、LiDAR、视频与地图',
      intro: '在浏览器中将 IFC 与点云、时序 LiDAR、施工视频和 3D 地图结合——每篇指南都附有可直接打开的演示。',
    },
  },
  ja: {
    validation: {
      title: 'IFCの検証とモデルチェック',
      intro: '納品前にIFCモデルをチェックする方法（スキーマ、品質ルール、IDS、Health Score）と、チェック結果の読み方。',
    },
    'export-fixes': {
      title: 'IFCエクスポートの不具合を直す',
      intro: 'モデルが差し戻される原因になるエクスポートの問題（GUIDの変化や重複、プロパティの欠落、座標の誤り、ファイルの肥大化）を、Revitなどのツール側の原因までたどります。',
    },
    tools: {
      title: 'IFCツール・ビューアー・形式の比較',
      intro: '作業に合うビューアー、チェッカー、エディターはどれか。どのファイル形式とIFCバージョンで納品すべきか。デスクトップソフトなしでIFCを開いて読む方法も解説します。',
    },
    delivery: {
      title: 'IFCの納品とISO 19650',
      intro: 'モデルの品質を合意済みの手順にする方法：ISO 19650のチェック、BEPの条項、受入基準、モデルと一緒に引き渡すもの。',
    },
    privacy: {
      title: 'BIMモデルのプライバシーとセキュリティ',
      intro: 'ツールがモデルを処理するとき何が起きるのか：NDA案件、GDPR、ベンダーへのITセキュリティ質問、ブラウザー処理とクラウド処理の違い。',
    },
    'digital-twins': {
      title: 'IFCデジタルツイン：点群・LiDAR・動画・地図',
      intro: 'ブラウザー上でIFCを点群、時系列LiDAR、工事動画、3D地図と組み合わせる方法。どのガイドにも実際に開けるデモがあります。',
    },
  },
  th: {
    validation: {
      title: 'การตรวจสอบความถูกต้องของไฟล์และโมเดล IFC',
      intro: 'วิธีตรวจสอบโมเดล IFC ก่อนส่งมอบ ทั้งสคีมา กฎคุณภาพ IDS และ Health Score รวมถึงวิธีอ่านผลการตรวจสอบ',
    },
    'export-fixes': {
      title: 'แก้ไขปัญหาการส่งออก IFC',
      intro: 'ปัญหาการส่งออกที่ทำให้โมเดลถูกตีกลับ ทั้ง GUID ที่เปลี่ยนหรือซ้ำ คุณสมบัติที่หายไป พิกัดผิด และไฟล์ใหญ่เกินไป พร้อมตามหาต้นเหตุใน Revit และเครื่องมืออื่น',
    },
    tools: {
      title: 'เปรียบเทียบเครื่องมือ โปรแกรมดู และรูปแบบไฟล์ IFC',
      intro: 'โปรแกรมดู เครื่องมือตรวจสอบ หรือโปรแกรมแก้ไขตัวไหนเหมาะกับงาน ควรส่งมอบรูปแบบไฟล์และเวอร์ชัน IFC ใด และวิธีเปิดหรืออ่าน IFC โดยไม่ต้องใช้ซอฟต์แวร์บนเดสก์ท็อป',
    },
    delivery: {
      title: 'การส่งมอบ IFC และ ISO 19650',
      intro: 'เปลี่ยนคุณภาพโมเดลให้เป็นขั้นตอนที่ตกลงร่วมกัน ทั้งการตรวจสอบตาม ISO 19650 ข้อกำหนดใน BEP เกณฑ์การตรวจรับ และสิ่งที่ต้องส่งมอบพร้อมโมเดล',
    },
    privacy: {
      title: 'ความเป็นส่วนตัวและความปลอดภัยของโมเดล BIM',
      intro: 'เกิดอะไรขึ้นกับโมเดลเมื่อเครื่องมือประมวลผล ทั้งโครงการที่มี NDA, GDPR, คำถามด้านความปลอดภัยไอทีสำหรับผู้ให้บริการ และการประมวลผลบนเบราว์เซอร์เทียบกับคลาวด์',
    },
    'digital-twins': {
      title: 'ดิจิทัลทวิน IFC: พอยต์คลาวด์ LiDAR วิดีโอ และแผนที่',
      intro: 'รวม IFC เข้ากับพอยต์คลาวด์ LiDAR ตามช่วงเวลา วิดีโอหน้างาน และแผนที่ 3D ในเบราว์เซอร์ ทุกคู่มือมีเดโมที่เปิดใช้งานได้จริง',
    },
  },
}

export interface Topic {
  slug: string
  /** Short label (the category name), for chips and breadcrumbs. */
  label: string
  copy: TopicCopy
  posts: BlogPost[]
}

export function topicsFor(posts: BlogPost[], lang: string): Topic[] {
  const copy = TOPIC_COPY[lang] ?? {}
  const bySlug = new Map<string, BlogPost[]>()
  for (const p of posts) {
    if ((p.lang ?? 'en') !== lang) continue
    bySlug.set(p.categorySlug, [...(bySlug.get(p.categorySlug) ?? []), p])
  }
  return [...bySlug.entries()]
    .filter(([slug, list]) => list.length >= MIN_TOPIC_POSTS && copy[slug])
    .map(([slug, list]) => ({ slug, label: list[0].category, copy: copy[slug], posts: list }))
    .sort((a, b) => b.posts.length - a.posts.length)
}

export function topicBySlug(posts: BlogPost[], lang: string, slug: string): Topic | undefined {
  return topicsFor(posts, lang).find((t) => t.slug === slug)
}

/**
 * How many other posts link to each post — the site's own evidence of which
 * articles are foundational. A post five others build on is where a newcomer
 * should start; that's a better signal than recency, and honest without
 * page-view data.
 */
export function inboundLinks(posts: BlogPost[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of posts) {
    for (const slug of linkedSlugs(p)) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  return counts
}

/** Most-linked posts first; ties go to the newer one. */
export function foundationalPosts(posts: BlogPost[], limit: number, pool: BlogPost[] = posts): BlogPost[] {
  const inbound = inboundLinks(pool)
  return [...posts]
    .sort((a, b) => (inbound.get(b.slug) ?? 0) - (inbound.get(a.slug) ?? 0) || b.date.localeCompare(a.date))
    .slice(0, limit)
}

// ── Freshness ───────────────────────────────────────────────────────────────

const DAY = 86_400_000
const NEW_DAYS = 30
/** An update counts only if it came well after publication. */
const UPDATE_GAP_DAYS = 14

export type Freshness = 'new' | 'updated' | null

export function freshness(post: BlogPost, today: Date): Freshness {
  const published = Date.parse(post.date)
  const modified = post.dateModified ? Date.parse(post.dateModified) : NaN
  if (today.getTime() - published <= NEW_DAYS * DAY) return 'new'
  if (Number.isFinite(modified) && modified - published >= UPDATE_GAP_DAYS * DAY && today.getTime() - modified <= 90 * DAY) return 'updated'
  return null
}

/** The date that matters to a returning reader: last update, else publication. */
export function lastTouched(post: BlogPost): string {
  return post.dateModified && post.dateModified > post.date ? post.dateModified : post.date
}

/** Newest activity first — new posts and meaningful updates together. */
export function whatsNew(posts: BlogPost[], limit: number): BlogPost[] {
  return [...posts].sort((a, b) => lastTouched(b).localeCompare(lastTouched(a))).slice(0, limit)
}
