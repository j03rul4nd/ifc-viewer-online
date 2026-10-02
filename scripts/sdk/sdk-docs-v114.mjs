// ─── SDK docs — v1.14 (presentation in articles) ─────────────────────────────
// Same conventions as sdk-docs-v111.mjs: ten languages, identifiers in English.

export const SDK_DOCS_V114 = {
  en: {
    camFrame: 'Frame for presentation: the model fills `fill` of the frame (0.2–0.98, default 0.85), fitted to its corners rather than its bounding sphere. azimuth / elevation look from any angle.',
    optView: "Once every model has loaded, frame it from this view with a tight fit. ui: 'article' implies 'iso'.",
    optFill: 'With view: share of the frame the model fills, 0.2–0.98.',
    optWheel: "'ctrl': the wheel scrolls your page and zooms only with Ctrl/⌘ held, like an embedded map. ui: 'article' implies it.",
    rec12T: 'A model inside an article', rec12B: "ui: 'article' is the canvas alone, framed so the model fills it, with a wheel that lets the reader keep scrolling. Pick the angle with frame().",
  },
  es: {
    camFrame: 'Encuadre para presentar: el modelo ocupa `fill` del marco (0,2–0,98; por defecto 0,85), ajustado a sus esquinas y no a su esfera envolvente. azimuth / elevation miran desde cualquier ángulo.',
    optView: "Cuando todos los modelos han cargado, encuádralos desde esta vista con un ajuste ceñido. ui: 'article' implica 'iso'.",
    optFill: 'Con view: parte del marco que ocupa el modelo, 0,2–0,98.',
    optWheel: "'ctrl': la rueda desplaza tu página y solo hace zoom con Ctrl/⌘ pulsado, como un mapa incrustado. ui: 'article' lo implica.",
    rec12T: 'Un modelo dentro de un artículo', rec12B: "ui: 'article' es solo el lienzo, encuadrado para que el modelo lo llene, con una rueda que deja al lector seguir leyendo. Elige el ángulo con frame().",
  },
  de: {
    camFrame: 'Bildausschnitt für die Präsentation: Das Modell füllt `fill` des Bildes (0,2–0,98, Standard 0,85), an seine Ecken angepasst statt an die Hüllkugel. azimuth / elevation wählen jeden Blickwinkel.',
    optView: "Sobald alle Modelle geladen sind, aus dieser Ansicht eng einpassen. ui: 'article' setzt 'iso'.",
    optFill: 'Mit view: Anteil des Bildes, den das Modell füllt, 0,2–0,98.',
    optWheel: "'ctrl': Das Mausrad scrollt Ihre Seite und zoomt nur mit gedrückter Strg/⌘ — wie eine eingebettete Karte. ui: 'article' setzt es.",
    rec12T: 'Ein Modell in einem Artikel', rec12B: "ui: 'article' ist nur die Leinwand, so eingepasst, dass das Modell sie füllt, mit einem Mausrad, das Lesende weiterscrollen lässt. Den Winkel wählt frame().",
  },
  fr: {
    camFrame: 'Cadrage de présentation : le modèle occupe `fill` du cadre (0,2–0,98, 0,85 par défaut), ajusté à ses coins plutôt qu’à sa sphère englobante. azimuth / elevation choisissent l’angle.',
    optView: "Une fois tous les modèles chargés, les cadrer serré depuis cette vue. ui: 'article' implique 'iso'.",
    optFill: 'Avec view : part du cadre occupée par le modèle, 0,2–0,98.',
    optWheel: "'ctrl' : la molette fait défiler votre page et ne zoome qu’avec Ctrl/⌘, comme une carte intégrée. ui: 'article' l’implique.",
    rec12T: 'Un modèle dans un article', rec12B: "ui: 'article', c’est le canevas seul, cadré pour que le modèle le remplisse, avec une molette qui laisse le lecteur continuer à défiler. L’angle se choisit avec frame().",
  },
  pt: {
    camFrame: 'Enquadramento para apresentar: o modelo ocupa `fill` do quadro (0,2–0,98, por omissão 0,85), ajustado aos seus cantos e não à esfera envolvente. azimuth / elevation olham de qualquer ângulo.',
    optView: "Quando todos os modelos carregam, enquadrá-los a partir desta vista, de forma justa. ui: 'article' implica 'iso'.",
    optFill: 'Com view: parte do quadro que o modelo ocupa, 0,2–0,98.',
    optWheel: "'ctrl': a roda desloca a sua página e só faz zoom com Ctrl/⌘ premido, como um mapa incorporado. ui: 'article' implica-o.",
    rec12T: 'Um modelo dentro de um artigo', rec12B: "ui: 'article' é só a tela, enquadrada para o modelo a preencher, com uma roda que deixa o leitor continuar a ler. Escolha o ângulo com frame().",
  },
  it: {
    camFrame: 'Inquadratura per la presentazione: il modello occupa `fill` del riquadro (0,2–0,98, predefinito 0,85), adattato ai suoi spigoli e non alla sfera che lo contiene. azimuth / elevation scelgono l’angolo.',
    optView: "Quando tutti i modelli sono caricati, inquadrarli stretti da questa vista. ui: 'article' implica 'iso'.",
    optFill: 'Con view: quota del riquadro occupata dal modello, 0,2–0,98.',
    optWheel: "'ctrl': la rotellina scorre la pagina e fa zoom solo con Ctrl/⌘ premuto, come una mappa incorporata. ui: 'article' lo implica.",
    rec12T: 'Un modello dentro un articolo', rec12B: "ui: 'article' è solo il canvas, inquadrato perché il modello lo riempia, con una rotellina che lascia continuare a leggere. L’angolo si sceglie con frame().",
  },
  ca: {
    camFrame: 'Enquadrament per presentar: el model ocupa `fill` del marc (0,2–0,98; per defecte 0,85), ajustat a les seves cantonades i no a l’esfera que l’envolta. azimuth / elevation miren des de qualsevol angle.',
    optView: "Quan tots els models han carregat, enquadra’ls des d’aquesta vista amb un ajust estret. ui: 'article' implica 'iso'.",
    optFill: 'Amb view: part del marc que ocupa el model, 0,2–0,98.',
    optWheel: "'ctrl': la roda desplaça la teva pàgina i només fa zoom amb Ctrl/⌘ premut, com un mapa incrustat. ui: 'article' ho implica.",
    rec12T: 'Un model dins d’un article', rec12B: "ui: 'article' és només el llenç, enquadrat perquè el model l’ompli, amb una roda que deixa el lector continuar llegint. Tria l’angle amb frame().",
  },
  zh: {
    camFrame: '用于展示的取景：模型占画面的 `fill`（0.2–0.98，默认 0.85），按包围盒角点而非包围球拟合。azimuth / elevation 可从任意角度观察。',
    optView: "所有模型加载完成后，从该视图紧凑取景。ui: 'article' 默认 'iso'。",
    optFill: '配合 view：模型占画面的比例，0.2–0.98。',
    optWheel: "'ctrl'：滚轮滚动你的页面，只有按住 Ctrl/⌘ 才缩放，就像嵌入的地图。ui: 'article' 默认如此。",
    rec12T: '文章中的模型', rec12B: "ui: 'article' 只有画布，模型填满画面，滚轮让读者继续阅读。用 frame() 选择角度。",
  },
  ja: {
    camFrame: 'プレゼン用の構図：モデルが画面の `fill`（0.2–0.98、既定 0.85）を占めるよう、外接球ではなく角に合わせてフィットします。azimuth / elevation で任意の角度から。',
    optView: "すべてのモデルの読み込み後、このビューからぴったり収めます。ui: 'article' は 'iso' を含みます。",
    optFill: 'view と併用：モデルが占める画面の割合、0.2–0.98。',
    optWheel: "'ctrl'：ホイールはページをスクロールし、Ctrl/⌘ を押したときだけズーム。埋め込み地図と同じ動き。ui: 'article' で有効。",
    rec12T: '記事の中のモデル', rec12B: "ui: 'article' はキャンバスだけ。モデルが画面いっぱいに収まり、ホイールでは読者がそのまま読み進められます。角度は frame() で。",
  },
  th: {
    camFrame: 'จัดเฟรมเพื่อนำเสนอ: โมเดลกินพื้นที่ `fill` ของเฟรม (0.2–0.98 ค่าเริ่มต้น 0.85) โดยพอดีกับมุมของกล่อง ไม่ใช่ทรงกลมล้อมรอบ azimuth / elevation เลือกมุมมองได้ทุกมุม',
    optView: "เมื่อโหลดโมเดลครบ จัดเฟรมให้พอดีจากมุมมองนี้ ui: 'article' ใช้ 'iso' โดยอัตโนมัติ",
    optFill: 'ใช้กับ view: สัดส่วนของเฟรมที่โมเดลครอบคลุม 0.2–0.98',
    optWheel: "'ctrl': ล้อเมาส์เลื่อนหน้าเว็บของคุณ และซูมเฉพาะเมื่อกด Ctrl/⌘ เหมือนแผนที่ฝัง ui: 'article' ใช้โดยอัตโนมัติ",
    rec12T: 'โมเดลในบทความ', rec12B: "ui: 'article' มีเพียงแคนวาส จัดเฟรมให้โมเดลเต็มพื้นที่ และล้อเมาส์ให้ผู้อ่านเลื่อนอ่านต่อได้ เลือกมุมด้วย frame()",
  },
}
