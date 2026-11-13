// Builds the three visual directions of the weekly coordination report and
// screenshots each one at desktop, mobile and dark. Run from the repo root:
//   node docs/email-directions/build.mjs
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(process.cwd(), 'package.json'))
let chromium
try { ({ chromium } = require('playwright-core')) } catch { ({ chromium } = createRequire('C:/repo/ifc/package.json')('playwright-core')) }

// ── Shared, realistic data for one issue ─────────────────────────────────────
const D = {
  pub: 'Llevant 84',
  pubSub: 'Boletín de coordinación BIM',
  project: 'Residencial Llevant · 84 viviendas',
  place: 'Badalona (Barcelona)',
  issue: 23, week: 46, range: '9–13 nov 2026', date: '13.11.2026',
  phase: 'Proyecto de ejecución', rev: 'P05',
  code: 'LLV-FER-ZZ-XX-RP-B-0023',
  editor: 'Marta Vidal', role: 'BIM Coordinator · Ferrer Arquitectura',
  audience: 'Coordinadores y BIM managers',
  lede: 'La federación P05 baja de 49 a 37 colisiones abiertas. El cruce de la red de saneamiento con las vigas de planta baja sigue siendo el punto crítico antes del cierre de la revisión del lunes 23.',
  health: 82, healthPrev: 78, ids: 'EIR_Llevant_v3.ids', reqs: 312, pass: 96.4,
  kpis: [
    { k: 'Colisiones abiertas', v: '37', d: '−12' },
    { k: 'BCF nuevas / cerradas', v: '14 / 22', d: '' },
    { k: 'Requisitos IDS', v: '96,4 %', d: '+1,8' },
  ],
  clashes: [
    { a: 'EST', b: 'MEP', open: 21, prev: 27, owner: 'Instal·lacions Garraf', due: '20.11' },
    { a: 'ARQ', b: 'EST', open: 9, prev: 13, owner: 'Ferrer Arquitectura', due: '18.11' },
    { a: 'ARQ', b: 'MEP', open: 7, prev: 9, owner: 'Instal·lacions Garraf', due: '20.11' },
  ],
  versions: [
    { disc: 'ARQ', file: 'LLV-FER-ZZ-ZZ-M3-A-0001', from: 'P04', to: 'P05', note: '18 tabiques reubicados en P2–P4' },
    { disc: 'EST', file: 'LLV-EGS-ZZ-ZZ-M3-S-0001', from: 'P03', to: 'P04', note: 'Vigas de cuelgue en PB, canto 60 → 55 cm' },
    { disc: 'MEP', file: 'LLV-IGA-ZZ-ZZ-M3-M-0001', from: 'P05', to: 'P06', note: 'Saneamiento colgado, nuevo trazado eje C' },
  ],
  actions: [
    { who: 'Instal·lacions Garraf', what: 'Resolver 14 cruces de saneamiento con vigas en ejes C–D / 2–4', due: 'Jue 20.11' },
    { who: 'Estructuras EGS', what: 'Confirmar pasos en vigas V-PB-12 a V-PB-17', due: 'Mar 18.11' },
    { who: 'Ferrer Arquitectura', what: 'Añadir FireRating a 11 IfcDoor de escalera', due: 'Mar 18.11' },
  ],
  caption: 'Fachada sur, vista 3D · Planta baja · Federado P05 · 11 elementos sin FireRating resaltados',
  next: 'Reunión de coordinación: lunes 23.11, 10:00, sala 2 / Jitsi',
}
const DISC = { ARQ: '#8a6d1d', EST: '#5b5f97', MEP: '#1f7a62' }
const N = 'n'; void N

