// Gallery + block editor for project mail. The coordinator picks a template
// by audience, reorders, hides and rewrites its blocks, inserts a viewer
// capture or a validation report in one click, and sees the real HTML on
// desktop, phone and dark. Sending stays with the approval queue; plans that
// can't send see everything but the send button. No new popups.

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Image as ImageIcon, ShieldCheck } from 'lucide-react'
import { Field, Panel, Primary, Quiet, SectionLabel, inputClass } from '../../../ui'
import { renderIssue, type Audience, type EBlock, type Issue, type Publication } from './render'
import { AUDIENCES, SAMPLE_FACTS, TEMPLATES_V3, nameOf, purposeOf, samplePublication, type Facts, type TemplateDef } from './templates'
import { labels } from './labels'
import { PAIRINGS, isHex, type Pairing } from './tokens'

// UI words: Spanish and English written by hand; other languages read English for now.
const UI = {
  es: { all: 'Todas', for: 'Para', gallery: 'Plantillas', edit: 'Editar', back: 'Volver a la galería', blocks: 'Bloques', up: 'Subir', down: 'Bajar', hide: 'Ocultar', show: 'Mostrar', capture: 'Insertar captura del visor', report: 'Insertar informe de validación', brand: 'Marca y publicación', pubName: 'Nombre de la publicación', accent: 'Color de acento', type: 'Tipografía', lang: 'Idioma del correo', subject: 'Asunto', preheader: 'Preheader', text: 'Texto plano', html: 'Correo', queue: 'Enviar a aprobación', locked: 'Tu plan ve y prepara las plantillas; el envío está en {{plan}}.', headline: 'Titular', lede: 'Entradilla', note: 'Texto', label: 'Botón', title: 'Título de sección', weight: '{{kb}} KB · límite de Gmail 102 KB', liveData: 'Cifras del proyecto', sampleData: 'Cifras de ejemplo', captureCaption: 'Vista del visor · {{p}}', reportTitle: 'Informe de validación' },
  en: { all: 'All', for: 'For', gallery: 'Templates', edit: 'Edit', back: 'Back to the gallery', blocks: 'Blocks', up: 'Move up', down: 'Move down', hide: 'Hide', show: 'Show', capture: 'Insert a viewer capture', report: 'Insert a validation report', brand: 'Brand and publication', pubName: 'Publication name', accent: 'Accent colour', type: 'Typography', lang: 'Mail language', subject: 'Subject', preheader: 'Preheader', text: 'Plain text', html: 'Mail', queue: 'Send for approval', locked: 'Your plan sees and prepares templates; sending is in {{plan}}.', headline: 'Headline', lede: 'Standfirst', note: 'Text', label: 'Button', title: 'Section title', weight: '{{kb}} KB · Gmail limit 102 KB', liveData: 'Project figures', sampleData: 'Sample figures', captureCaption: 'Viewer capture · {{p}}', reportTitle: 'Validation report' },
}
type UiKey = keyof typeof UI.en
const ui = (lang: string) => (k: UiKey, v?: Record<string, string>) => (UI[lang.startsWith('es') ? 'es' : 'en'][k]).replace(/\{\{(\w+)\}\}/g, (_, x) => v?.[x] ?? '')

const BLOCK_NAMES: Record<EBlock['k'], { es: string; en: string }> = {
  editor: { es: 'Nota del editor', en: 'Editor’s note' }, kpis: { es: 'Cifras', en: 'Figures' }, stamp: { es: 'Sello Health Score', en: 'Health Score stamp' },
  clashes: { es: 'Colisiones por disciplina', en: 'Clashes by discipline' }, bcf: { es: 'Incidencias BCF', en: 'BCF issues' }, changes: { es: 'Cambios entre versiones', en: 'Changes between versions' },
  milestones: { es: 'Hitos', en: 'Milestones' }, capture: { es: 'Captura del modelo', en: 'Model capture' }, actions: { es: 'Qué te toca', en: 'What is yours' },
  note: { es: 'Nota o cita', en: 'Note or quote' }, decision: { es: 'Decisión pendiente', en: 'Pending decision' }, requirements: { es: 'Requisitos que fallan', en: 'Failing requirements' },
  list: { es: 'Lista', en: 'List' }, cta: { es: 'Botón', en: 'Button' },
}

export interface StudioProps {
  /** Workspace language (UI). */
  lang: string
  /** Real figures when the workspace has them. */
  facts?: Facts
  /** Whether this plan can send; it still sees and edits everything. */
  canSend: boolean
  sendPlanName: string
  onQueue?: (r: { subject: string; html: string; text: string; templateId: string }) => void
  /** The section's own preview frame (device + theme switch). */
  Preview: (p: { html: (theme: 'light' | 'dark') => string }) => JSX.Element
}

const origin = () => (typeof location !== 'undefined' ? location.origin : 'https://www.ifcvieweronline.eu')

