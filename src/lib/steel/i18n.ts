// ─── steel takeoff texts ×10 ──────────────────────────────────────────────────
// Next to the feature, like lib/clash/i18n: loads with the panel's lazy chunk
// and touches no shared locale file. Missing keys fall back to English.

import { useTranslation } from 'react-i18next'
import { useCallback } from 'react'

const en = {
  noGeometry: 'The geometry of {{files}} could not be read (no IFC file kept, e.g. a .frag): lengths and weights come only from its properties.',
  missingWarn_one: '1 piece has no weight in the file: the total weight leaves it out.', noProfile: '(no profile)',
  class_beam: 'Beam', class_column: 'Column', class_member: 'Member', class_plate: 'Plate', class_fastener: 'Fastener', class_assembly: 'Assembly',
  showAll: 'Show all', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: 'Click a row to show only those pieces.',
  title: 'Steel takeoff',
  subtitle: 'Profiles, lengths and weights from the loaded models. Runs in your browser.',
  run: 'Calculate', rerun: 'Recalculate', reading: 'Reading elements {{done}} / {{total}}', cancel: 'Cancel',
  empty: 'There are no steel elements in the loaded models.',
  needModel: 'Load at least one IFC model.',
  profile: 'Profile', cls: 'Class', count: 'Pcs', length: 'Length (m)', weight: 'Weight (kg)', material: 'Material', noWeight: 'No weight',
  total: 'Total',
  missingWarn_other: '{{n}} pieces have no weight in the file: the total weight leaves them out.',
  error: 'Could not read the models ({{error}}).',
  close: 'Close',
  upsellTitle: 'Steel takeoff is part of Pro',
  upsellBody: 'Count, length and weight per profile across every loaded model, read from Tekla, Revit, Advance Steel and IFC quantities. Everything runs in your browser.',
  upsellCta: 'See plans',
}
export type SteelTextKey = keyof typeof en
type Dict = Partial<Record<SteelTextKey, string>>

