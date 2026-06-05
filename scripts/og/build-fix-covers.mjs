// Build localized fix-category cover images (1200×630) for IFC fix guide pages.
//
// One card per category × language — shows the localized category name, a short
// description in the target language, the "IFC Fix Guide" badge, and tool logos.
//
// Output: public/fix/covers/<lang>/<category>.png
//
// Usage:
//   node scripts/og/build-fix-covers.mjs                     # all 10 langs × 8 cats
//   node scripts/og/build-fix-covers.mjs --lang en es de fr  # specific languages
//   node scripts/og/build-fix-covers.mjs --cat schema mep    # specific categories

import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const W = 1200, H = 630
const log = (...a) => console.log('[fix-covers]', ...a)

// ── Languages ─────────────────────────────────────────────────────────────────
const ALL_LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
const ALL_CATS  = ['schema', 'spatial', 'quality', 'classification', 'lod', 'iso19650', 'mep', 'clash']

// CJK / Thai languages that need Noto fonts
const NOTO = {
  zh: { family: 'Noto Sans SC', param: 'Noto+Sans+SC:wght@400;500;700;800' },
  ja: { family: 'Noto Sans JP', param: 'Noto+Sans+JP:wght@400;500;700;800' },
  th: { family: 'Noto Sans Thai', param: 'Noto+Sans+Thai:wght@400;500;700;800' },
}

// ── Category colors ────────────────────────────────────────────────────────────
const CAT_COLORS = {
  schema:         { color: '#f87171', glow: '248,113,113' },
  spatial:        { color: '#fb923c', glow: '251,146,60' },
  quality:        { color: '#34d399', glow: '52,211,153' },
  classification: { color: '#c084fc', glow: '192,132,252' },
  lod:            { color: '#67d7f0', glow: '103,215,240' },
  iso19650:       { color: '#818cf8', glow: '129,140,248' },
  mep:            { color: '#4aeabd', glow: '74,234,189' },
  clash:          { color: '#fbbf24', glow: '251,191,36' },
}

// Category SVG icons (same as build-fix-covers original)
function catIcon(key, color) {
  const sw = '1.6'
  const icons = {
    schema: `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>`,
    spatial: `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/>
      <line x1="6.5" y1="10" x2="6.5" y2="14"/>
      <line x1="17.5" y1="10" x2="17.5" y2="14"/>
      <line x1="10" y1="17.5" x2="14" y2="17.5"/>
    </svg>`,
    quality: `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>`,
    classification: `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
    </svg>`,
    lod: `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="14" width="4" height="8"/><rect x="9" y="10" width="4" height="12"/>
      <rect x="16" y="4" width="4" height="18"/>
      <line x1="1" y1="22" x2="23" y2="22"/>
    </svg>`,
    iso19650: `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>`,
    mep: `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 12h6l2-5 4 10 2-5h6"/>
    </svg>`,
    clash: `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>`,
  }
  return icons[key] || icons['schema']
}

// ── Translations ───────────────────────────────────────────────────────────────

// "IFC FIX GUIDE" badge
const BADGE = {
  en: 'IFC FIX GUIDE',
  es: 'GUÍA DE CORRECCIÓN IFC',
  de: 'IFC-KORREKTURANLEITUNG',
  fr: 'GUIDE DE CORRECTION IFC',
  pt: 'GUIA DE CORREÇÃO IFC',
  it: 'GUIDA DI CORREZIONE IFC',
  ca: 'GUIA DE CORRECCIÓ IFC',
  zh: 'IFC 修复指南',
  ja: 'IFC 修正ガイド',
  th: 'คู่มือแก้ไข IFC',
}

// "38 validation rules" chip
const RULES_LABEL = {
  en: '38 validation rules',
  es: '38 reglas de validación',
  de: '38 Prüfregeln',
  fr: '38 règles de validation',
  pt: '38 regras de validação',
  it: '38 regole di validazione',
  ca: '38 regles de validació',
  zh: '38 条验证规则',
  ja: '38 の検証ルール',
  th: '38 กฎตรวจสอบ',
}

