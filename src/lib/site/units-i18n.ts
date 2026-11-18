// ─── site units texts ×10 ─────────────────────────────────────────────────────
// Next to the feature, like lib/steel/i18n: no shared locale file touched.
// Missing keys fall back to English.

import { useTranslation } from 'react-i18next'
import { useCallback } from 'react'

const en = {
  title: 'Units', subtitle: 'Status of each dwelling, on the model. Saved in this browser.',
  close: 'Close', needModel: 'Load at least one IFC model.', run: 'Read units', rerun: 'Reload units', reading: 'Reading spaces…',
  empty: 'No spaces (IfcSpace) found in the loaded models.', error: 'Could not read the models ({{error}}).',
  filterAll: 'All statuses', search: 'Search unit or buyer', colorBy: 'Colour by status', showAll: 'Show all',
  importCsv: 'Import CSV', exportCsv: 'CSV', unit: 'Unit', area: 'Area (m²)', status: 'Status', buyer: 'Buyer', notes: 'Notes',
  noStorey: '(no storey)', isolate: 'Show only this unit',
  imported: '{{matched}} units updated, {{unmatched}} rows not found, {{bad}} with an unknown status.',
  saveFailed: 'Statuses could not be saved in this browser; export a CSV to keep them.',
  s_available: 'Available', s_reserved: 'Reserved', s_sold: 'Sold', s_in_works: 'In works', s_delivered: 'Delivered', s_post_sale: 'After-sales',
}
export type UnitsTextKey = keyof typeof en
type Dict = Partial<Record<UnitsTextKey, string>>

