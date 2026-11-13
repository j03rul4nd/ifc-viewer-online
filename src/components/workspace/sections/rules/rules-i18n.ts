// ─── Rules screen translations ───────────────────────────────────────────────
// Kept apart from the shared workspace catalogue so this work does not collide
// with other sections. Keys are the English text; rows are es, ca, fr, de, it,
// pt, ja, zh, th. rules.test.ts checks every key used is here, with nine
// translations and the same {{params}}.

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RULES_DICT_V2 } from './rules-i18n-v2'

export const RULES_LANGS = ['es', 'ca', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'th'] as const
type Row = readonly [string, string, string, string, string, string, string, string, string]

/** Keys passed as variables (tab labels, sample data), so the test finds them. */
export const RULES_DYNAMIC_KEYS = [
  'Editor', 'Tests', 'Coverage', 'Templates', 'Geometry and relations',
  'All', 'Architecture', 'Facility management', 'Structure', 'MEP', 'Imported',
  'First version from CTE DB-SI.', 'Slabs added; GuBIMClass on walls.', 'EI30 allowed on load-bearing walls of parking.',
  'COBie basics for the client.', 'Draft, not reviewed.', 'Imported from IDS 1.0.',
  'The parking supplier asks for EI30. Can we allow it?', 'Only with a where on the storey. As it is, it relaxes every wall.',
]