export default function Studio({ lang, facts, canSend, sendPlanName, onQueue, Preview }: StudioProps) {
  const t = ui(lang)
  const L = labels(lang)
  const [aud, setAud] = useState<Audience | 'all'>('all')
  const [mailLang, setMailLang] = useState(lang.startsWith('es') ? 'es' : 'en')
  const [pub, setPub] = useState<Publication>(() => samplePublication(mailLang))
  const [sel, setSel] = useState<string | null>(null)
  const [issue, setIssue] = useState<Issue | null>(null)
  const [view, setView] = useState<'html' | 'text'>('html')
  const base = origin()
  const f = facts ?? SAMPLE_FACTS

  const open = (d: TemplateDef, l = mailLang) => { setSel(d.id); setIssue(d.build({ lang: l, pub: { ...pub, ...samplePublication(l), name: pub.name, accent: pub.accent, pairing: pub.pairing }, facts: f, base })) }
  const thumbs = useMemo(() => Object.fromEntries(TEMPLATES_V3.map((d) => [d.id, renderIssue(d.build({ lang: mailLang, pub, facts: f, base }), pub, { lang: mailLang, scheme: 'light', unsubscribeUrl: '#' }).html])), [mailLang, pub, f, base])

  if (!issue || !sel) {
    const list = TEMPLATES_V3.filter((d) => aud === 'all' || d.audience === aud)
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label={t('for')}>
          {(['all', ...AUDIENCES] as const).map((a) => (
            <button key={a} aria-pressed={aud === a} onClick={() => setAud(a)} className={`h-[30px] px-3 rounded-full border text-[12.5px] ${aud === a ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-faint)]'}`}>{a === 'all' ? t('all') : L[a]}</button>
          ))}
          <span className="flex-1" />
          <label className="text-[12px] text-[var(--text-faint)] flex items-center gap-2">{t('lang')}
            <select className={`${inputClass} w-auto`} value={mailLang} onChange={(e) => { setMailLang(e.target.value); setPub((p) => ({ ...samplePublication(e.target.value), name: p.name, accent: p.accent, pairing: p.pairing })) }}>
              <option value="es">Español</option><option value="en">English</option>
            </select></label>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => (
            <li key={d.id}>
              <button onClick={() => open(d)} className="w-full text-left rounded-[10px] border border-[var(--border)] hover:border-[var(--accent)] overflow-hidden bg-[var(--surface)]">
                <div className="overflow-hidden relative" style={{ height: 220, background: '#ecebe6' }} aria-hidden>
                  <iframe title="" tabIndex={-1} srcDoc={thumbs[d.id]} sandbox="" className="border-0 origin-top-left pointer-events-none absolute left-1/2" style={{ width: 680, height: 900, transform: 'translateX(-50%) scale(0.5)', transformOrigin: 'top center' }} />
                </div>
                <div className="p-3 border-t border-[var(--border)]">
                  <p className="text-[11px] uppercase tracking-[.08em] text-[var(--text-faint)]">{t('for')}: {L[d.audience]}</p>
                  <p className="mt-1 text-[13.5px] font-medium">{nameOf(d, lang)}</p>
                  <p className="mt-0.5 text-[12.5px] text-[var(--text-dim)] [overflow-wrap:anywhere]">{purposeOf(d, lang)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const def = TEMPLATES_V3.find((d) => d.id === sel)!
  const setBlock = (id: string, patch: Partial<EBlock>) => setIssue({ ...issue, blocks: issue.blocks.map((b) => (b.id === id ? { ...b, ...patch } as EBlock : b)) })
  const move = (i: number, dir: -1 | 1) => { const a = [...issue.blocks]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setIssue({ ...issue, blocks: a }) }
  const insertAt = (b: EBlock) => { const a = [...issue.blocks]; const cta = a.findIndex((x) => x.k === 'cta'); a.splice(cta < 0 ? a.length : cta, 0, b); setIssue({ ...issue, blocks: a }) }
  const render = (scheme: 'auto' | 'light' | 'dark') => renderIssue(issue, pub, { lang: mailLang, scheme, unsubscribeUrl: `${base}/u/preview` })
  const out = render('auto')
  const kb = (new TextEncoder().encode(out.html).length / 1024).toFixed(1)
  const bn = (k: EBlock['k']) => (lang.startsWith('es') ? BLOCK_NAMES[k].es : BLOCK_NAMES[k].en)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Quiet onClick={() => { setIssue(null); setSel(null) }}>← {t('back')}</Quiet>
          <span className="text-[13px] font-medium">{nameOf(def, lang)}</span>
          <span className="text-[12px] text-[var(--text-faint)]">· {t('for')}: {L[def.audience]} · {facts ? t('liveData') : t('sampleData')}</span>
        </div>
        <Panel className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field className="sm:col-span-2" label={t('subject')}><input className={inputClass} value={issue.subject} onChange={(e) => setIssue({ ...issue, subject: e.target.value })} /></Field>
            <Field className="sm:col-span-2" label={t('preheader')}><input className={inputClass} value={issue.preheader} onChange={(e) => setIssue({ ...issue, preheader: e.target.value })} /></Field>
          </div>
          <SectionLabel>{t('blocks')}</SectionLabel>
          <ol className="flex flex-col gap-2">
            {issue.blocks.map((b, i) => (
              <li key={b.id} className={`rounded-[8px] border border-[var(--border)] p-2.5 ${b.hidden ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-medium flex-1 [overflow-wrap:anywhere]">{bn(b.k)}{b.title ? <span className="text-[var(--text-faint)] font-normal"> · {b.title}</span> : null}</span>
                  <button aria-label={t('up')} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button aria-label={t('down')} disabled={i === issue.blocks.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button aria-label={b.hidden ? t('show') : t('hide')} aria-pressed={!!b.hidden} onClick={() => setBlock(b.id, { hidden: !b.hidden })} className="p-1">{b.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
                {!b.hidden && <BlockFields b={b} t={t} set={(p) => setBlock(b.id, p)} />}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2 mt-3">
            <Quiet onClick={() => insertAt({ id: `c${Date.now()}`, k: 'capture', src: `${base}/images/mail/sample-capture.jpg`, w: 1280, h: 600, caption: t('captureCaption', { p: pub.rev }), href: `${base}/` })}><ImageIcon size={13} aria-hidden /> {t('capture')}</Quiet>
            <Quiet onClick={() => insertAt({ id: `r${Date.now()}`, k: 'stamp', title: t('reportTitle'), score: f.health, prev: f.healthPrev, against: f.ids, reqs: f.reqs, pass: `${f.passPct} %` })}><ShieldCheck size={13} aria-hidden /> {t('report')}</Quiet>
          </div>
          <SectionLabel>{t('brand')}</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('pubName')}><input className={inputClass} value={pub.name} onChange={(e) => setPub({ ...pub, name: e.target.value })} /></Field>
            <Field label={t('accent')}><span className="flex gap-2"><input type="color" aria-label={t('accent')} value={isHex(pub.accent) ? pub.accent : '#00696a'} onChange={(e) => setPub({ ...pub, accent: e.target.value })} className="h-[34px] w-[42px] rounded border border-[var(--border)] bg-transparent" /><input className={inputClass} value={pub.accent} onChange={(e) => setPub({ ...pub, accent: e.target.value })} /></span></Field>
            <Field label={t('type')}><select className={inputClass} value={pub.pairing} onChange={(e) => setPub({ ...pub, pairing: e.target.value as Pairing })}>{(Object.keys(PAIRINGS) as Pairing[]).map((k) => <option key={k} value={k}>{PAIRINGS[k].label}</option>)}</select></Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Primary disabled={!canSend} onClick={() => onQueue?.({ subject: out.subject, html: out.html, text: out.text, templateId: def.id })}>{t('queue')}</Primary>
            {!canSend && <span className="text-[12px] text-[var(--text-dim)]">{t('locked', { plan: sendPlanName })}</span>}
            <span className="text-[12px] text-[var(--text-faint)] tabular-nums ml-auto">{t('weight', { kb })}</span>
          </div>
        </Panel>
      </div>
      <div className="min-w-0">
        <div role="group" aria-label={t('html')} className="inline-flex border border-[var(--border)] rounded-[8px] p-0.5 mb-2">
          {(['html', 'text'] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`h-[30px] px-2.5 text-[12px] rounded-[6px] ${view === v ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-faint)]'}`}>{v === 'html' ? t('html') : t('text')}</button>)}
        </div>
        {view === 'html'
          ? <Preview html={(theme) => render(theme).html} />
          : <pre className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[12px] leading-[1.5] whitespace-pre-wrap [overflow-wrap:anywhere] max-h-[600px] overflow-auto">{`${t('subject')}: ${out.subject}\n${t('preheader')}: ${out.preheader}\n\n${out.text}`}</pre>}
      </div>
    </div>
  )
}

function BlockFields({ b, t, set }: { b: EBlock; t: ReturnType<typeof ui>; set: (p: Partial<EBlock>) => void }) {
  const area = `${inputClass} h-auto min-h-[60px] py-2 mt-2`
  return (
    <div>
      {b.title !== undefined && <input aria-label={t('title')} className={`${inputClass} mt-2`} value={b.title} onChange={(e) => set({ title: e.target.value })} />}
      {b.k === 'editor' && <><input aria-label={t('headline')} className={`${inputClass} mt-2`} value={b.headline} onChange={(e) => set({ headline: e.target.value } as Partial<EBlock>)} />
        <textarea aria-label={t('lede')} className={area} value={b.lede} onChange={(e) => set({ lede: e.target.value } as Partial<EBlock>)} /></>}
      {b.k === 'note' && <textarea aria-label={t('note')} className={area} value={b.text} onChange={(e) => set({ text: e.target.value } as Partial<EBlock>)} />}
      {b.k === 'cta' && <input aria-label={t('label')} className={`${inputClass} mt-2`} value={b.label} onChange={(e) => set({ label: e.target.value } as Partial<EBlock>)} />}
      {b.k === 'capture' && <input aria-label={t('note')} className={`${inputClass} mt-2`} value={b.caption} onChange={(e) => set({ caption: e.target.value } as Partial<EBlock>)} />}
    </div>
  )
}
