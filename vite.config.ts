import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { generateFixPages } from './scripts/seo/generate-fix-pages'
import { generateBlogPages } from './scripts/seo/generate-blog-pages'
import { generateLegalPages } from './scripts/seo/generate-legal-pages'

// ── Static landing content injection ─────────────────────────────────────────
// Reads src/locales/en/landing.json after the build and injects the FAQ and
// feature descriptions as a <noscript> block in dist/index.html.
// Purpose: makes the landing page content (FAQ, features, steps) indexable by
// web crawlers that do not execute JavaScript.
// The block is inside <noscript>, so it is invisible to real users — it only
// surfaces for bots running in no-JS mode (Bing, various SEO tools, etc.).
// Google's crawler executes JS and will see the React-rendered content.
interface LandingLocale {
  hero:              { h1: string; h1Accent: string; subtitleFull: string }
  featuresSection:   { title: string; subtitle: string }
  howItWorksSection: { title: string }
  faqSection:        { title: string }
  features:          Array<{ title: string; body: string }>
  steps:             Array<{ n: string; title: string; body: string }>
  faq:               Array<{ q: string; a: string }>
}
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function injectLandingContent(): import('vite').Plugin {
  return {
    name: 'inject-landing-content',
    apply: 'build',
    closeBundle() {
      const distIndex = path.resolve(__dirname, 'dist', 'index.html')
      const localeFile = path.resolve(__dirname, 'src', 'locales', 'en', 'landing.json')
      if (!existsSync(distIndex) || !existsSync(localeFile)) return

      const t: LandingLocale = JSON.parse(readFileSync(localeFile, 'utf-8'))

      const featuresHtml = t.features.map(f =>
        `<article><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></article>`
      ).join('\n')

      const stepsHtml = t.steps.map(s =>
        `<section><h3>${esc(s.n)}. ${esc(s.title)}</h3><p>${esc(s.body)}</p></section>`
      ).join('\n')

      const faqHtml = t.faq.map(item =>
        `<div><h3>${esc(item.q)}</h3><p>${esc(item.a)}</p></div>`
      ).join('\n')

      const block = [
        '<noscript>',
        `<h1>${esc(t.hero.h1)} ${esc(t.hero.h1Accent)}</h1>`,
        `<p>${esc(t.hero.subtitleFull)}</p>`,
        `<section><h2>${esc(t.featuresSection.title)}</h2><p>${esc(t.featuresSection.subtitle)}</p>${featuresHtml}</section>`,
        `<section><h2>${esc(t.howItWorksSection.title)}</h2>${stepsHtml}</section>`,
        `<section><h2>${esc(t.faqSection.title)}</h2>${faqHtml}</section>`,
        '</noscript>',
      ].join('\n')

      let html = readFileSync(distIndex, 'utf-8')
      html = html.replace('</body>', `${block}\n</body>`)
      writeFileSync(distIndex, html)
    },
  }
}

// ── Programmatic SEO: per-rule "How to fix" pages ─────────────────────────────
// Generates dist/fix/<rule>/index.html for every validation rule from the
// remediation corpus, plus a dist/fix/ hub, and injects the URLs into
// dist/sitemap.xml. One hand-authored page → ~34 auto-maintained pages, all
// driven by data already in the repo. See scripts/seo/generate-fix-pages.ts.
function generateRuleFixPages(): import('vite').Plugin {
  return {
    name: 'generate-rule-fix-pages',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      if (!existsSync(distDir)) return
      const r = generateFixPages(distDir)
      const status = r.errors > 0 ? `⚠ ${r.errors} errors` : 'ok'
      // eslint-disable-next-line no-console
      console.log(
        `\n  ✓ SEO fix pages: ${r.pages} rule pages + ${r.categories} category pages + ${r.hubs} hubs across ${r.langs} languages` +
        ` · sitemap ${r.sitemap ? 'updated' : 'unchanged'} · llms.txt ${r.llms ? 'updated' : 'unchanged'} · ${status}\n`,
      )
    },
  }
}

// ── Legal static page shells ─────────────────────────────────────────────────
// Generates dist/privacy/index.html + dist/terms/index.html for GH Pages SPA
// routing and crawlable <head> metadata without SSR.
function generateLegalPageShells(): import('vite').Plugin {
  return {
    name: 'generate-legal-page-shells',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      if (!existsSync(distDir)) return
      const r = generateLegalPages(distDir)
      const status = r.errors > 0 ? `⚠ ${r.errors} errors` : 'ok'
      // eslint-disable-next-line no-console
      console.log(`\n  ✓ Legal pages: ${r.pages} shells (privacy + terms) · ${status}\n`)
    },
  }
}

// ── Blog static page shells ───────────────────────────────────────────────────
// Generates dist/blog/index.html + dist/blog/<slug>/index.html for GitHub Pages
// SPA routing and per-page SEO meta. Runs after generateRuleFixPages so it can
// append to the sitemap + llms.txt that were just written/updated.
function generateBlogPageShells(): import('vite').Plugin {
  return {
    name: 'generate-blog-page-shells',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      if (!existsSync(distDir)) return
      const r = generateBlogPages(distDir)
      const status = r.errors > 0 ? `⚠ ${r.errors} errors` : 'ok'
      // eslint-disable-next-line no-console
      console.log(
        `\n  ✓ Blog pages: ${r.pages} shells (index + ${r.pages - 1} posts)` +
        ` · sitemap ${r.sitemap ? 'updated' : 'unchanged'} · llms.txt ${r.llms ? 'updated' : 'unchanged'} · ${status}\n`,
      )
    },
  }
}

