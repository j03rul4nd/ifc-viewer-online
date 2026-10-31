// The widget's own words. It runs on other people's sites, so it carries them
// with it instead of pulling in the app's i18n.
const K = ['shipments', 'search', 'none', 'pending', 'transit', 'delayed', 'delivered', 'sea', 'air', 'rail', 'road', 'eta', 'etd', 'done', 'simulated', 'globe', 'map', 'zoomIn', 'zoomOut', 'fullscreen', 'feedError', 'updated', 'load', 'lookupError', 'unknownPlace'] as const
export type Key = typeof K[number]
const T: Record<string, string> = {
  en: 'Shipments|Search by reference|Nothing found|Booked|In transit|Delayed|Delivered|Sea|Air|Rail|Road|ETA|Departed|complete|Simulated data|Globe|Map|Zoom in|Zoom out|Full screen|Could not refresh the data|Updated|Show the tracking map|Reference not found|Unknown location',
  es: 'Envíos|Buscar por referencia|Sin resultados|Reservado|En tránsito|Retrasado|Entregado|Marítimo|Aéreo|Ferrocarril|Carretera|Llegada prevista|Salida|completado|Datos simulados|Globo|Mapa|Acercar|Alejar|Pantalla completa|No se han podido actualizar los datos|Actualizado|Mostrar el mapa de seguimiento|Referencia no encontrada|Ubicación desconocida',
  de: 'Sendungen|Nach Referenz suchen|Nichts gefunden|Gebucht|Unterwegs|Verspätet|Zugestellt|See|Luft|Schiene|Straße|Ankunft (ETA)|Abfahrt|abgeschlossen|Simulierte Daten|Globus|Karte|Vergrößern|Verkleinern|Vollbild|Daten konnten nicht aktualisiert werden|Aktualisiert|Tracking-Karte anzeigen|Referenz nicht gefunden|Unbekannter Ort',
  fr: 'Expéditions|Rechercher par référence|Aucun résultat|Réservé|En transit|En retard|Livré|Maritime|Aérien|Ferroviaire|Routier|Arrivée prévue|Départ|effectué|Données simulées|Globe|Carte|Zoom avant|Zoom arrière|Plein écran|Impossible d’actualiser les données|Mis à jour|Afficher la carte de suivi|Référence introuvable|Lieu inconnu',
  pt: 'Remessas|Buscar por referência|Nada encontrado|Reservado|Em trânsito|Atrasado|Entregue|Marítimo|Aéreo|Ferroviário|Rodoviário|Chegada prevista|Saída|concluído|Dados simulados|Globo|Mapa|Aproximar|Afastar|Tela cheia|Não foi possível atualizar os dados|Atualizado|Mostrar o mapa de rastreamento|Referência não encontrada|Local desconhecido',
  it: 'Spedizioni|Cerca per riferimento|Nessun risultato|Prenotato|In transito|In ritardo|Consegnato|Mare|Aereo|Ferrovia|Strada|Arrivo previsto|Partenza|completato|Dati simulati|Globo|Mappa|Ingrandisci|Riduci|Schermo intero|Impossibile aggiornare i dati|Aggiornato|Mostra la mappa di tracciamento|Riferimento non trovato|Luogo sconosciuto',
  ca: 'Enviaments|Cerca per referència|Cap resultat|Reservat|En trànsit|Endarrerit|Lliurat|Marítim|Aeri|Ferrocarril|Carretera|Arribada prevista|Sortida|completat|Dades simulades|Globus|Mapa|Apropa|Allunya|Pantalla completa|No s’han pogut actualitzar les dades|Actualitzat|Mostra el mapa de seguiment|Referència no trobada|Ubicació desconeguda',
  zh: '货运|按单号搜索|未找到|已订舱|运输中|已延误|已送达|海运|空运|铁路|公路|预计到达|出发|已完成|模拟数据|地球|地图|放大|缩小|全屏|无法刷新数据|更新于|显示跟踪地图|未找到该单号|未知地点',
  ja: '貨物|参照番号で検索|見つかりません|予約済み|輸送中|遅延|配達済み|海上|航空|鉄道|陸送|到着予定|出発|完了|シミュレーションデータ|地球儀|地図|拡大|縮小|全画面|データを更新できませんでした|更新|追跡マップを表示|参照番号が見つかりません|不明な場所',
  th: 'การขนส่ง|ค้นหาด้วยเลขอ้างอิง|ไม่พบข้อมูล|จองแล้ว|กำลังขนส่ง|ล่าช้า|ส่งแล้ว|ทางเรือ|ทางอากาศ|ทางราง|ทางถนน|กำหนดถึง|ออกเดินทาง|เสร็จสิ้น|ข้อมูลจำลอง|ลูกโลก|แผนที่|ซูมเข้า|ซูมออก|เต็มจอ|รีเฟรชข้อมูลไม่สำเร็จ|อัปเดตเมื่อ|แสดงแผนที่ติดตาม|ไม่พบเลขอ้างอิง|ไม่ทราบสถานที่',
}
export const LANGS = Object.keys(T)
export function pickLang(wanted?: string): string {
  const docLang = typeof document === 'undefined' ? '' : document.documentElement.lang
  const nav = typeof navigator === 'undefined' ? '' : navigator.language
  for (const c of [wanted, docLang, nav]) { const l = c?.slice(0, 2).toLowerCase(); if (l && T[l]) return l }
  return 'en'
}
export function words(lang: string): Record<Key, string> {
  const parts = (T[lang] ?? T.en).split('|')
  return Object.fromEntries(K.map((k, i) => [k, parts[i]])) as Record<Key, string>
}
