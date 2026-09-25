# Translation brief — IFC Viewer Online blog → zh, ja, th, es, de, fr, pt, it, ca

## What you are translating

IFC Viewer Online (www.ifcvieweronline.eu) is a free, browser-based IFC viewer and
model checker: files are opened and validated locally in the browser, never uploaded.
The blog is a library of practical technical guides for **BIM coordinators, BIM
managers, architects and engineers** — people who deliver IFC models and get them
rejected. These translations exist so that professionals in China, Japan and Thailand
find the guides in their own search engines and read them as if a local BIM specialist
wrote them.

So: **faithful in substance, native in form.** Keep every fact, number, claim, caveat,
step and example. Do not add claims, local standards or marketing that the source does
not make; do not drop sentences. But do not translate word by word: restructure
sentences the way a native technical writer would, and use the terms local BIM
professionals actually use.

## The files

Each part is a JSON object: `"path": "English text"`. Write the same object with the
values translated.

- Keep **every key**, spelled exactly, in the same order. Never add or remove keys.
- Output must be valid JSON (UTF-8, `"` inside values escaped as `\"`, no trailing commas).
- A post can have several parts (`slug.0.json`, `slug.1.json`…). They are consecutive
  sections of ONE article — keep terminology consistent across them.
- Keys tell you what the text is: `title`, `excerpt`, `content.12.text` (a paragraph or
  a heading — headings are short), `content.8.items.3` (list item), `faqs.2.q` /
  `faqs.2.a`, `content.20.rows.3.1` (table cell), `content.5.cite` (pull-quote source).

## Inline tags — must survive exactly

Some values carry tags. Translate the text **between** them; never change a tag.

| Tag | Meaning |
|---|---|
| `<a to="slug">text</a>` | link to another article |
| `<a href="https://…">text</a>` | external link |
| `<t id="0">term</t>` | a term with a pop-up definition; the definition is the key `<same key>@def0` |
| `<cite id="x"/>` / `<cite id="x">text</cite>` | numbered citation |

- Attribute values (`slug`, URL, id) stay byte-identical.
- Each tag appears exactly as many times as in the source. No new tags, none dropped.
- You MAY move a tag to where the translated sentence needs it — word order changes.
- The linked text should be the natural phrase for the link in your language.

## Keys with special rules

- **`seoTitle`** — the title shown in a search result. Must fit: Chinese/Japanese
  **≤ 28 full-width characters** (a Latin letter or digit counts as half); Thai
  **≤ 58 characters** (vowel and tone marks written above/below a consonant don't
  count). Put the main search phrase first. It must never be longer than `title`;
  if `title` already fits, `seoTitle` may simply repeat it.
- **`seoDescription`** — the search snippet. Chinese/Japanese **42–78 full-width
  characters**; Thai **85–155 characters**. One or two sentences that say what the
  reader gets; include the main search phrase naturally.
- **`title`** — the article's H1. Natural, specific, keeps the main keyword. May be longer
  than `seoTitle`.
- **`excerpt`** — the summary on the blog index card. 1–3 sentences.
- **`keywords.N`** — the phrase a local professional would actually type into a search
  engine for that intent, in your language (e.g. `免费 IFC 查看器`, `IFCビューア 無料`,
  `โปรแกรมเปิดไฟล์ IFC ฟรี`). Not a transliteration. Keep product/standard names in Latin.
- **Headings** (`content.N.text` of a heading) — short; each unique within the article.
- **Table cells** — keep ✓, ✗, —, numbers, versions, product names as they are; translate words.
- **`stats.N.suffix` / `prefix`, `unit`** — keep units and symbols (`%`, `MB`, `min`→ translate
  only if it is a word).
- **Code, commands, file paths, menu paths of third-party software** — keep as in the source.
  (Software UI labels like `File → Export → IFC` stay in English; you may add the common
  local label in parentheses only if you are certain of it.)

## Never translate

