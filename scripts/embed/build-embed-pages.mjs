// Generates the localized "Embed builder" pages into public/embed/.
//   en → public/embed/index.html ; xx → public/embed/<xx>/index.html
// A no-code playground: paste a public IFC URL, tweak options, get a live preview
// plus a copy-ready <iframe> + URL — for blogs, CDE panels, Power BI, dashboards.
//
//   node scripts/embed/build-embed-pages.mjs  (runs as part of `npm run build:embed`)

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, 'public/embed')
const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
const LANG_LABEL = { en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português', it: 'Italiano', ca: 'Català', zh: '中文', ja: '日本語', th: 'ไทย' }
const SAMPLE = 'https://raw.githubusercontent.com/youshengCode/IfcSampleFiles/main/Ifc4_SampleHouse.ifc'

const T = {
  en: { title: 'Embed builder — present IFC models anywhere', desc: 'Build a copy-ready iframe to embed an interactive IFC viewer in a blog, CDE panel, Power BI report or dashboard. No code, no upload.', h1: 'Embed an IFC model anywhere', lede: 'Paste a public IFC URL, tune the look, and copy the iframe (or link). Works in blogs, CDE panels, Notion, Power BI and dashboards — the model is parsed in the visitor’s browser, nothing is uploaded.', model: 'Public IFC URL', modelHelp: 'Must be reachable over HTTPS with CORS enabled.', layout: 'Layout', accent: 'Accent colour', height: 'Height (px)', options: 'Options', optValidate: 'Run validation', optPanel: 'Open validation panel', language: 'Viewer language', auto: 'Auto', preview: 'Live preview', update: 'Update preview', linkTab: 'Link', iframeTab: 'iframe', copy: 'Copy', copied: 'Copied!', biTitle: 'Where can I paste this?', biHint: 'Anywhere that accepts an iframe or a web URL: blog/CMS embeds, a CDE document panel, Notion, Confluence, a Power BI “Web content” visual, SharePoint, or any dashboard.', langLabel: 'Language', presetMinimal: 'Minimal', presetFull: 'Full', presetKiosk: 'Kiosk', noUrl: 'Enter a valid public IFC URL to generate the embed.' },
  es: { title: 'Generador de embed — presenta modelos IFC en cualquier sitio', desc: 'Crea un iframe listo para copiar y embeber un visor IFC interactivo en un blog, panel de CDE, informe de Power BI o dashboard. Sin código, sin subidas.', h1: 'Embebe un modelo IFC en cualquier sitio', lede: 'Pega una URL pública de IFC, ajusta el aspecto y copia el iframe (o el enlace). Funciona en blogs, paneles de CDE, Notion, Power BI y dashboards — el modelo se procesa en el navegador del visitante, no se sube nada.', model: 'URL pública de IFC', modelHelp: 'Debe ser accesible por HTTPS y con CORS habilitado.', layout: 'Diseño', accent: 'Color de acento', height: 'Altura (px)', options: 'Opciones', optValidate: 'Ejecutar validación', optPanel: 'Abrir panel de validación', language: 'Idioma del visor', auto: 'Auto', preview: 'Vista previa', update: 'Actualizar vista previa', linkTab: 'Enlace', iframeTab: 'iframe', copy: 'Copiar', copied: '¡Copiado!', biTitle: '¿Dónde puedo pegar esto?', biHint: 'En cualquier sitio que acepte un iframe o una URL web: embeds de blog/CMS, un panel de documento de CDE, Notion, Confluence, un objeto visual “Contenido web” de Power BI, SharePoint o cualquier dashboard.', langLabel: 'Idioma', presetMinimal: 'Minimal', presetFull: 'Completo', presetKiosk: 'Kiosco', noUrl: 'Introduce una URL pública de IFC válida para generar el embed.' },
  de: { title: 'Embed-Generator — IFC-Modelle überall präsentieren', desc: 'Erstelle ein kopierfertiges iframe, um einen interaktiven IFC-Viewer in Blog, CDE-Panel, Power-BI-Bericht oder Dashboard einzubetten. Ohne Code, ohne Upload.', h1: 'Ein IFC-Modell überall einbetten', lede: 'Füge eine öffentliche IFC-URL ein, passe das Aussehen an und kopiere das iframe (oder den Link). Funktioniert in Blogs, CDE-Panels, Notion, Power BI und Dashboards — das Modell wird im Browser des Besuchers verarbeitet, nichts wird hochgeladen.', model: 'Öffentliche IFC-URL', modelHelp: 'Muss über HTTPS mit aktiviertem CORS erreichbar sein.', layout: 'Layout', accent: 'Akzentfarbe', height: 'Höhe (px)', options: 'Optionen', optValidate: 'Validierung ausführen', optPanel: 'Validierungspanel öffnen', language: 'Viewer-Sprache', auto: 'Auto', preview: 'Live-Vorschau', update: 'Vorschau aktualisieren', linkTab: 'Link', iframeTab: 'iframe', copy: 'Kopieren', copied: 'Kopiert!', biTitle: 'Wo kann ich das einfügen?', biHint: 'Überall, wo ein iframe oder eine Web-URL möglich ist: Blog/CMS-Embeds, ein CDE-Dokumentpanel, Notion, Confluence, ein Power-BI-„Web content“-Visual, SharePoint oder jedes Dashboard.', langLabel: 'Sprache', presetMinimal: 'Minimal', presetFull: 'Voll', presetKiosk: 'Kiosk', noUrl: 'Gib eine gültige öffentliche IFC-URL ein, um das Embed zu erzeugen.' },
  fr: { title: 'Générateur d’embed — présentez des modèles IFC partout', desc: 'Créez un iframe prêt à copier pour intégrer un visualiseur IFC interactif dans un blog, un panneau CDE, un rapport Power BI ou un tableau de bord. Sans code, sans téléversement.', h1: 'Intégrez un modèle IFC partout', lede: 'Collez une URL IFC publique, ajustez l’apparence et copiez l’iframe (ou le lien). Fonctionne dans les blogs, panneaux CDE, Notion, Power BI et tableaux de bord — le modèle est analysé dans le navigateur du visiteur, rien n’est téléversé.', model: 'URL IFC publique', modelHelp: 'Doit être accessible en HTTPS avec CORS activé.', layout: 'Disposition', accent: 'Couleur d’accent', height: 'Hauteur (px)', options: 'Options', optValidate: 'Lancer la validation', optPanel: 'Ouvrir le panneau de validation', language: 'Langue du visualiseur', auto: 'Auto', preview: 'Aperçu en direct', update: 'Mettre à jour l’aperçu', linkTab: 'Lien', iframeTab: 'iframe', copy: 'Copier', copied: 'Copié !', biTitle: 'Où puis-je le coller ?', biHint: 'Partout où un iframe ou une URL web est accepté : embeds de blog/CMS, un panneau de document CDE, Notion, Confluence, un visuel « Web content » Power BI, SharePoint ou tout tableau de bord.', langLabel: 'Langue', presetMinimal: 'Minimal', presetFull: 'Complet', presetKiosk: 'Kiosque', noUrl: 'Saisissez une URL IFC publique valide pour générer l’embed.' },
  pt: { title: 'Gerador de embed — apresente modelos IFC em qualquer lugar', desc: 'Crie um iframe pronto a copiar para incorporar um visualizador IFC interativo num blog, painel de CDE, relatório Power BI ou dashboard. Sem código, sem upload.', h1: 'Incorpore um modelo IFC em qualquer lugar', lede: 'Cole um URL público de IFC, ajuste o aspeto e copie o iframe (ou o link). Funciona em blogs, painéis de CDE, Notion, Power BI e dashboards — o modelo é processado no navegador do visitante, nada é enviado.', model: 'URL público de IFC', modelHelp: 'Tem de estar acessível por HTTPS com CORS ativado.', layout: 'Esquema', accent: 'Cor de destaque', height: 'Altura (px)', options: 'Opções', optValidate: 'Executar validação', optPanel: 'Abrir painel de validação', language: 'Idioma do visualizador', auto: 'Auto', preview: 'Pré-visualização', update: 'Atualizar pré-visualização', linkTab: 'Link', iframeTab: 'iframe', copy: 'Copiar', copied: 'Copiado!', biTitle: 'Onde posso colar isto?', biHint: 'Em qualquer lugar que aceite um iframe ou um URL web: embeds de blog/CMS, um painel de documento de CDE, Notion, Confluence, um visual “Web content” do Power BI, SharePoint ou qualquer dashboard.', langLabel: 'Idioma', presetMinimal: 'Mínimo', presetFull: 'Completo', presetKiosk: 'Quiosque', noUrl: 'Introduza um URL público de IFC válido para gerar o embed.' },
  it: { title: 'Generatore di embed — presenta modelli IFC ovunque', desc: 'Crea un iframe pronto da copiare per incorporare un viewer IFC interattivo in un blog, pannello CDE, report Power BI o dashboard. Senza codice, senza upload.', h1: 'Incorpora un modello IFC ovunque', lede: 'Incolla un URL IFC pubblico, regola l’aspetto e copia l’iframe (o il link). Funziona in blog, pannelli CDE, Notion, Power BI e dashboard — il modello viene elaborato nel browser del visitatore, non si carica nulla.', model: 'URL IFC pubblico', modelHelp: 'Deve essere raggiungibile via HTTPS con CORS abilitato.', layout: 'Layout', accent: 'Colore d’accento', height: 'Altezza (px)', options: 'Opzioni', optValidate: 'Esegui validazione', optPanel: 'Apri pannello di validazione', language: 'Lingua del viewer', auto: 'Auto', preview: 'Anteprima live', update: 'Aggiorna anteprima', linkTab: 'Link', iframeTab: 'iframe', copy: 'Copia', copied: 'Copiato!', biTitle: 'Dove posso incollarlo?', biHint: 'Ovunque accetti un iframe o un URL web: embed di blog/CMS, un pannello documento CDE, Notion, Confluence, un oggetto visivo “Web content” di Power BI, SharePoint o qualsiasi dashboard.', langLabel: 'Lingua', presetMinimal: 'Minimal', presetFull: 'Completo', presetKiosk: 'Chiosco', noUrl: 'Inserisci un URL IFC pubblico valido per generare l’embed.' },
  ca: { title: 'Generador d’embed — presenta models IFC a qualsevol lloc', desc: 'Crea un iframe a punt per copiar i incrustar un visor IFC interactiu en un blog, panell de CDE, informe de Power BI o dashboard. Sense codi, sense pujades.', h1: 'Incrusta un model IFC a qualsevol lloc', lede: 'Enganxa un URL públic d’IFC, ajusta l’aspecte i copia l’iframe (o l’enllaç). Funciona en blogs, panells de CDE, Notion, Power BI i dashboards — el model es processa al navegador del visitant, no es puja res.', model: 'URL públic d’IFC', modelHelp: 'Ha de ser accessible per HTTPS amb CORS activat.', layout: 'Disseny', accent: 'Color d’accent', height: 'Alçada (px)', options: 'Opcions', optValidate: 'Executa la validació', optPanel: 'Obre el panell de validació', language: 'Idioma del visor', auto: 'Automàtic', preview: 'Vista prèvia', update: 'Actualitza la vista prèvia', linkTab: 'Enllaç', iframeTab: 'iframe', copy: 'Copia', copied: 'Copiat!', biTitle: 'On puc enganxar-ho?', biHint: 'A qualsevol lloc que accepti un iframe o un URL web: embeds de blog/CMS, un panell de document de CDE, Notion, Confluence, un objecte visual “Web content” de Power BI, SharePoint o qualsevol dashboard.', langLabel: 'Idioma', presetMinimal: 'Mínim', presetFull: 'Complet', presetKiosk: 'Quiosc', noUrl: 'Introdueix un URL públic d’IFC vàlid per generar l’embed.' },
  zh: { title: '嵌入生成器 — 在任何地方展示 IFC 模型', desc: '生成可直接复制的 iframe，将交互式 IFC 查看器嵌入博客、CDE 面板、Power BI 报表或仪表盘。无需代码，无需上传。', h1: '在任何地方嵌入 IFC 模型', lede: '粘贴一个公开的 IFC URL，调整外观，复制 iframe（或链接）。可用于博客、CDE 面板、Notion、Power BI 和仪表盘——模型在访问者的浏览器中解析，不会上传任何内容。', model: '公开 IFC URL', modelHelp: '必须可通过 HTTPS 访问并启用 CORS。', layout: '布局', accent: '强调色', height: '高度（px）', options: '选项', optValidate: '运行校验', optPanel: '打开校验面板', language: '查看器语言', auto: '自动', preview: '实时预览', update: '更新预览', linkTab: '链接', iframeTab: 'iframe', copy: '复制', copied: '已复制！', biTitle: '可以粘贴到哪里？', biHint: '任何支持 iframe 或网页 URL 的地方：博客/CMS 嵌入、CDE 文档面板、Notion、Confluence、Power BI 的“Web 内容”视觉对象、SharePoint 或任意仪表盘。', langLabel: '语言', presetMinimal: '精简', presetFull: '完整', presetKiosk: '展台', noUrl: '请输入有效的公开 IFC URL 以生成嵌入代码。' },
  ja: { title: '埋め込みビルダー — IFC モデルをどこにでも表示', desc: 'インタラクティブな IFC ビューアをブログ、CDE パネル、Power BI レポート、ダッシュボードに埋め込むためのコピー可能な iframe を生成。コード不要、アップロード不要。', h1: 'IFC モデルをどこにでも埋め込む', lede: '公開 IFC の URL を貼り付け、見た目を調整し、iframe（またはリンク）をコピー。ブログ、CDE パネル、Notion、Power BI、ダッシュボードで動作します。モデルは訪問者のブラウザで解析され、何もアップロードされません。', model: '公開 IFC の URL', modelHelp: 'HTTPS かつ CORS 有効でアクセスできる必要があります。', layout: 'レイアウト', accent: 'アクセントカラー', height: '高さ（px）', options: 'オプション', optValidate: '検証を実行', optPanel: '検証パネルを開く', language: 'ビューアの言語', auto: '自動', preview: 'ライブプレビュー', update: 'プレビューを更新', linkTab: 'リンク', iframeTab: 'iframe', copy: 'コピー', copied: 'コピーしました！', biTitle: 'どこに貼り付けられますか？', biHint: 'iframe または Web URL を受け付ける場所ならどこでも：ブログ/CMS の埋め込み、CDE のドキュメントパネル、Notion、Confluence、Power BI の「Web コンテンツ」ビジュアル、SharePoint、各種ダッシュボード。', langLabel: '言語', presetMinimal: 'ミニマル', presetFull: 'フル', presetKiosk: 'キオスク', noUrl: '埋め込みを生成するには、有効な公開 IFC URL を入力してください。' },
  th: { title: 'เครื่องมือสร้างการฝัง — นำเสนอโมเดล IFC ได้ทุกที่', desc: 'สร้าง iframe พร้อมคัดลอกเพื่อฝังตัวแสดงผล IFC แบบโต้ตอบในบล็อก แผง CDE รายงาน Power BI หรือแดชบอร์ด ไม่ต้องเขียนโค้ด ไม่ต้องอัปโหลด', h1: 'ฝังโมเดล IFC ได้ทุกที่', lede: 'วาง URL สาธารณะของ IFC ปรับรูปลักษณ์ แล้วคัดลอก iframe (หรือลิงก์) ใช้ได้ในบล็อก แผง CDE, Notion, Power BI และแดชบอร์ด โมเดลถูกประมวลผลในเบราว์เซอร์ของผู้เข้าชม ไม่มีการอัปโหลด', model: 'URL สาธารณะของ IFC', modelHelp: 'ต้องเข้าถึงได้ผ่าน HTTPS และเปิด CORS', layout: 'เลย์เอาต์', accent: 'สีเน้น', height: 'ความสูง (px)', options: 'ตัวเลือก', optValidate: 'รันการตรวจสอบ', optPanel: 'เปิดแผงการตรวจสอบ', language: 'ภาษาของตัวแสดงผล', auto: 'อัตโนมัติ', preview: 'ตัวอย่างสด', update: 'อัปเดตตัวอย่าง', linkTab: 'ลิงก์', iframeTab: 'iframe', copy: 'คัดลอก', copied: 'คัดลอกแล้ว!', biTitle: 'วางได้ที่ไหนบ้าง?', biHint: 'ที่ใดก็ได้ที่รองรับ iframe หรือ URL เว็บ: การฝังบล็อก/CMS, แผงเอกสาร CDE, Notion, Confluence, วิช্যువล “Web content” ของ Power BI, SharePoint หรือแดชบอร์ดใดก็ได้', langLabel: 'ภาษา', presetMinimal: 'มินิมอล', presetFull: 'เต็ม', presetKiosk: 'คีออสก์', noUrl: 'กรอก URL สาธารณะของ IFC ที่ถูกต้องเพื่อสร้างการฝัง' },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s) => esc(s).replace(/"/g, '&quot;')

function langSwitcher(current) {
  return LANGS.map((l) => {
    const href = l === 'en' ? (current === 'en' ? './' : '../') : (current === l ? './' : (current === 'en' ? `${l}/` : `../${l}/`))
    const style = l === current ? 'color:var(--text);font-weight:600' : 'color:var(--faint)'
    return `<a href="${href}" hreflang="${l}" style="${style};text-decoration:none">${esc(LANG_LABEL[l])}</a>`
  }).join('<span style="color:var(--border)"> · </span>')
}

function page(lang) {
  const t = T[lang]
  // app base relative to this page: en at /embed/, lang at /embed/<lang>/
  const appBase = lang === 'en' ? '../' : '../../'
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="index,follow" />
  <title>${esc(t.title)}</title>
  <meta name="description" content="${escAttr(t.desc)}" />
  <style>
    :root { --accent:#5E6AD2; --accent2:#818cf8; --bg:#0b0b0f; --surface:#15151b; --surface2:#1c1c24; --border:#26262f; --text:#e8e8ec; --dim:#a0a0ad; --faint:#6b6b78; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    a { color:var(--accent2); }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 20px 80px; }
    .nav { display:flex;flex-wrap:wrap;gap:6px;font-size:12.5px;margin-bottom:22px;align-items:center }
    .nav b { color:var(--faint);font-weight:600;margin-right:4px }
    h1 { font-size: 30px; letter-spacing:-0.02em; margin:0 0 8px; }
    .lede { color:var(--dim); font-size:15px; max-width:680px; }
    .badge { display:inline-block; font:600 11px/1 ui-monospace,monospace; color:var(--accent2); background:rgba(94,106,210,0.12); border:1px solid rgba(94,106,210,0.3); padding:5px 9px; border-radius:999px; margin-bottom:14px; }
    .grid { display:grid; grid-template-columns: 340px 1fr; gap:20px; margin-top:22px; align-items:start; }
    @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px; }
    label.f { display:block; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--faint); margin:14px 0 6px; }
    label.f:first-child { margin-top:0; }
    input[type=url], input[type=number], select { width:100%; height:36px; padding:0 10px; border-radius:9px; background:var(--bg); border:1px solid var(--border); color:var(--text); font:13px ui-monospace,monospace; outline:none; }
    input:focus, select:focus { border-color:var(--accent); }
    .help { font-size:10.5px; color:var(--faint); margin-top:5px; }
    .seg { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
    .seg button { padding:8px 4px; border-radius:9px; border:1px solid var(--border); background:transparent; color:var(--dim); font:600 12px inherit; cursor:pointer; }
    .seg button.on { border-color:var(--accent); background:rgba(94,106,210,0.12); color:var(--text); }
    .togs { display:flex; flex-direction:column; gap:8px; }
    .tog { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--dim); cursor:pointer; }
    .inline { display:flex; gap:10px; align-items:center; }
    .inline > * { flex:1; }
    .preview-shell { height:480px; border-radius:14px; overflow:hidden; border:1px solid rgba(94,106,210,0.35); background:#0d0d10; }
    .tabs { display:flex; gap:6px; margin:14px 0 6px; align-items:center; }
    .tab { padding:5px 10px; border-radius:8px; font:12px inherit; background:transparent; border:0; color:var(--faint); cursor:pointer; }
    .tab.on { background:var(--surface2); color:var(--text); }
    pre { margin:0; background:#08080b; border:1px solid var(--border); border-radius:10px; padding:12px; overflow:auto; font:12px/1.5 ui-monospace,monospace; color:#cdd0e0; white-space:pre-wrap; word-break:break-all; max-height:160px; }
    button.copy { margin-left:auto; padding:5px 10px; border-radius:8px; border:1px solid var(--border); background:var(--surface2); color:var(--dim); font:12px inherit; cursor:pointer; }
    button.update { width:100%; margin-top:14px; height:38px; border-radius:9px; border:0; background:var(--accent); color:#fff; font:600 13px inherit; cursor:pointer; }
    .note { display:flex; gap:10px; margin-top:16px; padding:12px; border-radius:12px; background:rgba(94,106,210,0.08); border:1px solid rgba(94,106,210,0.2); font-size:12.5px; color:var(--dim); }
    .note b { color:var(--text); }
  </style>
</head>
<body>
  <div class="wrap">
    <nav class="nav"><b>${esc(t.langLabel)}:</b>${langSwitcher(lang)}</nav>
    <span class="badge">IFC EMBED</span>
    <h1>${esc(t.h1)}</h1>
    <p class="lede">${esc(t.lede)}</p>

    <div class="grid">
      <div class="card">
        <label class="f">${esc(t.model)}</label>
        <input type="url" id="model" value="${escAttr(SAMPLE)}" spellcheck="false" />
        <div class="help">${esc(t.modelHelp)}</div>

        <label class="f">${esc(t.layout)}</label>
        <div class="seg" id="preset">
          <button data-v="minimal" class="on">${esc(t.presetMinimal)}</button>
          <button data-v="full">${esc(t.presetFull)}</button>
          <button data-v="kiosk">${esc(t.presetKiosk)}</button>
        </div>

        <label class="f">${esc(t.options)}</label>
        <div class="togs">
          <label class="tog"><input type="checkbox" id="validate" checked /> ${esc(t.optValidate)}</label>
          <label class="tog"><input type="checkbox" id="panel" /> ${esc(t.optPanel)}</label>
        </div>

        <div class="inline" style="margin-top:14px">
          <div>
            <label class="f" style="margin-top:0">${esc(t.accent)}</label>
            <input type="color" id="accent" value="#5E6AD2" style="height:36px;padding:2px;width:100%;background:var(--bg);border:1px solid var(--border);border-radius:9px" />
          </div>
          <div>
            <label class="f" style="margin-top:0">${esc(t.height)}</label>
            <input type="number" id="height" value="520" min="240" max="2000" step="20" />
          </div>
        </div>

        <label class="f">${esc(t.language)}</label>
        <select id="lang">
          <option value="">${esc(t.auto)}</option>
          ${LANGS.map((l) => `<option value="${l}">${esc(LANG_LABEL[l])}</option>`).join('')}
        </select>

        <button class="update" id="update">${esc(t.update)}</button>
      </div>

      <div>
        <div class="preview-shell"><iframe id="preview" title="IFC preview" style="width:100%;height:100%;border:0" allow="fullscreen"></iframe></div>

        <div class="tabs">
          <button class="tab on" data-tab="iframe">${esc(t.iframeTab)}</button>
          <button class="tab" data-tab="link">${esc(t.linkTab)}</button>
          <button class="copy" id="copy">${esc(t.copy)}</button>
        </div>
        <pre id="out"></pre>

        <div class="note"><span>💡</span><span><b>${esc(t.biTitle)}</b> ${esc(t.biHint)}</span></div>
      </div>
    </div>
  </div>

  <script>
    const APP = new URL(${JSON.stringify(appBase)}, location.href).href.replace(/\\/$/, '') + '/';
    const I18N = ${JSON.stringify({ copy: t.copy, copied: t.copied, noUrl: t.noUrl })};
    const $ = (id) => document.getElementById(id);
    let preset = 'minimal', tab = 'iframe';

    function isValid(u) { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } }

    function buildUrl() {
      const model = $('model').value.trim();
      if (!isValid(model)) return null;
      const u = new URL(APP);
      u.searchParams.set('model', model);
      u.searchParams.set('embed', '1');
      if (preset !== 'minimal') u.searchParams.set('ui', preset);
      if (!$('validate').checked) u.searchParams.set('validate', '0');
      if ($('panel').checked) u.searchParams.set('panel', '1');
      const accent = $('accent').value.replace(/^#/, '');
      if (accent && accent.toLowerCase() !== '5e6ad2') u.searchParams.set('accent', accent);
      if ($('lang').value) u.searchParams.set('lang', $('lang').value);
      return u.toString();
    }

    function snippet(url) {
      const h = Math.max(240, Math.min(2000, parseInt($('height').value, 10) || 520));
      return '<iframe\\n  src="' + url + '"\\n  width="100%"\\n  height="' + h + '"\\n  style="border:0;border-radius:12px;max-width:100%"\\n  loading="lazy"\\n  allow="fullscreen"\\n  title="IFC model viewer">\\n</iframe>';
    }

    function render() {
      const url = buildUrl();
      const out = $('out');
      if (!url) { out.textContent = I18N.noUrl; return; }
      out.textContent = tab === 'iframe' ? snippet(url) : url;
    }

    function reloadPreview() {
      const url = buildUrl();
      if (url) $('preview').src = url;
    }

    // wiring
    $('preset').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      preset = b.dataset.v;
      [...$('preset').children].forEach((c) => c.classList.toggle('on', c === b));
      render();
    });
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
      render();
    }));
    ['model', 'validate', 'panel', 'accent', 'lang', 'height'].forEach((id) => {
      $(id).addEventListener('input', render);
      $(id).addEventListener('change', render);
    });
    $('update').addEventListener('click', reloadPreview);
    $('copy').addEventListener('click', async () => {
      const url = buildUrl(); if (!url) return;
      try { await navigator.clipboard.writeText(tab === 'iframe' ? snippet(url) : url); const c = $('copy'); c.textContent = I18N.copied; setTimeout(() => { c.textContent = I18N.copy; }, 1500); } catch {}
    });

    render();
    reloadPreview();
  </script>
</body>
</html>
`
}

for (const lang of LANGS) {
  const dir = lang === 'en' ? OUT : resolve(OUT, lang)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'index.html'), page(lang), 'utf8')
}
console.log(`  ✓ Embed builder: ${LANGS.length} localized pages → public/embed/{,<lang>/}index.html`)
