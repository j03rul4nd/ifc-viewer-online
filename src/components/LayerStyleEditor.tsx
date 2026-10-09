// ─── LayerStyleEditor ─────────────────────────────────────────────────────────
// "How does this data look in the scene?" — for a layer of trains, bikes,
// chargers, zones, routes… Three tabs:
//
//   Groups      pick features by their properties ("asset.type = train" → 80),
//               one look per group: icon / shape / model, colour, size, label for
//               points; colour and width for lines; fill and height for areas.
//   Zoom        what is drawn at which distance: full + label → icon → dot → gone.
//   Aggregate   from far away, a heatmap or hexagons coloured by a value
//               (occupancy, traffic) instead of thousands of pins.
//   Alerts      "tell me when…": a condition held for N minutes rings the
//               feature in the scene and shows a notice.

import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { useVectorLayerStore, type VectorLayer } from '../stores/vectorLayerStore'
import { layerRows, focusVectorFeature, seriesOf } from '../lib/layers/vector-runner'
import { newAlertId, type AlertRule } from '../lib/layers/alerts'
import {
  getNotifySettings, setNotifySettings, onNotifySettings, systemPermission, enableSystemNotifications,
} from '../lib/layers/alert-notify'
import { getAlertLog, onAlertLog, clearAlertLog, alertLogCsv, entryOf } from '../lib/layers/alert-log'
import { inferSchema } from '../lib/twin/flatten-props'
import {
  groupCounts, valueCounts, newGroupId, defaultGroupStyle, RAMPS, numericRange, classBreaks, graduatedGroups, type ClassMethod,
  type LayerStyle, type StyleGroup, type GroupStyle, type Filter, type FilterOp, type ColorStop,
} from '../lib/layers/style-groups'
import { ICON_IDS, PRIMITIVES, guessIcon, type PointSymbol } from '../lib/layers/symbology'
import { addAssetFile, iconDataUrl, listAssets } from '../lib/layers/vector-assets'
import { toast } from '../stores/toastStore'

type T = (k: string, o?: Record<string, unknown>) => string