function copyWebIfcWasm() {
  return {
    name: 'copy-web-ifc-wasm',
    writeBundle() {
      const wasmFiles = ['web-ifc.wasm', 'web-ifc-mt.wasm']
      const src = path.resolve(__dirname, 'node_modules/web-ifc')
      const dst = path.resolve(__dirname, 'dist')
      mkdirSync(dst, { recursive: true })
      for (const file of wasmFiles) {
        const srcPath = path.join(src, file)
        if (existsSync(srcPath)) copyFileSync(srcPath, path.join(dst, file))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyWebIfcWasm(), injectLandingContent(), generateRuleFixPages(), generateBlogPageShells(), generateLegalPageShells()],
  // Served from the domain root on Vercel (https://www.ifcvieweronline.eu/).
  // BASE_PATH is honoured if set, but defaults to '/' — the single deploy target.
  base: process.env.BASE_PATH || '/',
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // ── Single Three.js instance fix ─────────────────────────────────────────
      // @thatopen/* packages are excluded from optimizeDeps (see below), so Vite
      // serves them as raw ESM directly from node_modules.  When they import
      // 'three' the bare-specifier would resolve to the raw ESM file on disk,
      // while our app code imports the pre-bundled version from .vite/deps.
      // Two different module URLs → two Three.js instances → __THREE__ warning.
      //
      // IMPORTANT: regex anchored to ^three$ so ONLY the bare specifier is
      // aliased.  A plain string key is a prefix match in Vite and would also
      // rewrite 'three/addons/...' → 'three.module.js/addons/...' (file, not
      // directory) causing an ENOENT crash on startup.
      { find: /^three$/, replacement: path.resolve(__dirname, 'node_modules/three/build/three.module.js') },
    ],
    dedupe: ['three'],
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // @thatopen packages are large and use dynamic imports that conflict with
    // Vite's pre-bundler; serve them as raw ESM.  The 'three' alias above
    // ensures they all share the same Three.js instance with the app code.
    exclude: [
      '@thatopen/components',
      '@thatopen/components-front',
      '@thatopen/fragments',
      'web-ifc',
    ],
    // Force Vite to pre-bundle three so its .vite/deps chunk exists before the
    // excluded packages request it.  Without this, on a cold start the
    // excluded packages might race against three's pre-bundling and end up
    // with an unresolved dependency.
    include: ['three'],
  },
  worker: {
    format: 'es',
    plugins: () => [],
    // Do NOT externalize 'three' here. Web Workers have no module resolution
    // for bare specifiers — externalizing three leaves an unresolvable
    // `import ... from 'three'` in the built worker bundle, which causes a
    // silent module-load failure in production (GitHub Pages / any static host).
    // three must be bundled inline into the worker chunk.
  },
  server: {
    // PORT env override lets tooling (preview harness, CI) assign a free port;
    // day-to-day dev stays on 3000.
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    // Workers must bundle three inline (see worker config note above),
    // so their chunks will always be large. Raise the warning threshold
    // to avoid noise for those unavoidable bundles.
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // The EN locale files are intentionally both statically imported
        // (bundled eagerly so first render has translations) AND referenced
        // via the lazyLoader.ts dynamic template (which Rollup resolves
        // statically). The runtime guard `language === DEFAULT_LOCALE` means
        // the dynamic path is never actually exercised for EN, but Rollup
        // can't know that. Suppress this known-harmless warning.
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' ||
          (warning.message?.includes('dynamically imported') &&
           warning.message?.includes('/locales/en/'))
        ) return
        defaultHandler(warning)
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // GIS-only deps must ride with the LAZY geo chunks: 3d-tiles-renderer
          // contains '/three/' in its internal layout (would land in the eager
          // vendor-three) and proj4 (+ its deps) would fall into vendor-ui.
          // Returning undefined lets Rollup co-locate them with their importer
          // — the dynamically imported geo-system / placement chunks.
          if (
            id.includes('3d-tiles-renderer') ||
            id.includes('/proj4/') || id.includes('/wkt-parser/') || id.includes('/mgrs/') ||
            id.includes('/suncalc/') || id.includes('/tz-lookup/')
          ) return
          // Clerk (F2 auth) must NEVER ride in the eager vendor-ui chunk
          // (invariant I-1: zero auth bytes for the anonymous user). main.tsx
          // imports it dynamically and only when a publishable key is set —
          // naming the chunk (vendor-auth, docs-planning/01 §3.3) keeps it a
          // single lazy, opt-in file that is easy to audit in dist/.
          if (id.includes('@clerk/')) return 'vendor-auth'
          // three.js — large 3D engine, changes infrequently
          if (id.includes('/three/')) return 'vendor-three'
          // IFC engine — @thatopen/* + web-ifc JS side
          if (id.includes('@thatopen/') || id.includes('/web-ifc/')) return 'vendor-ifc'
          // Everything else in node_modules (React, Framer, Radix, Zustand…)
          // Kept as one chunk to avoid circular-dependency warnings from
          // cross-imports between React ecosystem packages.
          return 'vendor-ui'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