// ── Common shell ─────────────────────────────────────────────────────────────
function shell({ title, preheader, css, body, bg, bgDark }) {
  return `<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body{margin:0;padding:0;background:${bg};-webkit-text-size-adjust:100%}
table{border-collapse:collapse}img{border:0;display:block;outline:none}
a{color:inherit}
.tab{font-variant-numeric:tabular-nums}
@media (max-width:620px){.w{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.st{display:block!important;width:100%!important}.hide-m{display:none!important}.img{width:100%!important;height:auto!important}}
${css}
@media (prefers-color-scheme:dark){body,.bg{background:${bgDark}!important}}
</style></head>
<body class="bg" style="margin:0;background:${bg}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" class="bg" style="background:${bg}"><tr><td align="center">
<!--[if mso]><table role="presentation" width="640"><tr><td><![endif]-->
${body}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`
}

const pre = `Semana ${D.week}: 37 colisiones abiertas (−12), Health Score ${D.health}. Lo que toca antes del 20.11.`

// ── A · Editorial ─────────────────────────────────────────────────────────────
function dirA() {
  const serif = `Georgia,'Times New Roman',Times,serif`
  const sans = `Arial,Helvetica,sans-serif`
  const ink = '#1c1b16', mute = '#65635e', line = '#d9d4c8', paper = '#f7f4ee', acc = '#00696a'
  const css = `
.a-ink{color:${ink}}.a-mute{color:${mute}}.a-line{border-color:${line}!important}.a-acc{color:${acc}}.a-paper{background:${paper}}
@media (prefers-color-scheme:dark){.a-ink{color:#ecebe7!important}.a-mute{color:#a7a59f!important}.a-line{border-color:#3a3833!important}.a-acc{color:#55cac3!important}.a-paper{background:#161512!important}}
@media (max-width:620px){.a-h1{font-size:34px!important;line-height:38px!important}}`
  const sec = (n, t) => `<tr><td class="px a-line" style="padding:44px 48px 0;border-top:1px solid ${line}">
<p class="a-acc" style="margin:0 0 6px;font:12px/16px ${sans};letter-spacing:.14em;text-transform:uppercase">${n}</p>
<h2 class="a-ink" style="margin:0;font:400 26px/32px ${serif}">${t}</h2></td></tr>`
  const body = `<table role="presentation" width="640" class="w a-paper" style="width:640px;background:${paper}">
<tr><td class="px" style="padding:28px 48px 0">
 <table role="presentation" width="100%"><tr>
 <td class="a-mute" style="font:11px/16px ${sans};letter-spacing:.12em;text-transform:uppercase">Nº ${D.issue} · Semana ${D.week}</td>
 <td align="right" class="a-mute" style="font:11px/16px ${sans};letter-spacing:.12em;text-transform:uppercase">${D.range}</td></tr></table>
</td></tr>
<tr><td class="px" style="padding:26px 48px 4px" align="center">
 <p class="a-ink" style="margin:0;font:400 54px/56px ${serif};letter-spacing:-.01em">${D.pub}</p>
 <p class="a-mute" style="margin:8px 0 0;font:italic 15px/20px ${serif}">${D.pubSub} · ${D.project}</p>
</td></tr>
<tr><td class="px" style="padding:22px 48px 0"><table role="presentation" width="100%"><tr><td class="a-line" style="border-top:3px double ${line};font-size:0;line-height:0">&nbsp;</td></tr></table>
 <p class="a-mute" style="margin:10px 0 0;font:11px/16px ${sans};letter-spacing:.12em;text-transform:uppercase;text-align:center">Para: ${D.audience}</p></td></tr>
<tr><td class="px" style="padding:40px 48px 8px">
 <h1 class="a-ink a-h1" style="margin:0;font:400 40px/46px ${serif};letter-spacing:-.01em">Doce colisiones menos, y el saneamiento aún en la viga</h1>
 <p class="a-ink" style="margin:20px 0 0;font:18px/29px ${serif}">${D.lede}</p>
 <p class="a-mute" style="margin:18px 0 0;font:13px/18px ${sans}">— ${D.editor}, ${D.role}</p>
</td></tr>
<tr><td style="padding:32px 0 0"><img class="img" src="capture-model.jpg" width="640" height="300" alt="${D.caption}" style="width:640px;height:300px"></td></tr>
<tr><td class="px" style="padding:10px 48px 0"><p class="a-mute" style="margin:0;font:italic 13px/19px ${serif}">${D.caption}. <a class="a-acc" href="#" style="font-style:normal;text-decoration:underline">Abrir esta vista</a></p></td></tr>
<tr><td style="height:44px"></td></tr>
${sec('01 · Estado', 'El modelo, en tres cifras')}
<tr><td class="px" style="padding:22px 48px 8px"><table role="presentation" width="100%"><tr>
${D.kpis.map((k, i) => `<td class="st" valign="top" width="33%" style="padding:0 ${i < 2 ? 16 : 0}px 16px 0">
<p class="a-ink tab" style="margin:0;font:400 38px/42px ${serif}">${k.v}</p>
<p class="a-mute" style="margin:6px 0 0;font:13px/18px ${sans}">${k.k}${k.d ? ` <span class="a-acc">${k.d}</span>` : ''}</p></td>`).join('')}
</tr></table>
<p class="a-mute" style="margin:6px 0 32px;font:13px/19px ${sans}">Health Score <b class="a-ink tab">${D.health}</b> (antes ${D.healthPrev}), medido con ${D.ids} sobre el federado ${D.rev}.</p></td></tr>
${sec('02 · Colisiones', 'Dónde se concentra el trabajo')}
<tr><td class="px" style="padding:18px 48px 32px">
${D.clashes.map(c => `<table role="presentation" width="100%"><tr>
<td class="a-line" style="padding:14px 0;border-bottom:1px solid ${line}"><p class="a-ink" style="margin:0;font:17px/24px ${serif}">${c.a} × ${c.b} <span class="a-mute tab" style="font:13px ${sans}">&nbsp;${c.prev} → </span><b class="tab" style="font:700 17px ${sans}">${c.open}</b></p>
<p class="a-mute" style="margin:2px 0 0;font:13px/18px ${sans}">${c.owner} · antes del ${c.due}</p></td></tr></table>`).join('')}
</td></tr>
${sec('03 · Qué te toca', 'Antes de la revisión del lunes 23')}
<tr><td class="px" style="padding:18px 48px 32px">
${D.actions.map(a => `<p class="a-ink" style="margin:0 0 16px;font:17px/26px ${serif}"><b style="font-family:${sans};font-size:14px">${a.who}.</b> ${a.what}. <span class="a-acc" style="font:13px ${sans};white-space:nowrap">${a.due}</span></p>`).join('')}
</td></tr>
${sec('04 · Versiones', 'Lo que ha cambiado esta semana')}
<tr><td class="px" style="padding:18px 48px 40px">
${D.versions.map(v => `<p class="a-ink" style="margin:0 0 14px;font:16px/24px ${serif}"><span class="a-mute" style="font:11px ${sans};letter-spacing:.1em">${v.disc}&nbsp;&nbsp;${v.from}→${v.to}</span><br>${v.note}</p>`).join('')}
</td></tr>
<tr><td class="px" align="center" style="padding:0 48px 48px">
<a href="#" style="display:inline-block;background:${acc};color:#ffffff;font:700 15px/20px ${sans};padding:14px 28px;text-decoration:none">Abrir el federado P05</a>
<p class="a-mute" style="margin:16px 0 0;font:13px/18px ${sans}">${D.next}</p></td></tr>
<tr><td class="px a-line" style="padding:20px 48px 32px;border-top:1px solid ${line}"><p class="a-mute" style="margin:0;font:11px/17px ${sans}">${D.project} · ${D.phase} · Rev. ${D.rev} · ${D.date} · ${D.code}<br>Lo recibes como agente del proyecto. <a href="#" style="text-decoration:underline">Darte de baja</a></p></td></tr>
</table>`
  return shell({ title: `${D.pub} Nº ${D.issue}`, preheader: pre, css, body, bg: '#ebe7df', bgDark: '#0d0c0a' })
}

