// ─── EirProfileEditor ─────────────────────────────────────────────────────────
// Create/edit EIR validation profiles (add / edit / delete / duplicate / change
// severity / import / export / save). Profiles compile to an IdsDocument and run
// on the EXISTING IDS engine — "Use & run" feeds the docked IdsPanel, which owns
// results rendering, 3D highlight (red/amber/green) and JSON/CSV/HTML/BCF export.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { useEirStore } from '../../stores/eirStore'
import { useIdsStore } from '../../stores/idsStore'
import { useUIStore } from '../../stores/uiStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useIdsRun } from '../../hooks/useIdsRun'
import { modelRegistry } from '../../lib/model-registry'
import { toast } from '../../stores/toastStore'
import {
  compileEirToIds, parseEirProfile, serializeEirProfile, eirProfileSchema,
  emptyEirProfile, isBuiltinProfile, slug, idsToEir, modelClassCounts, applicabilityCount,
} from '../../lib/eir'
import { parseIds } from '../../lib/ids/ids-parser'
import type { EirProfile, EirRule, EirRuleType, EirSeverity, NumericOperator } from '../../lib/eir'

interface Props { onClose: () => void }

const RULE_TYPES: EirRuleType[] = [
  'entityExists', 'requiredProperty', 'requiredPropertySet', 'propertyNotEmpty',
  'propertyEquals', 'numeric', 'allowedValues', 'regex', 'classification',
]

const SEVERITIES: EirSeverity[] = ['error', 'warning', 'info', 'ignored']
const SEV_COLOR: Record<EirSeverity, string> = {
  error: 'var(--danger)', warning: '#F5A623', info: 'var(--accent)', ignored: 'var(--text-faint)',
}
const OPERATORS: NumericOperator[] = ['>', '>=', '<', '<=', '=']

// Static authoring vocabulary for autocomplete (common IFC classes / standard
// psets / frequent properties). A starting point — users can type anything.
const ENTITY_SUGGESTIONS = [
  'IfcWall', 'IfcSlab', 'IfcColumn', 'IfcBeam', 'IfcDoor', 'IfcWindow', 'IfcRoof',
  'IfcStair', 'IfcRailing', 'IfcCovering', 'IfcCurtainWall', 'IfcSpace', 'IfcZone',
  'IfcBuildingStorey', 'IfcBuilding', 'IfcSite', 'IfcFurniture', 'IfcSanitaryTerminal',
  'IfcPipeSegment', 'IfcDuctSegment', 'IfcFlowTerminal', 'IfcBuildingElementProxy',
]
const PSET_SUGGESTIONS = [
  'Pset_WallCommon', 'Pset_SlabCommon', 'Pset_ColumnCommon', 'Pset_BeamCommon',
  'Pset_DoorCommon', 'Pset_WindowCommon', 'Pset_RoofCommon', 'Pset_CoveringCommon',
  'Pset_SpaceCommon', 'Pset_ZoneCommon', 'Pset_BuildingCommon', 'Pset_BuildingStoreyCommon',
  'Pset_ManufacturerTypeInformation', 'Pset_ManufacturerOccurrence', 'Pset_Warranty',
]
const PROP_SUGGESTIONS = [
  'FireRating', 'LoadBearing', 'IsExternal', 'ThermalTransmittance', 'AcousticRating',
  'Combustible', 'Reference', 'Status', 'Manufacturer', 'ModelLabel', 'SerialNumber',
  'InstallationDate', 'WarrantyStartDate', 'NetFloorArea', 'GrossFloorArea',
]

let _idSeq = 0
const newRuleId = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? `rule-${crypto.randomUUID()}` : `rule-${Date.now()}-${_idSeq++}`

/** Defaults when a rule's type changes, preserving the shared base fields. */
function defaultsForType(type: EirRuleType, base: Pick<EirRule, 'id' | 'entity' | 'severity' | 'message' | 'predefinedType'>): EirRule {
  const b = { id: base.id, entity: base.entity, severity: base.severity, message: base.message, predefinedType: base.predefinedType }
  switch (type) {
    case 'entityExists':        return { ...b, type }
    case 'requiredProperty':    return { ...b, type, property: '' }
    case 'requiredPropertySet': return { ...b, type, pset: '' }
    case 'propertyNotEmpty':    return { ...b, type, property: '' }
    case 'propertyEquals':      return { ...b, type, property: '', value: '' }
    case 'numeric':             return { ...b, type, property: '', operator: '>', value: 0 }
    case 'allowedValues':       return { ...b, type, property: '', values: [] }
    case 'regex':               return { ...b, type, property: '', pattern: '' }
    case 'classification':      return { ...b, type }
  }
}