const es: Dict = {
  noGeometry: 'No se pudo leer la geometría de {{files}} (no se guarda el IFC, p. ej. un .frag): longitudes y pesos salen solo de sus propiedades.',
  missingWarn_one: '1 pieza no tiene peso en el fichero: el peso total no la cuenta.', noProfile: '(sin perfil)',
  class_beam: 'Viga', class_column: 'Pilar', class_member: 'Barra', class_plate: 'Chapa', class_fastener: 'Tornillería', class_assembly: 'Conjunto',
  showAll: 'Mostrar todo', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: 'Haz clic en una fila para ver solo esas piezas.',
  title: 'Medición de acero', subtitle: 'Perfiles, longitudes y pesos de los modelos cargados. Se calcula en tu navegador.',
  run: 'Calcular', rerun: 'Recalcular', reading: 'Leyendo elementos {{done}} / {{total}}', cancel: 'Cancelar',
  empty: 'No hay elementos de acero en los modelos cargados.', needModel: 'Carga al menos un modelo IFC.',
  profile: 'Perfil', cls: 'Clase', count: 'Uds.', length: 'Longitud (m)', weight: 'Peso (kg)', material: 'Material', noWeight: 'Sin peso',
  total: 'Total', missingWarn_other: '{{n}} piezas no tienen peso en el fichero: el peso total no las cuenta.',
  error: 'No se pudieron leer los modelos ({{error}}).', close: 'Cerrar',
  upsellTitle: 'La medición de acero es parte de Pro',
  upsellBody: 'Piezas, longitud y peso por perfil en todos los modelos cargados, leídos de Tekla, Revit, Advance Steel y las cantidades IFC. Todo se calcula en tu navegador.',
  upsellCta: 'Ver planes',
}
const ca: Dict = {
  noGeometry: "No s'ha pogut llegir la geometria de {{files}} (no es conserva l'IFC, p. ex. un .frag): longituds i pesos surten només de les seves propietats.",
  missingWarn_one: '1 peça no té pes al fitxer: el pes total no la compta.', noProfile: '(sense perfil)',
  class_beam: 'Biga', class_column: 'Pilar', class_member: 'Barra', class_plate: 'Xapa', class_fastener: 'Cargoleria', class_assembly: 'Conjunt',
  showAll: 'Mostrar-ho tot', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: 'Fes clic en una fila per veure només aquestes peces.',
  title: "Amidament d'acer", subtitle: 'Perfils, longituds i pesos dels models carregats. Es calcula al teu navegador.',
  run: 'Calcular', rerun: 'Recalcular', reading: 'Llegint elements {{done}} / {{total}}', cancel: 'Cancel·lar',
  empty: "No hi ha elements d'acer als models carregats.", needModel: 'Carrega almenys un model IFC.',
  profile: 'Perfil', cls: 'Classe', count: 'U.', length: 'Longitud (m)', weight: 'Pes (kg)', material: 'Material', noWeight: 'Sense pes',
  total: 'Total', missingWarn_other: '{{n}} peces no tenen pes al fitxer: el pes total no les compta.',
  error: "No s'han pogut llegir els models ({{error}}).", close: 'Tancar',
  upsellTitle: "L'amidament d'acer és part de Pro",
  upsellBody: 'Peces, longitud i pes per perfil a tots els models carregats, llegits de Tekla, Revit, Advance Steel i les quantitats IFC. Tot es calcula al teu navegador.',
  upsellCta: 'Veure plans',
}
const de: Dict = {
  noGeometry: 'Die Geometrie von {{files}} konnte nicht gelesen werden (keine IFC-Datei vorhanden, z. B. .frag): Längen und Gewichte stammen nur aus den Eigenschaften.',
  missingWarn_one: '1 Teil hat im Modell kein Gewicht: das Gesamtgewicht enthält es nicht.', noProfile: '(kein Profil)',
  class_beam: 'Träger', class_column: 'Stütze', class_member: 'Stab', class_plate: 'Blech', class_fastener: 'Verbindungsmittel', class_assembly: 'Baugruppe',
  showAll: 'Alle anzeigen', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: 'Klicke auf eine Zeile, um nur diese Teile zu zeigen.',
  title: 'Stahlmengen', subtitle: 'Profile, Längen und Gewichte der geladenen Modelle. Läuft in deinem Browser.',
  run: 'Berechnen', rerun: 'Neu berechnen', reading: 'Elemente werden gelesen {{done}} / {{total}}', cancel: 'Abbrechen',
  empty: 'Die geladenen Modelle enthalten keine Stahlelemente.', needModel: 'Lade mindestens ein IFC-Modell.',
  profile: 'Profil', cls: 'Klasse', count: 'Stk.', length: 'Länge (m)', weight: 'Gewicht (kg)', material: 'Material', noWeight: 'Ohne Gewicht',
  total: 'Summe', missingWarn_other: '{{n}} Teile haben im Modell kein Gewicht: das Gesamtgewicht enthält sie nicht.',
  error: 'Die Modelle konnten nicht gelesen werden ({{error}}).', close: 'Schließen',
  upsellTitle: 'Stahlmengen gehören zu Pro',
  upsellBody: 'Stückzahl, Länge und Gewicht pro Profil über alle geladenen Modelle, aus Tekla, Revit, Advance Steel und IFC-Mengen. Alles läuft in deinem Browser.',
  upsellCta: 'Pläne ansehen',
}
const fr: Dict = {
  noGeometry: "La géométrie de {{files}} n'a pas pu être lue (pas de fichier IFC conservé, p. ex. un .frag) : longueurs et poids viennent seulement de ses propriétés.",
  missingWarn_one: "{{n}} pièce n'a pas de poids dans le fichier : le poids total ne la compte pas.", noProfile: '(sans profilé)',
  class_beam: 'Poutre', class_column: 'Poteau', class_member: 'Barre', class_plate: 'Platine', class_fastener: 'Boulonnerie', class_assembly: 'Assemblage',
  showAll: 'Tout afficher', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: 'Cliquez sur une ligne pour ne voir que ces pièces.',
  title: 'Métré acier', subtitle: 'Profilés, longueurs et poids des modèles chargés. Calculé dans votre navigateur.',
  run: 'Calculer', rerun: 'Recalculer', reading: 'Lecture des éléments {{done}} / {{total}}', cancel: 'Annuler',
  empty: 'Aucun élément en acier dans les modèles chargés.', needModel: 'Chargez au moins un modèle IFC.',
  profile: 'Profilé', cls: 'Classe', count: 'Pcs', length: 'Longueur (m)', weight: 'Poids (kg)', material: 'Matériau', noWeight: 'Sans poids',
  total: 'Total', missingWarn_other: "{{n}} pièces n'ont pas de poids dans le fichier : le poids total ne les compte pas.",
  error: 'Impossible de lire les modèles ({{error}}).', close: 'Fermer',
  upsellTitle: 'Le métré acier fait partie de Pro',
  upsellBody: 'Nombre, longueur et poids par profilé dans tous les modèles chargés, lus depuis Tekla, Revit, Advance Steel et les quantités IFC. Tout est calculé dans votre navigateur.',
  upsellCta: 'Voir les offres',
}
const it: Dict = {
  noGeometry: 'Non è stato possibile leggere la geometria di {{files}} (nessun IFC conservato, ad es. un .frag): lunghezze e pesi vengono solo dalle proprietà.',
  missingWarn_one: '1 pezzo non ha peso nel file: il peso totale non lo conta.', noProfile: '(senza profilo)',
  class_beam: 'Trave', class_column: 'Pilastro', class_member: 'Asta', class_plate: 'Piastra', class_fastener: 'Bulloneria', class_assembly: 'Assieme',
  showAll: 'Mostra tutto', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: 'Clicca su una riga per vedere solo quei pezzi.',
  title: 'Computo acciaio', subtitle: 'Profili, lunghezze e pesi dei modelli caricati. Calcolato nel tuo browser.',
  run: 'Calcola', rerun: 'Ricalcola', reading: 'Lettura elementi {{done}} / {{total}}', cancel: 'Annulla',
  empty: 'Non ci sono elementi in acciaio nei modelli caricati.', needModel: 'Carica almeno un modello IFC.',
  profile: 'Profilo', cls: 'Classe', count: 'Pz', length: 'Lunghezza (m)', weight: 'Peso (kg)', material: 'Materiale', noWeight: 'Senza peso',
  total: 'Totale', missingWarn_other: '{{n}} pezzi non hanno peso nel file: il peso totale non li conta.',
  error: 'Impossibile leggere i modelli ({{error}}).', close: 'Chiudi',
  upsellTitle: 'Il computo acciaio fa parte di Pro',
  upsellBody: 'Pezzi, lunghezza e peso per profilo in tutti i modelli caricati, letti da Tekla, Revit, Advance Steel e dalle quantità IFC. Tutto calcolato nel tuo browser.',
  upsellCta: 'Vedi i piani',
}
const pt: Dict = {
  noGeometry: 'Não foi possível ler a geometria de {{files}} (o IFC não foi guardado, p. ex. um .frag): comprimentos e pesos vêm só das propriedades.',
  missingWarn_one: '1 peça não tem peso no ficheiro: o peso total não a conta.', noProfile: '(sem perfil)',
  class_beam: 'Viga', class_column: 'Pilar', class_member: 'Barra', class_plate: 'Chapa', class_fastener: 'Parafusaria', class_assembly: 'Conjunto',
  showAll: 'Mostrar tudo', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: 'Clique numa linha para ver só essas peças.',
  title: 'Quantitativo de aço', subtitle: 'Perfis, comprimentos e pesos dos modelos carregados. Calculado no seu navegador.',
  run: 'Calcular', rerun: 'Recalcular', reading: 'A ler elementos {{done}} / {{total}}', cancel: 'Cancelar',
  empty: 'Não há elementos de aço nos modelos carregados.', needModel: 'Carregue pelo menos um modelo IFC.',
  profile: 'Perfil', cls: 'Classe', count: 'Pç', length: 'Comprimento (m)', weight: 'Peso (kg)', material: 'Material', noWeight: 'Sem peso',
  total: 'Total', missingWarn_other: '{{n}} peças não têm peso no ficheiro: o peso total não as conta.',
  error: 'Não foi possível ler os modelos ({{error}}).', close: 'Fechar',
  upsellTitle: 'O quantitativo de aço faz parte do Pro',
  upsellBody: 'Peças, comprimento e peso por perfil em todos os modelos carregados, lidos do Tekla, Revit, Advance Steel e das quantidades IFC. Tudo calculado no seu navegador.',
  upsellCta: 'Ver planos',
}
const ja: Dict = {
  noGeometry: '{{files}} のジオメトリを読み込めませんでした（IFC が保持されていません。例: .frag）。長さと重量はプロパティからのみ取得します。',
  noProfile: '(断面なし)',
  class_beam: '梁', class_column: '柱', class_member: '部材', class_plate: 'プレート', class_fastener: 'ボルト類', class_assembly: '組立',
  showAll: 'すべて表示', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: '行をクリックすると、その部材だけを表示します。',
  title: '鉄骨数量', subtitle: '読み込んだモデルの断面・長さ・重量。ブラウザ内で計算します。',
  run: '計算', rerun: '再計算', reading: '要素を読み込み中 {{done}} / {{total}}', cancel: 'キャンセル',
  empty: '読み込んだモデルに鉄骨要素がありません。', needModel: 'IFC モデルを1つ以上読み込んでください。',
  profile: '断面', cls: 'クラス', count: '個数', length: '長さ (m)', weight: '重量 (kg)', material: '材質', noWeight: '重量なし',
  total: '合計', missingWarn_other: '{{n}} 個の部材にファイル上の重量がありません。合計重量には含まれません。',
  error: 'モデルを読み込めませんでした ({{error}})。', close: '閉じる',
  upsellTitle: '鉄骨数量は Pro の機能です',
  upsellBody: '読み込んだすべてのモデルの断面ごとの個数・長さ・重量を、Tekla・Revit・Advance Steel・IFC 数量から集計します。すべてブラウザ内で動作します。',
  upsellCta: 'プランを見る',
}
const zh: Dict = {
  noGeometry: '无法读取 {{files}} 的几何（未保留 IFC 文件，例如 .frag）：长度和重量仅来自其属性。',
  noProfile: '（无型材）',
  class_beam: '梁', class_column: '柱', class_member: '杆件', class_plate: '板', class_fastener: '紧固件', class_assembly: '组件',
  showAll: '显示全部', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: '点击一行，只显示这些构件。',
  title: '钢结构算量', subtitle: '已加载模型的型材、长度和重量。在浏览器中计算。',
  run: '计算', rerun: '重新计算', reading: '正在读取构件 {{done}} / {{total}}', cancel: '取消',
  empty: '已加载的模型中没有钢构件。', needModel: '请至少加载一个 IFC 模型。',
  profile: '型材', cls: '类别', count: '件数', length: '长度 (m)', weight: '重量 (kg)', material: '材质', noWeight: '无重量',
  total: '合计', missingWarn_other: '{{n}} 个构件在文件中没有重量：总重量未计入它们。',
  error: '无法读取模型（{{error}}）。', close: '关闭',
  upsellTitle: '钢结构算量属于 Pro',
  upsellBody: '在所有已加载模型中按型材统计件数、长度和重量，读取 Tekla、Revit、Advance Steel 和 IFC 数量。全部在浏览器中运行。',
  upsellCta: '查看方案',
}
const th: Dict = {
  noGeometry: 'อ่านรูปทรงของ {{files}} ไม่ได้ (ไม่มีไฟล์ IFC เก็บไว้ เช่น .frag): ความยาวและน้ำหนักมาจากคุณสมบัติเท่านั้น',
  noProfile: '(ไม่มีหน้าตัด)',
  class_beam: 'คาน', class_column: 'เสา', class_member: 'ชิ้นส่วน', class_plate: 'แผ่น', class_fastener: 'สลักเกลียว', class_assembly: 'ชุดประกอบ',
  showAll: 'แสดงทั้งหมด', exportCsv: 'CSV', exportXlsx: 'Excel', isolateHint: 'คลิกแถวเพื่อแสดงเฉพาะชิ้นส่วนเหล่านั้น',
  title: 'ถอดปริมาณเหล็ก', subtitle: 'หน้าตัด ความยาว และน้ำหนักจากโมเดลที่โหลด คำนวณในเบราว์เซอร์ของคุณ',
  run: 'คำนวณ', rerun: 'คำนวณใหม่', reading: 'กำลังอ่านชิ้นส่วน {{done}} / {{total}}', cancel: 'ยกเลิก',
  empty: 'ไม่มีชิ้นส่วนเหล็กในโมเดลที่โหลด', needModel: 'โหลดโมเดล IFC อย่างน้อยหนึ่งไฟล์',
  profile: 'หน้าตัด', cls: 'คลาส', count: 'ชิ้น', length: 'ความยาว (m)', weight: 'น้ำหนัก (kg)', material: 'วัสดุ', noWeight: 'ไม่มีน้ำหนัก',
  total: 'รวม', missingWarn_other: '{{n}} ชิ้นไม่มีน้ำหนักในไฟล์: น้ำหนักรวมไม่นับชิ้นเหล่านี้',
  error: 'อ่านโมเดลไม่ได้ ({{error}})', close: 'ปิด',
  upsellTitle: 'การถอดปริมาณเหล็กเป็นส่วนหนึ่งของ Pro',
  upsellBody: 'จำนวน ความยาว และน้ำหนักต่อหน้าตัดในทุกโมเดลที่โหลด อ่านจาก Tekla, Revit, Advance Steel และปริมาณ IFC ทั้งหมดทำงานในเบราว์เซอร์ของคุณ',
  upsellCta: 'ดูแพ็กเกจ',
}

