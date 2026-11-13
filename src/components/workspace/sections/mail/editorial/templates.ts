// The ten project-mail templates. Each one has one audience and one purpose,
// and answers in five seconds: what happened, what is yours, and by when.
// Sample content is a real-looking residential job in Badalona, in Spanish
// and English; other languages get the English content with translated labels.
// When the workspace has real data (ProjectSnapshot), `factsFrom` replaces the
// sample figures that come from it.

import type { Audience, EBlock, Issue, Publication, Register } from './render'
import type { Lang } from './labels'
import { DEFAULT_ACCENT } from './tokens'

export interface Facts {
  health: number
  healthPrev: number
  clashesOpen: number
  clashesPrev: number
  bcfNew: number
  bcfClosed: number
  reqs: number
  passPct: number
  ids: string
  certificate: { id: string; score: number; date: string }
  milestones?: { name: string; date: string; state: 'done' | 'next' | 'later' }[]
}

export const SAMPLE_FACTS: Facts = {
  health: 82, healthPrev: 78, clashesOpen: 37, clashesPrev: 49, bcfNew: 14, bcfClosed: 22, reqs: 312, passPct: 96.4,
  ids: 'EIR_Llevant_v3.ids', certificate: { id: 'CERT-LLV-0007', score: 91, date: '13.11.2026' },
}

/** Real figures from the workspace snapshot, where it has them. */
export function factsFrom(p: { health: number[]; clashes?: { open: number }[]; issues?: { opened: number; closed: number }; certificate?: { id: string; score: number; date: string }; milestones?: { name: string; date: string; done: boolean }[] }, base: Facts = SAMPLE_FACTS): Facts {
  const h = p.health ?? []
  const c = p.clashes ?? []
  const firstOpen = p.milestones?.findIndex((m) => !m.done) ?? -1
  return {
    ...base,
    ...(h.length ? { health: h[h.length - 1], healthPrev: h.length > 1 ? h[h.length - 2] : h[h.length - 1] } : {}),
    ...(c.length ? { clashesOpen: c[c.length - 1].open, clashesPrev: c.length > 1 ? c[c.length - 2].open : c[c.length - 1].open } : {}),
    ...(p.issues ? { bcfNew: p.issues.opened, bcfClosed: p.issues.closed } : {}),
    ...(p.certificate ? { certificate: p.certificate } : {}),
    ...(p.milestones?.length ? { milestones: p.milestones.map((m, i) => ({ name: m.name, date: m.date, state: m.done ? 'done' as const : i === firstOpen ? 'next' as const : 'later' as const })) } : {}),
  }
}

export interface TemplateCtx {
  lang: Lang | string
  pub: Publication
  facts?: Facts
  /** Absolute origin for images and links: https://… in a send, the app origin in a preview. */
  base: string
}

export interface TemplateDef {
  id: string
  audience: Audience
  register: Register
  name: { es: string; en: string }
  purpose: { es: string; en: string }
  build: (ctx: TemplateCtx) => Issue
}

export function samplePublication(lang: string): Publication {
  const es = lang.startsWith('es')
  return {
    name: 'Llevant 84',
    tagline: es ? 'Boletín de coordinación BIM' : 'BIM coordination bulletin',
    project: es ? 'Residencial Llevant · 84 viviendas' : 'Llevant Residential · 84 homes',
    phase: es ? 'Proyecto de ejecución' : 'Detailed design',
    rev: 'P05', code: 'LLV-FER-ZZ-XX-RP-B-0023',
    editor: { name: 'Marta Vidal', role: es ? 'BIM Coordinator · Ferrer Arquitectura' : 'BIM Coordinator · Ferrer Arquitectura' },
    studio: { name: 'Ferrer Arquitectura' }, client: { name: 'Promocions Llevant SL' },
    accent: DEFAULT_ACCENT, pairing: 'editorial', address: 'C/ de Mar 41, 08911 Badalona',
  }
}