const inputCls = 'h-7 px-2 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)]'

export default function EirProfileEditor({ onClose }: Props) {
  const { t } = useTranslation('eir')
  const { profiles, load, save, remove } = useEirStore()
  const [draft, setDraft] = useState<EirProfile | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const activeModelId = useSceneStore((s) => s.activeModelId ?? s.models[0]?.id ?? null)
  const sceneModels = useSceneStore((s) => s.models)
  const hasBuffer = activeModelId ? !!modelRegistry.getBuffer(activeModelId) : false
  // Live "this rule matches N elements" data, derived from the loaded model(s).
  const classCounts = useMemo(() => modelClassCounts(sceneModels), [sceneModels])
  const { run } = useIdsRun()

  useEffect(() => { void load() }, [load])
  // Select the first profile once the list loads.
  useEffect(() => {
    if (!draft && profiles.length > 0) setDraft(structuredClone(profiles[0]))
  }, [profiles, draft])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const draftIsBuiltin = draft ? isBuiltinProfile(draft.id) : false

  const updateRule = (id: string, patch: Partial<EirRule>): void => {
    if (!draft) return
    setDraft({ ...draft, rules: draft.rules.map((r) => (r.id === id ? { ...r, ...patch } as EirRule : r)) })
  }
  const changeRuleType = (id: string, type: EirRuleType): void => {
    if (!draft) return
    setDraft({ ...draft, rules: draft.rules.map((r) => (r.id === id ? defaultsForType(type, r) : r)) })
  }
  const addRule = (): void => {
    if (!draft) return
    setDraft({ ...draft, rules: [...draft.rules, { id: newRuleId(), type: 'requiredProperty', entity: 'IfcWall', property: '', severity: 'error' }] })
  }
  const deleteRule = (id: string): void => {
    if (!draft) return
    setDraft({ ...draft, rules: draft.rules.filter((r) => r.id !== id) })
  }

  const newProfile = (): void => setDraft({ ...emptyEirProfile(), id: '' })
  const duplicate = (): void => {
    if (!draft) return
    setDraft({ ...structuredClone(draft), id: '', name: `${draft.name} (copy)` })
  }

  const persist = async (): Promise<EirProfile | null> => {
    if (!draft) return null
    // Forking a built-in (or a never-saved draft) → derive a fresh user id.
    const id = (!draft.id || draftIsBuiltin) ? `${slug(draft.name)}-${Date.now().toString(36)}` : draft.id
    const candidate: EirProfile = { ...draft, id, version: draft.version + (draft.id ? 1 : 0) }
    const parsed = eirProfileSchema.safeParse(candidate)
    if (!parsed.success) {
      toast(t('toasts.invalidProfile', { detail: parsed.error.issues[0]?.message ?? 'check rule fields' }), 'error')
      return null
    }
    await save(parsed.data as EirProfile)
    setDraft(parsed.data as EirProfile)
    return parsed.data as EirProfile
  }

  const onSave = async (): Promise<void> => {
    const saved = await persist()
    if (saved) toast(t('toasts.saved'), 'success')
  }

  const onDelete = async (): Promise<void> => {
    if (!draft || !draft.id || draftIsBuiltin) return
    await remove(draft.id)
    setDraft(null)
  }

  const onExport = (): void => {
    if (!draft) return
    const blob = new Blob([serializeEirProfile(draft)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(draft.name)}.eir.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = async (file: File): Promise<void> => {
    try {
      const text = await file.text()
      // A buildingSMART .ids (XML) is converted to an editable EIR profile;
      // otherwise treat the file as an EIR profile JSON.
      const isIds = /\.ids$/i.test(file.name) || /^\s*<\?xml|<ids\b/i.test(text)
      let profile: EirProfile
      let warnings: string[] = []
      if (isIds) {
        const imported = idsToEir(parseIds(text), file.name.replace(/\.ids$/i, ''))
        profile = imported.profile
        warnings = imported.warnings
      } else {
        profile = parseEirProfile(text)
      }
      // Imported profiles always become user copies.
      const saved: EirProfile = { ...profile, id: `${slug(profile.name)}-${Date.now().toString(36)}` }
      await save(saved)
      setDraft(saved)
      if (warnings.length) toast(t('toasts.importedWithWarnings', { count: warnings.length }), 'warning')
      else toast(t('toasts.imported'), 'success')
    } catch (err) {
      toast(t('toasts.importFailed', { detail: err instanceof Error ? err.message : String(err) }), 'error')
    }
  }

  const useAndRun = async (): Promise<void> => {
    const profile = (await persist()) ?? draft
    if (!profile) return
    if (profile.rules.length === 0) { toast(t('toasts.addRuleFirst'), 'warning'); return }
    if (!hasBuffer) { toast(t('toasts.loadModelFirst'), 'warning'); return }
    const doc = compileEirToIds(profile)
    if (doc.specifications.length === 0) { toast(t('toasts.allIgnored'), 'warning'); return }
    useIdsStore.getState().setLoaded(profile.name, doc)
    useUIStore.getState().setValidationPanelOpen(false)
    useIdsStore.getState().setPanelOpen(true)
    onClose()
    await run()
  }

  const ruleCount = draft?.rules.length ?? 0
  const compiledCount = useMemo(() => (draft ? compileEirToIds(draft).specifications.length : 0), [draft])

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[72] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -8 }}
          transition={{ duration: 0.18 }}
          className="relative z-[73] w-[840px] max-w-[calc(100vw-2rem)] rounded-2xl bg-[rgba(12,12,16,0.97)] backdrop-blur-[20px] border border-[var(--border-strong)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
          style={{ maxHeight: 'calc(100dvh - 4rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Icons.Shield size={15} className="text-[var(--accent)]" />
              <span className="text-[13px] font-semibold text-[var(--text)]">{t('title')}</span>
            </div>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Close">
              <Icons.X size={11} />
            </button>
          </div>

          {/* Autocomplete vocabularies (shared by all rule inputs) */}
          <datalist id="eir-entities">{ENTITY_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          <datalist id="eir-psets">{PSET_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          <datalist id="eir-props">{PROP_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>

          <div className="flex flex-1 min-h-0">
            {/* ── Sidebar: profile list ─────────────────────────────────── */}
            <div className="w-[200px] shrink-0 border-r border-[var(--border)] flex flex-col">
              <div className="flex items-center gap-1 p-2 border-b border-[var(--border)]">
                <button onClick={newProfile} className="flex-1 h-7 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)]">+ {t('sidebar.new')}</button>
                <button onClick={() => fileRef.current?.click()} title={t('sidebar.import')} className="w-7 h-7 grid place-items-center rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]">
                  <Icons.Upload size={13} />
                </button>
                <input ref={fileRef} type="file" accept=".json,application/json,.ids,.xml,application/xml,text/xml" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = '' }} />
              </div>
              <div className="overflow-y-auto flex-1 p-1.5 flex flex-col gap-0.5">
                {profiles.map((p) => {
                  const active = draft?.id === p.id || (draft && !draft.id && false)
                  return (
                    <button
                      key={p.id}
                      onClick={() => setDraft(structuredClone(p))}
                      className={`text-left px-2 py-1.5 rounded-md text-[11.5px] flex items-center gap-1.5 ${active ? 'bg-[var(--accent)]/15 text-[var(--text)]' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]'}`}
                    >
                      <span className="truncate flex-1">{p.name}</span>
                      {isBuiltinProfile(p.id) && <Icons.Lock size={10} className="text-[var(--text-faint)] shrink-0" />}
                    </button>
                  )
                })}
                {profiles.length === 0 && <span className="px-2 py-3 text-[11px] text-[var(--text-faint)] text-center">{t('sidebar.empty')}</span>}
              </div>
            </div>

            {/* ── Editor ────────────────────────────────────────────────── */}
            <div className="flex-1 min-w-0 flex flex-col">
              {!draft ? (
                <div className="flex-1 grid place-items-center text-[12px] text-[var(--text-faint)]">{t('selectOrCreate')}</div>
              ) : (
                <>
                  <div className="p-3 border-b border-[var(--border)] flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        placeholder={t('namePlaceholder')}
                        className={`${inputCls} flex-1 h-8 text-[12px] font-medium`}
                      />
                      {draftIsBuiltin && <span className="text-[10px] text-[var(--text-faint)] flex items-center gap-1"><Icons.Lock size={10} /> {t('builtinBadge')}</span>}
                    </div>
                    <input
                      value={draft.description ?? ''}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      placeholder={t('descPlaceholder')}
                      className={`${inputCls} w-full`}
                    />
                  </div>

                  {/* Rules */}
                  <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-2">
                    {draft.rules.map((rule) => (
                      <RuleCard key={rule.id} rule={rule} classCounts={classCounts} onChange={updateRule} onType={changeRuleType} onDelete={deleteRule} />
                    ))}
                    <button onClick={addRule} className="h-8 rounded-md border border-dashed border-[var(--border)] text-[11.5px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)]">
                      + {t('addRule')}
                    </button>
                  </div>

                  {/* Footer actions */}
                  <div className="p-3 border-t border-[var(--border)] flex items-center gap-2">
                    <span className="text-[10.5px] text-[var(--text-faint)]">{t('footer', { rules: ruleCount, active: compiledCount })}</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <button onClick={duplicate} title={t('actions.duplicate')} className="w-8 h-8 grid place-items-center rounded-md border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]"><Icons.Copy size={13} /></button>
                      <button onClick={onExport} title={t('actions.export')} className="w-8 h-8 grid place-items-center rounded-md border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]"><Icons.Download size={13} /></button>
                      {!draftIsBuiltin && draft.id && (
                        <button onClick={() => void onDelete()} title={t('actions.delete')} className="w-8 h-8 grid place-items-center rounded-md border border-[var(--border)] text-[var(--danger)] hover:brightness-125"><Icons.X size={13} /></button>
                      )}
                      <button onClick={() => void onSave()} className="h-8 px-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[11.5px] text-[var(--text)] hover:brightness-110 flex items-center gap-1.5"><Icons.Check size={13} /> {t('actions.save')}</button>
                      <button onClick={() => void useAndRun()} disabled={!hasBuffer} title={hasBuffer ? '' : t('toasts.loadModelFirst')} className="h-8 px-3 rounded-md bg-[var(--accent)] text-white text-[11.5px] font-medium disabled:opacity-40 hover:brightness-110">{t('actions.useAndRun')}</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}

// ─── Rule card ──────────────────────────────────────────────────────────────

interface RuleCardProps {
  rule: EirRule
  classCounts: Map<string, number>
  onChange: (id: string, patch: Partial<EirRule>) => void
  onType: (id: string, type: EirRuleType) => void
  onDelete: (id: string) => void
}

function RuleCard({ rule, classCounts, onChange, onType, onDelete }: RuleCardProps) {
  const { t } = useTranslation('eir')
  const set = (patch: Partial<EirRule>): void => onChange(rule.id, patch)
  // Applicability hint (only when a model is loaded). predefinedType narrows
  // further than we can count here, so present it as an upper bound.
  const applies = classCounts.size > 0 ? applicabilityCount(classCounts, rule.entity) : null
  const appliesLabel = applies == null ? null
    : rule.predefinedType ? t('applies.upper', { count: applies })
    : applies > 0 ? t('applies.match', { count: applies })
    : t('applies.none')
  const appliesColor = applies && applies > 0 ? 'var(--text-faint)' : '#F5A623'
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <select value={rule.type} onChange={(e) => onType(rule.id, e.target.value as EirRuleType)} className={`${inputCls} w-[150px]`}>
          {RULE_TYPES.map((rt) => <option key={rt} value={rt}>{t(`ruleTypes.${rt}`)}</option>)}
        </select>
        <input value={rule.entity} list="eir-entities" onChange={(e) => set({ entity: e.target.value })} placeholder="IfcEntity" className={`${inputCls} w-[120px]`} />
        <select
          value={rule.severity}
          onChange={(e) => set({ severity: e.target.value as EirSeverity })}
          className={`${inputCls} w-[110px]`}
          style={{ color: SEV_COLOR[rule.severity] }}
        >
          {SEVERITIES.map((s) => <option key={s} value={s} style={{ color: 'var(--text)' }}>{t(`severity.${s}`)}</option>)}
        </select>
        {appliesLabel && (
          <span className="ml-auto text-[10px] font-mono tabular-nums shrink-0" style={{ color: appliesColor }} title={appliesLabel}>{appliesLabel}</span>
        )}
        <button onClick={() => onDelete(rule.id)} className={`${appliesLabel ? '' : 'ml-auto '}w-7 h-7 grid place-items-center rounded-md text-[var(--text-faint)] hover:text-[var(--danger)]`}><Icons.X size={12} /></button>
      </div>
      <RuleFields rule={rule} set={set} />
    </div>
  )
}

function RuleFields({ rule, set }: { rule: EirRule; set: (patch: Partial<EirRule>) => void }) {
  const { t } = useTranslation('eir')
  // Narrow per-type. Each branch reads only fields valid for that type.
  switch (rule.type) {
    case 'entityExists':
      return <Row><Field label={t('fields.predefinedType')} value={rule.predefinedType ?? ''} onChange={(v) => set({ predefinedType: v || undefined })} placeholder="(optional)" /></Row>
    case 'requiredProperty':
    case 'propertyNotEmpty':
      return <Row><PsetField rule={rule} set={set} /><Field label={t('fields.property')} list="eir-props" value={rule.property} onChange={(v) => set({ property: v })} placeholder="FireRating" /></Row>
    case 'requiredPropertySet':
      return <Row><Field label={t('fields.propertySet')} list="eir-psets" value={rule.pset} onChange={(v) => set({ pset: v })} placeholder="Pset_WallCommon" /></Row>
    case 'propertyEquals':
      return <Row><PsetField rule={rule} set={set} /><Field label={t('fields.property')} list="eir-props" value={rule.property} onChange={(v) => set({ property: v })} placeholder="Status" /><Field label={t('fields.equals')} value={rule.value} onChange={(v) => set({ value: v })} placeholder="New" /></Row>
    case 'numeric':
      return (
        <Row>
          <PsetField rule={rule} set={set} />
          <Field label={t('fields.property')} list="eir-props" value={rule.property} onChange={(v) => set({ property: v })} placeholder="Area" />
          <label className="flex flex-col gap-0.5">
            <span className="text-[9.5px] text-[var(--text-faint)] uppercase tracking-wide">{t('fields.op')}</span>
            <select value={rule.operator} onChange={(e) => set({ operator: e.target.value as NumericOperator })} className={`${inputCls} w-[60px]`}>
              {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9.5px] text-[var(--text-faint)] uppercase tracking-wide">{t('fields.value')}</span>
            <input type="number" value={rule.value} onChange={(e) => set({ value: Number(e.target.value) })} className={`${inputCls} w-[90px]`} />
          </label>
        </Row>
      )
    case 'allowedValues':
      return <Row><PsetField rule={rule} set={set} /><Field label={t('fields.property')} list="eir-props" value={rule.property} onChange={(v) => set({ property: v })} placeholder="FireRating" /><Field label={t('fields.allowed')} wide value={rule.values.join(', ')} onChange={(v) => set({ values: v.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="EI30, EI60, EI90" /></Row>
    case 'regex':
      return (
        <Row>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9.5px] text-[var(--text-faint)] uppercase tracking-wide">{t('fields.target')}</span>
            <select value={rule.target ?? 'property'} onChange={(e) => set({ target: e.target.value as 'property' | 'attribute' })} className={`${inputCls} w-[90px]`}>
              <option value="property">property</option>
              <option value="attribute">attribute</option>
            </select>
          </label>
          {(rule.target ?? 'property') === 'property' && <PsetField rule={rule} set={set} />}
          <Field label={(rule.target ?? 'property') === 'attribute' ? t('fields.attribute') : t('fields.property')} list="eir-props" value={rule.property} onChange={(v) => set({ property: v })} placeholder="Reference" />
          <Field label={t('fields.pattern')} wide value={rule.pattern} onChange={(v) => set({ pattern: v })} placeholder="^[A-Z]{2}-[0-9]+$" />
        </Row>
      )
    case 'classification':
      return <Row><Field label={t('fields.system')} value={rule.system ?? ''} onChange={(v) => set({ system: v || undefined })} placeholder="Uniclass (optional)" /><Field label={t('fields.classValue')} value={rule.value ?? ''} onChange={(v) => set({ value: v || undefined })} placeholder="(optional)" /></Row>
  }
}

const Row = ({ children }: { children: ReactNode }) => <div className="flex items-end gap-1.5 flex-wrap">{children}</div>

function PsetField({ rule, set }: { rule: { pset?: string }; set: (patch: Partial<EirRule>) => void }) {
  const { t } = useTranslation('eir')
  return <Field label={t('fields.propertySet')} list="eir-psets" value={rule.pset ?? ''} onChange={(v) => set({ pset: v || undefined } as Partial<EirRule>)} placeholder="(any)" />
}

function Field({ label, value, onChange, placeholder, wide, list }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; wide?: boolean; list?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9.5px] text-[var(--text-faint)] uppercase tracking-wide">{label}</span>
      <input value={value} list={list} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} ${wide ? 'w-[220px]' : 'w-[130px]'}`} />
    </label>
  )
}