// ── B · Técnica / plano ───────────────────────────────────────────────────────
function dirB() {
  const mono = `Consolas,Menlo,'DejaVu Sans Mono',monospace`
  const sans = `Arial,Helvetica,sans-serif`
  const ink = '#1c1b16', mute = '#5d5b56', line = '#1c1b16', hair = '#c9c7c1', paper = '#fefdfc', acc = '#00696a'
  const css = `
.b-ink{color:${ink}}.b-mute{color:${mute}}.b-line{border-color:${line}!important}.b-hair{border-color:${hair}!important}.b-acc{color:${acc}}.b-paper{background:${paper}}.b-band{background:#f1f0ec}
@media (prefers-color-scheme:dark){.b-ink{color:#ecebe7!important}.b-mute{color:#a2a09a!important}.b-line{border-color:#8f8d87!important}.b-hair{border-color:#3a3833!important}.b-acc{color:#55cac3!important}.b-paper{background:#15140f!important}.b-band{background:#1e1d19!important}}`
  const axes = ['A', 'B', 'C', 'D', 'E', 'F']
  const tag = d => `<span style="display:inline-block;border:1px solid ${DISC[d]};color:${DISC[d]};font:700 10px/14px ${mono};padding:0 4px">${d}</span>`
  const head = (n, t) => `<tr><td class="px" style="padding:30px 32px 10px"><table role="presentation" width="100%"><tr>
<td width="34" valign="top"><span class="b-ink b-line" style="display:inline-block;width:22px;height:22px;border:1px solid ${line};border-radius:50%;text-align:center;font:700 11px/22px ${mono}">${n}</span></td>
<td class="b-ink" style="font:700 12px/22px ${mono};letter-spacing:.08em;text-transform:uppercase">${t}</td></tr></table></td></tr>`
  const body = `<table role="presentation" width="640" class="w b-paper b-line" style="width:640px;background:${paper};border:1px solid ${line}">
<tr><td class="hide-m b-hair" style="border-bottom:1px solid ${hair}"><table role="presentation" width="100%"><tr>${axes.map(a => `<td class="b-mute b-hair" align="center" style="font:10px/18px ${mono};border-left:1px solid ${hair}">${a}</td>`).join('')}</tr></table></td></tr>
<tr><td class="px" style="padding:26px 32px 22px"><table role="presentation" width="100%"><tr>
 <td valign="bottom"><p class="b-mute" style="margin:0;font:11px/16px ${mono};letter-spacing:.06em">${D.pubSub.toUpperCase()}</p>
 <p class="b-ink" style="margin:4px 0 0;font:700 30px/34px ${sans};letter-spacing:-.01em">${D.pub}</p></td>
 <td valign="bottom" align="right" class="b-ink" style="font:12px/18px ${mono}">Nº ${String(D.issue).padStart(3, '0')}<br>S${D.week} · ${D.range}</td></tr></table></td></tr>
<tr><td class="b-line" style="border-top:2px solid ${line}"></td></tr>
<tr><td class="px b-band" style="padding:10px 32px;background:#f1f0ec"><span class="b-mute" style="font:11px/16px ${mono}">PARA&nbsp;&nbsp;</span><span class="b-ink" style="font:700 11px/16px ${mono}">${D.audience.toUpperCase()}</span><span class="b-mute" style="font:11px/16px ${mono}">&nbsp;&nbsp;·&nbsp;&nbsp;DE&nbsp;&nbsp;</span><span class="b-ink" style="font:11px/16px ${mono}">${D.editor.toUpperCase()}</span></td></tr>
<tr><td class="px" style="padding:26px 32px 4px">
 <h1 class="b-ink" style="margin:0;font:700 24px/30px ${sans}">37 colisiones abiertas (−12). Saneamiento × vigas PB sigue crítico.</h1>
 <p class="b-ink" style="margin:12px 0 0;font:15px/23px ${sans}">${D.lede}</p></td></tr>
${head(1, 'Estado del federado ' + D.rev)}
<tr><td class="px" style="padding:0 32px"><table role="presentation" width="100%" class="b-line" style="border:1px solid ${line}"><tr>
 <td class="st b-line" width="34%" valign="top" style="padding:16px;border-right:1px solid ${line}">
  <p class="b-mute" style="margin:0;font:10px/14px ${mono};letter-spacing:.08em">HEALTH SCORE</p>
  <p class="b-ink tab" style="margin:6px 0 0;font:700 44px/46px ${mono}">${D.health}</p>
  <p class="b-acc tab" style="margin:4px 0 0;font:12px/16px ${mono}">▲ ${D.health - D.healthPrev} vs S${D.week - 1}</p>
  <p class="b-mute" style="margin:8px 0 0;font:10px/14px ${mono}">${D.ids}<br>${D.reqs} req · ${String(D.pass).replace('.', ',')} % ok</p></td>
 <td class="st" valign="top" style="padding:0">
 ${D.kpis.map((k, i) => `<table role="presentation" width="100%"><tr><td class="b-hair" style="padding:10px 16px;${i ? `border-top:1px solid ${hair}` : ''}">
  <span class="b-mute" style="font:11px/16px ${mono}">${k.k.toUpperCase()}</span></td><td align="right" class="b-ink tab" style="padding:10px 16px;font:700 16px/18px ${mono};white-space:nowrap">${k.v} <span class="b-acc" style="font-weight:400;font-size:12px">${k.d}</span></td></tr></table>`).join('')}
 </td></tr></table></td></tr>
${head(2, 'Colisiones por pareja de disciplinas')}
<tr><td class="px" style="padding:0 32px"><table role="presentation" width="100%">
<tr>${['Pareja', 'S45', 'S46', 'Responsable', 'Límite'].map((h, i) => `<td class="b-mute b-line ${i === 3 ? 'hide-m' : ''}" ${i && i !== 3 ? 'align="right"' : ''} style="padding:6px 0 6px ${i === 3 ? 16 : 0}px;border-bottom:1px solid ${line};font:10px/14px ${mono};letter-spacing:.08em">${h.toUpperCase()}</td>`).join('')}</tr>
${D.clashes.map(c => `<tr><td class="b-hair" style="padding:10px 0;border-bottom:1px solid ${hair}">${tag(c.a)} ${tag(c.b)}</td>
<td align="right" class="b-mute tab b-hair" style="border-bottom:1px solid ${hair};font:13px ${mono}">${c.prev}</td>
<td align="right" class="b-ink tab b-hair" style="border-bottom:1px solid ${hair};font:700 13px ${mono}">${c.open}</td>
<td class="b-ink hide-m b-hair" style="padding-left:16px;border-bottom:1px solid ${hair};font:12px ${sans}">${c.owner}</td>
<td align="right" class="b-ink tab b-hair" style="border-bottom:1px solid ${hair};font:13px ${mono}">${c.due}</td></tr>`).join('')}
</table></td></tr>
${head(3, 'Vista del modelo')}
<tr><td class="px" style="padding:0 32px"><img class="img b-line" src="capture-model.jpg" width="574" height="269" alt="${D.caption}" style="width:574px;height:269px;border:1px solid ${line}">
<table role="presentation" width="100%"><tr><td class="b-mute" style="padding:6px 0 0;font:10px/15px ${mono}">${D.caption.toUpperCase()}</td><td class="b-ink" align="right" valign="top" style="padding:6px 0 0;font:700 10px/15px ${mono};white-space:nowrap">N ↑ &nbsp;<a class="b-acc" href="#">ABRIR VISTA →</a></td></tr></table></td></tr>
${head(4, 'Acciones · responsable · fecha')}
<tr><td class="px" style="padding:0 32px">${D.actions.map((a, i) => `<table role="presentation" width="100%"><tr>
<td width="34" valign="top" class="b-mute" style="padding:10px 0;font:12px/20px ${mono}">4.${i + 1}</td>
<td valign="top" class="b-hair" style="padding:10px 0;border-bottom:1px solid ${hair}"><p class="b-ink" style="margin:0;font:14px/20px ${sans}">${a.what}</p><p class="b-mute" style="margin:2px 0 0;font:12px/16px ${sans}">${a.who}</p></td>
<td valign="top" align="right" class="b-ink b-hair" style="padding:10px 0 10px 12px;border-bottom:1px solid ${hair};font:700 12px/20px ${mono};white-space:nowrap">${a.due}</td></tr></table>`).join('')}</td></tr>
${head(5, 'Registro de versiones')}
<tr><td class="px" style="padding:0 32px">${D.versions.map(v => `<p style="margin:0 0 12px">${tag(v.disc)} <span class="b-ink" style="font:12px ${mono}">${v.file}</span> <span class="b-mute" style="font:12px ${mono}">${v.from}→</span><b class="b-ink" style="font:700 12px ${mono}">${v.to}</b><br><span class="b-ink" style="font:13px/19px ${sans}">${v.note}</span></p>`).join('')}</td></tr>
<tr><td class="px" style="padding:20px 32px 30px"><a href="#" style="display:inline-block;background:${acc};color:#ffffff;font:700 13px/18px ${mono};padding:12px 20px;text-decoration:none;letter-spacing:.04em">ABRIR FEDERADO ${D.rev} →</a></td></tr>
<tr><td class="b-line" style="border-top:2px solid ${line}"><table role="presentation" width="100%">
<tr>${[['Proyecto', D.project], ['Fase', D.phase], ['Rev.', D.rev]].map(([k, v], i) => `<td class="st b-line" valign="top" style="padding:8px 12px;${i ? `border-left:1px solid ${line};` : ''}"><p class="b-mute" style="margin:0;font:9px/12px ${mono}">${k.toUpperCase()}</p><p class="b-ink" style="margin:2px 0 0;font:11px/15px ${mono}">${v}</p></td>`).join('')}</tr>
<tr>${[['Autor', D.editor], ['Fecha', D.date], ['Código', D.code]].map(([k, v], i) => `<td class="st b-line" valign="top" style="padding:8px 12px;border-top:1px solid ${line};${i ? `border-left:1px solid ${line};` : ''}"><p class="b-mute" style="margin:0;font:9px/12px ${mono}">${k.toUpperCase()}</p><p class="b-ink" style="margin:2px 0 0;font:11px/15px ${mono}">${v}</p></td>`).join('')}</tr>
</table></td></tr>
<tr><td class="px b-line" style="padding:12px 32px;border-top:1px solid ${line}"><p class="b-mute" style="margin:0;font:10px/15px ${mono}">${D.next} · <a href="#">Baja</a></p></td></tr>
</table>`
  return shell({ title: `${D.pub} Nº ${D.issue}`, preheader: pre, css, body, bg: '#e9e8e4', bgDark: '#0b0a08' })
}

