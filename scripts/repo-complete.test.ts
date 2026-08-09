// ─── repository completeness ──────────────────────────────────────────────────
// Guards the failure that took production down for an evening: the repository
// referencing a file that exists on the author's disk but was never `git add`ed.
//
// It is a nasty one because every local signal says fine. The build passes, the
// types check, the tests are green — because the file IS there. Only a fresh
// checkout disagrees, so the first symptom is a red deploy whose error looks
// nothing like the cause. It happened twice in a day: `tsconfig.sdk.json` and
// `scripts/sdk/finalize-types.mjs` were invoked by the committed build script,
// and the event-bus command types were missing under a panel already committed.
//
// EVERYTHING HERE ASKS ABOUT HEAD, NOT THE DISK. The invariant is "what git
// would hand a fresh checkout is self-consistent", so imports are resolved
// against the tracked set rather than the filesystem. Checking the working tree
// instead would fire on every half-finished feature — new files legitimately
// sit untracked for a while — and a guard that cries during normal work is a
// guard that gets deleted.
//
// Conservative by design: an import that resolves to nothing anywhere is
// SKIPPED, because bare specifiers, path aliases and virtual modules are none
// of its business. It fails only when a file plainly exists on disk and is
// plainly absent from git, which is the bug and nothing else.

// WHY IT LIVES IN scripts/ AND NOT NEXT TO WHAT IT GUARDS: tsconfig.json is the
// BROWSER program — `"include": ["src"]` with `"types": ["vite/client"]` and no
// @types/node. A test under src/ that imports `node:fs` therefore fails
// `tsc -b`, which `npm run build` runs, so the guard against a broken build
// broke the build. scripts/ sits outside that include, which is the same reason
// scripts/blender/props-assets.test.ts lives there. vitest finds it either way.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve, join, posix } from 'node:path'

const ROOT = resolve(__dirname, '..')

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Everything git has in the index, as repo-relative POSIX paths. */
const tracked = new Set(git(['ls-files']).split('\n').filter(Boolean).map((p) => p.trim()))

/** Extensions an import may omit, in the order a bundler would try them. */
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css']

/** Every path a relative import could mean, most specific first. */
function candidates(fromPath: string, spec: string): string[] {
  const base = posix.join(posix.dirname(fromPath), spec)
  return [
    ...EXTS.map((e) => base + e),
    ...EXTS.slice(1).map((e) => posix.join(base, 'index' + e)),
  ]
}

/** Present in git, or merely present on disk? Only the second is a bug. */
function untrackedButPresent(options: string[]): string | undefined {
  if (options.some((c) => tracked.has(c))) return undefined
  return options.find((c) => existsSync(join(ROOT, c)) && statSync(join(ROOT, c)).isFile())
}

describe('repository completeness', () => {
  it('tracks every local file the build scripts invoke', () => {
    const pkg = JSON.parse(git(['show', 'HEAD:package.json'])) as {
      scripts?: Record<string, string>
    }

    // Paths that look like files this repo owns: a config or a script, never a
    // package name and never a flag value.
    const PATH_LIKE =
      /(?:^|[\s='"])((?:\.\/)?(?:scripts|config)\/[\w./-]+\.(?:mjs|cjs|js|ts)|[\w.-]*tsconfig[\w.-]*\.json|vite\.config[\w.-]*\.ts)/g

    const missing: string[] = []
    for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
      for (const match of script.matchAll(PATH_LIKE)) {
        const rel = match[1].replace(/^\.\//, '')
        if (tracked.has(rel)) continue
        // A path that is not a real file either is not this test's business.
        if (!existsSync(join(ROOT, rel))) continue
        missing.push(`${rel}  — invoked by "${name}"`)
      }
    }

    expect(
      missing,
      'These files exist on disk but are NOT in git, so a fresh checkout cannot build:\n' +
        missing.map((m) => '  ' + m).join('\n'),
    ).toEqual([])
  })

  it('tracks every local file that committed source imports', () => {
    // ONE git process, not one per file. Spawning `git show` per source took
    // 17 seconds and timed the test out; `git grep` over HEAD does the whole
    // repository in a single pass and returns file, line and text.
    //
    // Line-based scanning is fine even for multi-line import statements: the
    // specifier always sits on the same line as its `from`.
    let raw: string
    try {
      raw = git([
        'grep', '-I', '-n', '-E',
        "(from|import\\()[[:space:]]*['\"]\\.",
        'HEAD', '--', 'src',
      ])
    } catch {
      // git grep exits non-zero when nothing matches, which here would mean the
      // pattern has rotted rather than that all is well.
      throw new Error('repo-complete: no relative imports found under src — check the pattern')
    }

    const SPEC_RE = /(?:from|import\()\s*['"]([^'"]+)['"]/
    const LINE_RE = /^HEAD:([^:]+):\d+:(.*)$/
    const missing: string[] = []

    for (const line of raw.split('\n')) {
      const m = LINE_RE.exec(line)
      if (!m) continue
      const [, file, text] = m
      if (!/\.(ts|tsx)$/.test(file)) continue
      const spec = SPEC_RE.exec(text)?.[1]
      if (!spec || !spec.startsWith('.')) continue

      const onDisk = untrackedButPresent(candidates(file, spec))
      if (onDisk) missing.push(`${onDisk}  — imported by ${file}`)
    }

    const unique = [...new Set(missing)]
    expect(
      unique,
      'Committed source imports files that are NOT in git, so a fresh checkout cannot build:\n' +
        unique.map((x) => '  ' + x).join('\n'),
    ).toEqual([])
  })
})
