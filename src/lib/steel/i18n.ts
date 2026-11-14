// ─── steel takeoff texts ×10 ──────────────────────────────────────────────────
// Next to the feature, like lib/clash/i18n: loads with the panel's lazy chunk
// and touches no shared locale file. Missing keys fall back to English.

import { useTranslation } from 'react-i18next'
import { useCallback } from 'react'

const en = {
  tourTitle: "Steel takeoff in two minutes",
  tourTableTitle: "One row per profile",
  tourTableBody: "This steel hall was read in your browser: pieces, metres and kilograms per profile, with the source of each value. Pieces without a weight in the file are counted apart.",
  tourRowTitle: "Click a row",
  tourRowBody: "Click a row to show only those pieces in 3D. Click it again, or use the bar above, to see everything.",
  tourBarTitle: "Back to the whole model",
  tourBarBody: "When a row is isolated, “Show all” appears in this bar. The buttons here also recalculate after you change the scene.",
  tourExportTitle: "Take it to Excel",
  tourExportBody: "One click gives you the table, plus a sheet with every piece, its mark and where its length and weight came from.",
  tourEndTitle: "Now with your own model",
  tourEndBody: "Drop your own Tekla IFC to get your takeoff.",
  tourSkip: "Skip",
  tourBack: "Back",
  tourNext: "Next",
  tourDone: "Done",
  tourOf: "{{title}} · {{n}} of {{total}}",
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
}
export type SteelTextKey = keyof typeof en
type Dict = Partial<Record<SteelTextKey, string>>