let seq = 0
const id = () => `e${(seq++).toString(36)}`
const pct = (n: number, es: boolean) => `${es ? String(n).replace('.', ',') : n} %`
const sign = (n: number, es: boolean) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${es ? String(Math.abs(n)).replace('.', ',') : Math.abs(n)}`

function frame(c: TemplateCtx, t: Omit<Issue, 'number' | 'date'> & { number?: number; date?: string }): Issue {
  const es = String(c.lang).startsWith('es')
  return { number: 23, date: es ? '13.11.2026' : '13 Nov 2026', ...t }
}

const T = (es: string, en: string) => ({ es, en })

export const TEMPLATES_V3: TemplateDef[] = [
  // 1 ─ Weekly coordination report → coordinators
  {
    id: 'weekly', audience: 'coordinators', register: 'technical',
    name: T('Informe semanal de coordinación', 'Weekly coordination report'),
    purpose: T('Estado del federado, colisiones, versiones y acciones de la semana.', 'Federated model status, clashes, versions and the week’s actions.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), f = c.facts ?? SAMPLE_FACTS, x = (a: string, b: string) => (es ? a : b)
      const down = f.clashesPrev - f.clashesOpen
      return frame(c, {
        templateId: 'weekly', audience: 'coordinators', register: 'technical', range: x('S46 · 9–13 nov 2026', 'W46 · 9–13 Nov 2026'),
        to: x('Coordinadores y BIM managers', 'Coordinators and BIM managers'), kicker: x('Informe semanal', 'Weekly report'),
        subject: x(`Llevant 84 · S46: ${f.clashesOpen} colisiones abiertas (${sign(-down, true)}), Health Score ${f.health}`, `Llevant 84 · W46: ${f.clashesOpen} open clashes (${sign(-down, false)}), Health Score ${f.health}`),
        preheader: x('Saneamiento × vigas de PB sigue siendo crítico. Tres acciones antes del jueves 20.', 'Drainage × ground-floor beams is still critical. Three actions due by Thursday 20.'),
        blocks: [
          { id: id(), k: 'editor', headline: x(`${f.clashesOpen} colisiones abiertas (${sign(-down, true)}). Saneamiento × vigas PB sigue crítico.`, `${f.clashesOpen} open clashes (${sign(-down, false)}). Drainage × ground-floor beams still critical.`),
            lede: x(`La federación P05 baja de ${f.clashesPrev} a ${f.clashesOpen} colisiones abiertas. El cruce de la red de saneamiento con las vigas de planta baja sigue siendo el punto crítico antes del cierre de la revisión del lunes 23.`, `Federation P05 goes from ${f.clashesPrev} to ${f.clashesOpen} open clashes. The drainage network crossing the ground-floor beams is still the critical point before the revision closes on Monday 23.`) },
          { id: id(), k: 'stamp', title: x('Estado del federado P05', 'Federated model P05'), score: f.health, prev: f.healthPrev, against: f.ids, reqs: f.reqs, pass: pct(f.passPct, es) },
          { id: id(), k: 'kpis', items: [
            { label: x('Colisiones abiertas', 'Open clashes'), value: String(f.clashesOpen), delta: sign(-down, es) },
            { label: x('BCF nuevas / cerradas', 'BCF new / closed'), value: `${f.bcfNew} / ${f.bcfClosed}` },
            { label: x('Requisitos IDS', 'IDS requirements'), value: pct(f.passPct, es), delta: sign(1.8, es) },
          ] },
          { id: id(), k: 'clashes', title: x('Colisiones por pareja de disciplinas', 'Clashes by discipline pair'), rows: [
            { a: 'EST', b: 'MEP', prev: 27, open: 21, owner: 'Instal·lacions Garraf', due: '20.11' },
            { a: 'ARQ', b: 'EST', prev: 13, open: 9, owner: 'Ferrer Arquitectura', due: '18.11' },
            { a: 'ARQ', b: 'MEP', prev: 9, open: 7, owner: 'Instal·lacions Garraf', due: '20.11' },
          ] },
          { id: id(), k: 'capture', title: x('Vista del modelo', 'Model view'), src: `${c.base}/images/mail/sample-capture.jpg`, w: 1280, h: 600,
            caption: x('Fachada sur · Planta baja · Federado P05 · 11 elementos sin FireRating resaltados', 'South elevation · Ground floor · Federated P05 · 11 elements without FireRating highlighted'), href: `${c.base}/?v=llv-p05-south` },
          { id: id(), k: 'actions', title: x('Acciones · responsable · fecha', 'Actions · owner · date'), items: [
            { who: 'Instal·lacions Garraf', what: x('Resolver 14 cruces de saneamiento con vigas en ejes C–D / 2–4', 'Resolve 14 drainage crossings with beams on grids C–D / 2–4'), due: x('Jue 20.11', 'Thu 20 Nov') },
            { who: 'Estructuras EGS', what: x('Confirmar pasos en vigas V-PB-12 a V-PB-17', 'Confirm openings in beams V-PB-12 to V-PB-17'), due: x('Mar 18.11', 'Tue 18 Nov') },
            { who: 'Ferrer Arquitectura', what: x('Añadir FireRating a 11 IfcDoor de escalera', 'Add FireRating to 11 stair IfcDoor'), due: x('Mar 18.11', 'Tue 18 Nov') },
          ] },
          { id: id(), k: 'changes', title: x('Registro de versiones', 'Version log'), rows: [
            { disc: 'ARQ', file: 'LLV-FER-ZZ-ZZ-M3-A-0001', from: 'P04', to: 'P05', note: x('18 tabiques reubicados en P2–P4', '18 partitions moved on levels 2–4') },
            { disc: 'EST', file: 'LLV-EGS-ZZ-ZZ-M3-S-0001', from: 'P03', to: 'P04', note: x('Vigas de cuelgue en PB, canto 60 → 55 cm', 'Ground-floor downstand beams, depth 60 → 55 cm') },
            { disc: 'MEP', file: 'LLV-IGA-ZZ-ZZ-M3-M-0001', from: 'P05', to: 'P06', note: x('Saneamiento colgado, nuevo trazado eje C', 'Suspended drainage, new route on grid C') },
          ] },
          { id: id(), k: 'cta', label: x('Abrir federado P05', 'Open federated P05'), href: `${c.base}/?v=llv-p05`, note: x('Reunión de coordinación: lunes 23.11, 10:00, sala 2 / Jitsi', 'Coordination meeting: Monday 23 Nov, 10:00, room 2 / Jitsi') },
        ],
      })
    },
  },
  // 2 ─ New model version → one trade
  {
    id: 'new-version', audience: 'trades', register: 'technical',
    name: T('Nueva versión: qué cambia para ti', 'New version: what changes for you'),
    purpose: T('Una subcontrata ve solo lo que le afecta de la nueva revisión.', 'One trade sees only what the new revision changes for them.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'new-version', audience: 'trades', register: 'technical', to: 'Instal·lacions Garraf (MEP)', kicker: x('Nueva versión', 'New version'),
        subject: x('ARQ P05 publicada: 6 cambios te afectan, revisión antes del 20.11', 'ARQ P05 published: 6 changes affect you, review by 20 Nov'),
        preheader: x('Tabiques movidos en P2–P4 y un patinillo nuevo. Tu modelo P06 se compara mañana.', 'Partitions moved on L2–L4 and a new shaft. Your P06 model is compared tomorrow.'),
        blocks: [
          { id: id(), k: 'editor', headline: x('Arquitectura publica P05: seis cambios tocan tus trazados', 'Architecture publishes P05: six changes touch your routes'),
            lede: x('De los 41 cambios entre P04 y P05, seis cruzan instalaciones. El resto no te afecta y no necesitas revisarlo.', 'Of the 41 changes between P04 and P05, six cross your services. The rest do not affect you and need no review.') },
          { id: id(), k: 'changes', title: x('Lo que cambia para MEP', 'What changes for MEP'), rows: [
            { disc: 'ARQ', file: 'P2 · ejes B–C / 3', from: 'P04', to: 'P05', note: x('Tabique de baño desplazado 35 cm: revisar bajantes BV-07 y BV-08', 'Bathroom partition moved 35 cm: check stacks BV-07 and BV-08') },
            { disc: 'ARQ', file: 'P3 · eje D / 2', from: 'P04', to: 'P05', note: x('Patinillo nuevo 60 × 40 cm junto a escalera 2', 'New 60 × 40 cm shaft next to stair 2') },
            { disc: 'ARQ', file: 'P4 · ejes A–B / 4', from: 'P04', to: 'P05', note: x('Falso techo de cocina baja de 2,60 a 2,50 m', 'Kitchen ceiling lowered from 2.60 to 2.50 m') },
            { disc: 'ARQ', file: 'PB · eje C / 1', from: 'P04', to: 'P05', note: x('Cuarto de contadores: puerta EI2 60 girada', 'Meter room: EI2 60 door now opens outwards') },
          ] },
          { id: id(), k: 'capture', src: `${c.base}/images/mail/sample-capture.jpg`, w: 1280, h: 600, caption: x('P3 · eje D / 2 · patinillo nuevo en P05', 'L3 · grid D / 2 · new shaft in P05'), href: `${c.base}/?v=llv-p05-shaft` },
          { id: id(), k: 'actions', title: x('Qué te toca', 'What is yours'), to: x('Instal·lacions Garraf, antes de la comparación del jueves:', 'Instal·lacions Garraf, before Thursday’s comparison:'), items: [
            { who: 'Instal·lacions Garraf', what: x('Reconducir BV-07 y BV-08 al patinillo nuevo', 'Reroute BV-07 and BV-08 into the new shaft'), due: x('Jue 20.11', 'Thu 20 Nov') },
            { who: 'Instal·lacions Garraf', what: x('Bajar conductos de cocina en P4 a +2,45 m', 'Lower kitchen ducts on L4 to +2.45 m'), due: x('Jue 20.11', 'Thu 20 Nov') },
            { who: 'Instal·lacions Garraf', what: x('Subir P06 al CDE con el nombre LLV-IGA-ZZ-ZZ-M3-M-0001', 'Upload P06 to the CDE named LLV-IGA-ZZ-ZZ-M3-M-0001'), due: x('Vie 21.11', 'Fri 21 Nov') },
          ] },
          { id: id(), k: 'cta', label: x('Ver los 6 cambios en 3D', 'See the 6 changes in 3D'), href: `${c.base}/?v=llv-p05-diff-mep` },
        ],
      })
    },
  },
  // 3 ─ Clashes / BCF by discipline → trades + coordinators
  {
    id: 'clashes-bcf', audience: 'trades', register: 'technical',
    name: T('Resumen de colisiones y BCF', 'Clash and BCF summary'),
    purpose: T('Incidencias abiertas por disciplina, con captura, responsable y fecha.', 'Open issues by discipline, with view, owner and date.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), f = c.facts ?? SAMPLE_FACTS, x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'clashes-bcf', audience: 'trades', register: 'technical', to: x('Subcontratas y coordinadores', 'Trades and coordinators'), kicker: x('Colisiones y BCF', 'Clashes and BCF'),
        subject: x(`${f.clashesOpen} colisiones abiertas: 4 incidencias BCF vencen esta semana`, `${f.clashesOpen} open clashes: 4 BCF issues due this week`),
        preheader: x('EST × MEP concentra el 57 % de lo abierto. Cada incidencia lleva su vista.', 'STR × MEP holds 57 % of what is open. Each issue links to its view.'),
        blocks: [
          { id: id(), k: 'editor', headline: x('Cuatro incidencias vencen esta semana', 'Four issues are due this week'), lede: x(`Quedan ${f.clashesOpen} colisiones abiertas tras la detección del miércoles (tolerancia 20 mm, duplicados agrupados). Estas son las que bloquean la revisión del 23.`, `${f.clashesOpen} clashes remain open after Wednesday’s run (20 mm tolerance, duplicates grouped). These are the ones blocking the review on the 23rd.`) },
          { id: id(), k: 'clashes', title: x('Por pareja de disciplinas', 'By discipline pair'), rows: [
            { a: 'EST', b: 'MEP', prev: 27, open: 21, owner: 'Instal·lacions Garraf', due: '20.11' },
            { a: 'ARQ', b: 'EST', prev: 13, open: 9, owner: 'Ferrer Arquitectura', due: '18.11' },
            { a: 'ARQ', b: 'MEP', prev: 9, open: 7, owner: 'Instal·lacions Garraf', due: '20.11' },
          ] },
          { id: id(), k: 'bcf', title: x('Incidencias BCF que vencen', 'BCF issues due'), items: [
            { ref: 'BCF-0412', disc: 'MEP', status: 'open', title: x('Colector Ø160 atraviesa viga V-PB-14', 'Ø160 collector passes through beam V-PB-14'), where: x('PB · ejes C / 3', 'GF · grid C / 3'), owner: 'Instal·lacions Garraf', due: '20.11' },
            { ref: 'BCF-0415', disc: 'EST', status: 'review', title: x('Paso en viga V-PB-12 sin confirmar', 'Opening in beam V-PB-12 not confirmed'), where: x('PB · ejes D / 2', 'GF · grid D / 2'), owner: 'Estructuras EGS', due: '18.11' },
            { ref: 'BCF-0398', disc: 'ARQ', status: 'open', title: x('Falso techo choca con bandeja de cables', 'Ceiling clashes with cable tray'), where: x('P1 · pasillo eje B', 'L1 · corridor grid B'), owner: 'Ferrer Arquitectura', due: '18.11' },
            { ref: 'BCF-0377', disc: 'MEP', status: 'closed', title: x('Rociador bajo jácena de escalera', 'Sprinkler under stair girder'), where: x('P2 · escalera 1', 'L2 · stair 1'), owner: 'Instal·lacions Garraf', due: '13.11' },
          ] },
          { id: id(), k: 'cta', label: x('Abrir las incidencias en el visor', 'Open the issues in the viewer'), href: `${c.base}/?v=llv-bcf`, note: x('El BCF 2.1 completo va adjunto en el CDE: LLV-FER-ZZ-XX-CR-B-0046.', 'The full BCF 2.1 is on the CDE: LLV-FER-ZZ-XX-CR-B-0046.') },
        ],
      })
    },
  },
  // 4 ─ Milestone delivery with certificate → client
  {
    id: 'milestone-cert', audience: 'client', register: 'editorial',
    name: T('Entrega de hito con certificado', 'Milestone delivery with certificate'),
    purpose: T('Al cliente: qué se entrega, que está validado y qué viene después.', 'For the client: what is delivered, that it is checked, and what comes next.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), f = c.facts ?? SAMPLE_FACTS, x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'milestone-cert', audience: 'client', register: 'editorial', to: 'Promocions Llevant SL', kicker: x('Entrega de hito', 'Milestone delivery'),
        subject: x('Proyecto de ejecución entregado y validado', 'Detailed design delivered and checked'),
        preheader: x(`Modelo federado con ${f.certificate.score} sobre 100 frente a los requisitos del contrato. Siguiente paso: licitación.`, `Federated model scoring ${f.certificate.score} out of 100 against the contract requirements. Next: tender.`),
        blocks: [
          { id: id(), k: 'editor', headline: x('El proyecto de ejecución, entregado y comprobado', 'Detailed design, delivered and checked'),
            lede: x('Hoy cerramos el hito 3. Los modelos de arquitectura, estructura e instalaciones están federados, revisados entre sí y comprobados contra los requisitos de información del contrato. Ya pueden usarse para pedir precios.', 'Today we close milestone 3. The architecture, structure and services models are federated, checked against each other and against the information requirements in the contract. They are ready for pricing.') },
          { id: id(), k: 'stamp', title: x('Certificado de validación', 'Validation certificate'), score: f.certificate.score, against: f.ids, reqs: f.reqs, pass: pct(99.1, es), cert: f.certificate.id },
          { id: id(), k: 'capture', src: `${c.base}/images/mail/sample-capture.jpg`, w: 1280, h: 600, caption: x('Fachada sur, modelo federado P05', 'South elevation, federated model P05'), href: `${c.base}/?v=llv-p05-south` },
          { id: id(), k: 'milestones', title: x('Dónde estamos', 'Where we are'), items: f.milestones ?? [
            { name: x('Anteproyecto', 'Concept design'), date: '03.2026', state: 'done' },
            { name: x('Proyecto básico y licencia', 'Planning application'), date: '06.2026', state: 'done' },
            { name: x('Proyecto de ejecución', 'Detailed design'), date: '13.11.2026', state: 'done' },
            { name: x('Licitación de obra', 'Construction tender'), date: '12.2026', state: 'next' },
            { name: x('Inicio de obra', 'Start on site'), date: '03.2027', state: 'later' },
          ] },
          { id: id(), k: 'note', quote: true, text: x('Lo que entregamos hoy es lo que se va a construir. Cada cambio a partir de aquí tendrá fecha, autor y motivo.', 'What we deliver today is what will be built. Every change from here on will have a date, an author and a reason.'), by: 'Marta Vidal' },
          { id: id(), k: 'cta', label: x('Ver el modelo y el certificado', 'See the model and the certificate'), href: `${c.base}/?v=llv-cert`, note: x('No necesitas instalar nada: se abre en el navegador.', 'Nothing to install: it opens in the browser.') },
        ],
      })
    },
  },
  // 5 ─ Monthly project newsletter → client and everyone
  {
    id: 'monthly', audience: 'client', register: 'editorial',
    name: T('Newsletter mensual del proyecto', 'Monthly project newsletter'),
    purpose: T('El mes en una lectura: avance, decisiones, riesgos y próximos pasos.', 'The month in one read: progress, decisions, risks and next steps.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), f = c.facts ?? SAMPLE_FACTS, x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'monthly', audience: 'client', register: 'editorial', number: 11, date: x('30.11.2026', '30 Nov 2026'), range: x('Noviembre 2026', 'November 2026'),
        to: x('Promotor y equipo de proyecto', 'Client and project team'), kicker: x('Edición mensual', 'Monthly edition'),
        subject: x('Llevant 84 · Noviembre: proyecto cerrado, licitación en diciembre', 'Llevant 84 · November: design closed, tender in December'),
        preheader: x('Tres cifras, una decisión pendiente y lo que viene en diciembre.', 'Three figures, one pending decision and what comes in December.'),
        blocks: [
          { id: id(), k: 'editor', headline: x('Un mes para cerrar el proyecto', 'A month to close the design'),
            lede: x('Noviembre ha sido el mes de las colisiones: empezamos con 112 y lo cerramos con 37, todas menores y con responsable. El modelo está listo para licitar y el calendario se mantiene.', 'November was the month of clashes: we started with 112 and end with 37, all minor and all owned. The model is ready to tender and the programme holds.') },
          { id: id(), k: 'kpis', title: x('El mes en cifras', 'The month in figures'), items: [
            { label: x('Colisiones resueltas', 'Clashes resolved'), value: '75' },
            { label: x('Health Score del modelo', 'Model Health Score'), value: String(f.health), delta: sign(f.health - 71, es) },
            { label: x('Días de retraso', 'Days of delay'), value: '0' },
          ] },
          { id: id(), k: 'capture', src: `${c.base}/images/mail/sample-capture.jpg`, w: 1280, h: 600, caption: x('Fachada sur con la nueva carpintería de aluminio', 'South elevation with the new aluminium frames'), href: `${c.base}/?v=llv-south` },
          { id: id(), k: 'note', title: x('Una decisión para diciembre', 'One decision for December'), text: x('La carpintería de fachada sur puede pasar a aluminio con rotura de puente térmico de gama media. Ahorra unos 38.000 € y mantiene la calificación energética A. Necesitamos vuestra respuesta antes del 12 de diciembre para incluirlo en la licitación.', 'The south façade frames can move to mid-range thermally broken aluminium. It saves about €38,000 and keeps the A energy rating. We need your answer by 12 December to include it in the tender.') },
          { id: id(), k: 'milestones', title: x('Lo que viene', 'What comes next'), items: [
            { name: x('Respuesta sobre carpintería', 'Decision on window frames'), date: '12.12', state: 'next' },
            { name: x('Envío a licitación', 'Tender issued'), date: '15.12', state: 'later' },
            { name: x('Ofertas recibidas', 'Bids received'), date: '30.01', state: 'later' },
          ] },
          { id: id(), k: 'cta', label: x('Abrir el proyecto', 'Open the project'), href: `${c.base}/?v=llv` },
        ],
      })
    },
  },
  // 6 ─ RFI / pending decision → internal department
  {
    id: 'rfi', audience: 'internal', register: 'editorial',
    name: T('RFI / decisión pendiente', 'RFI / pending decision'),
    purpose: T('Una pregunta, sus opciones con coste y plazo, y quién decide.', 'One question, its options with cost and time, and who decides.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'rfi', audience: 'internal', register: 'editorial', to: x('Compras y jefatura de obra', 'Procurement and site management'), kicker: 'RFI-031',
        subject: x('RFI-031: pasos en vigas de PB, decidir antes del martes 18', 'RFI-031: openings in ground-floor beams, decide by Tuesday 18'),
        preheader: x('Dos opciones, 4.200 € de diferencia y una semana de plazo. Hace falta una respuesta.', 'Two options, €4,200 apart and one week of lead time. We need an answer.'),
        blocks: [
          { id: id(), k: 'editor', headline: x('¿Pasos en las vigas o saneamiento por debajo?', 'Openings in the beams, or drainage below them?'), sign: true,
            lede: x('Las vigas V-PB-12 a V-PB-17 cruzan el recorrido del colector. Estructura acepta pasos de hasta Ø160 con refuerzo. La alternativa baja el falso techo del aparcamiento 25 cm.', 'Beams V-PB-12 to V-PB-17 cross the collector route. Structure accepts openings up to Ø160 with reinforcement. The alternative lowers the car-park ceiling by 25 cm.') },
          { id: id(), k: 'decision', question: x('¿Qué solución pedimos a Instal·lacions Garraf y a Estructuras EGS?', 'Which solution do we ask Instal·lacions Garraf and Estructuras EGS for?'), options: [
            { label: x('Pasos Ø160 con manguito y refuerzo en 6 vigas', 'Ø160 sleeved openings with reinforcement in 6 beams'), impact: x('+3.100 € · sin retraso · estructura revisa el 18.11', '+€3,100 · no delay · structure reviews on 18 Nov') },
            { label: x('Colector por debajo de las vigas', 'Collector below the beams'), impact: x('+7.300 € · falso techo a 2,25 m · 5 días más de instalaciones', '+€7,300 · ceiling at 2.25 m · 5 more days of services work') },
          ], deadline: x('Mar 18.11', 'Tue 18 Nov'), owner: x('Jordi Puig, jefe de obra', 'Jordi Puig, site manager') },
          { id: id(), k: 'capture', src: `${c.base}/images/mail/sample-capture.jpg`, w: 1280, h: 600, caption: x('PB · ejes C–D / 2–4 · vigas afectadas en naranja', 'GF · grid C–D / 2–4 · affected beams in orange'), href: `${c.base}/?v=llv-rfi031` },
          { id: id(), k: 'note', text: x('Recomendación de coordinación: opción A. Es más barata, no toca el gálibo del aparcamiento y estructura ya la ha validado en cálculo preliminar.', 'Coordination recommendation: option A. It is cheaper, keeps the car-park clearance, and structure has already checked it in preliminary calculation.') },
          { id: id(), k: 'cta', label: x('Responder a la RFI', 'Answer the RFI'), href: `${c.base}/?rfi=031` },
        ],
      })
    },
  },
  // 7 ─ Failed EIR/IDS requirements → one trade
  {
    id: 'eir-reminder', audience: 'trades', register: 'technical',
    name: T('Requisitos EIR/IDS incumplidos', 'Failed EIR/IDS requirements'),
    purpose: T('A una subcontrata: qué requisitos fallan, en qué elementos y hasta cuándo.', 'To one trade: which requirements fail, on which elements, and by when.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'eir-reminder', audience: 'trades', register: 'technical', to: 'Fusteria Metàl·lica Besòs (FAC)', kicker: x('Requisitos', 'Requirements'),
        subject: x('Tu entrega FAC P02 no cumple 3 requisitos del EIR: 47 elementos', 'Your FAC P02 delivery fails 3 EIR requirements: 47 elements'),
        preheader: x('Falta FireRating, ThermalTransmittance y la clasificación Uniclass. Nueva entrega antes del viernes 21.', 'Missing FireRating, ThermalTransmittance and Uniclass classification. Redeliver by Friday 21.'),
        blocks: [
          { id: id(), k: 'editor', headline: x('Tres requisitos por corregir antes de aceptar P02', 'Three requirements to fix before P02 is accepted'),
            lede: x('Hemos comprobado LLV-FMB-ZZ-ZZ-M3-F-0001 P02 contra EIR_Llevant_v3.ids. El modelo está bien geométricamente; lo que falta es información en 47 elementos.', 'We checked LLV-FMB-ZZ-ZZ-M3-F-0001 P02 against EIR_Llevant_v3.ids. The geometry is fine; what is missing is information on 47 elements.') },
          { id: id(), k: 'stamp', score: 64, prev: 58, against: 'EIR_Llevant_v3.ids · FAC', reqs: 38, pass: pct(92.1, es) },
          { id: id(), k: 'requirements', title: x('Lo que falla', 'What fails'), spec: 'EIR_Llevant_v3.ids · LLV-FMB-ZZ-ZZ-M3-F-0001 P02', rows: [
            { req: x('Pset_WindowCommon.FireRating obligatorio en huecos de escalera', 'Pset_WindowCommon.FireRating required on stair openings'), entity: 'IfcWindow', failing: 12, example: '2fXk$9Hq…' },
            { req: x('Pset_WindowCommon.ThermalTransmittance ≤ 1,6 W/m²K', 'Pset_WindowCommon.ThermalTransmittance ≤ 1.6 W/m²K'), entity: 'IfcWindow', failing: 28, example: '0Lm7Qe2r…' },
            { req: x('Clasificación Uniclass 2015 Pr_30_59', 'Uniclass 2015 classification Pr_30_59'), entity: 'IfcCurtainWall', failing: 7, example: '3tYb8aNv…' },
          ] },
          { id: id(), k: 'actions', title: x('Qué te toca', 'What is yours'), items: [
            { who: 'Fusteria Metàl·lica Besòs', what: x('Completar las tres propiedades y volver a exportar IFC 4', 'Fill in the three properties and export IFC 4 again'), due: x('Vie 21.11', 'Fri 21 Nov') },
            { who: 'Fusteria Metàl·lica Besòs', what: x('Subir P03 al CDE; se comprueba sola al llegar', 'Upload P03 to the CDE; it is checked on arrival'), due: x('Vie 21.11', 'Fri 21 Nov') },
          ] },
          { id: id(), k: 'cta', label: x('Ver los 47 elementos', 'See the 47 elements'), href: `${c.base}/?v=llv-fac-ids`, note: x('El IDS completo está en el CDE: LLV-FER-ZZ-XX-SP-B-0003.', 'The full IDS is on the CDE: LLV-FER-ZZ-XX-SP-B-0003.') },
        ],
      })
    },
  },
  // 8 ─ Coordination meeting minutes
  {
    id: 'minutes', audience: 'coordinators', register: 'technical',
    name: T('Acta de reunión de coordinación', 'Coordination meeting minutes'),
    purpose: T('Acuerdos, responsables y fechas, en una página.', 'Agreements, owners and dates, on one page.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'minutes', audience: 'coordinators', register: 'technical', number: 14, date: x('16.11.2026', '16 Nov 2026'), to: x('Asistentes y agentes del proyecto', 'Attendees and project agents'), kicker: x('Acta', 'Minutes'),
        range: x('Reunión 14 · 16.11.2026', 'Meeting 14 · 16 Nov 2026'),
        subject: x('Acta reunión 14: 5 acuerdos, 4 responsables', 'Minutes of meeting 14: 5 agreements, 4 owners'),
        preheader: x('Pasos en vigas aprobados, patinillo P3 confirmado y fecha de congelación del modelo.', 'Beam openings approved, L3 shaft confirmed and model freeze date set.'),
        blocks: [
          { id: id(), k: 'list', title: x('Asistentes', 'Attendees'), items: [
            { term: 'ARQ', text: 'Marta Vidal, Pau Ferrer (Ferrer Arquitectura)' },
            { term: 'EST', text: 'Laia Soler (Estructuras EGS)' },
            { term: 'MEP', text: 'Oriol Mas (Instal·lacions Garraf)' },
            { term: x('PROM', 'CLIENT'), text: 'Núria Roca (Promocions Llevant SL)' },
          ] },
          { id: id(), k: 'list', title: x('Acuerdos', 'Agreements'), items: [
            { term: '14.1', text: x('Se aprueban pasos Ø160 con refuerzo en V-PB-12 a V-PB-17 (RFI-031, opción A).', 'Ø160 openings with reinforcement in V-PB-12 to V-PB-17 approved (RFI-031, option A).') },
            { term: '14.2', text: x('Se confirma el patinillo de P3 junto a escalera 2; no se mueve más.', 'The L3 shaft next to stair 2 is confirmed and will not move again.') },
            { term: '14.3', text: x('Tolerancia de detección de colisiones: 20 mm; duplicados agrupados por sistema.', 'Clash detection tolerance: 20 mm; duplicates grouped by system.') },
            { term: '14.4', text: x('Congelación de modelos para licitación: viernes 5 de diciembre.', 'Model freeze for tender: Friday 5 December.') },
          ] },
          { id: id(), k: 'actions', title: x('Responsables y fechas', 'Owners and dates'), items: [
            { who: 'Estructuras EGS', what: x('Emitir detalle de refuerzo de pasos', 'Issue the opening reinforcement detail'), due: '20.11' },
            { who: 'Instal·lacions Garraf', what: x('Modelo MEP P06 con colector por los pasos', 'MEP P06 model with collector through the openings'), due: '21.11' },
            { who: 'Ferrer Arquitectura', what: x('Federado P06 y nueva detección', 'Federated P06 and new clash run'), due: '24.11' },
            { who: 'Promocions Llevant SL', what: x('Respuesta sobre carpintería de fachada sur', 'Decision on the south façade frames'), due: '12.12' },
          ] },
          { id: id(), k: 'note', text: x('Próxima reunión: lunes 23.11, 10:00, sala 2 / Jitsi. Si no hay objeciones en 48 h, el acta se da por aprobada.', 'Next meeting: Monday 23 Nov, 10:00, room 2 / Jitsi. If there are no objections within 48 h, these minutes stand approved.') },
        ],
      })
    },
  },
  // 9 ─ Welcome to the project → new agents
  {
    id: 'welcome', audience: 'trades', register: 'editorial',
    name: T('Bienvenida al proyecto', 'Welcome to the project'),
    purpose: T('Normas, nomenclatura ISO 19650 y enlaces para quien se incorpora.', 'Rules, ISO 19650 naming and links for whoever joins.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'welcome', audience: 'trades', register: 'editorial', number: 1, to: 'Fusteria Metàl·lica Besòs', kicker: x('Bienvenida', 'Welcome'),
        subject: x('Bienvenidos a Llevant 84: cómo entregar modelos en este proyecto', 'Welcome to Llevant 84: how to deliver models on this project'),
        preheader: x('Nombres de fichero, requisitos, calendario de entregas y a quién preguntar.', 'File names, requirements, delivery calendar and who to ask.'),
        blocks: [
          { id: id(), k: 'editor', headline: x('Bienvenidos al equipo de Llevant 84', 'Welcome to the Llevant 84 team'),
            lede: x('Os incorporáis como responsables de fachadas y carpintería. Aquí está todo lo que necesitáis para que vuestra primera entrega se acepte a la primera.', 'You join as the façade and window trade. Here is everything you need for your first delivery to be accepted first time.') },
          { id: id(), k: 'list', title: x('Cómo se nombran los ficheros', 'How files are named'), items: [
            { term: 'LLV', text: x('Proyecto', 'Project') },
            { term: 'FMB', text: x('Vuestro código de autor (Fusteria Metàl·lica Besòs)', 'Your originator code (Fusteria Metàl·lica Besòs)') },
            { term: 'ZZ-ZZ', text: x('Volumen y nivel: todo el edificio', 'Volume and level: whole building') },
            { term: 'M3', text: x('Tipo: modelo 3D', 'Type: 3D model') },
            { term: 'F', text: x('Función: fachadas', 'Role: façades') },
            { term: 'LLV-FMB-ZZ-ZZ-M3-F-0001', text: x('Así se llama vuestro modelo', 'This is your model’s name') },
          ] },
          { id: id(), k: 'list', title: x('Reglas de entrega', 'Delivery rules'), items: [
            { term: 'IFC 4', text: x('Reference View, coordenadas del proyecto (ETRS89 / UTM 31N), unidades en metros.', 'Reference View, project coordinates (ETRS89 / UTM 31N), units in metres.') },
            { term: 'EIR v3', text: x('Requisitos en EIR_Llevant_v3.ids; cada entrega se comprueba sola al subirla.', 'Requirements in EIR_Llevant_v3.ids; every upload is checked on arrival.') },
            { term: x('Viernes', 'Fridays'), text: x('Entregas semanales antes de las 14:00; la detección corre el miércoles.', 'Weekly deliveries before 14:00; the clash run is on Wednesday.') },
          ] },
          { id: id(), k: 'list', title: x('A quién preguntar', 'Who to ask'), items: [
            { term: 'BIM', text: 'Marta Vidal · m.vidal@ferrerarquitectura.cat' },
            { term: x('Obra', 'Site'), text: 'Jordi Puig · 600 412 908' },
          ] },
          { id: id(), k: 'cta', label: x('Abrir el modelo federado', 'Open the federated model'), href: `${c.base}/?v=llv`, note: x('Primera entrega esperada: viernes 28.11.', 'First delivery expected: Friday 28 Nov.') },
        ],
      })
    },
  },
  // 10 ─ Phase close / lessons learned → management
  {
    id: 'closeout', audience: 'internal', register: 'editorial',
    name: T('Cierre de fase y lecciones aprendidas', 'Phase close and lessons learned'),
    purpose: T('Para dirección: qué salió, qué costó y qué cambiamos en el siguiente proyecto.', 'For management: what came out, what it cost, and what we change next time.'),
    build: (c) => {
      const es = String(c.lang).startsWith('es'), f = c.facts ?? SAMPLE_FACTS, x = (a: string, b: string) => (es ? a : b)
      return frame(c, {
        templateId: 'closeout', audience: 'internal', register: 'editorial', number: 24, date: x('05.12.2026', '5 Dec 2026'), to: x('Dirección', 'Management'), kicker: x('Cierre de fase', 'Phase close'),
        subject: x('Cierre del proyecto de ejecución: en plazo, 112 colisiones resueltas, 3 lecciones', 'Detailed design closed: on time, 112 clashes resolved, 3 lessons'),
        preheader: x('Entregado el 13.11 sin retraso. Lo que funcionó, lo que no y qué cambiamos.', 'Delivered on 13 Nov with no delay. What worked, what did not, and what we change.'),
        blocks: [
          { id: id(), k: 'editor', headline: x('Proyecto de ejecución: cerrado en plazo', 'Detailed design: closed on time'),
            lede: x('La fase se entregó el 13 de noviembre, en la fecha del contrato. La coordinación costó 410 horas, un 8 % menos que en Can Rull, sobre todo por detectar colisiones cada semana en lugar de cada mes.', 'The phase was delivered on 13 November, the contract date. Coordination took 410 hours, 8 % fewer than on Can Rull, mostly because clashes were run weekly instead of monthly.') },
          { id: id(), k: 'kpis', items: [
            { label: x('Horas de coordinación', 'Coordination hours'), value: '410', delta: sign(-8, es) + ' %' },
            { label: x('Colisiones resueltas', 'Clashes resolved'), value: '112' },
            { label: 'Health Score', value: String(f.health), delta: sign(f.health - 64, es) },
          ] },
          { id: id(), k: 'list', title: x('Tres lecciones', 'Three lessons'), items: [
            { term: '01', text: x('Fijar la tolerancia de colisiones en la primera reunión: perdimos dos semanas discutiendo 10 o 20 mm.', 'Set the clash tolerance at the first meeting: we lost two weeks arguing 10 or 20 mm.') },
            { term: '02', text: x('Comprobar el IDS en cada subida, no al final: los fallos de propiedades bajaron un 70 %.', 'Check the IDS on every upload, not at the end: property failures dropped by 70 %.') },
            { term: '03', text: x('Las subcontratas responden antes cuando el correo dice solo lo suyo.', 'Trades answer sooner when the email shows only what is theirs.') },
          ] },
          { id: id(), k: 'note', quote: true, text: x('La próxima vez, el plan de ejecución BIM se firma antes de contratar a instalaciones.', 'Next time, the BIM execution plan is signed before the services trade is appointed.'), by: x('Pau Ferrer, socio director', 'Pau Ferrer, managing partner') },
          { id: id(), k: 'cta', label: x('Informe completo de la fase', 'Full phase report'), href: `${c.base}/?report=llv-ped` },
        ],
      })
    },
  },
]

export const AUDIENCES: Audience[] = ['client', 'trades', 'coordinators', 'internal']
export const templateById = (id: string) => TEMPLATES_V3.find((t) => t.id === id)
export const nameOf = (t: TemplateDef, lang: string) => (lang.startsWith('es') ? t.name.es : t.name.en)
export const purposeOf = (t: TemplateDef, lang: string) => (lang.startsWith('es') ? t.purpose.es : t.purpose.en)
export type { EBlock }