// Category descriptions per lang (2 lines)
const DESCS = {
  schema: {
    en: ['Fix GUID, structural, and IFC schema compliance errors', 'that break downstream tools and CDE delivery.'],
    es: ['Corrige errores de GUID, estructurales y de conformidad', 'de esquema IFC que rompen entregas al ECD.'],
    de: ['GUID-, Struktur- und IFC-Schema-Fehler beheben,', 'die nachgelagerte Tools und die CDE-Lieferung beschädigen.'],
    fr: ['Corrigez les erreurs de GUID, structurelles et de conformité', 'IFC qui brisent les livraisons à la GED.'],
    pt: ['Corrija erros de GUID, estruturais e de conformidade', 'do esquema IFC que quebram entregas ao ECD.'],
    it: ['Correggere errori di GUID, strutturali e di conformità', 'allo schema IFC che compromettono la consegna.'],
    ca: ['Corregiu errors de GUID, estructurals i de conformitat', "d'esquema IFC que trenquen els lliuraments."],
    zh: ['修复 GUID、结构和 IFC 架构合规错误', '确保模型可正确交付和下游工具使用。'],
    ja: ['GUID・構造・IFCスキーマ適合エラーを修正し', 'CDEへの納品とダウンストリームツールを保護します。'],
    th: ['แก้ไขข้อผิดพลาด GUID โครงสร้าง และ IFC Schema', 'เพื่อให้ส่งมอบงานและใช้เครื่องมือต่อได้ถูกต้อง'],
  },
  spatial: {
    en: ['Repair orphan elements, wrong containers, and broken', 'spatial hierarchies (Project → Site → Building → Storey).'],
    es: ['Repara elementos huérfanos, contenedores incorrectos', 'y jerarquías espaciales rotas (Proyecto → Edificio → Planta).'],
    de: ['Verwaiste Elemente, falsche Container und defekte', 'räumliche Hierarchien reparieren.'],
    fr: ['Réparez les éléments orphelins, les conteneurs incorrects', 'et les hiérarchies spatiales brisées.'],
    pt: ['Repare elementos órfãos, contêineres incorretos e', 'hierarquias espaciais quebradas.'],
    it: ['Riparare elementi orfani, contenitori errati e', 'gerarchie spaziali interrotte.'],
    ca: ['Repareu elements orfes, contenidors incorrectes', 'i jerarquies espacials trencades.'],
    zh: ['修复孤立元素、错误容器和空间层级问题', '（项目→场地→建筑→楼层）。'],
    ja: ['孤立要素・誤ったコンテナ・空間階層の不具合を修正', '（プロジェクト→敷地→建物→フロア）。'],
    th: ['แก้ไของค์ประกอบกำพร้า คอนเทนเนอร์ผิดพลาด', 'และลำดับชั้นพื้นที่ที่เสียหาย'],
  },
  quality: {
    en: ['Fix empty names, missing property sets, and proxy overuse', 'that reduce model usefulness for coordination and FM.'],
    es: ['Corrige nombres vacíos, property sets faltantes', 'y exceso de proxies que reducen la utilidad del modelo.'],
    de: ['Leere Namen, fehlende Property-Sets und Proxy-Übernutzung', 'beheben, die die Modellqualität verringern.'],
    fr: ['Corrigez les noms vides, property sets manquants', 'et la sur-utilisation de proxies.'],
    pt: ['Corrija nomes vazios, property sets ausentes', 'e excesso de proxies.'],
    it: ['Correggere nomi vuoti, property set mancanti', 'e sovrautilizzo di proxy.'],
    ca: ['Corregiu noms buits, property sets mancants', 'i excés de proxies.'],
    zh: ['修复空名称、缺失属性集和代理滥用', '提升模型在协调和设施管理中的可用性。'],
    ja: ['空の名称・欠損プロパティセット・プロキシ多用を修正し', 'モデルの調整・FM活用度を高めます。'],
    th: ['แก้ไขชื่อว่าง ชุดคุณสมบัติที่หายไป', 'และการใช้ proxy มากเกินไป'],
  },
  classification: {
    en: ['Add or repair IfcRelAssociatesClassification and ensure', 'elements are mapped to the agreed classification system.'],
    es: ['Añade o repara IfcRelAssociatesClassification para que', 'los elementos queden mapeados al sistema acordado.'],
    de: ['IfcRelAssociatesClassification hinzufügen oder reparieren', 'und Elemente dem Klassifikationssystem zuordnen.'],
    fr: ['Ajoutez ou réparez IfcRelAssociatesClassification pour', 'mapper les éléments au système de classification.'],
    pt: ['Adicione ou repare IfcRelAssociatesClassification', 'e mapeie elementos ao sistema de classificação.'],
    it: ['Aggiungere o riparare IfcRelAssociatesClassification', 'e mappare gli elementi al sistema di classificazione.'],
    ca: ['Afegiu o repareu IfcRelAssociatesClassification', 'i mapeu els elements al sistema de classificació.'],
    zh: ['添加或修复 IfcRelAssociatesClassification', '确保元素正确映射到约定的分类系统。'],
    ja: ['IfcRelAssociatesClassificationを追加・修正し', '要素を合意された分類システムにマッピングします。'],
    th: ['เพิ่มหรือซ่อมแซม IfcRelAssociatesClassification', 'เพื่อให้องค์ประกอบถูกจัดประเภทอย่างถูกต้อง'],
  },
  lod: {
    en: ['Verify element geometry and information meet the', 'Level of Detail and Level of Information requirements.'],
    es: ['Verifica que la geometría e información de los elementos', 'cumplen los requisitos de Nivel de Detalle (LOD/LOIN).'],
    de: ['Prüfen, ob Geometrie und Information der Elemente', 'den LOD- und LOIN-Anforderungen entsprechen.'],
    fr: ['Vérifiez que la géométrie et les informations', 'respectent les exigences LOD et LOIN.'],
    pt: ['Verifique se a geometria e informações dos elementos', 'atendem aos requisitos LOD/LOIN.'],
    it: ['Verificare che la geometria e le informazioni', 'rispettino i requisiti LOD/LOIN.'],
    ca: ['Verifiqueu que la geometria i la informació', 'compleixen els requisits LOD/LOIN.'],
    zh: ['验证元素几何和信息满足', '详细程度（LOD）和信息程度（LOIN）要求。'],
    ja: ['要素の形状と情報がLOD・LOIN要求を', '満たしているか検証します。'],
    th: ['ตรวจสอบว่าเรขาคณิตและข้อมูลขององค์ประกอบ', 'เป็นไปตามข้อกำหนด LOD และ LOIN'],
  },
  iso19650: {
    en: ['Meet ISO 19650-2 information requirements: file naming,', 'IfcProject metadata, and FILE_NAME author/organisation.'],
    es: ['Cumple los requisitos ISO 19650-2: nombre de archivo,', 'metadatos de IfcProject y autor en FILE_NAME.'],
    de: ['ISO-19650-2-Anforderungen erfüllen: Dateiname,', 'IfcProject-Metadaten und FILE_NAME-Autor.'],
    fr: ['Respectez ISO 19650-2 : nommage de fichier,', 'métadonnées IfcProject et auteur FILE_NAME.'],
    pt: ['Atenda aos requisitos ISO 19650-2: nomenclatura,', 'metadados IfcProject e autor em FILE_NAME.'],
    it: ['Soddisfare i requisiti ISO 19650-2: nomenclatura,', 'metadati IfcProject e autore FILE_NAME.'],
    ca: ['Compliu els requisits ISO 19650-2: nomenclatura,', 'metadades IfcProject i autor a FILE_NAME.'],
    zh: ['满足 ISO 19650-2 信息要求：文件命名、', 'IfcProject 元数据和 FILE_NAME 作者/机构。'],
    ja: ['ISO 19650-2要求を満たす：ファイル命名、', 'IfcProjectメタデータ、FILE_NAME著者/組織。'],
    th: ['ปฏิบัติตามข้อกำหนด ISO 19650-2', 'การตั้งชื่อไฟล์ ข้อมูล IfcProject และ FILE_NAME'],
  },
  mep: {
    en: ['Fix missing IfcSystem assignments and MEP element', 'classification to enable reliable federated coordination.'],
    es: ['Corrige asignaciones de IfcSystem faltantes y clasificación', 'de elementos MEP para coordinación federada fiable.'],
    de: ['Fehlende IfcSystem-Zuweisungen und MEP-Element-', 'Klassifikation für zuverlässige Koordination beheben.'],
    fr: ['Corrigez les affectations IfcSystem manquantes et la', 'classification MEP pour une coordination fédérée fiable.'],
    pt: ['Corrija atribuições IfcSystem ausentes e classificação', 'de elementos MEP para coordenação federada.'],
    it: ['Correggere le assegnazioni IfcSystem mancanti', 'e la classificazione MEP per la coordinazione.'],
    ca: ['Corregiu assignacions IfcSystem mancants i classificació', 'MEP per a una coordinació federada fiable.'],
    zh: ['修复缺失的 IfcSystem 分配和 MEP 元素分类', '以实现可靠的联合协调。'],
    ja: ['IfcSystemへの割り当て不足とMEP要素分類を修正し', '連合モデルの信頼性ある協調を実現します。'],
    th: ['แก้ไขการกำหนด IfcSystem ที่หายไป', 'และการจำแนก MEP เพื่อการประสานงานที่เชื่อถือได้'],
  },
  clash: {
    en: ['Identify and resolve geometric clashes between MEP,', 'structural, and architectural elements in federated models.'],
    es: ['Identifica y resuelve colisiones geométricas entre', 'elementos MEP, estructurales y arquitectónicos.'],
    de: ['Geometrische Kollisionen zwischen MEP-, Struktur-', 'und Architektur-Elementen erkennen und beheben.'],
    fr: ['Identifiez et résolvez les conflits géométriques entre', 'éléments MEP, structure et architecture.'],
    pt: ['Identifique e resolva conflitos geométricos entre', 'elementos MEP, estruturais e arquitetônicos.'],
    it: ['Identificare e risolvere interferenze geometriche tra', 'elementi MEP, strutturali e architettonici.'],
    ca: ['Identifiqueu i resoleu col·lisions geomètriques entre', 'elements MEP, estructurals i arquitectònics.'],
    zh: ['识别并解决 MEP、结构和建筑元素', '之间的几何碰撞。'],
    ja: ['MEP・構造・建築要素間の形状干渉を', '特定・解決します。'],
    th: ['ระบุและแก้ไขการชนกันระหว่าง', 'MEP โครงสร้าง และสถาปัตยกรรม'],
  },
}