const PALETTE = ['#2fb7ff', '#5ce27a', '#ffd23f', '#f25c54', '#b18cff', '#ff7a1a', '#3ee0d0', '#ff4f8b', '#c0ca33', '#ffffff']
const OPS: FilterOp[] = ['eq', 'neq', 'in', 'notIn', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte', 'between', 'exists', 'missing', 'isTrue', 'isFalse']
const NO_VALUE_OPS = new Set<FilterOp>(['exists', 'missing', 'isTrue', 'isFalse'])

const sel = 'min-w-0 px-1.5 py-1 max-md:py-2 rounded-[6px] text-[10px] max-md:text-[12px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]'
const btn = 'shrink-0 px-2 py-1 max-md:py-2 rounded-[6px] text-[10px] max-md:text-[12px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-colors disabled:opacity-40'

export function LayerStyleEditor({ layer }: { layer: VectorLayer }) {
  const { t: tRaw } = useTranslation('layers')
  const t = tRaw as unknown as T
  const [tab, setTab] = useState<'groups' | 'zoom' | 'aggregate' | 'alerts'>('groups')
  const ls = layer.layerStyle
  const set = (next: LayerStyle): void => useVectorLayerStore.getState().setLayerStyle(layer.id, next)
  const rows = useMemo(() => (layer.data ? layerRows(layer.data) : []), [layer.data])
  const schema = useMemo(() => inferSchema(rows), [rows])
  const kinds = layer.data?.counts ?? { point: 0, line: 0, polygon: 0 }

  return (
    <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[var(--border)]" data-testid="layer-style">
      <div className="flex gap-1" role="tablist">
        {(['groups', 'zoom', 'aggregate', 'alerts'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex-1 px-1.5 py-1 rounded-[6px] text-[10px] font-medium border ${tab === k ? 'border-[var(--accent)] text-[var(--text)] bg-[var(--surface-2)]' : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
            {t(`styleTabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'groups' && <GroupsTab ls={ls} set={set} rows={rows} schema={schema} kinds={kinds} t={t} />}
      {tab === 'zoom' && <ZoomTab ls={ls} set={set} t={t} hasPoints={kinds.point > 0} />}
      {tab === 'aggregate' && <AggregateTab ls={ls} set={set} schema={schema} t={t} hasPoints={kinds.point > 0} />}
      {tab === 'alerts' && <AlertsTab layer={layer} rows={rows} schema={schema} t={t} />}
    </div>
  )
}

// ── Groups ─────────────────────────────────────────────────────────────────────

type Rows = ReturnType<typeof layerRows>
type Schema = ReturnType<typeof inferSchema>
type Kinds = { point: number; line: number; polygon: number }

function GroupsTab({ ls, set, rows, schema, kinds, t }: {
  ls: LayerStyle; set: (s: LayerStyle) => void; rows: Rows; schema: Schema; kinds: Kinds; t: T
}) {
  const counts = useMemo(() => groupCounts(rows, ls), [rows, ls])
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(ls.groups.length === 0)
  const patchGroup = (i: number, g: StyleGroup): void => set({ ...ls, groups: ls.groups.map((x, k) => (k === i ? g : x)) })
  const move = (i: number, d: -1 | 1): void => {
    const j = i + d
    if (j < 0 || j >= ls.groups.length) return
    const groups = [...ls.groups];[groups[i], groups[j]] = [groups[j], groups[i]]
    set({ ...ls, groups })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">
        {t('groups.summary', { n: rows.length, g: ls.groups.length })}
      </div>

      {creating
        ? <GroupMaker rows={rows} schema={schema} t={t} existing={ls.groups.length}
          onCancel={() => setCreating(false)}
          onCreate={(gs, top) => {
            // Ranges go first: they are the colouring the user just asked for,
            // and groups are first-match — below older groups they would never show.
            set({ ...ls, groups: top ? [...gs, ...ls.groups] : [...ls.groups, ...gs] }); setCreating(false); setOpen(top ? null : gs[0]?.id ?? null)
          }} />
        : <button className={`${btn} self-start`} onClick={() => setCreating(true)}>+ {t('groups.create')}</button>}

      {ls.groups.map((g, i) => (
        <GroupCard key={g.id} g={g} count={counts.byGroup[i]} kinds={kinds} schema={schema} rows={rows} t={t}
          open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)}
          onChange={(ng) => patchGroup(i, ng)}
          onUp={i > 0 ? () => move(i, -1) : undefined}
          onDown={i < ls.groups.length - 1 ? () => move(i, 1) : undefined}
          onDelete={() => set({ ...ls, groups: ls.groups.filter((_, k) => k !== i) })} />
      ))}

      {/* Everything no group took. */}
      <div className="rounded-[7px] border border-dashed border-[var(--border)] px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <input type="checkbox" checked={ls.fallback.visible} aria-label={t('groups.visible')}
            onChange={(e) => set({ ...ls, fallback: { ...ls.fallback, visible: e.target.checked } })} />
          <Swatch style={ls.fallback} />
          <button className="flex-1 min-w-0 text-left text-[11px] text-[var(--text)] truncate" onClick={() => setOpen(open === '_rest' ? null : '_rest')}>
            {ls.groups.length ? t('groups.rest') : t('groups.all')}
          </button>
          <span className="text-[10px] font-mono text-[var(--text-faint)]">{counts.fallback}</span>
        </div>
        {open === '_rest' && (
          <LookEditor style={ls.fallback} kinds={kinds} schema={schema} t={t}
            onChange={(st) => set({ ...ls, fallback: { ...st, visible: ls.fallback.visible } })} />
        )}
      </div>
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('groups.priorityHint')}</div>
    </div>
  )
}

/** The "select the 80 trains" step: a field, its values with counts, tick and create. */
function GroupMaker({ rows, schema, existing, onCreate, onCancel, t }: {
  rows: Rows; schema: Schema; existing: number; onCreate: (g: StyleGroup[], top?: boolean) => void; onCancel: () => void; t: T
}) {
  const fields = useMemo(() => schema
    .filter((f) => f.distinct >= 1 && f.coverage >= 0.05)
    .sort((a, b) => Number(b.role === 'category') - Number(a.role === 'category') || a.distinct - b.distinct), [schema])
  const [field, setField] = useState(fields.find((f) => f.role === 'category')?.field ?? fields[0]?.field ?? '')
  const values = useMemo(() => (field ? valueCounts(rows, field) : []), [rows, field])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const shown = values.filter((v) => !q || v.value.toLowerCase().includes(q.toLowerCase()))
  const pickedCount = values.filter((v) => picked.has(v.value)).reduce((n, v) => n + v.count, 0)
  // A number with more than a handful of values reads better as ranges.
  const isNumeric = useMemo(() => !!field && values.length > 4 && numericRange(rows, field) !== null, [rows, field, values.length])

  const mk = (name: string, filters: Filter[], i: number, hint: string): StyleGroup => {
    const color = PALETTE[(existing + i) % PALETTE.length]
    const style = defaultGroupStyle(color)
    const icon = guessIcon(hint) ?? guessIcon(field)
    if (icon) style.point = { ...style.point, symbol: { kind: 'icon', icon } }
    return { id: newGroupId(), name, match: 'all', filters, style, visible: true }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-[7px] border border-[var(--accent)] p-2" data-testid="group-maker">
      <div className="text-[11px] font-medium">{t('maker.title')}</div>
      <label className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--text-dim)] shrink-0">{t('maker.field')}</span>
        <select className={`${sel} flex-1`} value={field} onChange={(e) => { setField(e.target.value); setPicked(new Set()) }}>
          {fields.map((f) => <option key={f.field} value={f.field}>{f.field} ({f.distinct})</option>)}
        </select>
      </label>
      {isNumeric && <Graduated rows={rows} field={field} onCreate={(gs) => onCreate(gs, true)} t={t} />}
      {values.length > 8 && (
        <input className={sel} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('maker.filter')} />
      )}
      <div className="flex gap-2 text-[10px]">
        <button className="text-[var(--accent)] hover:underline" onClick={() => setPicked(new Set(shown.map((v) => v.value)))}>{t('maker.all')}</button>
        <button className="text-[var(--accent)] hover:underline" onClick={() => setPicked(new Set())}>{t('maker.none')}</button>
        <span className="flex-1" />
        <span className="text-[var(--text-faint)]">{t('maker.picked', { n: pickedCount })}</span>
      </div>
      <div className="flex flex-col max-h-48 overflow-y-auto rounded-[6px] border border-[var(--border)]">
        {shown.map((v) => (
          <label key={v.value} className="flex items-center gap-1.5 px-2 py-1 max-md:py-2 text-[11px] border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] cursor-pointer">
            <input type="checkbox" checked={picked.has(v.value)} onChange={(e) => {
              const n = new Set(picked); if (e.target.checked) n.add(v.value); else n.delete(v.value); setPicked(n)
            }} />
            <span className="flex-1 min-w-0 truncate text-[var(--text)]">{v.value}</span>
            <span className="font-mono text-[10px] text-[var(--text-faint)]">{v.count}</span>
          </label>
        ))}
        {shown.length === 0 && <div className="px-2 py-1.5 text-[10px] text-[var(--text-faint)]">{t('maker.noValues')}</div>}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <button className={btn} disabled={picked.size === 0} onClick={() => {
          const vals = values.filter((v) => picked.has(v.value)).map((v) => v.value)
          const name = vals.length === 1 ? vals[0] : `${field}: ${vals.slice(0, 3).join(', ')}${vals.length > 3 ? '…' : ''}`
          onCreate([mk(name, [vals.length === 1 ? { field, op: 'eq', value: vals[0] } : { field, op: 'in', value: vals }], 0, vals.join(' '))])
        }}>{t('maker.oneGroup')}</button>
        <button className={btn} disabled={picked.size === 0} onClick={() => {
          const vals = values.filter((v) => picked.has(v.value))
          onCreate(vals.map((v, i) => mk(v.value, [{ field, op: 'eq', value: v.value }], i, v.value)))
        }}>{t('maker.groupPerValue')}</button>
        <button className={btn} onClick={() => onCreate([mk(t('maker.newGroup'), [], 0, '')])}>{t('maker.empty')}</button>
        <span className="flex-1" />
        <button className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]" onClick={onCancel}>{t('links.cancel')}</button>
      </div>
    </div>
  )
}

/** "Colour by a number": classes of a numeric field along a colour ramp. */
function Graduated({ rows, field, onCreate, t }: { rows: Rows; field: string; onCreate: (g: StyleGroup[]) => void; t: T }) {
  const [n, setN] = useState(4)
  const [method, setMethod] = useState<ClassMethod>('quantile')
  const [ramp, setRamp] = useState<keyof typeof RAMPS>('traffic')
  const [reverse, setReverse] = useState(false)
  const values = useMemo(() => rows.flatMap((r) => r.filter((p) => p.field === field && typeof p.value === 'number').map((p) => p.value as number)), [rows, field])
  const groups = useMemo(() => graduatedGroups(field, classBreaks(values, n, method), RAMPS[ramp], reverse), [field, values, n, method, ramp, reverse])
  const counts = useMemo(() => classBreaks(values, n, method).map((c) => c.count), [values, n, method])
  return (
    <div className="flex flex-col gap-1 p-1.5 rounded-[6px] bg-[var(--surface-2)]" data-testid="graduated">
      <div className="text-[10px] font-medium text-[var(--text)]">{t('graduated.title')}</div>
      <div className="flex items-center gap-1 flex-wrap text-[10px]">
        <select className={sel} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label={t('graduated.classes')}>
          {[3, 4, 5, 6, 7].map((k) => <option key={k} value={k}>{t('graduated.nClasses', { n: k })}</option>)}
        </select>
        <select className={sel} value={method} onChange={(e) => setMethod(e.target.value as ClassMethod)} aria-label={t('graduated.method')}>
          <option value="quantile">{t('graduated.quantile')}</option>
          <option value="equal">{t('graduated.equal')}</option>
        </select>
        <select className={sel} value={ramp} onChange={(e) => setRamp(e.target.value as keyof typeof RAMPS)} aria-label={t('graduated.ramp')}>
          {(Object.keys(RAMPS) as Array<keyof typeof RAMPS>).map((r) => <option key={r} value={r}>{t(`agg.ramp.${r}`)}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[var(--text-dim)]">
          <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />{t('graduated.reverse')}
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {groups.map((g, i) => (
          <span key={g.id} className="flex items-center gap-1 px-1 rounded text-[10px] bg-[var(--surface)] text-[var(--text)]">
            <span className="w-2 h-2 rounded-full" style={{ background: g.style.point.color }} />{g.name}
            <span className="font-mono text-[var(--text-faint)]">{counts[i]}</span>
          </span>
        ))}
      </div>
      <button className={`${btn} self-start`} disabled={groups.length === 0} onClick={() => onCreate(groups)}>
        {t('graduated.create', { n: groups.length })}
      </button>
    </div>
  )
}

function Swatch({ style }: { style: GroupStyle }) {
  const s = style.point.symbol
  const url = s.kind === 'icon' ? iconDataUrl(s.icon, style.point.color) : null
  return url
    ? <img src={url} alt="" className="w-5 h-5 shrink-0" />
    : <span className="w-4 h-4 shrink-0 rounded-full border border-black/40" style={{ background: style.point.color }} />
}

function GroupCard({ g, count, kinds, schema, rows, open, onToggle, onChange, onUp, onDown, onDelete, t }: {
  g: StyleGroup; count: number; kinds: Kinds; schema: Schema; rows: Rows; open: boolean; t: T
  onToggle: () => void; onChange: (g: StyleGroup) => void; onUp?: () => void; onDown?: () => void; onDelete: () => void
}) {
  return (
    <div className={`rounded-[7px] border px-2 py-1.5 ${open ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`} data-testid="style-group">
      <div className="flex items-center gap-1.5">
        <input type="checkbox" checked={g.visible} aria-label={t('groups.visible')} onChange={(e) => onChange({ ...g, visible: e.target.checked })} />
        <Swatch style={g.style} />
        <button className="flex-1 min-w-0 text-left text-[11px] text-[var(--text)] truncate" onClick={onToggle} title={g.name}>{g.name}</button>
        <span className="text-[10px] font-mono text-[var(--text-faint)]" title={t('groups.count')}>{count}</span>
        <button className="w-5 text-[10px] text-[var(--text-dim)] disabled:opacity-30" disabled={!onUp} onClick={onUp} aria-label={t('groups.up')}>▲</button>
        <button className="w-5 text-[10px] text-[var(--text-dim)] disabled:opacity-30" disabled={!onDown} onClick={onDown} aria-label={t('groups.down')}>▼</button>
      </div>
      {open && (
        <div className="mt-1.5 flex flex-col gap-2">
          <input className={sel} value={g.name} onChange={(e) => onChange({ ...g, name: e.target.value })} aria-label={t('groups.name')} />
          <Conditions g={g} schema={schema} rows={rows} onChange={onChange} t={t} />
          <LookEditor style={g.style} kinds={kinds} schema={schema} t={t} onChange={(style) => onChange({ ...g, style })} />
          <button className="self-start text-[10px] text-[#f25c54] hover:underline" onClick={onDelete}>{t('groups.delete')}</button>
        </div>
      )}
    </div>
  )
}

type Conditional = { match: 'all' | 'any'; filters: Filter[] }
function Conditions<G extends Conditional>({ g, schema, rows, onChange, t }: { g: G; schema: Schema; rows: Rows; onChange: (g: G) => void; t: T }) {
  const setF = (i: number, f: Filter): void => onChange({ ...g, filters: g.filters.map((x, k) => (k === i ? f : x)) })
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
        <span>{t('cond.title')}</span>
        {g.filters.length > 1 && (
          <select className={sel} value={g.match} onChange={(e) => onChange({ ...g, match: e.target.value as 'all' | 'any' })}>
            <option value="all">{t('cond.all')}</option>
            <option value="any">{t('cond.any')}</option>
          </select>
        )}
      </div>
      {g.filters.length === 0 && <div className="text-[10px] text-[var(--text-faint)]">{t('cond.none')}</div>}
      {g.filters.map((f, i) => (
        <FilterRow key={i} f={f} schema={schema} rows={rows} t={t} onChange={(nf) => setF(i, nf)}
          onRemove={() => onChange({ ...g, filters: g.filters.filter((_, k) => k !== i) })} />
      ))}
      <button className="self-start text-[10px] text-[var(--accent)] hover:underline"
        onClick={() => onChange({ ...g, filters: [...g.filters, { field: schema[0]?.field ?? '', op: 'eq', value: '' }] })}>
        + {t('cond.add')}
      </button>
    </div>
  )
}

function FilterRow({ f, schema, rows, onChange, onRemove, t }: {
  f: Filter; schema: Schema; rows: Rows; onChange: (f: Filter) => void; onRemove: () => void; t: T
}) {
  const values = useMemo(() => valueCounts(rows, f.field, 50), [rows, f.field])
  const listId = `vals-${f.field.replace(/\W/g, '_')}`
  const valueText = Array.isArray(f.value) ? f.value.join(', ') : f.value === undefined ? '' : String(f.value)
  const parse = (txt: string): Filter['value'] => {
    if (f.op === 'in' || f.op === 'notIn' || f.op === 'between') return txt.split(',').map((x) => x.trim()).filter(Boolean)
    return txt
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <select className={`${sel} max-w-[110px]`} value={f.field} onChange={(e) => onChange({ ...f, field: e.target.value })}>
        {schema.map((s) => <option key={s.field} value={s.field}>{s.field}</option>)}
      </select>
      <select className={sel} value={f.op} onChange={(e) => onChange({ ...f, op: e.target.value as FilterOp })}>
        {OPS.map((op) => <option key={op} value={op}>{t(`op.${op}`)}</option>)}
      </select>
      {!NO_VALUE_OPS.has(f.op) && (
        <>
          <input className={`${sel} flex-1 min-w-[70px]`} list={listId} value={valueText}
            placeholder={f.op === 'between' ? 'min, max' : f.op === 'in' || f.op === 'notIn' ? 'a, b, c' : ''}
            onChange={(e) => onChange({ ...f, value: parse(e.target.value) })} />
          <datalist id={listId}>{values.map((v) => <option key={v.value} value={v.value}>{v.count}</option>)}</datalist>
        </>
      )}
      <button className="w-5 text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]" onClick={onRemove} aria-label={t('cond.remove')}>✕</button>
    </div>
  )
}

/** Look of one group, per kind of geometry the layer actually contains. */
function LookEditor({ style, kinds, schema, onChange, t }: {
  style: GroupStyle; kinds: Kinds; schema: Schema; onChange: (s: GroupStyle) => void; t: T
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const assets = listAssets()
  const numeric = schema.filter((s) => s.type === 'number')
  const enc = (s: PointSymbol): string => (s.kind === 'primitive' ? `p:${s.shape}` : s.kind === 'icon' ? `i:${s.icon}` : `m:${s.assetId}`)
  const setSymbol = (v: string): void => {
    if (v === 'upload') { fileRef.current?.click(); return }
    const [k, rest] = [v[0], v.slice(2)]
    const symbol: PointSymbol = k === 'p' ? { kind: 'primitive', shape: rest as never } : k === 'i' ? { kind: 'icon', icon: rest as never } : { kind: 'model', assetId: rest }
    onChange({ ...style, point: { ...style.point, symbol } })
  }
  const row = 'flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]'
  return (
    <div className="flex flex-col gap-2">
      <input ref={fileRef} type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f) return
        try { const a = await addAssetFile(f); onChange({ ...style, point: { ...style.point, symbol: { kind: 'model', assetId: a.id } } }) }
        catch { toast(t('symbology.modelFailed'), 'error') }
      }} />
      {kinds.point > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[10px] font-medium text-[var(--text)]">{t('look.points')}</legend>
          {/* Icon grid: the fastest way to say "this is a train". */}
          <div className="grid grid-cols-10 gap-0.5">
            {ICON_IDS.map((id) => {
              const url = iconDataUrl(id, style.point.color)
              const active = style.point.symbol.kind === 'icon' && style.point.symbol.icon === id
              return (
                <button key={id} title={t(`symbology.icon.${id}`)} aria-label={t(`symbology.icon.${id}`)}
                  onClick={() => setSymbol(`i:${id}`)}
                  className={`aspect-square rounded-[5px] flex items-center justify-center ${active ? 'ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--surface-2)]'}`}>
                  {url ? <img src={url} alt="" className="w-full h-full" /> : <span className="text-[8px]">{id}</span>}
                </button>
              )
            })}
          </div>
          <label className={row}>
            <span className="w-14 shrink-0">{t('look.symbol')}</span>
            <select className={`${sel} flex-1`} value={enc(style.point.symbol)} onChange={(e) => setSymbol(e.target.value)}>
              <optgroup label={t('symbology.icons')}>{ICON_IDS.map((id) => <option key={id} value={`i:${id}`}>{t(`symbology.icon.${id}`)}</option>)}</optgroup>
              <optgroup label={t('symbology.shapes')}>{PRIMITIVES.map((p) => <option key={p} value={`p:${p}`}>{t(`symbology.shape.${p}`)}</option>)}</optgroup>
              <optgroup label={t('symbology.models')}>
                {assets.map((a) => <option key={a.id} value={`m:${a.id}`}>{a.name}</option>)}
                <option value="upload">{t('symbology.uploadModel')}</option>
              </optgroup>
            </select>
          </label>
          <label className={row}>
            <span className="w-14 shrink-0">{t('style.color')}</span>
            <input type="color" value={style.point.color} onChange={(e) => onChange({
              ...style, point: { ...style.point, color: e.target.value }, line: { ...style.line, color: e.target.value }, area: { ...style.area, color: e.target.value },
            })} className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0" />
            <span className="w-10 shrink-0 text-right">{t('look.size')}</span>
            <input type="range" min={1} max={14} step={0.5} value={style.point.size} className="flex-1 accent-[var(--accent)]"
              onChange={(e) => onChange({ ...style, point: { ...style.point, size: Number(e.target.value) } })} />
          </label>
          <label className={row}>
            <span className="w-14 shrink-0">{t('look.label')}</span>
            <select className={`${sel} flex-1`} value={style.point.labelField ?? ''} onChange={(e) => onChange({ ...style, point: { ...style.point, labelField: e.target.value || null } })}>
              <option value="">{t('look.noLabel')}</option>
              {schema.map((s) => <option key={s.field} value={s.field}>{s.field}</option>)}
            </select>
          </label>
        </fieldset>
      )}
      {kinds.line > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[10px] font-medium text-[var(--text)]">{t('look.lines')}</legend>
          <label className={row}>
            <span className="w-14 shrink-0">{t('style.color')}</span>
            <input type="color" value={style.line.color} onChange={(e) => onChange({ ...style, line: { ...style.line, color: e.target.value } })}
              className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0" />
            <span className="w-10 shrink-0 text-right">{t('look.width')}</span>
            <input type="range" min={0.5} max={30} step={0.5} value={style.line.widthM} className="flex-1 accent-[var(--accent)]"
              onChange={(e) => onChange({ ...style, line: { ...style.line, widthM: Number(e.target.value) } })} />
            <span className="w-9 text-right font-mono">{style.line.widthM} m</span>
          </label>
          <label className={row}>
            <span className="w-14 shrink-0">{t('look.opacity')}</span>
            <input type="range" min={0.1} max={1} step={0.05} value={style.line.opacity} className="flex-1 accent-[var(--accent)]"
              onChange={(e) => onChange({ ...style, line: { ...style.line, opacity: Number(e.target.value) } })} />
          </label>
          {/* Traffic-map controls: two-way streets side by side, moving chevrons. */}
          <label className={row} title={t('look.offsetHint')}>
            <span className="w-14 shrink-0">{t('look.offset')}</span>
            <input type="range" min={0} max={15} step={0.5} value={style.line.offsetM ?? 0} className="flex-1 accent-[var(--accent)]"
              onChange={(e) => onChange({ ...style, line: { ...style.line, offsetM: Number(e.target.value) } })} />
            <span className="w-9 text-right font-mono">{style.line.offsetM ?? 0} m</span>
          </label>
          <label className={row}>
            <input type="checkbox" checked={!!style.line.flow} onChange={(e) => onChange({ ...style, line: { ...style.line, flow: e.target.checked } })} />
            <span className="shrink-0">{t('look.flow')}</span>
            {style.line.flow && (
              <>
                <input type="range" min={0} max={30} step={0.5} value={style.line.flowSpeed ?? 8} className="flex-1 accent-[var(--accent)]"
                  title={t('look.flowSpeed')} aria-label={t('look.flowSpeed')}
                  onChange={(e) => onChange({ ...style, line: { ...style.line, flowSpeed: Number(e.target.value) } })} />
                <span className="w-9 text-right font-mono">{style.line.flowSpeed ?? 8}</span>
              </>
            )}
          </label>
        </fieldset>
      )}
      {kinds.polygon > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[10px] font-medium text-[var(--text)]">{t('look.areas')}</legend>
          <label className={row}>
            <span className="w-14 shrink-0">{t('style.color')}</span>
            <input type="color" value={style.area.color} onChange={(e) => onChange({ ...style, area: { ...style.area, color: e.target.value } })}
              className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0" />
            <span className="w-10 shrink-0 text-right">{t('look.fill')}</span>
            <input type="range" min={0} max={1} step={0.05} value={style.area.fillOpacity} className="flex-1 accent-[var(--accent)]"
              onChange={(e) => onChange({ ...style, area: { ...style.area, fillOpacity: Number(e.target.value) } })} />
          </label>
          <label className={row}>
            <input type="checkbox" checked={style.area.outline} onChange={(e) => onChange({ ...style, area: { ...style.area, outline: e.target.checked } })} />
            {t('look.outline')}
          </label>
          <label className={row}>
            <span className="w-14 shrink-0">{t('look.height')}</span>
            <select className={`${sel} flex-1`} value={style.area.heightField ?? ''} onChange={(e) => onChange({ ...style, area: { ...style.area, heightField: e.target.value || null } })}>
              <option value="">{t('look.fixedHeight')}</option>
              {numeric.map((s) => <option key={s.field} value={s.field}>{t('look.byField', { f: s.field })}</option>)}
            </select>
            {!style.area.heightField && (
              <input type="number" min={0} max={500} value={style.area.extrudeM} className={`${sel} w-14`}
                onChange={(e) => onChange({ ...style, area: { ...style.area, extrudeM: Math.max(0, Number(e.target.value)) } })} />
            )}
          </label>
        </fieldset>
      )}
    </div>
  )
}

// ── Zoom ───────────────────────────────────────────────────────────────────────

/** Log slider: 10 m … 50 km in a hand's width. */
const toSlider = (m: number): number => Math.log10(Math.max(10, m))
const fromSlider = (v: number): number => {
  const m = 10 ** v
  const mag = 10 ** Math.floor(Math.log10(m))
  return Math.round(m / (mag / 2)) * (mag / 2)
}
const fmtM = (m: number): string => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`)

function ZoomTab({ ls, set, t, hasPoints }: { ls: LayerStyle; set: (s: LayerStyle) => void; t: T; hasPoints: boolean }) {
  const z = ls.zoom
  const bands: Array<{ key: 'detailM' | 'iconM' | 'dotM'; label: string; color: string }> = [
    { key: 'detailM', label: t('zoom.detail'), color: '#5ce27a' },
    { key: 'iconM', label: t('zoom.icon'), color: '#2fb7ff' },
    { key: 'dotM', label: t('zoom.dot'), color: '#ffd23f' },
  ]
  const setBand = (key: 'detailM' | 'iconM' | 'dotM', m: number): void => {
    const next = { ...z, [key]: m }
    // Keep the bands ordered: detail ≤ icon ≤ dot.
    if (key === 'detailM') { next.iconM = Math.max(next.iconM, m); next.dotM = Math.max(next.dotM, next.iconM) }
    if (key === 'iconM') { next.detailM = Math.min(next.detailM, m); next.dotM = Math.max(next.dotM, m) }
    if (key === 'dotM') { next.iconM = Math.min(next.iconM, m); next.detailM = Math.min(next.detailM, next.iconM) }
    set({ ...ls, zoom: next })
  }
  if (!hasPoints) return <div className="text-[10px] text-[var(--text-faint)]">{t('zoom.onlyPoints')}</div>
  const span = toSlider(50_000) - toSlider(10)
  const pct = (m: number): number => ((toSlider(m) - toSlider(10)) / span) * 100
  return (
    <div className="flex flex-col gap-2" data-testid="zoom-tab">
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('zoom.hint')}</div>
      {/* The bands as a strip: what you see as the camera backs away. */}
      <div className="relative h-5 rounded-[4px] overflow-hidden flex text-[8px] font-semibold text-black/80">
        <div style={{ width: `${pct(z.detailM)}%`, background: '#5ce27a' }} className="flex items-center justify-center truncate">{t('zoom.detailShort')}</div>
        <div style={{ width: `${pct(z.iconM) - pct(z.detailM)}%`, background: '#2fb7ff' }} className="flex items-center justify-center truncate">{t('zoom.iconShort')}</div>
        <div style={{ width: `${pct(z.dotM) - pct(z.iconM)}%`, background: '#ffd23f' }} className="flex items-center justify-center truncate">{t('zoom.dotShort')}</div>
        <div className="flex-1 bg-[var(--surface-2)] text-[var(--text-faint)] flex items-center justify-center truncate">{t('zoom.hiddenShort')}</div>
      </div>
      {bands.map((b) => (
        <label key={b.key} className="flex flex-col gap-0.5">
          <span className="flex justify-between text-[10px] text-[var(--text-dim)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: b.color }} />{b.label}</span>
            <span className="font-mono">{fmtM(z[b.key])}</span>
          </span>
          <input type="range" min={toSlider(10)} max={toSlider(50_000)} step={0.01} value={toSlider(z[b.key])}
            className="w-full accent-[var(--accent)]" onChange={(e) => setBand(b.key, fromSlider(Number(e.target.value)))} />
        </label>
      ))}
      <div className="text-[10px] text-[var(--text-faint)]">{t('zoom.beyond', { d: fmtM(z.dotM) })}</div>
    </div>
  )
}

// ── Aggregate ──────────────────────────────────────────────────────────────────

function AggregateTab({ ls, set, schema, t, hasPoints }: { ls: LayerStyle; set: (s: LayerStyle) => void; schema: Schema; t: T; hasPoints: boolean }) {
  const a = ls.aggregate
  const setA = (patch: Partial<typeof a>): void => set({ ...ls, aggregate: { ...a, ...patch } })
  const numeric = schema.filter((s) => s.type === 'number')
  if (!hasPoints) return <div className="text-[10px] text-[var(--text-faint)]">{t('agg.onlyPoints')}</div>
  const gradient = `linear-gradient(90deg, ${[...a.ramp].sort((x, y) => x.at - y.at).map((s) => {
    const max = a.absolute ? Math.max(...a.ramp.map((r) => r.at), 1) : 1
    return `${s.color} ${(s.at / max) * 100}%`
  }).join(', ')})`
  const setStop = (i: number, patch: Partial<ColorStop>): void => setA({ ramp: a.ramp.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
  return (
    <div className="flex flex-col gap-2" data-testid="aggregate-tab">
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('agg.hint')}</div>
      <div className="flex gap-1">
        {(['none', 'heatmap', 'hexbin'] as const).map((k) => (
          <button key={k} onClick={() => setA({ kind: k, ramp: k === 'heatmap' && a.kind !== 'heatmap' ? RAMPS.heat : a.ramp })}
            className={`flex-1 px-1.5 py-1 rounded-[6px] text-[10px] border ${a.kind === k ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>
            {t(`agg.kind.${k}`)}
          </button>
        ))}
      </div>
      {a.kind !== 'none' && (
        <>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
            <span className="w-16 shrink-0">{t('agg.value')}</span>
            <select className={`${sel} flex-1`} value={a.field ?? ''} onChange={(e) => setA({ field: e.target.value || null, fn: e.target.value ? (a.fn === 'count' ? 'mean' : a.fn) : 'count' })}>
              <option value="">{t('agg.count')}</option>
              {numeric.map((s) => <option key={s.field} value={s.field}>{s.field}</option>)}
            </select>
            {a.field && (
              <select className={sel} value={a.fn} onChange={(e) => setA({ fn: e.target.value as typeof a.fn })}>
                {(['mean', 'sum', 'min', 'max'] as const).map((f) => <option key={f} value={f}>{t(`agg.fn.${f}`)}</option>)}
              </select>
            )}
          </label>
          <div className="flex flex-col gap-1">
            <div className="h-3 rounded-[3px]" style={{ background: gradient }} />
            <div className="flex gap-1 flex-wrap">
              {Object.keys(RAMPS).map((k) => (
                <button key={k} className={btn} onClick={() => setA({ ramp: RAMPS[k], absolute: false })}>{t(`agg.ramp.${k}`)}</button>
              ))}
            </div>
            {a.ramp.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
                <input type="color" value={s.color} onChange={(e) => setStop(i, { color: e.target.value })} className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0" />
                <input type="number" step="any" value={s.at} className={`${sel} w-20`} onChange={(e) => setStop(i, { at: Number(e.target.value) })} />
                <span className="flex-1">{a.absolute ? t('agg.atValue') : t('agg.atFraction')}</span>
              </div>
            ))}
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
              <input type="checkbox" checked={a.absolute} onChange={(e) => setA({ absolute: e.target.checked })} />
              {t('agg.absolute')}
            </label>
          </div>
          <label className="flex flex-col gap-0.5">
            <span className="flex justify-between text-[10px] text-[var(--text-dim)]"><span>{a.kind === 'hexbin' ? t('agg.cell') : t('agg.radius')}</span><span className="font-mono">{fmtM(a.cellM)}</span></span>
            <input type="range" min={toSlider(20)} max={toSlider(5000)} step={0.01} value={toSlider(a.cellM)} className="w-full accent-[var(--accent)]"
              onChange={(e) => setA({ cellM: fromSlider(Number(e.target.value)) })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="flex justify-between text-[10px] text-[var(--text-dim)]"><span>{t('agg.from')}</span><span className="font-mono">{fmtM(a.fromM)}</span></span>
            <input type="range" min={toSlider(10)} max={toSlider(50_000)} step={0.01} value={toSlider(a.fromM)} className="w-full accent-[var(--accent)]"
              onChange={(e) => setA({ fromM: fromSlider(Number(e.target.value)) })} />
          </label>
          {a.kind === 'hexbin' && (
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between text-[10px] text-[var(--text-dim)]"><span>{t('agg.extrude')}</span><span className="font-mono">{a.extrudeM} m</span></span>
              <input type="range" min={0} max={300} step={5} value={a.extrudeM} className="w-full accent-[var(--accent)]" onChange={(e) => setA({ extrudeM: Number(e.target.value) })} />
            </label>
          )}
          <label className="flex flex-col gap-0.5">
            <span className="flex justify-between text-[10px] text-[var(--text-dim)]"><span>{t('look.opacity')}</span><span className="font-mono">{a.opacity.toFixed(2)}</span></span>
            <input type="range" min={0.1} max={1} step={0.05} value={a.opacity} className="w-full accent-[var(--accent)]" onChange={(e) => setA({ opacity: Number(e.target.value) })} />
          </label>
          <div className="text-[10px] text-[var(--text-faint)]">{t('agg.legend', { d: fmtM(a.fromM) })}</div>
        </>
      )}
    </div>
  )
}

// ── Alerts ─────────────────────────────────────────────────────────────────────

function AlertsTab({ layer, rows, schema, t }: { layer: VectorLayer; rows: Rows; schema: Schema; t: T }) {
  const rules = layer.alerts ?? []
  const hits = useVectorLayerStore((s) => s.alertHits[layer.id])
  const save = (next: AlertRule[]): void => useVectorLayerStore.getState().setAlerts(layer.id, next)
  const setRule = (r: AlertRule): void => save(rules.map((x) => (x.id === r.id ? r : x)))
  const add = (from?: StyleGroup): void => save([...rules, {
    id: newAlertId(), name: from?.name ?? t('alerts.newName'), enabled: true, forMin: 0,
    match: from?.match ?? 'all',
    filters: from ? from.filters.map((f) => ({ ...f })) : [{ field: schema[0]?.field ?? '', op: 'eq', value: '' }],
  }])
  const groups = layer.layerStyle.groups.filter((g) => g.filters.length > 0)
  return (
    <div className="flex flex-col gap-1.5" data-testid="layer-alerts">
      <div className="text-[10px] text-[var(--text-faint)]">{t('alerts.hint')}</div>
      {!layer.live?.enabled && <div className="text-[10px] text-[var(--text-dim)]">{t('alerts.notLive')}</div>}
      {rules.map((r) => {
        const n = hits?.find((h) => h.ruleId === r.id)?.indices ?? []
        return (
          <div key={r.id} className="flex flex-col gap-1 p-1.5 rounded-[6px] border border-[var(--border)]">
            <div className="flex items-center gap-1">
              <input type="checkbox" checked={r.enabled} aria-label={t('alerts.enabled')}
                onChange={(e) => setRule({ ...r, enabled: e.target.checked })} />
              <input className={`${sel} flex-1`} value={r.name} aria-label={t('alerts.name')}
                onChange={(e) => setRule({ ...r, name: e.target.value })} />
              {n.length > 0 && (
                <button className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#ff3b30] text-white"
                  title={t('alerts.show')} onClick={() => { void focusVectorFeature(layer.id, n[0]) }}>
                  {n.length}
                </button>
              )}
              <button className="w-5 text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]" aria-label={t('alerts.remove')}
                onClick={() => save(rules.filter((x) => x.id !== r.id))}>✕</button>
            </div>
            <Conditions g={r} schema={schema} rows={rows} t={t} onChange={setRule} />
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
              {t('alerts.forMin')}
              <input type="number" min={0} max={1440} className={`${sel} w-14`} value={r.forMin}
                onChange={(e) => setRule({ ...r, forMin: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) })} />
              {t('alerts.minutes')}
            </label>
          </div>
        )
      })}
      {rules.length > 0 && <NotifyOptions t={t} />}
      <AlertLog layer={layer} t={t} />
      <div className="flex items-center gap-1 flex-wrap">
        <button className={btn} onClick={() => add()}>+ {t('alerts.add')}</button>
        {groups.length > 0 && (
          <select className={sel} value="" aria-label={t('alerts.fromGroup')}
            onChange={(e) => { const g = groups.find((x) => x.id === e.target.value); if (g) add(g) }}>
            <option value="">{t('alerts.fromGroup')}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

/** How alerts reach someone who is not looking: per device, off by default. */
function NotifyOptions({ t }: { t: T }) {
  const ns = useSyncExternalStore(onNotifySettings, getNotifySettings)
  const perm = systemPermission()
  return (
    <div className="flex flex-col gap-1 p-1.5 rounded-[6px] bg-[var(--surface-2)] text-[10px] text-[var(--text-dim)]">
      <span className="font-medium text-[var(--text)]">{t('alerts.notify.title')}</span>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={ns.system && perm === 'granted'} disabled={perm === 'denied' || perm === 'unsupported'}
          onChange={(e) => {
            if (!e.target.checked) setNotifySettings({ system: false })
            else void enableSystemNotifications().then((p) => {
              if (p === 'denied') toast(t('alerts.notify.denied'), 'warning')
            })
          }} />
        {t('alerts.notify.system')}
      </label>
      {perm === 'denied' && <span className="text-[var(--text-faint)]">{t('alerts.notify.denied')}</span>}
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={ns.sound} onChange={(e) => setNotifySettings({ sound: e.target.checked })} />
        {t('alerts.notify.sound')}
      </label>
      {(ns.system || ns.sound) && <span className="text-[var(--text-faint)]">{t('alerts.notify.background')}</span>}
    </div>
  )
}

/** What alerted on this layer and when: newest first, exportable. */
function AlertLog({ layer, t }: { layer: VectorLayer; t: T }) {
  const all = useSyncExternalStore(onAlertLog, getAlertLog)
  const series = seriesOf(layer.id)
  const mine = useMemo(() => all.filter((e) => entryOf(e, layer.id, series)), [all, layer.id, series])
  const [open, setOpen] = useState(false)
  if (mine.length === 0) return null
  const today = new Date().toDateString()
  const when = (at: number): string => {
    const d = new Date(at)
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toDateString() === today ? hm : `${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${hm}`
  }
  const exportCsv = (): void => {
    const url = URL.createObjectURL(new Blob([alertLogCsv(mine)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${layer.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'layer'}-alerts.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="flex flex-col gap-1" data-testid="alert-log">
      <button className="self-start text-[10px] text-[var(--accent)] hover:underline" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {t('alerts.log.title', { n: mine.length })}
      </button>
      {open && (
        <>
          <div className="flex flex-col max-h-[180px] overflow-y-auto rounded-[6px] border border-[var(--border)]">
            {[...mine].reverse().slice(0, 100).map((e, i) => (
              <div key={i} className="flex items-baseline gap-1.5 px-1.5 py-1 text-[10px] border-b border-[var(--border)] last:border-b-0">
                <span className="shrink-0 tabular-nums text-[var(--text-faint)]">{when(e.at)}</span>
                <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${e.kind === 'start' ? 'bg-[#ff3b30]' : 'bg-[#5ce27a]'}`} />
                <span className="min-w-0 text-[var(--text)]">
                  {e.kind === 'start' ? t('alerts.log.start', { rule: e.rule, n: e.n }) : t('alerts.log.clear', { rule: e.rule })}
                  {e.sample.length > 0 && <span className="text-[var(--text-dim)]"> · {e.sample.join(', ')}{e.n > e.sample.length ? '…' : ''}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <button className={btn} onClick={exportCsv}>{t('alerts.log.export')}</button>
            <button className={btn} onClick={() => clearAlertLog(layer.id, series)}>{t('alerts.log.clearAll')}</button>
          </div>
        </>
      )}
    </div>
  )
}