export const STEEL_TEXTS: Record<string, Dict> = { en, es, ca, de, fr, it, pt, ja, zh, th }

export function steelText(lang: string, key: SteelTextKey, vars?: Record<string, string | number>): string {
  const base = (lang || 'en').slice(0, 2)
  let s = STEEL_TEXTS[base]?.[key] ?? en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(String(v))
  return s
}

/** Plural forms: `<base>_one` / `<base>_other` chosen by Intl.PluralRules; {{n}} is filled in. */
export function steelPlural(lang: string, base: 'missingWarn', n: number): string {
  const base2 = (lang || 'en').slice(0, 2)
  let form = 'other'
  try { form = new Intl.PluralRules(base2).select(n) } catch { /* unknown locale */ }
  const key = `${base}_${form}` as SteelTextKey
  const d = STEEL_TEXTS[base2] ?? en
  const text = d[key] !== undefined ? steelText(lang, key, { n }) : steelText(lang, `${base}_other` as SteelTextKey, { n })
  return text
}

const CLASS_KEY: Record<string, SteelTextKey> = {
  IFCBEAM: 'class_beam', IFCBEAMSTANDARDCASE: 'class_beam', IFCCOLUMN: 'class_column', IFCCOLUMNSTANDARDCASE: 'class_column',
  IFCMEMBER: 'class_member', IFCMEMBERSTANDARDCASE: 'class_member', IFCPLATE: 'class_plate', IFCPLATESTANDARDCASE: 'class_plate',
  IFCMECHANICALFASTENER: 'class_fastener', IFCELEMENTASSEMBLY: 'class_assembly',
}

/** IFCMECHANICALFASTENER → "Fastener" (translated); unknown classes keep their IFC name without the prefix. */
export function steelClassLabel(lang: string, ifcClass: string | null): string {
  if (!ifcClass) return ''
  const k = CLASS_KEY[ifcClass.toUpperCase()]
  return k ? steelText(lang, k) : ifcClass.replace(/^IFC/i, '')
}

export function useSteelT(): {
  t: (key: SteelTextKey, vars?: Record<string, string | number>) => string
  tn: (base: 'missingWarn', n: number) => string
  cls: (ifcClass: string | null) => string
  lang: string
} {
  const { i18n } = useTranslation()
  const lang = i18n.language || 'en'
  const t = useCallback((key: SteelTextKey, vars?: Record<string, string | number>) => steelText(lang, key, vars), [lang])
  const tn = useCallback((base: 'missingWarn', n: number) => steelPlural(lang, base, n), [lang])
  const cls = useCallback((c: string | null) => steelClassLabel(lang, c), [lang])
  return { t, tn, cls, lang }
}