// ── Load category names from locale files ─────────────────────────────────────
function loadCatNames(lang) {
  try {
    const v = JSON.parse(readFileSync(`src/locales/${lang}/validation.json`, 'utf8'))
    return v.catFull || {}
  } catch {
    // Fallback to English
    try {
      const v = JSON.parse(readFileSync(`src/locales/en/validation.json`, 'utf8'))
      return v.catFull || {}
    } catch { return {} }
  }
}

// ── HTML template ──────────────────────────────────────────────────────────────
function coverHtml(lang, cat) {
  const c = CAT_COLORS[cat] || CAT_COLORS['schema']
  const catNames = loadCatNames(lang)
  const catName   = catNames[cat] || cat
  const badge     = BADGE[lang]    || BADGE.en
  const rulesLbl  = RULES_LABEL[lang] || RULES_LABEL.en
  const [descL1, descL2 = ''] = DESCS[cat]?.[lang] || DESCS[cat]?.en || ['', '']

  const noto = NOTO[lang]
  const fontParam = noto
    ? `Inter:wght@400;600;700;800&family=${noto.param}`
    : 'Inter:wght@400;600;700;800'
  const fontFamily = noto ? `'${noto.family}','Inter',system-ui,sans-serif` : `'Inter',system-ui,sans-serif`

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Dynamic category name font size
  const nl = catName.length
  const nfs = nl <= 14 ? 68 : nl <= 20 ? 58 : nl <= 28 ? 48 : 40

  return `<!doctype html><html><head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${fontParam}&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:${fontFamily};background:#0A0A0C;color:#fff;position:relative}
.glow{position:absolute;inset:0;background:
  radial-gradient(820px 700px at 91% 48%, rgba(${c.glow},.18), transparent 60%),
  radial-gradient(400px 380px at 5% 85%,  rgba(${c.glow},.09), transparent 58%)}
.grid{position:absolute;inset:0;opacity:.033;
  background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
  background-size:44px 44px;
  -webkit-mask-image:radial-gradient(ellipse 80% 65% at 28% 50%,#000,transparent 80%);
  mask-image:radial-gradient(ellipse 80% 65% at 28% 50%,#000,transparent 80%)}
.wrap{position:relative;height:100%;display:flex;align-items:center;padding:52px 56px 52px 72px;gap:44px}
.left{flex:1;display:flex;flex-direction:column;min-width:0}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:26px}
.logo{width:36px;height:36px;border-radius:9px;background:#5E6AD2;display:flex;align-items:center;justify-content:center;
  box-shadow:0 5px 16px rgba(94,106,210,.5)}
.brandname{font-size:15.5px;font-weight:700;color:#7a84d8;letter-spacing:-.01em}
.badge{display:inline-flex;align-items:center;font-family:monospace;font-size:8.5px;font-weight:700;
  letter-spacing:.15em;color:${c.color};
  background:rgba(${c.glow},.10);border:1px solid rgba(${c.glow},.28);
  padding:5px 12px;border-radius:999px;width:fit-content;margin-bottom:18px}
h1{font-size:${nfs}px;line-height:1.06;font-weight:800;letter-spacing:-.03em;color:#edeef2;margin-bottom:14px}
.desc{font-size:18px;line-height:1.52;color:rgba(255,255,255,.48);margin-bottom:24px;max-width:630px}
.tools{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:0}
.tool{font-size:11px;font-weight:600;color:rgba(255,255,255,.32);
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
  padding:5px 11px;border-radius:7px}
.url{margin-top:22px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:rgba(${c.glow},.8)}
.dot{width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 7px #4ade80;flex-shrink:0}
.right{width:252px;height:252px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.icon-ring{width:230px;height:230px;border-radius:34px;
  background:rgba(${c.glow},.055);border:1px solid rgba(${c.glow},.18);
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 20px 56px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.025) inset,
             0 0 70px rgba(${c.glow},.07)}
</style>
</head><body>
<div class="glow"></div>
<div class="grid"></div>
<div class="wrap">
  <div class="left">
    <div class="brand">
      <div class="logo">
        <svg width="19" height="19" viewBox="0 0 32 32">
          <path d="M8 22 L16 8 L24 22 Z M12 22 L16 15 L20 22" stroke="white" stroke-width="1.9" fill="none"/>
        </svg>
      </div>
      <span class="brandname">IFC Viewer Online</span>
    </div>
    <div class="badge">${esc(badge)}</div>
    <h1>${esc(catName)}</h1>
    <div class="desc">${esc(descL1)}${descL2 ? '<br>' + esc(descL2) : ''}</div>
    <div class="tools">
      <span class="tool">Revit</span>
      <span class="tool">ArchiCAD</span>
      <span class="tool">Tekla</span>
      <span class="tool">Allplan</span>
      <span class="tool">${esc(rulesLbl)}</span>
    </div>
    <div class="url"><span class="dot"></span>j03rul4nd.github.io/ifc-viewer-online</div>
  </div>
  <div class="right">
    <div class="icon-ring">${catIcon(cat, c.color)}</div>
  </div>
</div>
</body></html>`
}

