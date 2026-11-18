// ─── site progress texts ×10 ──────────────────────────────────────────────────
// Next to the feature, like lib/steel/i18n: loads with the panel's lazy chunk
// and touches no shared locale file. Missing keys fall back to English.

import { useTranslation } from 'react-i18next'
import { useCallback } from 'react'

const en = {
  title: 'Construction progress',
  subtitle: 'Mark elements as built and see the progress per storey. Saved in this browser.',
  close: 'Close',
  needModel: 'Load at least one IFC model.',
  selection: '{{n}} selected',
  noSelection: 'Select elements in 3D to mark them.',
  not_started: 'Not started', in_progress: 'In progress', done: 'Done',
  percent: '%', date: 'Date', note: 'Note',
  apply: 'Apply',
  byStorey: 'Per storey', byClass: 'Per class',
  noStorey: '(no storey)',
  colour: 'Colour by progress',
  exportCsv: 'CSV',
  snapshot: 'Save snapshot',
  compareWith: 'Compare with',
  delta: '{{delta}} pts since {{date}}',
  total: 'Total',
  elements: '{{n}} elements',
  computing: 'Calculating…',
  saveError: 'Could not save in this browser: changes last until you close the tab.',
}
export type ProgressTextKey = keyof typeof en
type Dict = Partial<Record<ProgressTextKey, string>>

