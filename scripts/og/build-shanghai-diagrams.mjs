// Original explanatory illustrations, deliberately not geographic surveys.
import { mkdirSync, writeFileSync } from 'node:fs'
const out = 'public/blog/images'
mkdirSync(out, { recursive: true })
let lang = 'es'
// English labels for the English edition (blog-shanghai-en.ts); every translation reuses those.
const EN = { "Tres capas. Tres niveles de evidencia.": "Three layers. Three levels of evidence.", "Separar el edificio, su entorno y el detalle evita confundir apariencia con precisión.": "Separating the building, its surroundings and the detail avoids mistaking looks for accuracy.", "02 / CARTOGRAFÍA": "02 / MAPPING", "03 / DETALLE": "03 / DETAIL", "Elementos y propiedades": "Elements and properties", "del archivo del edificio": "from the building file", "Huellas, rutas y etiquetas": "Footprints, routes and tags", "disponibles para el lugar": "available for the site", "Formas aproximadas": "Approximate shapes", "cuando faltan medidas": "where data is missing", "Un puente se entiende por sus conexiones": "A bridge is understood through its connections", "El tablero, la escalera y el ascensor deben compartir puntos de llegada.": "The deck, the stair and the lift must share arrival points.", "Escalera": "Stair", "Tablero y descansillo": "Deck and landing", "Ascensor": "Lift", "Cota compartida en cada unión": "Shared elevation at every joint", "layer ≠ altura en metros": "layer ≠ height in metres", "Suelo y acceso": "Ground and access", "La cubierta protege un espacio abierto": "The canopy shelters an open space", "Separar soportes, andén y vía permite revisar cotas y colisiones.": "Separating supports, platform and track lets you check elevations and clashes.", "Cubierta": "Canopy", "Andén": "Platform", "Carriles": "Rails", "Comparar la cota del andén con la vía": "Compare the platform elevation with the track", "Conservar el vacío inferior": "Keep the void underneath", "Conservar el vacío también es modelar": "Keeping the void is modelling too", "El contorno exterior no basta: patios, islas y caminos cambian la superficie útil.": "The outer boundary is not enough: courtyards, islands and paths change the usable surface.", "SE PIERDEN LOS HUECOS": "THE HOLES ARE LOST", "SE CONSERVAN LAS RELACIONES": "THE RELATIONSHIPS ARE KEPT", "Patio": "Courtyard", "Vegetación sobre el recorrido": "Vegetation over the path", "Camino libre · patio abierto · isla": "Clear path · open courtyard · island", "ESQUEMA · SIN ESCALA · NO TOPOGRÁFICO": "DIAGRAM · NOT TO SCALE · NOT A SURVEY" }
const tr = t => (lang === 'en' && EN[t]) || t
const NAMES = { capas: 'layers', puentes: 'bridges', estaciones: 'stations', patios: 'courtyards' }
const text = (x,y,t,size=23,color='#d9e6ef') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${tr(t)}</text>`
const rect = (x,y,w,h,fill,rx=8) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`
const line = (x1,y1,x2,y2,color='#79dbd2',width=4) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}" fill="none"/>`
function save(name,title,subtitle,body) {
  writeFileSync(`${out}/shanghai-${lang === 'en' ? NAMES[name] : name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600" role="img" aria-labelledby="title desc"><title id="title">${tr(title)}</title><desc id="desc">${tr(subtitle)}</desc><rect width="1200" height="600" rx="18" fill="#101d2b"/><g font-family="Arial, sans-serif">${text(48,62,title,34,'#ffffff')}${text(48,102,subtitle,21,'#9fb6cb')}${body}${line(48,539,1152,539,'#314657',1)}${text(48,574,'IFC VIEWER ONLINE  /  SHANGHAI',17,'#8fa8bc')}${text(733,574,'ESQUEMA · SIN ESCALA · NO TOPOGRÁFICO',17,'#8fa8bc')}</g></svg>`, 'utf8')
}
function build() {
save('capas','Tres capas. Tres niveles de evidencia.','Separar el edificio, su entorno y el detalle evita confundir apariencia con precisión.',
  rect(48,158,345,318,'#1a3443')+rect(427,158,345,318,'#223147')+rect(806,158,345,318,'#323040')+
  text(76,207,'01 / IFC',27,'#79dbd2')+text(455,207,'02 / CARTOGRAFÍA',27,'#a9c4ff')+text(834,207,'03 / DETALLE',27,'#edb896')+
  rect(100,245,52,89,'#79dbd2')+rect(170,264,83,70,'#4d9d9e')+rect(269,221,57,113,'#9cddd6')+
  line(468,270,727,333,'#a9c4ff',14)+line(480,340,688,246,'#65799b',11)+
  [875,945,1015].map(x=>`<circle cx="${x}" cy="282" r="25" fill="#ae9877"/>`+line(x,302,x,340,'#d8c6a5',6)).join('')+
  text(76,389,'Elementos y propiedades')+text(76,424,'del archivo del edificio')+text(455,389,'Huellas, rutas y etiquetas')+text(455,424,'disponibles para el lugar')+text(834,389,'Formas aproximadas')+text(834,424,'cuando faltan medidas'))
save('puentes','Un puente se entiende por sus conexiones','El tablero, la escalera y el ascensor deben compartir puntos de llegada.',
  rect(60,454,1080,22,'#607788',0)+rect(350,260,690,23,'#79dbd2',2)+
  line(388,283,388,454,'#8199a8',12)+line(808,283,808,454,'#8199a8',12)+
  `<path d="M110 454H150V423H190V392H230V361H270V330H310V299H350V260" stroke="#dbe6ea" stroke-width="8" fill="none"/>`+
  rect(951,300,64,153,'#39546b')+rect(955,205,56,240,'#253c52')+line(983,220,983,430,'#edb896',4)+
  `<circle cx="350" cy="260" r="15" fill="#edb896"/><circle cx="984" cy="260" r="15" fill="#edb896"/>`+
  text(71,230,'Escalera')+line(161,244,230,346,'#a4bbcc',2)+text(410,210,'Tablero y descansillo')+text(905,170,'Ascensor')+
  text(455,367,'Cota compartida en cada unión',24,'#79dbd2')+text(455,402,'layer ≠ altura en metros',25,'#edb896')+text(73,512,'Suelo y acceso',21))
save('estaciones','La cubierta protege un espacio abierto','Separar soportes, andén y vía permite revisar cotas y colisiones.',
  `<path d="M150 215Q600 90 1050 215L1050 234Q600 115 150 234Z" fill="#adc4d8"/>`+
  rect(190,226,20,233,'#6c879a',0)+rect(991,226,20,233,'#6c879a',0)+
  rect(130,451,940,23,'#415970',0)+rect(670,396,225,55,'#b8c9d1',0)+
  rect(337,410,215,25,'#738f99',0)+rect(365,389,18,33,'#79dbd2',0)+rect(506,389,18,33,'#79dbd2',0)+
  text(494,179,'Cubierta',25)+text(686,378,'Andén',24)+text(365,365,'Carriles',24,'#79dbd2')+
  line(522,406,651,406,'#edb896',2)+line(642,398,642,435,'#edb896',3)+text(522,502,'Comparar la cota del andén con la vía',23,'#edb896')+
  text(345,292,'Conservar el vacío inferior',27,'#ffffff'))
save('patios','Conservar el vacío también es modelar','El contorno exterior no basta: patios, islas y caminos cambian la superficie útil.',
  rect(60,161,490,325,'#244a40')+rect(650,161,490,325,'#244a40')+
  text(87,208,'SE PIERDEN LOS HUECOS',23,'#ffb1a9')+text(677,208,'SE CONSERVAN LAS RELACIONES',23,'#79dbd2')+
  rect(220,263,167,131,'#46765c')+rect(810,263,167,131,'#101d2b')+text(843,337,'Patio',25)+
  rect(82,420,445,21,'#46765c',0)+rect(672,420,445,21,'#d2b895',0)+
  `<ellipse cx="447" cy="301" rx="55" ry="50" fill="#527e77"/><ellipse cx="1037" cy="301" rx="55" ry="50" fill="#527e77"/><ellipse cx="1037" cy="301" rx="20" ry="19" fill="#bdc5a0"/>`+
  [110,180,250,320,390,460].map(x=>`<circle cx="${x}" cy="430" r="15" fill="#83a565"/>`).join('')+
  text(87,518,'Vegetación sobre el recorrido',21,'#ffb1a9')+text(677,518,'Camino libre · patio abierto · isla',21,'#79dbd2'))
}
for (lang of ['es', 'en']) build()
console.log('Shanghai diagrams generated (es + en)')