// ── C · Ejecutiva / informe anual ─────────────────────────────────────────────
function dirC() {
  const sans = `'Helvetica Neue',Helvetica,Arial,sans-serif`
  const ink = '#1c1b16', mute = '#65635e', line = '#e3e1dc', paper = '#ffffff', acc = '#00696a', dark = '#1c1b16'
  const css = `
.c-ink{color:${ink}}.c-mute{color:${mute}}.c-line{border-color:${line}!important}.c-acc{color:${acc}}.c-paper{background:${paper}}
@media (prefers-color-scheme:dark){.c-ink{color:#ecebe7!important}.c-mute{color:#a7a59f!important}.c-line{border-color:#34332e!important}.c-acc{color:#55cac3!important}.c-paper{background:#181714!important}.c-band{background:#0f0e0c!important}}
@media (max-width:620px){.c-big{font-size:72px!important;line-height:72px!important}}`
  const bar = (v, max) => `<table role="presentation" width="100%"><tr><td style="background:${acc};height:6px;font-size:0;line-height:0" width="${Math.round(v / max * 100)}%">&nbsp;</td><td class="c-line" style="border-bottom:1px solid ${line};font-size:0">&nbsp;</td></tr></table>`
  const body = `<table role="presentation" width="640" class="w c-paper" style="width:640px;background:${paper}">
<tr><td class="px c-band" style="padding:22px 40px;background:${dark}"><table role="presentation" width="100%"><tr>
<td style="color:#ecebe7;font:700 15px/20px ${sans};letter-spacing:.02em">${D.pub}</td>
<td align="right" style="color:#a7a59f;font:12px/20px ${sans}">Informe semanal · Nº ${D.issue} · ${D.range}</td></tr></table></td></tr>
<tr><td class="px" style="padding:44px 40px 8px">
<p class="c-mute" style="margin:0;font:13px/18px ${sans}">Para ${D.audience.charAt(0).toLowerCase() + D.audience.slice(1)} · ${D.project}</p>
<table role="presentation" width="100%" style="margin-top:18px"><tr>
<td class="st" valign="bottom" width="52%"><p class="c-ink c-big tab" style="margin:0;font:300 96px/90px ${sans};letter-spacing:-.04em">${D.health}</p>
<p class="c-mute" style="margin:10px 0 0;font:13px/18px ${sans}">Health Score del federado ${D.rev}<br><span class="c-acc">+${D.health - D.healthPrev} respecto a la semana ${D.week - 1}</span></p></td>
<td class="st" valign="bottom" style="padding-top:20px"><p class="c-ink" style="margin:0;font:400 19px/27px ${sans}">Doce colisiones menos esta semana. El único punto crítico es el saneamiento bajo las vigas de planta baja, con fecha el 20.11.</p></td>
</tr></table></td></tr>
<tr><td class="px" style="padding:36px 40px 0"><table role="presentation" width="100%" class="c-line" style="border-top:1px solid ${line}"><tr>
${D.kpis.map((k, i) => `<td class="st c-line" valign="top" width="33%" style="padding:18px ${i < 2 ? 18 : 0}px 18px 0">
<p class="c-ink tab" style="margin:0;font:300 34px/38px ${sans};letter-spacing:-.02em">${k.v}</p>
<p class="c-mute" style="margin:6px 0 0;font:12px/16px ${sans}">${k.k}${k.d ? ` · <span class="c-acc">${k.d}</span>` : ''}</p></td>`).join('')}
</tr></table></td></tr>
<tr><td style="padding:24px 0 0"><img class="img" src="capture-model.jpg" width="640" height="300" alt="${D.caption}" style="width:640px;height:300px"></td></tr>
<tr><td class="px" style="padding:8px 40px 0"><p class="c-mute" style="margin:0;font:12px/17px ${sans}">${D.caption}</p></td></tr>
<tr><td class="px" style="padding:40px 40px 0"><p class="c-ink" style="margin:0 0 16px;font:700 13px/18px ${sans};letter-spacing:.06em;text-transform:uppercase">Colisiones abiertas por pareja</p>
${D.clashes.map(c => `<table role="presentation" width="100%" style="margin-bottom:14px"><tr><td class="c-ink" style="font:14px/20px ${sans}">${c.a} × ${c.b}</td><td align="right" class="c-ink tab" style="font:700 14px/20px ${sans}">${c.open} <span class="c-mute" style="font-weight:400">de ${c.prev}</span></td></tr><tr><td colspan="2" style="padding-top:6px">${bar(c.open, 27)}</td></tr></table>`).join('')}
</td></tr>
<tr><td class="px" style="padding:30px 40px 0"><p class="c-ink" style="margin:0 0 6px;font:700 13px/18px ${sans};letter-spacing:.06em;text-transform:uppercase">Decisiones y entregas pendientes</p>
${D.actions.map(a => `<table role="presentation" width="100%"><tr><td class="c-line" style="padding:12px 0;border-bottom:1px solid ${line}"><p class="c-ink" style="margin:0;font:15px/21px ${sans}">${a.what}</p><p class="c-mute" style="margin:2px 0 0;font:12px/16px ${sans}">${a.who}</p></td><td align="right" valign="top" class="c-ink tab c-line" style="padding:12px 0 12px 16px;border-bottom:1px solid ${line};font:700 13px/21px ${sans};white-space:nowrap">${a.due}</td></tr></table>`).join('')}
</td></tr>
<tr><td class="px" style="padding:32px 40px 0"><table role="presentation" width="100%"><tr><td>
<a href="#" style="display:inline-block;background:${acc};color:#ffffff;font:700 14px/20px ${sans};padding:13px 24px;text-decoration:none;border-radius:2px">Ver el modelo y el detalle</a></td></tr></table>
<p class="c-mute" style="margin:14px 0 0;font:13px/18px ${sans}">${D.next}</p></td></tr>
<tr><td class="px" style="padding:36px 40px 0"><table role="presentation" width="100%" class="c-line" style="border-top:1px solid ${line}"><tr><td style="padding:16px 0"><p class="c-ink" style="margin:0;font:700 14px/20px ${sans}">${D.editor}</p><p class="c-mute" style="margin:0;font:13px/18px ${sans}">${D.role}</p></td></tr></table></td></tr>
<tr><td class="px c-line" style="padding:16px 40px 30px;border-top:1px solid ${line}"><p class="c-mute" style="margin:0;font:11px/17px ${sans}">${D.code} · ${D.phase} · Rev. ${D.rev} · ${D.date}<br><a href="#" style="text-decoration:underline">Darte de baja</a></p></td></tr>
</table>`
  return shell({ title: `${D.pub} · Informe Nº ${D.issue}`, preheader: pre, css, body, bg: '#f1f0ec', bgDark: '#0b0a08' })
}

