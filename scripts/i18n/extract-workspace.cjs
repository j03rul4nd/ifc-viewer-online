// ─── extract-workspace ────────────────────────────────────────────────────────
// Builds src/locales/en/workspace.json — the English source catalogue of the
// paid workspace — from the code, so it can never drift:
//   • the first argument of every tx('…') / wsT('…') call in the workspace
//   • the visible-text fields of the catalogues those screens translate where
//     they show them (tours, protocols, alerts, plans, data inventory…)
//   • schedule phrases, which are built in lib/connections/schedule.ts
// Keys are the English text (natural keys), so the values equal the keys.
// Plural keys ({{count}}) get an `_one` form when the singular reads differently.
//
//   node scripts/i18n/extract-workspace.cjs           write the catalogue
//   node scripts/i18n/extract-workspace.cjs --check   exit 1 if it is stale

const ts = require('typescript')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const rel = (p) => path.join(ROOT, p)
const OUT = rel('src/locales/en/workspace.json')

const componentFiles = [
  ...fs.readdirSync(rel('src/components/workspace')).filter((f) => f.endsWith('.tsx')).map((f) => `src/components/workspace/${f}`),
  ...fs.readdirSync(rel('src/components/workspace/sections')).filter((f) => f.endsWith('.tsx')).map((f) => `src/components/workspace/sections/${f}`),
].filter((f) => !f.endsWith('.test.tsx'))

/** Catalogue files → property names whose string values are shown to the user. */
const CATALOGUES = {
  'src/lib/workspace-tours/tours.ts': ['title', 'summary', 'body'],
  'src/lib/connections/protocols.ts': ['title', 'body', 'examples', 'name', 'pickWhen', 'label', 'help'],
  'src/lib/connections/schedule.ts': ['label'],
  'src/lib/pricing/catalog.ts': ['title', 'description', 'name', 'audience', 'features'],
  'src/components/workspace/registry.ts': ['label', 'short', 'pitch'],
  'src/components/workspace/sample-data.ts': ['label', 'detail', 'what', 'where', 'kept', 'description'],
  'src/components/workspace/connections-sample.ts': ['label', 'detail', 'note', 'message'],
  'src/components/workspace/plan-sample-data.ts': ['when'],
  'src/lib/plans/features.ts': ['does'],
  'src/lib/plans/ai-credits.ts': ['label'],
}

/** Module-level constants in components whose strings are UI copy. */
const UI_CONSTS = new Set(['STEPS', 'REASONS', 'OFFER', 'KIND_LABEL', 'PLACEHOLDER', 'REPLY_TIME', 'STATUS', 'HEALTH', 'ANSWERS',
  'PROCESSORS', 'REQUEST_LABEL', 'PROFILES', 'DETAIL_TABS', 'TABS', 'boxes', 'ROLES', 'map', 'PRIORITY', 'VERDICT', 'STATES'])
const CONST_KEYS = new Set(['label', 'title', 'body', 'action', 'q', 'a', 'name', 'role'])

const keys = new Set()
const looksLikeText = (s) => /[A-Za-z]/.test(s) && (/\s/.test(s) || /^[A-Z]/.test(s)) && !/^[a-z]+[_:-][a-z0-9_:-]*$/.test(s)

