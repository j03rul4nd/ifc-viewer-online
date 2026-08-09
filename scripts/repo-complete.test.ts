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
// SKIPPED, because path aliases and virtual modules are none of its business.
// It fails only when a thing plainly exists locally and is plainly absent from
// what git would hand over, which is the bug and nothing else.
//
// THE THIRD CHECK exists because the first two let a real one through. The
// point cloud readers imported `laz-perf`, which was in node_modules but in
// neither package.json nor the lock. Every local signal said fine — full suite
// green, full production build green — because the package was sitting there
// from an earlier manual install. Vercel installs from the lock, so it would
// have got a module that does not exist. Same shape as the file case: the
// repository referencing something it does not actually ship.

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

  it('declares every package that committed source imports', () => {
    // Aliases configured in vite.config.ts, which resolve to paths rather than
    // to packages. Kept here explicitly: if one is added there and not here the
    // test gets noisier, which is the safe direction to fail.
    const ALIASES = new Set(['@'])

    const pkg = JSON.parse(git(['show', 'HEAD:package.json'])) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ])

    let raw: string
    try {
      raw = git([
        'grep', '-I', '-n', '-E',
        "(from|import\\()[[:space:]]*['\"][^.'\"]",
        'HEAD', '--', 'src', 'scripts',
      ])
    } catch {
      throw new Error('repo-complete: no bare imports found — check the pattern')
    }

    const SPEC_RE = /(?:from|import\()\s*['"]([^'"]+)['"]/
    const LINE_RE = /^HEAD:([^:]+):\d+:(.*)$/
    const undeclared: string[] = []

    for (const line of raw.split('\n')) {
      const m = LINE_RE.exec(line)
      if (!m) continue
      const [, file, text] = m
      if (!/\.(ts|tsx|mjs)$/.test(file)) continue
      const spec = SPEC_RE.exec(text)?.[1]
      if (!spec) continue
      // Relative and absolute paths belong to the check above.
      if (spec.startsWith('.') || spec.startsWith('/')) continue
      // Node builtins, virtual modules and vite's own query suffixes.
      if (spec.startsWith('node:') || spec.includes(':')) continue

      // '@scope/name/deep/path' -> '@scope/name' ; 'name/deep' -> 'name'
      const parts = spec.split('/')
      const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
      if (!name || ALIASES.has(name) || declared.has(name)) continue

      // Same conservatism as the file check: only complain when the package is
      // plainly installed here and plainly missing from the manifest. An
      // unresolvable specifier is somebody else's problem.
      if (!existsSync(join(ROOT, 'node_modules', name))) continue
      undeclared.push(`${name}  — imported by ${file}`)
    }

    const unique = [...new Set(undeclared)]
    expect(
      unique,
      'Committed source imports packages that package.json does NOT declare, so a\n' +
      'clean `npm ci` will not install them and the build will fail on a fresh\n' +
      'machine even though it passes here:\n' +
        unique.map((x) => '  ' + x).join('\n'),
    ).toEqual([])
  })
})