- Product and company names: IFC Viewer Online, Revit, ArchiCAD, Tekla Structures, Allplan,
  Solibri, Navisworks, BIMcollab, Trimble Connect, Autodesk, BIM 360, ACC, Dalux, usBIM,
  xeokit, IfcOpenShell, web-ifc, That Open Engine, Three.js, Bonsai/BlenderBIM, FreeCAD,
  Speckle, buildingSMART, Chrome, Firefox, Safari, GitHub, Python…
- Standards and formats: IFC, IFC2x3, IFC4, IFC4.3, ISO 19650, ISO 16739, IDS, BCF, COBie,
  MVD, glTF, E57, LAS/LAZ, MCAP, GeoJSON, EPSG:25831, RVT, NWD, DWG…
- IFC entity, attribute and property names: IfcWall, IfcProject, GlobalId, Pset_WallCommon,
  IsExternal, IfcSite, RefLatitude… (they are identifiers, not words).
- **Health Score** — the product's quality metric. Keep it in English. At its first
  occurrence in each article add a gloss: zh `Health Score（健康评分）`,
  ja `Health Score（ヘルススコア）`, th `Health Score (คะแนนคุณภาพโมเดล)`; afterwards just `Health Score`.
- Numbers, prices (keep € amounts, don't convert), dates, percentages, versions, person names.

## Clarifications (from the pilot)

- **Budgets.** The checker enforces the hard limits (a search title ≤ 60 width units, a
  description 80–160, where one CJK character = 2 units and Thai marks = 0). The numbers
  above are stricter on purpose — aim for them to keep a margin.
- **`seoTitle` may be rewritten for search intent**, not just shortened: use the phrase a
  local user types (`区别` / `の違い` / `ต่างกันอย่างไร` for "vs", `免费` / `無料` / `ฟรี`,
  `怎么` / `方法` / `วิธี`…). Same meaning, local search phrasing.
- **First-use glosses** (Health Score, CDE, BEP, EIR…) go at the first occurrence in the
  **body** (`content.*`), not in `title`/`seoTitle`, which use the most natural short form.
- **zh "schema":** when the text means choosing IFC2x3 vs IFC4, prefer `IFC 版本` / `导出版本`;
  use `模式（Schema）` when it means the data schema itself. Never a bare `模式` next to `导出`
  (reads as "export mode").
- **Units.** ja: no space between number and unit (`50MB`, `10分`). zh: space between a digit
  and a Latin unit or word (`50 MB`, `44 条规则`). th: space around numbers (`ขนาด 50 MB`).

More glossary (zh / ja / th):

| English | 中文 | 日本語 | ไทย |
|---|---|---|---|
| tessellated geometry | 网格化几何 | テッセレーション形状 | เรขาคณิตแบบเทสเซลเลชัน (tessellated) |
| B-rep | B-rep（边界表示） | B-rep（境界表現） | B-rep |
| wall / slab / door / window | 墙 / 楼板 / 门 / 窗 | 壁 / スラブ / ドア / 窓 | ผนัง / แผ่นพื้น / ประตู / หน้าต่าง |
| quantities (QTO) | 工程量 | 数量 | ปริมาณ (quantity) |
| space / room | 空间 / 房间 | スペース / 室 | พื้นที่ (space) / ห้อง |
| MEP / structural / architectural | 机电（MEP）/ 结构 / 建筑 | 設備（MEP）/ 構造 / 意匠 | งานระบบ (MEP) / โครงสร้าง / สถาปัตยกรรม |
| Revit family / type / level | 族 / 类型 / 标高 | ファミリ / タイプ / レベル | Family / Type / Level (keep English) |
| IFC class / entity type | IFC 类 / 实体类型 | IFCクラス / エンティティ型 | คลาส IFC |
| rule set / report / issue (finding) | 规则集 / 报告 / 问题 | ルールセット / レポート / 指摘事項 | ชุดกฎ / รายงาน / ประเด็นที่พบ |
| auto-fix | 自动修复 | 自動修正 | แก้ไขอัตโนมัติ |
| workflow | 工作流程 | ワークフロー | ขั้นตอนการทำงาน (workflow) |

## Voice

The source is direct, practical and sometimes first-person ("In every project I've worked
on…"). Keep that: an experienced practitioner talking to a colleague. No hype, no filler.

---

## 中文（简体）— `zh`

- Mainland Simplified Chinese, the register of a professional BIM/建筑信息化 technical blog.
- Address the reader as **你** (consistently). First person: **我** / **我们**.
- Full-width punctuation: ，。：；？！（）“”、. Use “ ” for quotes. Use —— sparingly or restructure.
- **Put a half-width space between Chinese characters and Latin letters or digits**:
  `导出 IFC 文件`、`44 条规则`、`在 Revit 中`. No space next to full-width punctuation.
- Keep sentences tight; Chinese technical writing favours short clauses over long English ones.

| English | 中文 |
|---|---|
| IFC file / model | IFC 文件 / IFC 模型 |
| IFC viewer | IFC 查看器 |
| model checker | 模型检查工具 |
| validation / validate | 验证 / 校验 (prefer 验证) |
| validation rule | 验证规则 |
| BIM coordinator / BIM manager | BIM 协调员 / BIM 经理 |
| authoring tool | 建模软件 |
| export | 导出 |
| property / property set | 属性 / 属性集 |
| entity / element | 实体 / 构件 |
| schema | 模式（Schema） first, then 模式 |
| spatial structure / storey | 空间结构 / 楼层 |
| federated model / coordination | 整合模型 / 协调 |
| clash detection | 碰撞检查 |
| CDE | 公共数据环境（CDE） first, then CDE |
| BEP | BIM 执行计划（BEP） first, then BEP |
| EIR | 信息交换要求（EIR） first, then EIR |
| handover / delivery / deliverable | 移交 / 交付 / 交付成果 |
| acceptance criteria | 验收标准 |
| georeferencing / CRS | 地理配准 / 坐标参考系（CRS） |
| point cloud / laser scan | 点云 / 激光扫描 |
| digital twin | 数字孪生 |
| browser / upload / server | 浏览器 / 上传 / 服务器 |
| duplicate GUID | 重复 GUID |
| free | 免费 |
| NDA / GDPR | 保密协议（NDA） / 欧盟《通用数据保护条例》（GDPR） |

## 日本語 — `ja`

- です・ます調. Clear, professional, like a Japanese BIM practitioner's technical column.
- Avoid あなた where Japanese naturally omits the subject. First person: 私 / 私たち.
- Full-width 、。（）「」. No spaces between Japanese text and Latin words or digits
  (`IFCファイル`, `44のルール`, `Revitで`), except inside Latin phrases themselves.
- Katakana with the long-vowel mark: ビューアー, コーディネーター, サーバー, ユーザー, フォルダー.

| English | 日本語 |
|---|---|
| IFC file / model | IFCファイル / IFCモデル |
| IFC viewer | IFCビューアー |
| model checker | モデルチェッカー |
| validation / validate | 検証 / 検証する (チェック where colloquial) |
| validation rule | 検証ルール |
| BIM coordinator / BIM manager | BIMコーディネーター / BIMマネージャー |
| authoring tool | オーサリングツール（BIMソフト） first, then オーサリングツール |
| export | 書き出し / エクスポート (prefer エクスポート) |
| property / property set | プロパティ / プロパティセット |
| entity / element | エンティティ / 要素 |
| schema | スキーマ |
| spatial structure / storey | 空間構造 / 階 |
| federated model | 統合モデル |
| clash detection | 干渉チェック |
| CDE | 共通データ環境（CDE） first, then CDE |
| BEP | BIM実行計画（BEP） first, then BEP |
| EIR | 情報交換要件（EIR） first, then EIR |
| handover / delivery / deliverable | 引き渡し / 納品 / 成果物 |
| acceptance criteria | 受入基準 |
| georeferencing / CRS | ジオリファレンス / 座標参照系（CRS） |
| point cloud / laser scan | 点群 / レーザースキャン |
| digital twin | デジタルツイン |
| browser / upload / server | ブラウザー / アップロード / サーバー |
| duplicate GUID | 重複したGUID / GUIDの重複 |
| free | 無料 |
| NDA / GDPR | 秘密保持契約（NDA） / EU一般データ保護規則（GDPR） |

## ภาษาไทย — `th`

- Professional written Thai for a technical blog. Polite, clear, no spoken particles
  (no ครับ / ค่ะ / นะ). Address the reader as **คุณ**.
- **Avoid gendered first-person pronouns** (ผม / ดิฉัน): use **เรา** or rephrase.
- Thai has no sentence-final full stop: separate sentences with a space. Put a space
  before and after embedded Latin words and numbers (`ไฟล์ IFC ของคุณ`, `กฎ 44 ข้อ`).
- Thai BIM professionals use many English terms. Use the Thai term where one is natural,
  and on first use give the English in parentheses when it helps searching
  (e.g. `การตรวจสอบการชนกัน (clash detection)`). Don't bracket every term.

| English | ไทย |
|---|---|
| IFC file / model | ไฟล์ IFC / โมเดล IFC |
| IFC viewer | โปรแกรมดูไฟล์ IFC (IFC viewer) first, then โปรแกรมดู IFC |
| model checker | เครื่องมือตรวจสอบโมเดล (model checker) |
| validation / validate | การตรวจสอบความถูกต้อง / ตรวจสอบ |
| validation rule | กฎการตรวจสอบ |
| BIM coordinator / BIM manager | ผู้ประสานงาน BIM (BIM Coordinator) / ผู้จัดการ BIM |
| authoring tool | ซอฟต์แวร์สร้างโมเดล |
| export | ส่งออก (export) |
| property / property set | คุณสมบัติ (property) / ชุดคุณสมบัติ (property set) |
| entity / element | เอนทิตี / องค์ประกอบ |
| schema | สคีมา |
| spatial structure / storey | โครงสร้างเชิงพื้นที่ / ชั้น |
| federated model | โมเดลรวม (federated model) |
| clash detection | การตรวจสอบการชนกัน (clash detection) |
| CDE | สภาพแวดล้อมข้อมูลร่วม (CDE) first, then CDE |
| BEP | แผนการดำเนินงาน BIM (BEP) first, then BEP |
| EIR | ข้อกำหนดการแลกเปลี่ยนข้อมูล (EIR) first, then EIR |
| handover / delivery / deliverable | การส่งมอบ / การส่งงาน / สิ่งส่งมอบ |
| acceptance criteria | เกณฑ์การตรวจรับ |
| georeferencing / CRS | การอ้างอิงพิกัดทางภูมิศาสตร์ (georeferencing) / ระบบพิกัดอ้างอิง (CRS) |
| point cloud / laser scan | พอยต์คลาวด์ (point cloud) / การสแกนด้วยเลเซอร์ |
| digital twin | ดิจิทัลทวิน (digital twin) |
| browser / upload / server | เบราว์เซอร์ / อัปโหลด / เซิร์ฟเวอร์ |
| duplicate GUID | GUID ซ้ำ |
| free | ฟรี |
| NDA / GDPR | สัญญารักษาความลับ (NDA) / กฎหมายคุ้มครองข้อมูลของสหภาพยุโรป (GDPR) |

---

# Latin-script languages — es, de, fr, pt, it, ca

Everything above applies (files, tags, never-translate list, Health Score gloss,
first-use glosses in the body, voice). What differs:

- **Budgets**: `seoTitle` **≤ 58 characters**; `seoDescription` **110–155 characters**
  (the checker's hard limits are 60 and 80–160). German and French run long: write
  the listing copy for the listing, don't truncate the title.
- **Search phrasing**: `seoTitle` and `keywords.N` use what a local professional
  types (es `visor IFC gratis`, de `IFC Viewer kostenlos`, fr `visionneuse IFC gratuite`,
  pt `visualizador IFC grátis`, it `visualizzatore IFC gratuito`, ca `visor IFC gratuït`).
- **English terms**: these markets use some English BIM terms as-is (model checker,
  clash detection, workflow). Prefer the local term where the local industry uses one
  (the tables below); keep the English in parentheses at first use only when it helps
  searching.
- **Health Score** stays in English with no gloss (the product's existing Spanish,
  German and French pages use it plain).
- **The author's gender is not stated.** Where a first-person sentence would need a
  gendered agreement (es `estoy convencido`, fr `je suis convaincu`, pt/it/ca likewise),
  rephrase or use the plural (`nosotros`, `nous`…).
- **Typography**: each language's own quotation marks and spacing rules (below).
  Keep numbers as in the source; use the local decimal separator only in prose
  numbers, never in code, versions or identifiers (`IFC4.3`, `2.3 MB` in a table
  cell can stay as written).

## Español — `es`

- Spain Spanish, **tú**, direct and practical (the voice of the existing Spanish posts).
- Quotes «» or “”; ¿? and ¡! opening marks; no English title case in headings
  (only the first word and proper nouns capitalised).

| English | Español |
|---|---|
| IFC viewer / model checker | visor IFC / verificador de modelos (model checker) |
| validation | validación |
| BIM coordinator / BIM manager | coordinador BIM / BIM manager |
| authoring tool | software de autoría (herramienta de modelado) |
| export | exportación / exportar |
| property / property set | propiedad / conjunto de propiedades (Pset) |
| federated model | modelo federado |
| clash detection | detección de colisiones |
| CDE | entorno común de datos (CDE) |
| BEP / EIR | plan de ejecución BIM (BEP) / requisitos de información (EIR) |
| handover / delivery | entrega |
| acceptance criteria | criterios de aceptación |
| georeferencing | georreferenciación |
| point cloud / digital twin | nube de puntos / gemelo digital |
| duplicate GUID | GUID duplicado |
| free | gratis / gratuito |
| GDPR | RGPD |

## Deutsch — `de`

- **Sie**, sachlich und präzise, wie eine deutsche BIM-Fachpublikation.
- Quotes „…“; compound nouns with hyphens around acronyms (`IFC-Datei`, `BIM-Koordinator`).
- Headings in normal German capitalisation (nouns capitalised, no English title case).

| English | Deutsch |
|---|---|
| IFC viewer / model checker | IFC-Viewer / Model Checker (Modellprüfung) |
| validation | Validierung / Prüfung |
| BIM coordinator / BIM manager | BIM-Koordinator / BIM-Manager |
| authoring tool | Autorensoftware (Modellierungswerkzeug) |
| export | Export / exportieren |
| property / property set | Eigenschaft / Eigenschaftssatz (Pset) |
| federated model | Koordinationsmodell / föderiertes Modell |
| clash detection | Kollisionsprüfung |
| CDE | gemeinsame Datenumgebung (CDE) |
| BEP / EIR | BIM-Abwicklungsplan (BAP) / Auftraggeber-Informationsanforderungen (AIA) |
| handover / delivery | Übergabe / Lieferung |
| acceptance criteria | Abnahmekriterien |
| georeferencing | Georeferenzierung |
| point cloud / digital twin | Punktwolke / digitaler Zwilling |
| duplicate GUID | doppelte GUID |
| free | kostenlos |
| GDPR | DSGVO |

## Français — `fr`

- **vous**, clair et professionnel.
- Guillemets « … » with non-breaking spaces; a space before : ; ? ! (use a normal space
  if unsure); headings in sentence case.

| English | Français |
|---|---|
| IFC viewer / model checker | visionneuse IFC / outil de vérification de maquette (model checker) |
| model (BIM model) | maquette numérique / maquette |
| validation | validation / contrôle |
| BIM coordinator / BIM manager | coordinateur BIM / BIM manager |
| authoring tool | logiciel de modélisation |
| export | export / exporter |
| property / property set | propriété / jeu de propriétés (Pset) |
| federated model | maquette fédérée |
| clash detection | détection des conflits (clash detection) |
| CDE | environnement commun de données (CDE) |
| BEP / EIR | convention BIM (BEP) / cahier des charges BIM (EIR) |
| handover / delivery | remise / livraison |
| acceptance criteria | critères de réception |
| georeferencing | géoréférencement |
| point cloud / digital twin | nuage de points / jumeau numérique |
| duplicate GUID | GUID en double |
| free | gratuit |
| GDPR | RGPD |

## Português (Brasil) — `pt`

- **Brazilian Portuguese** (the site's pt locale): `arquivo`, `você`, `baixar`, `tela`.
- Aspas “…”; headings in sentence case.

| English | Português (BR) |
|---|---|
| IFC viewer / model checker | visualizador IFC / verificador de modelos (model checker) |
| validation | validação |
| BIM coordinator / BIM manager | coordenador BIM / gerente BIM |
| authoring tool | software de autoria |
| export | exportação / exportar |
| property / property set | propriedade / conjunto de propriedades (Pset) |
| federated model | modelo federado |
| clash detection | detecção de conflitos (clash detection) |
| CDE | ambiente comum de dados (CDE) |
| BEP / EIR | plano de execução BIM (BEP) / requisitos de informação (EIR) |
| handover / delivery | entrega |
| acceptance criteria | critérios de aceitação |
| georeferencing | georreferenciamento |
| point cloud / digital twin | nuvem de pontos / gêmeo digital |
| duplicate GUID | GUID duplicado |
| free | grátis / gratuito |
| GDPR | GDPR (Regulamento Geral de Proteção de Dados da UE); LGPD only if the source is about Brazil (it never is) |

## Italiano — `it`

- **tu**, pratico e professionale.
- Virgolette « … » or “…”; headings in sentence case.
- Use the Italian BIM vocabulary of UNI 11337 where it applies.

| English | Italiano |
|---|---|
| IFC viewer / model checker | visualizzatore IFC / strumento di model checking (model checker) |
| validation | validazione / verifica |
| BIM coordinator / BIM manager | BIM coordinator / BIM manager (roles are used in English in Italy) |
| authoring tool | software di authoring |
| export | esportazione / esportare |
| property / property set | proprietà / set di proprietà (Pset) |
| federated model | modello federato |
| clash detection | clash detection (rilevamento delle interferenze) |
| CDE | ambiente di condivisione dei dati (ACDat/CDE) |
| BEP / EIR | piano di gestione informativa (pGI/BEP) / capitolato informativo (CI/EIR) |
| handover / delivery | consegna |
| acceptance criteria | criteri di accettazione |
| georeferencing | georeferenziazione |
| point cloud / digital twin | nuvola di punti / gemello digitale (digital twin) |
| duplicate GUID | GUID duplicato |
| free | gratis / gratuito |
| GDPR | GDPR |

## Català — `ca`

- **tu**, clar i pràctic. Normative Catalan (IEC): `fitxer`, `navegador`, `baixar`.
- Cometes «…»; l·l with the middle dot; headings in sentence case.

| English | Català |
|---|---|
| IFC viewer / model checker | visor IFC / verificador de models (model checker) |
| validation | validació |
| BIM coordinator / BIM manager | coordinador BIM / BIM manager |
| authoring tool | programari d'autoria |
| export | exportació / exportar |
| property / property set | propietat / conjunt de propietats (Pset) |
| federated model | model federat |
| clash detection | detecció de col·lisions |
| CDE | entorn comú de dades (CDE) |
| BEP / EIR | pla d'execució BIM (BEP) / requisits d'informació (EIR) |
| handover / delivery | lliurament |
| acceptance criteria | criteris d'acceptació |
| georeferencing | georeferenciació |
| point cloud / digital twin | núvol de punts / bessó digital |
| duplicate GUID | GUID duplicat |
| free | gratuït |
| GDPR | RGPD |