// ── CLI argument parsing ───────────────────────────────────────────────────────
const args = process.argv.slice(2)
const langFlag = args.indexOf('--lang')
const catFlag  = args.indexOf('--cat')

const langs = langFlag !== -1
  ? args.slice(langFlag + 1).filter(a => !a.startsWith('--') && ALL_LANGS.includes(a))
  : ALL_LANGS

const cats = catFlag !== -1
  ? args.slice(catFlag + 1).filter(a => !a.startsWith('--') && ALL_CATS.includes(a))
  : ALL_CATS

// Also support positional lang args for backwards compatibility
const positional = args.filter(a => !a.startsWith('--') && ALL_LANGS.includes(a))
const activeLangs = positional.length > 0 && langFlag === -1 ? positional : langs

// ── Main ───────────────────────────────────────────────────────────────────────
log(`Generating ${activeLangs.length} lang(s) × ${cats.length} cat(s) = ${activeLangs.length * cats.length} images`)
for (const lang of activeLangs) mkdirSync(`public/fix/covers/${lang}`, { recursive: true })

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'],
})

for (const lang of activeLangs) {
  for (const cat of cats) {
    const out = `public/fix/covers/${lang}/${cat}.png`
    try {
      const ctx  = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 })
      const page = await ctx.newPage()
      await page.setContent(coverHtml(lang, cat), { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready).catch(() => {})
      await page.waitForTimeout(300)
      await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } })
      await ctx.close()
      log(`✓  ${lang}/${cat}`)
    } catch (e) {
      log(`✗  ${lang}/${cat}:`, e.message.slice(0, 100))
    }
  }
}

await browser.close()
log(`done (${activeLangs.length * cats.length} covers)`)