function parse(file) {
  return ts.createSourceFile(file, fs.readFileSync(rel(file), 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}
const strOf = (n) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null)

function collectValue(n) {
  const s = strOf(n)
  if (s !== null) { if (looksLikeText(s)) keys.add(s); return }
  if (ts.isArrayLiteralExpression(n)) n.elements.forEach(collectValue)
}

// 1. tx('…') calls, plus property values / array elements of UI constants.
for (const f of componentFiles) {
  const sf = parse(f)
  const visit = (n) => {
    if (ts.isCallExpression(n) && ['tx', 'wsT', 't'].includes(n.expression.getText()) && n.arguments[0]) {
      const s = strOf(n.arguments[0]); if (s !== null && /[A-Za-z]/.test(s)) keys.add(s)
    }
    if (ts.isVariableDeclaration(n) && UI_CONSTS.has(n.name.getText()) && n.initializer) {
      const walk = (m) => {
        if (ts.isPropertyAssignment(m) && (CONST_KEYS.has(m.name.getText()) || !ts.isIdentifier(m.name) || /^[a-z_]+$/.test(m.name.getText()))) collectValue(m.initializer)
        if (ts.isArrayLiteralExpression(m)) m.elements.forEach((e) => { const s = strOf(e); if (s !== null && looksLikeText(s)) keys.add(s) })
        ts.forEachChild(m, walk)
      }
      walk(n.initializer)
    }
    // Inline literal lists rendered through tx (the role picker).
    if (ts.isArrayLiteralExpression(n) && ts.isPropertyAccessExpression(n.parent) && n.parent.name.text === 'map') {
      n.elements.forEach((e) => { const s = strOf(e); if (s !== null && looksLikeText(s)) keys.add(s) })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

// 2. Catalogues.
for (const [f, props] of Object.entries(CATALOGUES)) {
  const sf = parse(f)
  const wanted = new Set(props)
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && wanted.has(n.name.getText())) collectValue(n.initializer)
    // tuple rows like DATA_INVENTORY are objects; tuples in SAMPLE_* are not UI.
    if (ts.isCallExpression(n) && n.expression.getText() === 't' && n.arguments[0]) {
      const s = strOf(n.arguments[0]); if (s !== null) keys.add(s)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

// 3. Phrases assembled at run time.
for (const name of ['minute', 'hour', 'day of month', 'month', 'day of week']) {
  keys.add(`“{{part}}” is not valid for the ${name}`)
  keys.add(`The ${name} must be between {{lo}} and {{hi}}`)
}
const activity = fs.readFileSync(rel('src/components/workspace/sample-data.ts'), 'utf8')
for (const m of activity.matchAll(/who: '([^']+)', what: '([^']+)'/g)) keys.add(`${m[1]} ${m[2]} <0>{{target}}</0>`)
for (const m of activity.matchAll(/kind: '(?:usage|purchase|plan_grant|refund|expiry)', description: '([^']+)'/g)) keys.add(m[1])
for (const m of activity.matchAll(/description: '([^']+)', amountEur/g)) keys.add(m[1])
for (const m of activity.matchAll(/result: '([^']+)'/g)) keys.add(m[1])

// The tx template with interpolated who/what is not a literal; drop it.
for (const k of [...keys]) if (k.includes('${')) keys.delete(k)

// Singular forms where English needs one.
const ONE = {
  '{{count}} deliveries': '{{count}} delivery',
  '{{count}} credits': '{{count}} credit',
  '{{count}} records': '{{count}} record',
  '{{count}} steps': '{{count}} step',
  '{{count}} months': '{{count}} month',
  'Starts with {{count}} saved sources:': 'Starts with {{count}} saved source:',
  'Sign out {{count}} devices': 'Sign out {{count}} device',
  '{{count}} connections failing — open them to see why.': '{{count}} connection failing — open it to see why.',
  'No charges until it resumes in {{count}} months. You can resume earlier from Credits & billing.': 'No charges until it resumes in {{count}} month. You can resume earlier from Credits & billing.',
  '{{count}} deliveries and their history are deleted now. This can\'t be undone — archive it instead if you may need it again.': '{{count}} delivery and its history are deleted now. This can\'t be undone — archive it instead if you may need it again.',
  'The {{count}} plan credits you have left expire; pack credits stay until their own date.': 'The {{count}} plan credit you have left expires; pack credits stay until their own date.',
  'Run for {{count}} credits': 'Run for {{count}} credit',
}

const out = {}
for (const k of [...keys].sort((a, b) => a.localeCompare(b))) {
  out[k] = k
  if (ONE[k]) out[`${k}_one`] = ONE[k]
}
const json = JSON.stringify(out, null, 2) + '\n'

if (process.argv.includes('--check')) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  if (now !== json) { console.error('src/locales/en/workspace.json is stale — run node scripts/i18n/extract-workspace.cjs'); process.exit(1) }
  console.log('workspace catalogue up to date:', Object.keys(out).length, 'keys')
} else {
  fs.writeFileSync(OUT, json)
  console.log('wrote', path.relative(ROOT, OUT), Object.keys(out).length, 'keys')
}