const es: Dict = {
  title: 'Avance de obra', subtitle: 'Marca elementos como ejecutados y ve el avance por planta. Se guarda en este navegador.',
  close: 'Cerrar', needModel: 'Carga al menos un modelo IFC.', selection: '{{n}} seleccionados',
  noSelection: 'Selecciona elementos en 3D para marcarlos.', not_started: 'Sin empezar', in_progress: 'En curso', done: 'Terminado',
  date: 'Fecha', note: 'Nota', apply: 'Aplicar', byStorey: 'Por planta', byClass: 'Por clase', noStorey: '(sin planta)',
  colour: 'Colorear por avance', snapshot: 'Guardar foto', compareWith: 'Comparar con', delta: '{{delta}} pts desde {{date}}',
  total: 'Total', elements: '{{n}} elementos', computing: 'Calculando…',
  saveError: 'No se pudo guardar en este navegador: los cambios duran hasta cerrar la pestaña.',
}
const ca: Dict = {
  title: "Avanç d'obra", subtitle: "Marca elements com a executats i mira l'avanç per planta. Es desa en aquest navegador.",
  close: 'Tanca', needModel: 'Carrega almenys un model IFC.', selection: '{{n}} seleccionats',
  noSelection: 'Selecciona elements en 3D per marcar-los.', not_started: 'Sense començar', in_progress: 'En curs', done: 'Acabat',
  date: 'Data', note: 'Nota', apply: 'Aplica', byStorey: 'Per planta', byClass: 'Per classe', noStorey: '(sense planta)',
  colour: 'Acoloreix per avanç', snapshot: 'Desa foto', compareWith: 'Compara amb', delta: '{{delta}} pts des de {{date}}',
  total: 'Total', elements: '{{n}} elements', computing: 'Calculant…',
  saveError: "No s'ha pogut desar en aquest navegador: els canvis duren fins que tanquis la pestanya.",
}
const fr: Dict = {
  title: 'Avancement du chantier', subtitle: "Marquez les éléments réalisés et suivez l'avancement par niveau. Enregistré dans ce navigateur.",
  close: 'Fermer', needModel: 'Chargez au moins un modèle IFC.', selection: '{{n}} sélectionnés',
  noSelection: 'Sélectionnez des éléments en 3D pour les marquer.', not_started: 'Non commencé', in_progress: 'En cours', done: 'Terminé',
  date: 'Date', note: 'Note', apply: 'Appliquer', byStorey: 'Par niveau', byClass: 'Par classe', noStorey: '(sans niveau)',
  colour: "Colorer par avancement", snapshot: 'Enregistrer un état', compareWith: 'Comparer avec', delta: '{{delta}} pts depuis le {{date}}',
  total: 'Total', elements: '{{n}} éléments', computing: 'Calcul…',
  saveError: "Impossible d'enregistrer dans ce navigateur : les changements durent jusqu'à la fermeture de l'onglet.",
}
const de: Dict = {
  title: 'Baufortschritt', subtitle: 'Bauteile als ausgeführt markieren und den Fortschritt je Geschoss sehen. In diesem Browser gespeichert.',
  close: 'Schließen', needModel: 'Laden Sie mindestens ein IFC-Modell.', selection: '{{n}} ausgewählt',
  noSelection: 'Bauteile in 3D auswählen, um sie zu markieren.', not_started: 'Nicht begonnen', in_progress: 'In Arbeit', done: 'Fertig',
  date: 'Datum', note: 'Notiz', apply: 'Anwenden', byStorey: 'Je Geschoss', byClass: 'Je Klasse', noStorey: '(ohne Geschoss)',
  colour: 'Nach Fortschritt einfärben', snapshot: 'Stand speichern', compareWith: 'Vergleichen mit', delta: '{{delta}} Pkt. seit {{date}}',
  total: 'Gesamt', elements: '{{n}} Bauteile', computing: 'Berechne…',
  saveError: 'Speichern in diesem Browser fehlgeschlagen: Änderungen bleiben bis zum Schließen des Tabs.',
}
const it: Dict = {
  title: 'Avanzamento lavori', subtitle: "Segna gli elementi eseguiti e vedi l'avanzamento per piano. Salvato in questo browser.",
  close: 'Chiudi', needModel: 'Carica almeno un modello IFC.', selection: '{{n}} selezionati',
  noSelection: 'Seleziona elementi in 3D per segnarli.', not_started: 'Non iniziato', in_progress: 'In corso', done: 'Completato',
  date: 'Data', note: 'Nota', apply: 'Applica', byStorey: 'Per piano', byClass: 'Per classe', noStorey: '(senza piano)',
  colour: 'Colora per avanzamento', snapshot: 'Salva istantanea', compareWith: 'Confronta con', delta: '{{delta}} pt dal {{date}}',
  total: 'Totale', elements: '{{n}} elementi', computing: 'Calcolo…',
  saveError: 'Impossibile salvare in questo browser: le modifiche durano fino alla chiusura della scheda.',
}
const pt: Dict = {
  title: 'Avanço da obra', subtitle: 'Marque elementos executados e veja o avanço por piso. Guardado neste navegador.',
  close: 'Fechar', needModel: 'Carregue pelo menos um modelo IFC.', selection: '{{n}} selecionados',
  noSelection: 'Selecione elementos em 3D para os marcar.', not_started: 'Não iniciado', in_progress: 'Em curso', done: 'Concluído',
  date: 'Data', note: 'Nota', apply: 'Aplicar', byStorey: 'Por piso', byClass: 'Por classe', noStorey: '(sem piso)',
  colour: 'Colorir por avanço', snapshot: 'Guardar estado', compareWith: 'Comparar com', delta: '{{delta}} pts desde {{date}}',
  total: 'Total', elements: '{{n}} elementos', computing: 'A calcular…',
  saveError: 'Não foi possível guardar neste navegador: as alterações duram até fechar o separador.',
}
const ja: Dict = {
  title: '施工進捗', subtitle: '要素を施工済みとしてマークし、階ごとの進捗を確認します。このブラウザに保存されます。',
  close: '閉じる', needModel: 'IFCモデルを1つ以上読み込んでください。', selection: '{{n}} 件選択',
  noSelection: '3Dで要素を選択してマークします。', not_started: '未着手', in_progress: '施工中', done: '完了',
  date: '日付', note: 'メモ', apply: '適用', byStorey: '階別', byClass: 'クラス別', noStorey: '(階なし)',
  colour: '進捗で色分け', snapshot: 'スナップショット保存', compareWith: '比較対象', delta: '{{date}} から {{delta}} pt',
  total: '合計', elements: '{{n}} 要素', computing: '計算中…',
  saveError: 'このブラウザに保存できませんでした。変更はタブを閉じるまで有効です。',
}
const zh: Dict = {
  title: '施工进度', subtitle: '将构件标记为已完成，并按楼层查看进度。保存在此浏览器中。',
  close: '关闭', needModel: '请至少加载一个 IFC 模型。', selection: '已选 {{n}} 个',
  noSelection: '在 3D 中选择构件进行标记。', not_started: '未开始', in_progress: '进行中', done: '已完成',
  date: '日期', note: '备注', apply: '应用', byStorey: '按楼层', byClass: '按类别', noStorey: '(无楼层)',
  colour: '按进度着色', snapshot: '保存快照', compareWith: '对比', delta: '自 {{date}} 起 {{delta}} 个百分点',
  total: '合计', elements: '{{n}} 个构件', computing: '计算中…',
  saveError: '无法保存到此浏览器：更改仅在关闭标签页前有效。',
}
const th: Dict = {
  title: 'ความคืบหน้างานก่อสร้าง', subtitle: 'ทำเครื่องหมายองค์ประกอบที่สร้างแล้วและดูความคืบหน้าตามชั้น บันทึกในเบราว์เซอร์นี้',
  close: 'ปิด', needModel: 'โหลดโมเดล IFC อย่างน้อยหนึ่งไฟล์', selection: 'เลือก {{n}} รายการ',
  noSelection: 'เลือกองค์ประกอบใน 3D เพื่อทำเครื่องหมาย', not_started: 'ยังไม่เริ่ม', in_progress: 'กำลังดำเนินการ', done: 'เสร็จแล้ว',
  date: 'วันที่', note: 'หมายเหตุ', apply: 'ใช้', byStorey: 'ตามชั้น', byClass: 'ตามคลาส', noStorey: '(ไม่มีชั้น)',
  colour: 'ระบายสีตามความคืบหน้า', snapshot: 'บันทึกสแนปช็อต', compareWith: 'เปรียบเทียบกับ', delta: '{{delta}} จุด ตั้งแต่ {{date}}',
  total: 'รวม', elements: '{{n}} องค์ประกอบ', computing: 'กำลังคำนวณ…',
  saveError: 'บันทึกในเบราว์เซอร์นี้ไม่ได้: การเปลี่ยนแปลงจะอยู่จนกว่าจะปิดแท็บ',
}

export const PROGRESS_TEXTS: Record<string, Dict> = { en, es, ca, de, fr, it, pt, ja, zh, th }

export function progressText(lang: string, key: ProgressTextKey, vars?: Record<string, string | number>): string {
  const base = lang.toLowerCase().split('-')[0]
  const s = PROGRESS_TEXTS[base]?.[key] ?? en[key]
  return vars ? s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? '')) : s
}

export function useProgressT(): { t: (key: ProgressTextKey, vars?: Record<string, string | number>) => string; lang: string } {
  const { i18n } = useTranslation()
  const lang = i18n.language || 'en'
  const t = useCallback((key: ProgressTextKey, vars?: Record<string, string | number>) => progressText(lang, key, vars), [lang])
  return { t, lang }
}