export const RULES_DICT: Record<string, Row> = {
  'Rules': ['Reglas', 'Regles', 'Règles', 'Regeln', 'Regole', 'Regras', 'ルール', '规则', 'กฎ'],
  'Write your own rules as a sentence, test them, see what they cover and govern them as a company. Every rule is IDS 1.0, so it runs in any checker.': [
    'Escribe tus propias reglas como una frase, pruébalas, mira qué cubren y gobiérnalas como empresa. Cada regla es IDS 1.0, así que funciona en cualquier comprobador.',
    'Escriu les teves regles com una frase, prova-les, mira què cobreixen i governa-les com a empresa. Cada regla és IDS 1.0, així que funciona en qualsevol comprovador.',
    'Écrivez vos propres règles comme une phrase, testez-les, voyez ce qu’elles couvrent et gérez-les en entreprise. Chaque règle est en IDS 1.0 et tourne dans tout vérificateur.',
    'Schreiben Sie eigene Regeln als Satz, testen Sie sie, sehen Sie, was sie abdecken, und verwalten Sie sie als Unternehmen. Jede Regel ist IDS 1.0 und läuft in jedem Prüfwerkzeug.',
    'Scrivi le tue regole come una frase, provale, guarda cosa coprono e gestiscile come azienda. Ogni regola è IDS 1.0, quindi funziona in qualsiasi verificatore.',
    'Escreva suas próprias regras como uma frase, teste-as, veja o que cobrem e gerencie-as como empresa. Cada regra é IDS 1.0, então roda em qualquer verificador.',
    '独自のルールを文章として書き、テストし、対象範囲を確認し、会社として管理します。すべてのルールは IDS 1.0 なので、どのチェッカーでも動きます。',
    '用一句话写出你自己的规则，测试它们，查看覆盖范围，并在公司层面管理。每条规则都是 IDS 1.0，可在任何检查工具中运行。',
    'เขียนกฎของคุณเองเป็นประโยค ทดสอบ ดูว่าครอบคลุมอะไร และกำกับดูแลในระดับบริษัท ทุกกฎเป็น IDS 1.0 จึงใช้ได้กับเครื่องมือตรวจทุกตัว'],
  'Preview on a sample model · Pro and Team plans': ['Vista previa con un modelo de ejemplo · planes Pro y Team', 'Vista prèvia amb un model d’exemple · plans Pro i Team', 'Aperçu sur un modèle d’exemple · offres Pro et Team', 'Vorschau mit einem Beispielmodell · Pro- und Team-Tarif', 'Anteprima su un modello di esempio · piani Pro e Team', 'Prévia com um modelo de exemplo · planos Pro e Team', 'サンプルモデルでのプレビュー · Pro・Team プラン', '示例模型预览 · Pro 和 Team 方案', 'ตัวอย่างบนโมเดลตัวอย่าง · แผน Pro และ Team'],
  'Checking against your rules stays free in the viewer. Writing, testing and governing rules here is part of Pro; the shared library with approval is Team.': [
    'Comprobar con tus reglas sigue siendo gratis en el visor. Escribir, probar y gobernar reglas aquí es de Pro; la biblioteca compartida con aprobación es de Team.',
    'Comprovar amb les teves regles continua sent gratis al visor. Escriure, provar i governar regles aquí és de Pro; la biblioteca compartida amb aprovació és de Team.',
    'Vérifier avec vos règles reste gratuit dans le visualiseur. Écrire, tester et gérer des règles ici fait partie de Pro ; la bibliothèque partagée avec approbation fait partie de Team.',
    'Die Prüfung mit Ihren Regeln bleibt im Viewer kostenlos. Regeln hier schreiben, testen und verwalten gehört zu Pro; die gemeinsame Bibliothek mit Freigabe zu Team.',
    'Verificare con le tue regole resta gratis nel visualizzatore. Scrivere, provare e gestire le regole qui fa parte di Pro; la libreria condivisa con approvazione è di Team.',
    'Verificar com suas regras continua grátis no visualizador. Escrever, testar e gerenciar regras aqui faz parte do Pro; a biblioteca compartilhada com aprovação é do Team.',
    'ビューアーでのルールチェックは引き続き無料です。ここでのルールの作成・テスト・管理は Pro、承認付きの共有ライブラリは Team の機能です。',
    '在查看器中按你的规则检查仍然免费。在此编写、测试和管理规则属于 Pro；带审批的共享库属于 Team。',
    'การตรวจตามกฎของคุณยังฟรีในตัวแสดงผล การเขียน ทดสอบ และกำกับดูแลกฎที่นี่เป็นของ Pro ส่วนคลังกฎที่ใช้ร่วมกันพร้อมการอนุมัติเป็นของ Team'],
  'Library': ['Biblioteca', 'Biblioteca', 'Bibliothèque', 'Bibliothek', 'Libreria', 'Biblioteca', 'ライブラリ', '规则库', 'คลังกฎ'],
  'Editor': ['Editor', 'Editor', 'Éditeur', 'Editor', 'Editor', 'Editor', 'エディター', '编辑器', 'ตัวแก้ไข'],
  'Tests': ['Pruebas', 'Proves', 'Tests', 'Tests', 'Test', 'Testes', 'テスト', '测试', 'การทดสอบ'],
  'Coverage': ['Cobertura', 'Cobertura', 'Couverture', 'Abdeckung', 'Copertura', 'Cobertura', 'カバレッジ', '覆盖范围', 'ความครอบคลุม'],
  'Templates': ['Plantillas', 'Plantilles', 'Modèles', 'Vorlagen', 'Modelli', 'Modelos', 'テンプレート', '模板', 'เทมเพลต'],
  'Rule added from the editor.': ['Regla añadida desde el editor.', 'Regla afegida des de l’editor.', 'Règle ajoutée depuis l’éditeur.', 'Regel aus dem Editor hinzugefügt.', 'Regola aggiunta dall’editor.', 'Regra adicionada pelo editor.', 'エディターから追加したルール。', '从编辑器添加的规则。', 'เพิ่มกฎจากตัวแก้ไข'],
  'From the template {{name}}.': ['Desde la plantilla {{name}}.', 'Des de la plantilla {{name}}.', 'Depuis le modèle {{name}}.', 'Aus der Vorlage {{name}}.', 'Dal modello {{name}}.', 'A partir do modelo {{name}}.', 'テンプレート {{name}} から。', '来自模板 {{name}}。', 'จากเทมเพลต {{name}}'],
  'Rule': ['Regla', 'Regla', 'Règle', 'Regel', 'Regola', 'Regra', 'ルール', '规则', 'กฎ'],
  'Which elements': ['Qué elementos', 'Quins elements', 'Quels éléments', 'Welche Elemente', 'Quali elementi', 'Quais elementos', '対象の要素', '哪些构件', 'องค์ประกอบใด'],
  'For every': ['Para cada', 'Per a cada', 'Pour chaque', 'Für jedes', 'Per ogni', 'Para cada', '対象クラス', '对于每个', 'สำหรับทุก'],
  'Only where (optional)': ['Solo donde (opcional)', 'Només on (opcional)', 'Seulement si (facultatif)', 'Nur wenn (optional)', 'Solo dove (facoltativo)', 'Somente onde (opcional)', '条件（任意）', '仅当（可选）', 'เฉพาะเมื่อ (ไม่บังคับ)'],
  'All of them': ['Todos', 'Tots', 'Tous', 'Alle', 'Tutti', 'Todos', 'すべて', '全部', 'ทั้งหมด'],
  'Must have': ['Debe tener', 'Ha de tenir', 'Doit avoir', 'Muss haben', 'Deve avere', 'Deve ter', '必須条件', '必须具有', 'ต้องมี'],
  'Requirement': ['Requisito', 'Requisit', 'Exigence', 'Anforderung', 'Requisito', 'Requisito', '要件', '要求', 'ข้อกำหนด'],
  'A property with a value': ['Una propiedad con valor', 'Una propietat amb valor', 'Une propriété renseignée', 'Eine Eigenschaft mit Wert', 'Una proprietà con valore', 'Uma propriedade com valor', '値のあるプロパティ', '有值的属性', 'คุณสมบัติที่มีค่า'],
  'A value from a list': ['Un valor de una lista', 'Un valor d’una llista', 'Une valeur d’une liste', 'Ein Wert aus einer Liste', 'Un valore da un elenco', 'Um valor de uma lista', 'リスト内の値', '列表中的值', 'ค่าจากรายการ'],
  'A number within a limit': ['Un número dentro de un límite', 'Un número dins d’un límit', 'Un nombre dans une limite', 'Eine Zahl innerhalb einer Grenze', 'Un numero entro un limite', 'Um número dentro de um limite', '上限・下限内の数値', '在限值内的数字', 'ตัวเลขภายในขีดจำกัด'],
  'A name or code with a pattern': ['Un nombre o código con un patrón', 'Un nom o codi amb un patró', 'Un nom ou code suivant un motif', 'Ein Name oder Code nach Muster', 'Un nome o codice con uno schema', 'Um nome ou código com um padrão', 'パターンに沿った名前・コード', '符合格式的名称或代码', 'ชื่อหรือรหัสตามรูปแบบ'],
  'A classification': ['Una clasificación', 'Una classificació', 'Une classification', 'Eine Klassifikation', 'Una classificazione', 'Uma classificação', '分類', '分类', 'การจัดหมวดหมู่'],
  'A property set': ['Un conjunto de propiedades', 'Un conjunt de propietats', 'Un jeu de propriétés', 'Ein Eigenschaftssatz', 'Un set di proprietà', 'Um conjunto de propriedades', 'プロパティセット', '属性集', 'ชุดคุณสมบัติ'],
  'Property set': ['Conjunto de propiedades', 'Conjunt de propietats', 'Jeu de propriétés', 'Eigenschaftssatz', 'Set di proprietà', 'Conjunto de propriedades', 'プロパティセット', '属性集', 'ชุดคุณสมบัติ'],
  'Attribute': ['Atributo', 'Atribut', 'Attribut', 'Attribut', 'Attributo', 'Atributo', '属性', '特性', 'แอตทริบิวต์'],
  'Property': ['Propiedad', 'Propietat', 'Propriété', 'Eigenschaft', 'Proprietà', 'Propriedade', 'プロパティ', '属性', 'คุณสมบัติ'],
  'Allowed values, comma separated': ['Valores permitidos, separados por comas', 'Valors permesos, separats per comes', 'Valeurs autorisées, séparées par des virgules', 'Erlaubte Werte, durch Komma getrennt', 'Valori ammessi, separati da virgole', 'Valores permitidos, separados por vírgulas', '許可する値（カンマ区切り）', '允许的值，用逗号分隔', 'ค่าที่อนุญาต คั่นด้วยจุลภาค'],
  'Comparison': ['Comparación', 'Comparació', 'Comparaison', 'Vergleich', 'Confronto', 'Comparação', '比較', '比较', 'การเปรียบเทียบ'],
  'Limit': ['Límite', 'Límit', 'Limite', 'Grenzwert', 'Limite', 'Limite', '基準値', '限值', 'ขีดจำกัด'],
  'Pattern': ['Patrón', 'Patró', 'Motif', 'Muster', 'Schema', 'Padrão', 'パターン', '格式', 'รูปแบบ'],
  'System': ['Sistema', 'Sistema', 'Système', 'System', 'Sistema', 'Sistema', '体系', '体系', 'ระบบ'],
  'If it fails': ['Si falla', 'Si falla', 'En cas d’échec', 'Wenn es fehlschlägt', 'Se fallisce', 'Se falhar', '不合格の場合', '如果不通过', 'หากไม่ผ่าน'],
  'Severity': ['Gravedad', 'Gravetat', 'Gravité', 'Schweregrad', 'Gravità', 'Gravidade', '重大度', '严重程度', 'ความรุนแรง'],
  'Error': ['Error', 'Error', 'Erreur', 'Fehler', 'Errore', 'Erro', 'エラー', '错误', 'ข้อผิดพลาด'],
  'Warning': ['Aviso', 'Avís', 'Avertissement', 'Warnung', 'Avviso', 'Aviso', '警告', '警告', 'คำเตือน'],
  'Info': ['Info', 'Info', 'Info', 'Info', 'Info', 'Info', '情報', '提示', 'ข้อมูล'],
  'Add to the company set': ['Añadir al conjunto de la empresa', 'Afegeix al conjunt de l’empresa', 'Ajouter au jeu de l’entreprise', 'Zum Unternehmenssatz hinzufügen', 'Aggiungi al set aziendale', 'Adicionar ao conjunto da empresa', '会社のセットに追加', '添加到公司规则集', 'เพิ่มในชุดของบริษัท'],
  'Save as new draft version': ['Guardar como nueva versión borrador', 'Desa com a nova versió esborrany', 'Enregistrer comme nouvelle version brouillon', 'Als neue Entwurfsversion speichern', 'Salva come nuova versione bozza', 'Salvar como nova versão rascunho', '新しい下書き版として保存', '保存为新的草稿版本', 'บันทึกเป็นฉบับร่างใหม่'],
  'Saved as a draft. It needs a reviewer before anyone uses it.': ['Guardada como borrador. Necesita un revisor antes de que nadie la use.', 'Desada com a esborrany. Necessita un revisor abans que ningú la faci servir.', 'Enregistrée en brouillon. Un relecteur doit la valider avant usage.', 'Als Entwurf gespeichert. Vor der Nutzung muss jemand sie prüfen.', 'Salvata come bozza. Serve un revisore prima che qualcuno la usi.', 'Salva como rascunho. Precisa de um revisor antes que alguém a use.', '下書きとして保存しました。使用前にレビュー担当者の確認が必要です。', '已保存为草稿。使用前需要审核人审核。', 'บันทึกเป็นฉบับร่างแล้ว ต้องมีผู้ตรวจก่อนใช้งาน'],
  'Live preview': ['Vista previa en vivo', 'Vista prèvia en directe', 'Aperçu en direct', 'Live-Vorschau', 'Anteprima dal vivo', 'Prévia ao vivo', 'ライブプレビュー', '实时预览', 'ตัวอย่างสด'],
  '{{n}} elements': ['{{n}} elementos', '{{n}} elements', '{{n}} éléments', '{{n}} Elemente', '{{n}} elementi', '{{n}} elementos', '{{n}} 要素', '{{n}} 个构件', '{{n}} องค์ประกอบ'],
  'This rule is not complete yet.': ['Esta regla aún no está completa.', 'Aquesta regla encara no està completa.', 'Cette règle n’est pas encore complète.', 'Diese Regel ist noch nicht vollständig.', 'Questa regola non è ancora completa.', 'Esta regra ainda não está completa.', 'このルールはまだ未完成です。', '此规则尚未完成。', 'กฎนี้ยังไม่สมบูรณ์'],
  'Checked': ['Comprobados', 'Comprovats', 'Vérifiés', 'Geprüft', 'Verificati', 'Verificados', 'チェック', '已检查', 'ตรวจแล้ว'],
  'Pass': ['Pasan', 'Passen', 'Conformes', 'Bestanden', 'Superati', 'Passam', '合格', '通过', 'ผ่าน'],
  'Fail': ['Fallan', 'Fallen', 'Non conformes', 'Fehlgeschlagen', 'Falliti', 'Falham', '不合格', '未通过', 'ไม่ผ่าน'],
  'No element of the sample model matches. Check the class and the condition.': ['Ningún elemento del modelo de ejemplo coincide. Revisa la clase y la condición.', 'Cap element del model d’exemple coincideix. Revisa la classe i la condició.', 'Aucun élément du modèle d’exemple ne correspond. Vérifiez la classe et la condition.', 'Kein Element des Beispielmodells passt. Prüfen Sie Klasse und Bedingung.', 'Nessun elemento del modello di esempio corrisponde. Controlla classe e condizione.', 'Nenhum elemento do modelo de exemplo corresponde. Verifique a classe e a condição.', 'サンプルモデルに一致する要素がありません。クラスと条件を確認してください。', '示例模型中没有匹配的构件。请检查类别和条件。', 'ไม่มีองค์ประกอบในโมเดลตัวอย่างที่ตรง ตรวจคลาสและเงื่อนไข'],
  'Hide': ['Ocultar', 'Amaga', 'Masquer', 'Ausblenden', 'Nascondi', 'Ocultar', '隠す', '隐藏', 'ซ่อน'],
  'Show': ['Mostrar', 'Mostra', 'Afficher', 'Anzeigen', 'Mostra', 'Mostrar', '表示', '显示', 'แสดง'],
  'Download .ids': ['Descargar .ids', 'Descarrega .ids', 'Télécharger .ids', '.ids herunterladen', 'Scarica .ids', 'Baixar .ids', '.ids をダウンロード', '下载 .ids', 'ดาวน์โหลด .ids'],
  'The same rule as buildingSMART IDS 1.0. Your suppliers can check it free in the viewer or in any IDS checker.': [
    'La misma regla en IDS 1.0 de buildingSMART. Tus proveedores pueden comprobarla gratis en el visor o en cualquier comprobador IDS.',
    'La mateixa regla en IDS 1.0 de buildingSMART. Els teus proveïdors la poden comprovar gratis al visor o en qualsevol comprovador IDS.',
    'La même règle en IDS 1.0 de buildingSMART. Vos fournisseurs peuvent la vérifier gratuitement dans le visualiseur ou dans tout vérificateur IDS.',
    'Dieselbe Regel als buildingSMART IDS 1.0. Ihre Lieferanten prüfen sie kostenlos im Viewer oder in jedem IDS-Prüfwerkzeug.',
    'La stessa regola in IDS 1.0 di buildingSMART. I tuoi fornitori possono verificarla gratis nel visualizzatore o in qualsiasi verificatore IDS.',
    'A mesma regra em IDS 1.0 da buildingSMART. Seus fornecedores podem verificá-la grátis no visualizador ou em qualquer verificador IDS.',
    '同じルールを buildingSMART IDS 1.0 で。取引先はビューアーや任意の IDS チェッカーで無料で確認できます。',
    '同一规则的 buildingSMART IDS 1.0 版本。你的供应商可在查看器或任何 IDS 检查工具中免费检查。',
    'กฎเดียวกันในรูปแบบ buildingSMART IDS 1.0 ซัพพลายเออร์ตรวจได้ฟรีในตัวแสดงผลหรือเครื่องมือตรวจ IDS ใดก็ได้'],
  'Passes': ['Pasa', 'Passa', 'Conforme', 'Besteht', 'Supera', 'Passa', '合格', '通过', 'ผ่าน'],
  'Fails': ['Falla', 'Falla', 'Non conforme', 'Schlägt fehl', 'Fallisce', 'Falha', '不合格', '不通过', 'ไม่ผ่าน'],
  'Does not apply': ['No aplica', 'No s’aplica', 'Non concerné', 'Nicht betroffen', 'Non si applica', 'Não se aplica', '対象外', '不适用', 'ไม่เกี่ยวข้อง'],
  'Test the rule before you publish it': ['Prueba la regla antes de publicarla', 'Prova la regla abans de publicar-la', 'Testez la règle avant de la publier', 'Testen Sie die Regel vor der Veröffentlichung', 'Prova la regola prima di pubblicarla', 'Teste a regra antes de publicá-la', '公開前にルールをテスト', '发布前先测试规则', 'ทดสอบกฎก่อนเผยแพร่'],
  'Pick sample elements and say what should happen. A rule that publishes wrong blocks every supplier; a test catches it first.': [
    'Elige elementos de ejemplo y di qué debe pasar. Una regla publicada mal bloquea a todos los proveedores; una prueba lo detecta antes.',
    'Tria elements d’exemple i digues què ha de passar. Una regla publicada malament bloqueja tots els proveïdors; una prova ho detecta abans.',
    'Choisissez des éléments d’exemple et indiquez le résultat attendu. Une règle publiée par erreur bloque tous les fournisseurs ; un test le détecte avant.',
    'Wählen Sie Beispielelemente und legen Sie das erwartete Ergebnis fest. Eine fehlerhafte Regel blockiert alle Lieferanten; ein Test fängt das vorher ab.',
    'Scegli elementi di esempio e indica cosa deve succedere. Una regola pubblicata male blocca tutti i fornitori; un test lo scopre prima.',
    'Escolha elementos de exemplo e diga o que deve acontecer. Uma regra publicada errada bloqueia todos os fornecedores; um teste detecta antes.',
    'サンプル要素を選び、期待する結果を指定します。誤ったルールを公開すると全取引先が止まります。テストで事前に防げます。',
    '选择示例构件并说明应有的结果。发布错误的规则会卡住所有供应商；测试能提前发现。',
    'เลือกองค์ประกอบตัวอย่างและระบุผลที่ควรเป็น กฎที่เผยแพร่ผิดจะบล็อกซัพพลายเออร์ทุกราย การทดสอบช่วยจับได้ก่อน'],
  'Element': ['Elemento', 'Element', 'Élément', 'Element', 'Elemento', 'Elemento', '要素', '构件', 'องค์ประกอบ'],
  'Expected': ['Esperado', 'Esperat', 'Attendu', 'Erwartet', 'Atteso', 'Esperado', '期待値', '预期', 'ที่คาดไว้'],
  'Result': ['Resultado', 'Resultat', 'Résultat', 'Ergebnis', 'Risultato', 'Resultado', '結果', '结果', 'ผลลัพธ์'],
  'OK': ['OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'OK', '正确', 'ถูกต้อง'],
  'Got: {{what}}': ['Resultado: {{what}}', 'Resultat: {{what}}', 'Obtenu : {{what}}', 'Erhalten: {{what}}', 'Ottenuto: {{what}}', 'Obtido: {{what}}', '結果：{{what}}', '实际：{{what}}', 'ได้: {{what}}'],
  'Remove': ['Quitar', 'Treu', 'Retirer', 'Entfernen', 'Rimuovi', 'Remover', '削除', '移除', 'ลบ'],
  'Run {{n}} tests': ['Ejecutar {{n}} pruebas', 'Executa {{n}} proves', 'Lancer {{n}} tests', '{{n}} Tests ausführen', 'Esegui {{n}} test', 'Executar {{n}} testes', '{{n}} 件のテストを実行', '运行 {{n}} 个测试', 'รัน {{n}} การทดสอบ'],
  'Add a case': ['Añadir un caso', 'Afegeix un cas', 'Ajouter un cas', 'Fall hinzufügen', 'Aggiungi un caso', 'Adicionar um caso', 'ケースを追加', '添加用例', 'เพิ่มกรณี'],
  '{{n}} cases do not match. Fix the rule or the case.': ['{{n}} casos no coinciden. Corrige la regla o el caso.', '{{n}} casos no coincideixen. Corregeix la regla o el cas.', '{{n}} cas ne correspondent pas. Corrigez la règle ou le cas.', '{{n}} Fälle stimmen nicht. Korrigieren Sie Regel oder Fall.', '{{n}} casi non corrispondono. Correggi la regola o il caso.', '{{n}} casos não correspondem. Corrija a regra ou o caso.', '{{n}} 件が一致しません。ルールかケースを修正してください。', '{{n}} 个用例不匹配。请修改规则或用例。', '{{n}} กรณีไม่ตรง แก้กฎหรือกรณี'],
  'All cases match. Safe to send for review.': ['Todos los casos coinciden. Puedes enviarla a revisión.', 'Tots els casos coincideixen. La pots enviar a revisió.', 'Tous les cas correspondent. Vous pouvez l’envoyer en relecture.', 'Alle Fälle stimmen. Sie kann zur Prüfung.', 'Tutti i casi corrispondono. Puoi inviarla in revisione.', 'Todos os casos correspondem. Pode enviá-la para revisão.', 'すべて一致しました。レビューに回せます。', '所有用例均匹配，可以提交审核。', 'ทุกกรณีตรงกัน ส่งตรวจได้'],
  'Rule set': ['Conjunto de reglas', 'Conjunt de regles', 'Jeu de règles', 'Regelsatz', 'Set di regole', 'Conjunto de regras', 'ルールセット', '规则集', 'ชุดกฎ'],
  '{{pct}}% of the elements of {{model}} are checked by at least one rule.': ['El {{pct}}% de los elementos de {{model}} los comprueba al menos una regla.', 'El {{pct}}% dels elements de {{model}} els comprova almenys una regla.', '{{pct}} % des éléments de {{model}} sont vérifiés par au moins une règle.', '{{pct}} % der Elemente von {{model}} prüft mindestens eine Regel.', 'Il {{pct}}% degli elementi di {{model}} è verificato da almeno una regola.', '{{pct}}% dos elementos de {{model}} são verificados por pelo menos uma regra.', '{{model}} の要素の {{pct}}% が少なくとも1つのルールでチェックされます。', '{{model}} 中 {{pct}}% 的构件至少被一条规则检查。', '{{pct}}% ขององค์ประกอบใน {{model}} ถูกตรวจโดยอย่างน้อยหนึ่งกฎ'],
  'No rule checks these elements': ['Ninguna regla comprueba estos elementos', 'Cap regla comprova aquests elements', 'Aucune règle ne vérifie ces éléments', 'Keine Regel prüft diese Elemente', 'Nessuna regola verifica questi elementi', 'Nenhuma regra verifica estes elementos', 'これらの要素をチェックするルールはありません', '没有规则检查这些构件', 'ไม่มีกฎใดตรวจองค์ประกอบเหล่านี้'],
  'On the sample: {{checked}} checks, {{failed}} fail': ['En el ejemplo: {{checked}} comprobaciones, {{failed}} fallan', 'A l’exemple: {{checked}} comprovacions, {{failed}} fallen', 'Sur l’exemple : {{checked}} vérifications, {{failed}} échecs', 'Im Beispiel: {{checked}} Prüfungen, {{failed}} fehlgeschlagen', 'Sull’esempio: {{checked}} verifiche, {{failed}} fallite', 'No exemplo: {{checked}} verificações, {{failed}} falham', 'サンプルで：{{checked}} 件チェック、{{failed}} 件不合格', '示例中：检查 {{checked}} 项，{{failed}} 项未通过', 'บนตัวอย่าง: ตรวจ {{checked}} ไม่ผ่าน {{failed}}'],
  'Add to the company library': ['Añadir a la biblioteca de la empresa', 'Afegeix a la biblioteca de l’empresa', 'Ajouter à la bibliothèque de l’entreprise', 'Zur Unternehmensbibliothek hinzufügen', 'Aggiungi alla libreria aziendale', 'Adicionar à biblioteca da empresa', '会社のライブラリに追加', '添加到公司规则库', 'เพิ่มในคลังกฎของบริษัท'],
  'Templates are a starting point with checks a machine can verify. They do not certify that a model meets the standard.': [
    'Las plantillas son un punto de partida con comprobaciones que una máquina puede verificar. No certifican que un modelo cumpla la norma.',
    'Les plantilles són un punt de partida amb comprovacions que una màquina pot verificar. No certifiquen que un model compleixi la norma.',
    'Les modèles sont un point de départ avec des vérifications automatisables. Ils ne certifient pas qu’un modèle respecte la norme.',
    'Vorlagen sind ein Ausgangspunkt mit maschinell prüfbaren Kontrollen. Sie bescheinigen nicht, dass ein Modell die Norm erfüllt.',
    'I modelli sono un punto di partenza con verifiche automatizzabili. Non certificano che un modello rispetti la norma.',
    'Os modelos são um ponto de partida com verificações que uma máquina pode fazer. Não certificam que um modelo cumpre a norma.',
    'テンプレートは機械で確認できるチェックの出発点です。モデルが規格に適合することを証明するものではありません。',
    '模板是一个起点，包含可由机器验证的检查项，并不证明模型符合标准。',
    'เทมเพลตเป็นจุดเริ่มต้นที่มีการตรวจที่เครื่องตรวจได้ ไม่ได้รับรองว่าโมเดลเป็นไปตามมาตรฐาน'],
  'Approved': ['Aprobada', 'Aprovada', 'Approuvée', 'Freigegeben', 'Approvata', 'Aprovada', '承認済み', '已批准', 'อนุมัติแล้ว'],
  'In review': ['En revisión', 'En revisió', 'En relecture', 'In Prüfung', 'In revisione', 'Em revisão', 'レビュー中', '审核中', 'กำลังตรวจ'],
  'Draft': ['Borrador', 'Esborrany', 'Brouillon', 'Entwurf', 'Bozza', 'Rascunho', '下書き', '草稿', 'ฉบับร่าง'],
  'Imported as a draft. {{n}} parts could not be turned into rules.': ['Importado como borrador. {{n}} partes no se pudieron convertir en reglas.', 'Importat com a esborrany. {{n}} parts no s’han pogut convertir en regles.', 'Importé en brouillon. {{n}} parties n’ont pas pu devenir des règles.', 'Als Entwurf importiert. {{n}} Teile ließen sich nicht in Regeln umwandeln.', 'Importato come bozza. {{n}} parti non sono diventate regole.', 'Importado como rascunho. {{n}} partes não puderam virar regras.', '下書きとして取り込みました。{{n}} 件はルールに変換できませんでした。', '已作为草稿导入。{{n}} 部分无法转换为规则。', 'นำเข้าเป็นฉบับร่างแล้ว {{n}} ส่วนแปลงเป็นกฎไม่ได้'],
  'Imported as a draft.': ['Importado como borrador.', 'Importat com a esborrany.', 'Importé en brouillon.', 'Als Entwurf importiert.', 'Importato come bozza.', 'Importado como rascunho.', '下書きとして取り込みました。', '已作为草稿导入。', 'นำเข้าเป็นฉบับร่างแล้ว'],
  'This file is not a valid IDS 1.0.': ['Este archivo no es un IDS 1.0 válido.', 'Aquest fitxer no és un IDS 1.0 vàlid.', 'Ce fichier n’est pas un IDS 1.0 valide.', 'Diese Datei ist kein gültiges IDS 1.0.', 'Questo file non è un IDS 1.0 valido.', 'Este arquivo não é um IDS 1.0 válido.', 'このファイルは有効な IDS 1.0 ではありません。', '此文件不是有效的 IDS 1.0。', 'ไฟล์นี้ไม่ใช่ IDS 1.0 ที่ถูกต้อง'],
  'Import IDS 1.0': ['Importar IDS 1.0', 'Importa IDS 1.0', 'Importer un IDS 1.0', 'IDS 1.0 importieren', 'Importa IDS 1.0', 'Importar IDS 1.0', 'IDS 1.0 を取り込む', '导入 IDS 1.0', 'นำเข้า IDS 1.0'],
  'Version {{v}} by {{author}} on {{date}}': ['Versión {{v}} de {{author}} el {{date}}', 'Versió {{v}} de {{author}} el {{date}}', 'Version {{v}} par {{author}} le {{date}}', 'Version {{v}} von {{author}} am {{date}}', 'Versione {{v}} di {{author}} il {{date}}', 'Versão {{v}} de {{author}} em {{date}}', 'バージョン {{v}} · {{author}} · {{date}}', '版本 {{v}} · {{author}} · {{date}}', 'เวอร์ชัน {{v}} โดย {{author}} เมื่อ {{date}}'],
  'Suppliers check against v{{v}}.': ['Los proveedores comprueban con la v{{v}}.', 'Els proveïdors comproven amb la v{{v}}.', 'Les fournisseurs vérifient avec la v{{v}}.', 'Lieferanten prüfen gegen v{{v}}.', 'I fornitori verificano con la v{{v}}.', 'Os fornecedores verificam com a v{{v}}.', '取引先は v{{v}} でチェックします。', '供应商按 v{{v}} 检查。', 'ซัพพลายเออร์ตรวจตาม v{{v}}'],
  'Not approved yet: nobody checks against it.': ['Aún sin aprobar: nadie comprueba con ella.', 'Encara sense aprovar: ningú no hi comprova.', 'Pas encore approuvé : personne ne vérifie avec.', 'Noch nicht freigegeben: Niemand prüft dagegen.', 'Non ancora approvato: nessuno lo usa per verificare.', 'Ainda não aprovado: ninguém verifica com ele.', '未承認：まだ誰もこれでチェックしていません。', '尚未批准：没有人按它检查。', 'ยังไม่อนุมัติ: ยังไม่มีใครใช้ตรวจ'],
  'Sent for review.': ['Enviada a revisión.', 'Enviada a revisió.', 'Envoyée en relecture.', 'Zur Prüfung gesendet.', 'Inviata in revisione.', 'Enviada para revisão.', 'レビューに回しました。', '已提交审核。', 'ส่งตรวจแล้ว'],
  'Send for review': ['Enviar a revisión', 'Envia a revisió', 'Envoyer en relecture', 'Zur Prüfung senden', 'Invia in revisione', 'Enviar para revisão', 'レビューに回す', '提交审核', 'ส่งตรวจ'],
  'Reviewer': ['Revisor', 'Revisor', 'Relecteur', 'Prüfer', 'Revisore', 'Revisor', 'レビュー担当者', '审核人', 'ผู้ตรวจ'],
  'The author cannot approve their own version.': ['Quien escribe una versión no puede aprobarla.', 'Qui escriu una versió no la pot aprovar.', 'L’auteur ne peut pas approuver sa propre version.', 'Wer eine Version schreibt, kann sie nicht selbst freigeben.', 'L’autore non può approvare la propria versione.', 'Quem escreve uma versão não pode aprová-la.', '作成者は自分の版を承認できません。', '作者不能批准自己的版本。', 'ผู้เขียนอนุมัติเวอร์ชันของตัวเองไม่ได้'],
  'Only a version in review can be approved.': ['Solo se puede aprobar una versión en revisión.', 'Només es pot aprovar una versió en revisió.', 'Seule une version en relecture peut être approuvée.', 'Nur eine Version in Prüfung kann freigegeben werden.', 'Si può approvare solo una versione in revisione.', 'Só uma versão em revisão pode ser aprovada.', '承認できるのはレビュー中の版だけです。', '只有审核中的版本可以批准。', 'อนุมัติได้เฉพาะเวอร์ชันที่กำลังตรวจ'],
  'Approved. Suppliers now check against v{{v}}.': ['Aprobada. Los proveedores ya comprueban con la v{{v}}.', 'Aprovada. Els proveïdors ja comproven amb la v{{v}}.', 'Approuvée. Les fournisseurs vérifient désormais avec la v{{v}}.', 'Freigegeben. Lieferanten prüfen jetzt gegen v{{v}}.', 'Approvata. Ora i fornitori verificano con la v{{v}}.', 'Aprovada. Os fornecedores agora verificam com a v{{v}}.', '承認しました。取引先は v{{v}} でチェックします。', '已批准。供应商现在按 v{{v}} 检查。', 'อนุมัติแล้ว ซัพพลายเออร์ตรวจตาม v{{v}} แล้ว'],
  'Approve': ['Aprobar', 'Aprova', 'Approuver', 'Freigeben', 'Approva', 'Aprovar', '承認', '批准', 'อนุมัติ'],
  'Export v{{v}} as IDS 1.0': ['Exportar v{{v}} como IDS 1.0', 'Exporta v{{v}} com a IDS 1.0', 'Exporter la v{{v}} en IDS 1.0', 'v{{v}} als IDS 1.0 exportieren', 'Esporta v{{v}} come IDS 1.0', 'Exportar v{{v}} como IDS 1.0', 'v{{v}} を IDS 1.0 で書き出す', '将 v{{v}} 导出为 IDS 1.0', 'ส่งออก v{{v}} เป็น IDS 1.0'],
  'Edit': ['Editar', 'Edita', 'Modifier', 'Bearbeiten', 'Modifica', 'Editar', '編集', '编辑', 'แก้ไข'],
  'What changed from v{{a}} to v{{b}}': ['Qué cambió de la v{{a}} a la v{{b}}', 'Què ha canviat de la v{{a}} a la v{{b}}', 'Ce qui a changé de la v{{a}} à la v{{b}}', 'Was sich von v{{a}} zu v{{b}} geändert hat', 'Cosa è cambiato dalla v{{a}} alla v{{b}}', 'O que mudou da v{{a}} para a v{{b}}', 'v{{a}} から v{{b}} への変更点', '从 v{{a}} 到 v{{b}} 的变化', 'สิ่งที่เปลี่ยนจาก v{{a}} เป็น v{{b}}'],
  'No rule changed.': ['No cambió ninguna regla.', 'No ha canviat cap regla.', 'Aucune règle n’a changé.', 'Keine Regel geändert.', 'Nessuna regola è cambiata.', 'Nenhuma regra mudou.', '変更されたルールはありません。', '没有规则变化。', 'ไม่มีกฎที่เปลี่ยน'],
  'Added': ['Añadida', 'Afegida', 'Ajoutée', 'Hinzugefügt', 'Aggiunta', 'Adicionada', '追加', '新增', 'เพิ่ม'],
  'Removed': ['Quitada', 'Treta', 'Retirée', 'Entfernt', 'Rimossa', 'Removida', '削除', '移除', 'ลบ'],
  'Changed': ['Cambiada', 'Canviada', 'Modifiée', 'Geändert', 'Modificata', 'Alterada', '変更', '修改', 'เปลี่ยน'],
  'Comments': ['Comentarios', 'Comentaris', 'Commentaires', 'Kommentare', 'Commenti', 'Comentários', 'コメント', '评论', 'ความคิดเห็น'],
  'No comments yet.': ['Aún no hay comentarios.', 'Encara no hi ha comentaris.', 'Pas encore de commentaires.', 'Noch keine Kommentare.', 'Ancora nessun commento.', 'Ainda sem comentários.', 'コメントはまだありません。', '还没有评论。', 'ยังไม่มีความคิดเห็น'],
  'Write a comment': ['Escribe un comentario', 'Escriu un comentari', 'Écrire un commentaire', 'Kommentar schreiben', 'Scrivi un commento', 'Escreva um comentário', 'コメントを書く', '写评论', 'เขียนความคิดเห็น'],
  'Send': ['Enviar', 'Envia', 'Envoyer', 'Senden', 'Invia', 'Enviar', '送信', '发送', 'ส่ง'],
  'History': ['Historial', 'Historial', 'Historique', 'Verlauf', 'Cronologia', 'Histórico', '履歴', '历史', 'ประวัติ'],
  'All': ['Todas', 'Totes', 'Toutes', 'Alle', 'Tutte', 'Todas', 'すべて', '全部', 'ทั้งหมด'],
  'Architecture': ['Arquitectura', 'Arquitectura', 'Architecture', 'Architektur', 'Architettura', 'Arquitetura', '建築', '建筑', 'สถาปัตยกรรม'],
  'Facility management': ['Mantenimiento', 'Manteniment', 'Exploitation', 'Facility Management', 'Facility management', 'Manutenção', '施設管理', '设施管理', 'การบริหารอาคาร'],
  'Structure': ['Estructura', 'Estructura', 'Structure', 'Tragwerk', 'Strutture', 'Estrutura', '構造', '结构', 'โครงสร้าง'],
  'MEP': ['Instalaciones', 'Instal·lacions', 'CVC-plomberie', 'TGA', 'Impianti', 'Instalações', '設備', '机电', 'งานระบบ'],
  'Imported': ['Importado', 'Importat', 'Importé', 'Importiert', 'Importato', 'Importado', '取り込み', '已导入', 'นำเข้า'],
  'First version from CTE DB-SI.': ['Primera versión a partir del CTE DB-SI.', 'Primera versió a partir del CTE DB-SI.', 'Première version d’après le CTE DB-SI.', 'Erste Version nach CTE DB-SI.', 'Prima versione dal CTE DB-SI.', 'Primeira versão a partir do CTE DB-SI.', 'CTE DB-SI に基づく初版。', '依据 CTE DB-SI 的第一版。', 'เวอร์ชันแรกจาก CTE DB-SI'],
  'Slabs added; GuBIMClass on walls.': ['Añadidos forjados; GuBIMClass en muros.', 'Afegits forjats; GuBIMClass als murs.', 'Dalles ajoutées ; GuBIMClass sur les murs.', 'Decken ergänzt; GuBIMClass an Wänden.', 'Aggiunti solai; GuBIMClass sui muri.', 'Lajes adicionadas; GuBIMClass nas paredes.', 'スラブを追加、壁に GuBIMClass。', '增加楼板；墙体使用 GuBIMClass。', 'เพิ่มพื้น; GuBIMClass ที่ผนัง'],
  'EI30 allowed on load-bearing walls of parking.': ['EI30 permitido en muros de carga del aparcamiento.', 'EI30 permès als murs de càrrega de l’aparcament.', 'EI30 autorisé sur les murs porteurs du parking.', 'EI30 an tragenden Wänden der Garage erlaubt.', 'EI30 ammesso sui muri portanti del parcheggio.', 'EI30 permitido nas paredes portantes do estacionamento.', '駐車場の耐力壁に EI30 を許可。', '允许停车场承重墙使用 EI30。', 'อนุญาต EI30 ที่ผนังรับน้ำหนักของที่จอดรถ'],
  'COBie basics for the client.': ['Lo básico de COBie para el cliente.', 'El bàsic de COBie per al client.', 'Les bases COBie pour le client.', 'COBie-Grundlagen für den Kunden.', 'Le basi COBie per il cliente.', 'O básico de COBie para o cliente.', 'クライアント向け COBie の基本。', '面向客户的 COBie 基础。', 'COBie พื้นฐานสำหรับลูกค้า'],
  'Draft, not reviewed.': ['Borrador, sin revisar.', 'Esborrany, sense revisar.', 'Brouillon, non relu.', 'Entwurf, nicht geprüft.', 'Bozza, non rivista.', 'Rascunho, não revisado.', '下書き、未レビュー。', '草稿，未审核。', 'ฉบับร่าง ยังไม่ตรวจ'],
  'Imported from IDS 1.0.': ['Importado desde IDS 1.0.', 'Importat des d’IDS 1.0.', 'Importé depuis IDS 1.0.', 'Aus IDS 1.0 importiert.', 'Importato da IDS 1.0.', 'Importado de IDS 1.0.', 'IDS 1.0 から取り込み。', '从 IDS 1.0 导入。', 'นำเข้าจาก IDS 1.0'],
  'The parking supplier asks for EI30. Can we allow it?': ['El proveedor del aparcamiento pide EI30. ¿Lo podemos permitir?', 'El proveïdor de l’aparcament demana EI30. Ho podem permetre?', 'Le fournisseur du parking demande EI30. Peut-on l’autoriser ?', 'Der Lieferant der Garage will EI30. Können wir das erlauben?', 'Il fornitore del parcheggio chiede EI30. Possiamo permetterlo?', 'O fornecedor do estacionamento pede EI30. Podemos permitir?', '駐車場の取引先が EI30 を希望しています。許可できますか？', '停车场供应商要求 EI30，可以允许吗？', 'ซัพพลายเออร์ที่จอดรถขอ EI30 อนุญาตได้ไหม'],
  'Only with a where on the storey. As it is, it relaxes every wall.': ['Solo con una condición de planta. Tal cual, relaja todos los muros.', 'Només amb una condició de planta. Tal com està, relaxa tots els murs.', 'Seulement avec une condition sur le niveau. En l’état, elle assouplit tous les murs.', 'Nur mit einer Bedingung auf das Geschoss. So lockert sie alle Wände.', 'Solo con una condizione sul piano. Così com’è, allenta tutti i muri.', 'Só com uma condição no pavimento. Do jeito que está, afrouxa todas as paredes.', '階の条件を付ける場合のみ。このままだと全ての壁が緩くなります。', '只有加上楼层条件才行。现在这样会放宽所有墙体。', 'ต้องมีเงื่อนไขชั้นเท่านั้น แบบนี้จะผ่อนทุกผนัง'],
}

/** The studio on a real model (Tests and Coverage). */
const RULES_DICT_MODEL: Record<string, Row> = {
  'Model: {{name}} · {{n}} elements': ['Modelo: {{name}} · {{n}} elementos', 'Model: {{name}} · {{n}} elements', 'Modèle : {{name}} · {{n}} éléments', 'Modell: {{name}} · {{n}} Elemente', 'Modello: {{name}} · {{n}} elementi', 'Modelo: {{name}} · {{n}} elementos', 'モデル: {{name}} · {{n}} 要素', '模型：{{name}} · {{n}} 个元素', 'โมเดล: {{name}} · {{n}} องค์ประกอบ'],
  'Use the model open in the viewer ({{name}})': ['Usar el modelo abierto en el visor ({{name}})', 'Fes servir el model obert al visor ({{name}})', 'Utiliser le modèle ouvert dans la visionneuse ({{name}})', 'Das im Viewer geöffnete Modell verwenden ({{name}})', 'Usa il modello aperto nel visualizzatore ({{name}})', 'Usar o modelo aberto no visualizador ({{name}})', 'ビューアーで開いているモデルを使う（{{name}}）', '使用查看器中打开的模型（{{name}}）', 'ใช้โมเดลที่เปิดอยู่ในตัวดู ({{name}})'],
  'Open an IFC…': ['Abrir un IFC…', 'Obre un IFC…', 'Ouvrir un IFC…', 'IFC öffnen…', 'Apri un IFC…', 'Abrir um IFC…', 'IFC を開く…', '打开 IFC…', 'เปิด IFC…'],
  'Reading the model… {{pct}}%': ['Leyendo el modelo… {{pct}} %', 'Llegint el model… {{pct}} %', 'Lecture du modèle… {{pct}} %', 'Modell wird gelesen… {{pct}} %', 'Lettura del modello… {{pct}}%', 'A ler o modelo… {{pct}}%', 'モデルを読み込み中… {{pct}}%', '正在读取模型… {{pct}}%', 'กำลังอ่านโมเดล… {{pct}}%'],
  'Could not read this IFC ({{error}}).': ['No se pudo leer este IFC ({{error}}).', "No s'ha pogut llegir aquest IFC ({{error}}).", 'Impossible de lire cet IFC ({{error}}).', 'Diese IFC konnte nicht gelesen werden ({{error}}).', 'Impossibile leggere questo IFC ({{error}}).', 'Não foi possível ler este IFC ({{error}}).', 'この IFC を読み込めませんでした（{{error}}）。', '无法读取此 IFC（{{error}}）。', 'อ่าน IFC นี้ไม่ได้ ({{error}})'],
  'Pick elements of the model and say what should happen. A rule that publishes wrong blocks every supplier; a test catches it first.': ['Elige elementos del modelo y di qué debe pasar. Una regla publicada mal bloquea a todos los proveedores; una prueba lo detecta antes.', "Tria elements del model i digues què ha de passar. Una regla publicada malament bloqueja tots els proveïdors; una prova ho detecta abans.", "Choisissez des éléments du modèle et dites ce qui doit se passer. Une règle mal publiée bloque tous les fournisseurs ; un test le détecte avant.", 'Wählen Sie Elemente des Modells und legen Sie fest, was passieren soll. Eine falsch veröffentlichte Regel blockiert jeden Lieferanten; ein Test fängt das vorher ab.', "Scegli elementi del modello e indica cosa deve succedere. Una regola pubblicata male blocca tutti i fornitori; un test lo intercetta prima.", 'Escolha elementos do modelo e diga o que deve acontecer. Uma regra publicada errada bloqueia todos os fornecedores; um teste deteta-o antes.', 'モデルの要素を選び、どうなるべきかを指定します。誤って公開されたルールはすべての協力会社を止めます。テストで事前に見つけましょう。', '选择模型中的元素并说明应有的结果。发布错误的规则会阻挡所有供应商；测试会先发现问题。', 'เลือกองค์ประกอบของโมเดลและระบุว่าควรเกิดอะไรขึ้น กฎที่เผยแพร่ผิดจะกั้นผู้รับเหมาทุกราย การทดสอบช่วยจับได้ก่อน'],
  'Tests and coverage run on the sample model until you open one of yours. Nothing leaves your browser.': ['Las pruebas y la cobertura usan el modelo de ejemplo hasta que abras uno tuyo. Nada sale de tu navegador.', "Les proves i la cobertura fan servir el model d'exemple fins que n'obris un de teu. Res no surt del teu navegador.", "Les tests et la couverture utilisent le modèle d'exemple tant que vous n'ouvrez pas le vôtre. Rien ne quitte votre navigateur.", 'Tests und Abdeckung laufen auf dem Beispielmodell, bis Sie ein eigenes öffnen. Nichts verlässt Ihren Browser.', "Test e copertura usano il modello di esempio finché non ne apri uno tuo. Nulla esce dal tuo browser.", 'Os testes e a cobertura usam o modelo de exemplo até abrir um seu. Nada sai do seu navegador.', '自分のモデルを開くまで、テストとカバレッジはサンプルモデルで実行されます。データはブラウザーの外に出ません。', '在你打开自己的模型之前，测试和覆盖率使用示例模型。数据不会离开你的浏览器。', 'การทดสอบและความครอบคลุมใช้โมเดลตัวอย่างจนกว่าคุณจะเปิดโมเดลของคุณเอง ไม่มีข้อมูลออกจากเบราว์เซอร์'],
}

Object.assign(RULES_DICT, RULES_DICT_V2)
Object.assign(RULES_DICT, RULES_DICT_MODEL)

function fill(text: string, vars?: Record<string, unknown>): string {
  return vars ? text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text
}

export function rulesT(lang: string, text: string, vars?: Record<string, unknown>): string {
  const i = (RULES_LANGS as readonly string[]).indexOf(lang.slice(0, 2))
  const row = RULES_DICT[text]
  return fill(i >= 0 && row ? row[i] : text, vars)
}

/** `const r = useR()` — follows the app language; English is the key itself. */
export function useR(): (text: string, vars?: Record<string, unknown>) => string {
  const { i18n } = useTranslation()
  const lang = i18n?.language || 'en'
  return useCallback((text, vars) => rulesT(lang, text, vars), [lang])
}
