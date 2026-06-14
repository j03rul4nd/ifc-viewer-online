# buildingSMART IDS test case fixtures

Curated subset of the official **buildingSMART IDS** implementers' test cases,
vendored **unmodified** for the engine's golden tests (`ids-testcases.test.ts`).

- **Source:** <https://github.com/buildingSMART/IDS>,
  `Documentation/ImplementersDocumentation/TestCases/`
- **Pinned commit:** `016bbadce0d227d8eabbbc3e8b2b3788590b8a97` (branch `development`, fetched 2026-06-11)
- **License:** © buildingSMART International Ltd. —
  [Creative Commons Attribution-NoDerivatives 4.0 International (CC BY-ND 4.0)](http://creativecommons.org/licenses/by-nd/4.0/).
  CC BY-ND permits redistribution of verbatim copies with attribution; the files
  in this directory are byte-identical to upstream. **Do not edit them** — to
  change coverage, edit `manifest.json` and re-run
  `node scripts/ids/fetch-testcases.mjs`.

## Layout

- `manifest.json` — the curated case list (single source of truth shared by the
  fetch script and the test harness). Expected outcome is encoded in the file
  name prefix (`pass-` / `fail-`); `todo` marks cases the engine cannot satisfy
  yet, tagged with the `docs/IDS_IMPLEMENTATION_PLAN.md` task that enables them.
- `<facet>/<case>.ids` + `<facet>/<case>.ifc` — verbatim upstream pairs.

## Semantics used by the harness

A model **passes** an IDS when no specification has `status: 'fail'`
(`'na'` counts as compliant until spec-level cardinality lands in P2-3).
`fail-*` cases expect at least one failed specification.