// ── Build + screenshots ──────────────────────────────────────────────────────
const out = join(here, 'shots'); mkdirSync(out, { recursive: true })
const exe = process.env.CHROME || "C:/Users/joelb/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
const browser = await chromium.launch({ executablePath: exe })
// Crop the landing capture to the model only (neutral background, no app chrome).
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 600 } })
  const src = 'data:image/jpeg;base64,' + readFileSync(join(here, 'capture.jpg')).toString('base64')
  const b64 = await p.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode()
    const c = document.createElement('canvas'); c.width = 1280; c.height = 600
    c.getContext('2d').drawImage(img, 535, 112, 939, 440, 0, 0, 1280, 600)
    return c.toDataURL('image/jpeg', 0.82).split(',')[1]
  }, src)
  writeFileSync(join(here, 'capture-model.jpg'), Buffer.from(b64, 'base64'))
  await p.close()
}
for (const [k, fn] of [['a-editorial', dirA], ['b-plano', dirB], ['c-ejecutiva', dirC]]) {
  const file = join(here, `${k}.html`); const html = fn(); writeFileSync(file, html)
  console.log(k, (Buffer.byteLength(html) / 1024).toFixed(1), 'KB')
  for (const [tag, w, scheme] of [['desktop', 760, 'light'], ['mobile', 375, 'light'], ['dark', 760, 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, deviceScaleFactor: tag === 'mobile' ? 2 : 1 })
    const page = await ctx.newPage(); await page.goto(pathToFileURL(file).href)
    await page.screenshot({ path: join(out, `${k}-${tag}.png`), fullPage: true }); await ctx.close()
  }
}
await browser.close()