const es: Dict = {
  tourTitle: "Medición de acero en dos minutos",
  tourTableTitle: "Una fila por perfil",
  tourTableBody: "Esta nave de acero se ha leído en tu navegador: piezas, metros y kilos por perfil, con el origen de cada valor. Las piezas sin peso en el fichero se cuentan aparte.",
  tourRowTitle: "Haz clic en una fila",
  tourRowBody: "Haz clic en una fila para ver solo esas piezas en 3D. Vuelve a hacer clic, o usa la barra de arriba, para verlo todo.",
  tourBarTitle: "Volver al modelo entero",
  tourBarBody: "Con una fila aislada aparece «Mostrar todo» en esta barra. Desde aquí también se recalcula si cambias la escena.",
  tourExportTitle: "Llévalo a Excel",
  tourExportBody: "Con un clic tienes la tabla y una hoja con cada pieza, su marca y de dónde sale su longitud y su peso.",
  tourEndTitle: "Ahora con tu modelo",
  tourEndBody: "Suelta tu propio IFC de Tekla para obtener tu medición.",
  tourSkip: "Saltar",
  tourBack: "Atrás",
  tourNext: "Siguiente",
  tourDone: "Hecho",
  tourOf: "{{title}} · {{n}} de {{total}}",
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
}
const ca: Dict = {
  tourTitle: "Amidament d'acer en dos minuts",
  tourTableTitle: "Una fila per perfil",
  tourTableBody: "Aquesta nau d'acer s'ha llegit al teu navegador: peces, metres i quilos per perfil, amb l'origen de cada valor. Les peces sense pes al fitxer es compten a part.",
  tourRowTitle: "Fes clic en una fila",
  tourRowBody: "Fes clic en una fila per veure només aquestes peces en 3D. Torna a fer clic, o fes servir la barra de dalt, per veure-ho tot.",
  tourBarTitle: "Tornar al model sencer",
  tourBarBody: "Amb una fila aïllada apareix «Mostrar-ho tot» en aquesta barra. Des d'aquí també es recalcula si canvies l'escena.",
  tourExportTitle: "Porta-ho a Excel",
  tourExportBody: "Amb un clic tens la taula i un full amb cada peça, la seva marca i d'on surt la seva longitud i el seu pes.",
  tourEndTitle: "Ara amb el teu model",
  tourEndBody: "Deixa anar el teu propi IFC de Tekla per obtenir el teu amidament.",
  tourSkip: "Saltar",
  tourBack: "Enrere",
  tourNext: "Següent",
  tourDone: "Fet",
  tourOf: "{{title}} · {{n}} de {{total}}",
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
}
const de: Dict = {
  tourTitle: "Stahlmengen in zwei Minuten",
  tourTableTitle: "Eine Zeile pro Profil",
  tourTableBody: "Diese Stahlhalle wurde in deinem Browser gelesen: Stückzahl, Meter und Kilogramm pro Profil, mit der Quelle jedes Werts. Teile ohne Gewicht in der Datei werden gesondert gezählt.",
  tourRowTitle: "Klicke auf eine Zeile",
  tourRowBody: "Ein Klick auf eine Zeile zeigt nur diese Teile in 3D. Erneut klicken oder die Leiste oben nutzen, um alles zu sehen.",
  tourBarTitle: "Zurück zum ganzen Modell",
  tourBarBody: "Ist eine Zeile isoliert, erscheint „Alle anzeigen“ in dieser Leiste. Hier wird auch neu berechnet, wenn sich die Szene ändert.",
  tourExportTitle: "Nach Excel",
  tourExportBody: "Ein Klick liefert die Tabelle und ein Blatt mit jedem Teil, seiner Position und der Herkunft von Länge und Gewicht.",
  tourEndTitle: "Jetzt mit deinem Modell",
  tourEndBody: "Zieh dein eigenes Tekla-IFC hierher, um deine Stahlmengen zu erhalten.",
  tourSkip: "Überspringen",
  tourBack: "Zurück",
  tourNext: "Weiter",
  tourDone: "Fertig",
  tourOf: "{{title}} · {{n}} von {{total}}",
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
}
const fr: Dict = {
  tourTitle: "Métré acier en deux minutes",
  tourTableTitle: "Une ligne par profil",
  tourTableBody: "Ce hangar acier a été lu dans votre navigateur : pièces, mètres et kilos par profil, avec la source de chaque valeur. Les pièces sans poids dans le fichier sont comptées à part.",
  tourRowTitle: "Cliquez sur une ligne",
  tourRowBody: "Cliquez sur une ligne pour n'afficher que ces pièces en 3D. Cliquez à nouveau, ou utilisez la barre du haut, pour tout revoir.",
  tourBarTitle: "Revenir au modèle entier",
  tourBarBody: "Quand une ligne est isolée, « Tout afficher » apparaît dans cette barre. On y relance aussi le calcul si la scène change.",
  tourExportTitle: "Vers Excel",
  tourExportBody: "Un clic donne le tableau et une feuille avec chaque pièce, son repère et l'origine de sa longueur et de son poids.",
  tourEndTitle: "Maintenant avec votre modèle",
  tourEndBody: "Déposez votre propre IFC Tekla pour obtenir votre métré.",
  tourSkip: "Passer",
  tourBack: "Retour",
  tourNext: "Suivant",
  tourDone: "Terminé",
  tourOf: "{{title}} · {{n}} sur {{total}}",
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
}
const it: Dict = {
  tourTitle: "Computo acciaio in due minuti",
  tourTableTitle: "Una riga per profilo",
  tourTableBody: "Questo capannone in acciaio è stato letto nel tuo browser: pezzi, metri e chili per profilo, con la fonte di ogni valore. I pezzi senza peso nel file sono contati a parte.",
  tourRowTitle: "Fai clic su una riga",
  tourRowBody: "Fai clic su una riga per vedere solo quei pezzi in 3D. Fai di nuovo clic, o usa la barra in alto, per vedere tutto.",
  tourBarTitle: "Torna al modello intero",
  tourBarBody: "Con una riga isolata compare «Mostra tutto» in questa barra. Da qui si ricalcola anche se cambi la scena.",
  tourExportTitle: "Portalo in Excel",
  tourExportBody: "Con un clic hai la tabella e un foglio con ogni pezzo, la sua marca e da dove vengono lunghezza e peso.",
  tourEndTitle: "Ora con il tuo modello",
  tourEndBody: "Trascina il tuo IFC di Tekla per ottenere il tuo computo.",
  tourSkip: "Salta",
  tourBack: "Indietro",
  tourNext: "Avanti",
  tourDone: "Fatto",
  tourOf: "{{title}} · {{n}} di {{total}}",
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
}
const pt: Dict = {
  tourTitle: "Quantitativo de aço em dois minutos",
  tourTableTitle: "Uma linha por perfil",
  tourTableBody: "Este pavilhão de aço foi lido no seu navegador: peças, metros e quilos por perfil, com a origem de cada valor. As peças sem peso no ficheiro são contadas à parte.",
  tourRowTitle: "Clique numa linha",
  tourRowBody: "Clique numa linha para ver só essas peças em 3D. Clique de novo, ou use a barra de cima, para ver tudo.",
  tourBarTitle: "Voltar ao modelo inteiro",
  tourBarBody: "Com uma linha isolada aparece «Mostrar tudo» nesta barra. Daqui também se recalcula se mudar a cena.",
  tourExportTitle: "Leve para o Excel",
  tourExportBody: "Com um clique tem a tabela e uma folha com cada peça, a sua marca e de onde vêm o comprimento e o peso.",
  tourEndTitle: "Agora com o seu modelo",
  tourEndBody: "Largue o seu próprio IFC do Tekla para obter o seu quantitativo.",
  tourSkip: "Saltar",
  tourBack: "Voltar",
  tourNext: "Seguinte",
  tourDone: "Concluído",
  tourOf: "{{title}} · {{n}} de {{total}}",
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
}
const ja: Dict = {
  tourTitle: "2分でわかる鋼材拾い",
  tourTableTitle: "断面ごとに1行",
  tourTableBody: "この鉄骨倉庫はブラウザ内で読み込まれました。断面ごとの本数・長さ・重量と、それぞれの値の出所を表示します。ファイルに重量がない部材は別に数えます。",
  tourRowTitle: "行をクリック",
  tourRowBody: "行をクリックすると、その部材だけを3Dで表示します。もう一度クリックするか、上のバーで全体に戻ります。",
  tourBarTitle: "モデル全体に戻る",
  tourBarBody: "行を分離表示すると、このバーに「すべて表示」が出ます。シーンを変えたらここで再計算できます。",
  tourExportTitle: "Excelへ",
  tourExportBody: "ワンクリックで表と、部材ごとの符号・長さと重量の出所を載せたシートが得られます。",
  tourEndTitle: "次はあなたのモデルで",
  tourEndBody: "ご自身のTekla IFCをドロップすると、その鋼材拾いが得られます。",
  tourSkip: "スキップ",
  tourBack: "戻る",
  tourNext: "次へ",
  tourDone: "完了",
  tourOf: "{{title}} · {{n}} / {{total}}",
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
}
const zh: Dict = {
  tourTitle: "两分钟了解钢材算量",
  tourTableTitle: "每种截面一行",
  tourTableBody: "这座钢结构厂房在你的浏览器中读取：按截面统计件数、米数和公斤数，并标明每个数值的来源。文件中没有重量的构件单独计数。",
  tourRowTitle: "点击一行",
  tourRowBody: "点击一行，只在三维中显示这些构件。再次点击或使用上方工具栏即可显示全部。",
  tourBarTitle: "回到整个模型",
  tourBarBody: "隔离某一行后，此工具栏会出现“显示全部”。场景变化后也可在这里重新计算。",
  tourExportTitle: "导出到 Excel",
  tourExportBody: "一键得到汇总表，以及一张列出每个构件、编号和长度重量来源的明细表。",
  tourEndTitle: "现在试试你的模型",
  tourEndBody: "拖入你自己的 Tekla IFC，即可得到你的钢材算量。",
  tourSkip: "跳过",
  tourBack: "上一步",
  tourNext: "下一步",
  tourDone: "完成",
  tourOf: "{{title}} · 第 {{n}} 步，共 {{total}} 步",
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
}
const th: Dict = {
  tourTitle: "ถอดปริมาณเหล็กในสองนาที",
  tourTableTitle: "หนึ่งแถวต่อหน้าตัด",
  tourTableBody: "โรงงานเหล็กนี้อ่านในเบราว์เซอร์ของคุณ: จำนวนชิ้น ความยาว และน้ำหนักต่อหน้าตัด พร้อมที่มาของแต่ละค่า ชิ้นที่ไม่มีน้ำหนักในไฟล์จะนับแยก",
  tourRowTitle: "คลิกที่แถว",
  tourRowBody: "คลิกแถวเพื่อแสดงเฉพาะชิ้นเหล่านั้นในสามมิติ คลิกอีกครั้งหรือใช้แถบด้านบนเพื่อดูทั้งหมด",
  tourBarTitle: "กลับไปที่ทั้งโมเดล",
  tourBarBody: "เมื่อแยกแสดงแถวหนึ่ง ปุ่ม “แสดงทั้งหมด” จะปรากฏในแถบนี้ และคำนวณใหม่ได้ที่นี่เมื่อฉากเปลี่ยน",
  tourExportTitle: "ส่งออกเป็น Excel",
  tourExportBody: "คลิกเดียวได้ตารางและชีตที่มีทุกชิ้น เครื่องหมาย และที่มาของความยาวและน้ำหนัก",
  tourEndTitle: "ลองกับโมเดลของคุณ",
  tourEndBody: "ลากไฟล์ IFC จาก Tekla ของคุณมาวางเพื่อรับการถอดปริมาณของคุณ",
  tourSkip: "ข้าม",
  tourBack: "ย้อนกลับ",
  tourNext: "ถัดไป",
  tourDone: "เสร็จ",
  tourOf: "{{title}} · {{n}} จาก {{total}}",
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