const es: Dict = {
  title: 'Viviendas', subtitle: 'Estado de cada vivienda, sobre el modelo. Se guarda en este navegador.',
  close: 'Cerrar', needModel: 'Carga al menos un modelo IFC.', run: 'Leer viviendas', rerun: 'Volver a leer', reading: 'Leyendo espacios…',
  empty: 'No hay espacios (IfcSpace) en los modelos cargados.', error: 'No se pudieron leer los modelos ({{error}}).',
  filterAll: 'Todos los estados', search: 'Buscar vivienda o comprador', colorBy: 'Colorear por estado', showAll: 'Ver todo',
  importCsv: 'Importar CSV', exportCsv: 'CSV', unit: 'Vivienda', area: 'Superficie (m²)', status: 'Estado', buyer: 'Comprador', notes: 'Notas',
  noStorey: '(sin planta)', isolate: 'Ver solo esta vivienda',
  imported: '{{matched}} viviendas actualizadas, {{unmatched}} filas sin encontrar, {{bad}} con estado desconocido.',
  saveFailed: 'No se pudieron guardar los estados en este navegador; exporta un CSV para conservarlos.',
  s_available: 'Disponible', s_reserved: 'Reservada', s_sold: 'Vendida', s_in_works: 'En obra', s_delivered: 'Entregada', s_post_sale: 'Postventa',
}
const ca: Dict = {
  title: 'Habitatges', subtitle: 'Estat de cada habitatge, sobre el model. Es desa en aquest navegador.',
  close: 'Tanca', needModel: 'Carrega almenys un model IFC.', run: 'Llegeix habitatges', rerun: 'Torna a llegir', reading: 'Llegint espais…',
  empty: 'No hi ha espais (IfcSpace) als models carregats.', error: 'No s’han pogut llegir els models ({{error}}).',
  filterAll: 'Tots els estats', search: 'Cerca habitatge o comprador', colorBy: 'Acoloreix per estat', showAll: 'Mostra-ho tot',
  importCsv: 'Importa CSV', exportCsv: 'CSV', unit: 'Habitatge', area: 'Superfície (m²)', status: 'Estat', buyer: 'Comprador', notes: 'Notes',
  noStorey: '(sense planta)', isolate: 'Mostra només aquest habitatge',
  imported: '{{matched}} habitatges actualitzats, {{unmatched}} files no trobades, {{bad}} amb estat desconegut.',
  saveFailed: 'No s’han pogut desar els estats en aquest navegador; exporta un CSV per conservar-los.',
  s_available: 'Disponible', s_reserved: 'Reservat', s_sold: 'Venut', s_in_works: 'En obra', s_delivered: 'Lliurat', s_post_sale: 'Postvenda',
}
const de: Dict = {
  title: 'Wohneinheiten', subtitle: 'Status jeder Wohnung im Modell. Wird in diesem Browser gespeichert.',
  close: 'Schließen', needModel: 'Laden Sie mindestens ein IFC-Modell.', run: 'Einheiten lesen', rerun: 'Neu lesen', reading: 'Räume werden gelesen…',
  empty: 'Keine Räume (IfcSpace) in den geladenen Modellen.', error: 'Die Modelle konnten nicht gelesen werden ({{error}}).',
  filterAll: 'Alle Status', search: 'Einheit oder Käufer suchen', colorBy: 'Nach Status einfärben', showAll: 'Alles zeigen',
  importCsv: 'CSV importieren', exportCsv: 'CSV', unit: 'Einheit', area: 'Fläche (m²)', status: 'Status', buyer: 'Käufer', notes: 'Notizen',
  noStorey: '(ohne Geschoss)', isolate: 'Nur diese Einheit zeigen',
  imported: '{{matched}} Einheiten aktualisiert, {{unmatched}} Zeilen nicht gefunden, {{bad}} mit unbekanntem Status.',
  saveFailed: 'Status konnten in diesem Browser nicht gespeichert werden; exportieren Sie eine CSV.',
  s_available: 'Verfügbar', s_reserved: 'Reserviert', s_sold: 'Verkauft', s_in_works: 'Im Bau', s_delivered: 'Übergeben', s_post_sale: 'Gewährleistung',
}
const fr: Dict = {
  title: 'Logements', subtitle: 'Statut de chaque logement, sur la maquette. Enregistré dans ce navigateur.',
  close: 'Fermer', needModel: 'Chargez au moins un modèle IFC.', run: 'Lire les logements', rerun: 'Relire', reading: 'Lecture des espaces…',
  empty: 'Aucun espace (IfcSpace) dans les modèles chargés.', error: 'Impossible de lire les modèles ({{error}}).',
  filterAll: 'Tous les statuts', search: 'Chercher un logement ou un acheteur', colorBy: 'Colorer par statut', showAll: 'Tout afficher',
  importCsv: 'Importer un CSV', exportCsv: 'CSV', unit: 'Logement', area: 'Surface (m²)', status: 'Statut', buyer: 'Acheteur', notes: 'Notes',
  noStorey: '(sans niveau)', isolate: 'Afficher seulement ce logement',
  imported: '{{matched}} logements mis à jour, {{unmatched}} lignes introuvables, {{bad}} avec un statut inconnu.',
  saveFailed: 'Les statuts n’ont pas pu être enregistrés dans ce navigateur ; exportez un CSV pour les garder.',
  s_available: 'Disponible', s_reserved: 'Réservé', s_sold: 'Vendu', s_in_works: 'En travaux', s_delivered: 'Livré', s_post_sale: 'SAV',
}
const it: Dict = {
  title: 'Unità', subtitle: 'Stato di ogni abitazione, sul modello. Salvato in questo browser.',
  close: 'Chiudi', needModel: 'Carica almeno un modello IFC.', run: 'Leggi unità', rerun: 'Rileggi', reading: 'Lettura degli spazi…',
  empty: 'Nessuno spazio (IfcSpace) nei modelli caricati.', error: 'Impossibile leggere i modelli ({{error}}).',
  filterAll: 'Tutti gli stati', search: 'Cerca unità o acquirente', colorBy: 'Colora per stato', showAll: 'Mostra tutto',
  importCsv: 'Importa CSV', exportCsv: 'CSV', unit: 'Unità', area: 'Superficie (m²)', status: 'Stato', buyer: 'Acquirente', notes: 'Note',
  noStorey: '(senza piano)', isolate: 'Mostra solo questa unità',
  imported: '{{matched}} unità aggiornate, {{unmatched}} righe non trovate, {{bad}} con stato sconosciuto.',
  saveFailed: 'Impossibile salvare gli stati in questo browser; esporta un CSV per conservarli.',
  s_available: 'Disponibile', s_reserved: 'Prenotata', s_sold: 'Venduta', s_in_works: 'In cantiere', s_delivered: 'Consegnata', s_post_sale: 'Post-vendita',
}
const pt: Dict = {
  title: 'Frações', subtitle: 'Estado de cada fração, no modelo. Guardado neste navegador.',
  close: 'Fechar', needModel: 'Carregue pelo menos um modelo IFC.', run: 'Ler frações', rerun: 'Voltar a ler', reading: 'A ler espaços…',
  empty: 'Não há espaços (IfcSpace) nos modelos carregados.', error: 'Não foi possível ler os modelos ({{error}}).',
  filterAll: 'Todos os estados', search: 'Procurar fração ou comprador', colorBy: 'Colorir por estado', showAll: 'Mostrar tudo',
  importCsv: 'Importar CSV', exportCsv: 'CSV', unit: 'Fração', area: 'Área (m²)', status: 'Estado', buyer: 'Comprador', notes: 'Notas',
  noStorey: '(sem piso)', isolate: 'Mostrar só esta fração',
  imported: '{{matched}} frações atualizadas, {{unmatched}} linhas não encontradas, {{bad}} com estado desconhecido.',
  saveFailed: 'Não foi possível guardar os estados neste navegador; exporte um CSV para os manter.',
  s_available: 'Disponível', s_reserved: 'Reservada', s_sold: 'Vendida', s_in_works: 'Em obra', s_delivered: 'Entregue', s_post_sale: 'Pós-venda',
}
const ja: Dict = {
  title: '住戸', subtitle: 'モデル上で各住戸の状況を表示します。このブラウザに保存されます。',
  close: '閉じる', needModel: 'IFCモデルを1つ以上読み込んでください。', run: '住戸を読み込む', rerun: '再読み込み', reading: '空間を読み込み中…',
  empty: '読み込んだモデルに空間（IfcSpace）がありません。', error: 'モデルを読み込めませんでした（{{error}}）。',
  filterAll: 'すべての状況', search: '住戸または購入者を検索', colorBy: '状況で色分け', showAll: 'すべて表示',
  importCsv: 'CSVを読み込む', exportCsv: 'CSV', unit: '住戸', area: '面積 (m²)', status: '状況', buyer: '購入者', notes: 'メモ',
  noStorey: '（階なし）', isolate: 'この住戸のみ表示',
  imported: '{{matched}}件の住戸を更新、{{unmatched}}行が見つからず、{{bad}}行は不明な状況です。',
  saveFailed: 'このブラウザに状況を保存できませんでした。CSVを書き出して保管してください。',
  s_available: '販売中', s_reserved: '予約済み', s_sold: '売約済み', s_in_works: '工事中', s_delivered: '引渡済み', s_post_sale: 'アフターサービス',
}
const zh: Dict = {
  title: '房源', subtitle: '在模型上查看每套住宅的状态。保存在此浏览器中。',
  close: '关闭', needModel: '请至少加载一个 IFC 模型。', run: '读取房源', rerun: '重新读取', reading: '正在读取空间…',
  empty: '已加载的模型中没有空间（IfcSpace）。', error: '无法读取模型（{{error}}）。',
  filterAll: '全部状态', search: '搜索房源或买家', colorBy: '按状态着色', showAll: '全部显示',
  importCsv: '导入 CSV', exportCsv: 'CSV', unit: '房源', area: '面积 (m²)', status: '状态', buyer: '买家', notes: '备注',
  noStorey: '（无楼层）', isolate: '仅显示此房源',
  imported: '已更新 {{matched}} 套，{{unmatched}} 行未找到，{{bad}} 行状态未知。',
  saveFailed: '无法在此浏览器中保存状态；请导出 CSV 保留。',
  s_available: '可售', s_reserved: '已预订', s_sold: '已售', s_in_works: '施工中', s_delivered: '已交付', s_post_sale: '售后',
}
const th: Dict = {
  title: 'ยูนิต', subtitle: 'สถานะของแต่ละยูนิตบนโมเดล บันทึกในเบราว์เซอร์นี้',
  close: 'ปิด', needModel: 'โหลดโมเดล IFC อย่างน้อยหนึ่งไฟล์', run: 'อ่านยูนิต', rerun: 'อ่านใหม่', reading: 'กำลังอ่านพื้นที่…',
  empty: 'ไม่พบพื้นที่ (IfcSpace) ในโมเดลที่โหลด', error: 'อ่านโมเดลไม่ได้ ({{error}})',
  filterAll: 'ทุกสถานะ', search: 'ค้นหายูนิตหรือผู้ซื้อ', colorBy: 'แสดงสีตามสถานะ', showAll: 'แสดงทั้งหมด',
  importCsv: 'นำเข้า CSV', exportCsv: 'CSV', unit: 'ยูนิต', area: 'พื้นที่ (m²)', status: 'สถานะ', buyer: 'ผู้ซื้อ', notes: 'หมายเหตุ',
  noStorey: '(ไม่มีชั้น)', isolate: 'แสดงเฉพาะยูนิตนี้',
  imported: 'อัปเดต {{matched}} ยูนิต, ไม่พบ {{unmatched}} แถว, สถานะไม่รู้จัก {{bad}} แถว',
  saveFailed: 'บันทึกสถานะในเบราว์เซอร์นี้ไม่ได้ กรุณาส่งออก CSV เพื่อเก็บไว้',
  s_available: 'ว่าง', s_reserved: 'จองแล้ว', s_sold: 'ขายแล้ว', s_in_works: 'กำลังก่อสร้าง', s_delivered: 'ส่งมอบแล้ว', s_post_sale: 'บริการหลังการขาย',
}

export const UNITS_TEXTS: Record<string, Dict> = { en, es, ca, de, fr, it, pt, ja, zh, th }

export function unitsText(lang: string, key: UnitsTextKey, vars?: Record<string, string | number>): string {
  const base = (lang || 'en').slice(0, 2)
  let s = UNITS_TEXTS[base]?.[key] ?? en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(String(v))
  return s
}

export function useUnitsT(): { t: (key: UnitsTextKey, vars?: Record<string, string | number>) => string; lang: string } {
  const { i18n } = useTranslation()
  const lang = i18n.language || 'en'
  const t = useCallback((key: UnitsTextKey, vars?: Record<string, string | number>) => unitsText(lang, key, vars), [lang])
  return { t, lang }
}
