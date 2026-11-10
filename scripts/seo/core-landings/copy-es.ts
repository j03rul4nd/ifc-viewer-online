import type { LangCopy } from './types'

// Spanish (Spain) copy for the six landing families. Translated from copy-en.ts:
// same structure, same figures. Vendor quotes stay in English inside «…».

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fuentes',
    readOn: 'consultado el',
    faqLabel: 'FAQ',
    faqTitle: 'Preguntas',
    related: 'Páginas relacionadas',
    fix: 'Corregir errores IFC',
    blogSolibri: 'Solibri o un validador en el navegador: la comparativa completa',
    pricing: 'Precios',
    embedCta: 'Ejecuta la validación en un IFC de ejemplo',
    embedSub: 'Carga el validador en esta página. No se sube nada.',
  },
  pages: {
    // ─────────────────────────────────────────────────────────────────────────
    validator: {
      title: 'Validación IFC Online — Validador IFC Gratis, 44 Reglas',
      desc: 'Comprueba un archivo IFC en tu navegador: 44 reglas, IDS 1.0 y un Health Score de 0 a 100. El archivo no se sube. Gratis, sin cuenta. IFC2x3, IFC4, IFC4x3.',
      nav: 'Validador IFC',
      kicker: '44 reglas · IDS 1.0 · El archivo se queda en tu navegador · Gratis',
      h1: ['Validación IFC online', 'Qué falla en el archivo y dónde'],
      lead: 'Suelta un archivo IFC y obtén un Health Score de 0 a 100, la lista de problemas agrupados por regla y los elementos que fallan resaltados en el modelo 3D. El archivo se lee en la pestaña de tu navegador y no se sube.',
      cta: 'Validar un archivo IFC',
      cta2: 'o abre el modelo de ejemplo',
      note: 'Sin cuenta. IFC2x3, IFC4, IFC4x1 e IFC4x3, hasta 2 GB por archivo.',
      shots: [
        { alt: 'Validación IFC de una casa de dos plantas en el navegador: Health Score 77, un error y 161 avisos, las tres correcciones que recuperan más puntos y la vista 3D recorriendo los 119 elementos sin tipo', cap: 'El modelo público de ejemplo Duplex (2,3 MB, 7.181 entidades) obtiene un 77. «Show in 3D» en la primera corrección encuadra los 119 elementos sin tipo, con un contador para recorrerlos uno a uno.' },
        { alt: 'Lista de incidencias de una validación IFC agrupadas por regla, con el número de elementos que incumplen cada regla y la explicación de cómo corregirla', cap: 'Cada regla se despliega con sus elementos y con los pasos para corregirla en Revit, Archicad o Tekla.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Alcance', h2: 'Qué cubre la comprobación y qué no',
          sub: 'Hay 44 reglas en ocho grupos. 25 se ejecutan por defecto; las otras 19 se activan desde un perfil porque necesitan una decisión tuya (un nivel de LOD, un patrón de nomenclatura, un sistema de clasificación).',
          cols: [
            { h: 'Comprueba', items: [
              'Identificadores: GlobalIds duplicados y GlobalIds que no son GUID IFC válidos de 22 caracteres.',
              'Estructura: un único IfcProject, la cadena Proyecto → Emplazamiento → Edificio → Planta, elementos sin planta, agregaciones rotas o circulares, huecos sin elemento anfitrión.',
              'Plantas: cotas ausentes, duplicadas o desordenadas.',
              'Datos: nombres vacíos, nombres duplicados, valores de propiedad vacíos, elementos sin tipo o sin material, espacios sin superficie.',
              'Calidad de la exportación: más del 5% de los elementos como IfcBuildingElementProxy, un modelo a más de 10 km del origen, más de 500 KB por elemento, unidades de longitud imperiales.',
              'Bajo petición: conjuntos de propiedades obligatorios por clase, patrones de nomenclatura, clasificación, propiedades y cantidades de LOD 100–400, campos de proyecto y autor de ISO 19650, sistemas MEP.',
              'Tus propios requisitos: un archivo IDS 1.0, uno de los cinco perfiles incluidos (entrega básica, revisión de calidad, coordinación BIM, ISO 19650, LOD 300) o un perfil que definas tú.',
            ] },
            { h: 'No comprueba', items: [
              'Colisiones entre dos modelos. Las reglas de colisión comparan cajas envolventes dentro de un mismo modelo, con un solape de 5 cm, hasta 800 elementos y 100 resultados. Son un primer filtro, no coordinación.',
              'Normativa de edificación: accesibilidad, protección contra incendios, recorridos de evacuación o alturas libres. Aquí ninguna regla lee una norma.',
              'El esquema IFC completo. No es una prueba de conformidad EXPRESS: ejecuta estas 44 reglas y tu IDS.',
              'Códigos de ISO 19650. La regla del nombre de archivo lee el nombre escrito en la cabecera del IFC y cuenta sus campos; no verifica cada código.',
              'Archivos nativos. Lee IFC, no archivos de Revit ni de Archicad.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Límites', h2: 'Límites, con cifras',
          head: ['', 'Límite'],
          rows: [
            ['Tamaño de archivo', 'Con 2 GB por archivo se rechaza. Aparece un aviso a partir de 200 MB y una advertencia de memoria a partir de 1 GB. En móviles, tabletas y ordenadores con 4 GB de memoria o menos, la advertencia empieza en 80 MB.'],
            ['Formatos', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, como .ifc o dentro de .ifczip y .zip.'],
            ['Reglas', '44 en total, 25 activas por defecto. La severidad y los umbrales se pueden cambiar en cada regla.'],
            ['IDS', 'IDS 1.0 con sus seis facetas. Las restricciones totalDigits, fractionDigits y whiteSpace no se leen. Se listan hasta 200 elementos que fallan por especificación.'],
            ['Correcciones automáticas', 'GlobalIds no válidos y duplicados, y nombres vacíos o duplicados. Todo lo demás lo editas a mano o lo corriges en el software de modelado.'],
            ['Velocidad', 'El ejemplo de la imagen (2,3 MB, 7.181 entidades) se validó en unos 20 segundos en el ordenador usado para estas capturas. El tiempo crece con el número de entidades.'],
            ['Conexión', 'La página tiene que cargarse desde internet. No funciona sin conexión.'],
          ],
        },
        {
          kind: 'text', label: 'Tu archivo', h2: 'Qué pasa con el archivo',
          ps: [
            'El IFC lo abre código que se ejecuta en la pestaña de tu navegador. No se nos envía a nosotros ni a nadie más, así que no hay subida que esperar ni nada que borrar después.',
            'Para reabrir un modelo más rápido, el navegador guarda una copia convertida de su geometría en su propio almacenamiento privado en tu ordenador (hasta 4 GB; las más antiguas se eliminan primero). Borrar los datos del sitio en tu navegador la elimina.',
            'Dos cosas sí salen del navegador, y ambas las controlas tú. Las estadísticas de uso sin cookies registran que se abrió un archivo, su tamaño y su número de elementos, nunca su contenido; se pueden desactivar y respetan Do Not Track. Y si pulsas Compartir, el propio enlace lleva la puntuación, el nombre del archivo y las 50 primeras incidencias con los nombres de sus elementos, de modo que cualquiera que tenga el enlace puede leerlos.',
          ],
        },
        { kind: 'shot', label: 'El resultado', h2: 'De la puntuación al elemento', sub: 'Pruébalo aquí con el modelo de ejemplo y después abre tu propio archivo.' },
        {
          kind: 'steps', label: 'Cómo funciona', h2: 'Del archivo a un IFC corregido',
          steps: [
            ['Abre el archivo', 'Arrastra el .ifc a la página. Puede haber varios archivos abiertos a la vez; cada uno se valida por separado.'],
            ['Lee el veredicto', 'La puntuación, los errores y avisos, y las tres correcciones que recuperan más puntos. Un clic resalta los elementos que fallan.'],
            ['Corrige lo que se puede corregir aquí', 'Regenera los GlobalIds no válidos, renombra en bloque, edita nombres y valores de propiedad. Cada edición se puede deshacer.'],
            ['Exporta', 'El IFC corregido, escrito de nuevo por el parser, y las incidencias como BCF 2.1, CSV, JSON, un informe de entrega en HTML o una hoja de cálculo COBie.'],
          ],
        },
        {
          kind: 'text', label: 'Precio', h2: 'Cuánto cuesta',
          ps: [
            'Nada. El visor, las 44 reglas, IDS, las correcciones y todas las exportaciones de esta página son gratis, sin cuenta, también para trabajo comercial. El código fuente es público bajo licencia MIT en [GitHub](github).',
            'Los planes de pago (Pro a 19 € al mes, Team a 35 € por editor al mes) son para lo que necesita un servidor, como almacenar modelos y guardar conjuntos de reglas. Todavía no están a la venta; la [página de precios](pricing) explica qué incluirá cada uno.',
          ],
        },
      ],
      faq: [
        ['¿Se sube el archivo IFC a un servidor?', 'No. El archivo lo lee código que se ejecuta en la pestaña de tu navegador. Solo salen del navegador las estadísticas de uso anónimas (tamaño del archivo y número de elementos, nunca el contenido) y los enlaces para compartir que crees tú.'],
        ['¿Qué versiones de IFC lee?', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, como archivos .ifc o dentro de archivos .ifczip y .zip. Los archivos de 2 GB o más se rechazan.'],
        ['¿Sustituye a una herramienta de detección de colisiones?', 'No. Las reglas de colisión comparan cajas envolventes dentro de un único modelo y están desactivadas por defecto. Encuentran solapes evidentes antes de que envíes un modelo; la coordinación entre disciplinas necesita una herramienta de colisiones.'],
        ['¿Puedo comprobar un modelo contra mis propios requisitos?', 'Sí. Carga un archivo IDS 1.0 o parte de uno de los siete conjuntos de requisitos ya preparados (entrega ISO 19650, LOD 200 y LOD 400, entrega COBie y otros). También puedes crear un perfil de validación con tus propios patrones de nomenclatura y conjuntos de propiedades obligatorios.'],
        ['¿Puedo corregir los errores y volver a exportar el IFC?', 'Los GlobalIds y los nombres se pueden corregir automáticamente; los nombres, las descripciones y los valores de propiedad se pueden editar a mano, con deshacer. La exportación escribe de nuevo el IFC con esos cambios. La geometría y las relaciones no se pueden editar.'],
        ['¿Funciona sin conexión a internet?', 'No. La página tiene que cargarse desde internet. Para redes sin acceso a internet existe una [instalación on-premise](onprem).'],
      ],
      bottom: ['Comprueba un archivo ahora', 'Gratis, sin cuenta, y el archivo se queda en tu navegador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    cloud: {
      title: 'Validador IFC en la Nube — Valida Online, Sin Subir Nada',
      desc: 'Comprobación IFC desde una página web sin subir el modelo: 44 reglas, IDS 1.0 y un Health Score calculado en tu navegador. Gratis, sin cuenta, hasta 2 GB.',
      nav: 'Validador IFC en la nube',
      kicker: 'Online · Sin subida · 44 reglas · IDS 1.0 · Gratis',
      h1: ['Validador IFC en la nube', 'sin la subida'],
      lead: 'Una herramienta de comprobación IFC en la nube suele implicar enviar el modelo al servidor de otro. Esta es una página web que hace el trabajo en tu propio navegador: la misma comodidad, y el archivo nunca sale de tu ordenador.',
      cta: 'Validar un archivo IFC',
      cta2: 'o abre el modelo de ejemplo',
      note: 'Sin cuenta. Funciona en Chrome, Edge, Firefox y Safari. Hasta 2 GB por archivo.',
      shots: [
        { alt: 'Comprobación IDS de un modelo IFC en el navegador: la especificación «Walls declare a FireRating in Pset_WallCommon» falla en los 57 muros de una casa de dos plantas mostrada en 3D', cap: 'Un IDS 1.0 de ejemplo comprobado contra el modelo: ninguno de los 57 muros declara una resistencia al fuego. El modelo y el IDS se leen los dos en la pestaña del navegador.' },
        { alt: 'Diálogo de exportación de una validación IFC con los formatos JSON, CSV, certificado, BCF, informe de entrega y COBie', cap: 'Las incidencias salen como archivos que descargas: BCF 2.1, CSV, JSON, un informe de entrega en HTML o una hoja de cálculo COBie.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Subida o navegador', h2: 'Un servicio de comprobación que sube el modelo y una página que no',
          sub: 'Solibri WebChecker es el ejemplo publicado más claro de un servicio de comprobación en la nube, así que es la comparación que se hace aquí. Su columna cita la propia página de Solibri.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['A dónde va el modelo', 'Se sube al servicio. Los datos se almacenan en la UE o en EE. UU., según se elija al configurar el proyecto', 'A ninguna parte. Se lee en la pestaña de tu navegador'],
            ['Cuánto se conservan los resultados', '30 días; después se eliminan', 'Hasta que cierras la pestaña. Conservas lo que exportes'],
            ['Tamaño de archivo', 'Hasta 5 GB por archivo IFC', 'Menos de 2 GB por archivo, y menos en un ordenador con poca memoria'],
            ['Cuenta', 'Un Solibri ID y un plan Solibri Advanced o Premium', 'Ninguna'],
            ['Coste de una comprobación', '50 tokens. Advanced incluye 1.750 tokens al año, Premium 17.500; un paquete de 5.000 tokens cuesta 250 €', 'Gratis'],
            ['Comprobaciones', 'La comprobación Model Health de Solibri, o un conjunto de reglas personalizado (.cset) preparado en la aplicación de escritorio de Solibri', '44 reglas fijas y tus archivos IDS 1.0'],
            ['Resultados', 'PDF y BCF; archivos SMC con Premium', 'BCF 2.1, CSV, JSON, informe HTML, hoja de cálculo COBie. No hay archivo PDF: el informe HTML se imprime desde el navegador'],
          ],
          after: [
            'Un servidor se justifica cuando los archivos son más grandes de lo que un navegador puede manejar, cuando los resultados deben seguir disponibles para todo el equipo del proyecto o cuando las comprobaciones tienen que ejecutarse sin supervisión. Aquí no ocurre nada de eso: esta página comprueba el archivo de una persona en el ordenador de esa persona.',
            'El navegador gana cuando el modelo no puede salir del edificio, cuando nadie va a aprobar un proveedor nuevo esta semana o cuando solo necesitas una respuesta sobre un archivo.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Alcance', h2: 'Qué comprueba y qué no',
          cols: [
            { h: 'Comprueba', items: [
              '44 reglas en ocho grupos: identificadores, estructura espacial, plantas, nombres, valores de propiedad, tipos, materiales, calidad de la exportación. 25 se ejecutan por defecto.',
              'Archivos IDS 1.0, con las seis facetas: entidad, atributo, propiedad, clasificación, material y «part-of».',
              'Cinco perfiles de validación incluidos (entrega básica, revisión de calidad, coordinación BIM, ISO 19650, LOD 300), o los tuyos.',
            ] },
            { h: 'No comprueba', items: [
              'Colisiones entre modelos. Solo cajas envolventes dentro de un mismo modelo, desactivado por defecto.',
              'Normativa de edificación ni reglas de diseño escritas para tu proyecto. No hay editor de reglas; los requisitos entran como IDS.',
              'Lotes. Cada archivo lo abre una persona; nada se ejecuta de forma programada.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Límites', h2: 'Límites, con cifras',
          head: ['', 'Límite'],
          rows: [
            ['Tamaño de archivo', 'Con 2 GB por archivo se rechaza. Aparece un aviso a partir de 200 MB y una advertencia de memoria a partir de 1 GB; en móviles, tabletas y ordenadores con 4 GB de memoria o menos empieza en 80 MB.'],
            ['Formatos', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, como .ifc o dentro de .ifczip y .zip.'],
            ['IDS', 'IDS 1.0. Las restricciones totalDigits, fractionDigits y whiteSpace no se leen. Se listan hasta 200 elementos que fallan por especificación.'],
            ['Compartir', 'Un enlace para compartir lleva la puntuación y las 50 primeras incidencias dentro de la URL, hasta 8.000 caracteres. El modelo no va en él.'],
            ['Conexión', 'La página tiene que cargarse desde internet. No funciona sin conexión.'],
          ],
        },
        {
          kind: 'text', label: 'Tu archivo', h2: 'Qué pasa con el archivo',
          ps: [
            'El IFC lo abre código que se ejecuta en la pestaña de tu navegador y no se envía a ningún sitio. Puedes comprobarlo tú mismo: abre las herramientas para desarrolladores del navegador, observa la pestaña Red y suelta un archivo.',
            'El navegador guarda una copia convertida de la geometría en su almacenamiento privado en tu ordenador (hasta 4 GB) para reabrir el modelo más rápido. Borrar los datos del sitio la elimina.',
            'Las estadísticas de uso sin cookies registran el tamaño del archivo y el número de elementos, nunca el contenido, y se pueden desactivar. Un enlace para compartir, si lo creas, contiene la puntuación, el nombre del archivo y hasta 50 incidencias con nombres de elementos.',
          ],
        },
        { kind: 'shot', label: 'El resultado', h2: 'Pruébalo con un modelo de ejemplo', sub: 'La demo de abajo se ejecuta en esta página. Después abre tu propio archivo.' },
        {
          kind: 'text', label: 'Precio', h2: 'Cuánto cuesta',
          ps: [
            'Nada: el visor, las reglas, IDS y las exportaciones son gratis y no necesitan cuenta. El código es público bajo licencia MIT en [GitHub](github).',
            'Los planes de pago que añaden un servidor (modelos almacenados, conjuntos de reglas guardados, trabajo en equipo) se describen en la [página de precios](pricing) y todavía no están a la venta.',
          ],
        },
      ],
      faq: [
        ['¿Es un servicio en la nube?', 'Se entrega desde la web como si lo fuera, pero la comprobación la hace tu navegador. No hay subida, ni cola, ni copia almacenada del modelo por nuestra parte.'],
        ['¿Cómo puedo verificar que no se sube nada?', 'Abre las herramientas para desarrolladores de tu navegador, ve a la pestaña Red y suelta un archivo IFC. Verás cargarse los archivos de la propia página y ninguna petición que lleve el modelo.'],
        ['¿Qué tamaño de archivo admite?', 'Los archivos de 2 GB o más se rechazan, y el límite práctico depende de la memoria del ordenador: aparece una advertencia a partir de 1 GB, o a partir de 80 MB en móviles y equipos con 4 GB de memoria o menos. Solibri WebChecker acepta hasta 5 GB por archivo (solibri.com/solutions/webchecker, consultado el 2026-11-10).'],
        ['¿Puedo automatizarlo?', 'Desde esta página no: cada archivo lo abre una persona. Hay un servidor MCP (ifc-viewer-mcp) que ejecuta la misma validación en tu propia máquina desde un asistente o un script; consulta el [código fuente en GitHub](github).'],
        ['¿Se puede usar con modelos confidenciales?', 'El modelo se queda en tu ordenador, que es lo que suele pedir un NDA. Contrasta dos cosas con tu propia política: las estadísticas de uso anónimas (se pueden desactivar) y los enlaces para compartir (contienen nombres de archivo y de elementos).'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Comprueba un archivo sin subirlo', 'Gratis, sin cuenta. El modelo se queda en tu ordenador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    onprem: {
      title: 'Validador IFC On-Premise — Validación BIM en Red Aislada',
      desc: 'Visor IFC, validador de 44 reglas y comprobaciones IDS servidos desde tu red, sin conexión a internet. Imagen de contenedor, instalación, formación y soporte.',
      nav: 'Validación IFC on-premise',
      kicker: 'On-premise · Sin conexión a internet · Tu servidor',
      h1: ['Validador IFC on-premise', 'para redes que permanecen cerradas'],
      lead: 'La aplicación pública ya lee los archivos IFC dentro del navegador, pero la propia página se carga desde internet. Donde eso no está permitido, el mismo visor, el mismo validador y las mismas comprobaciones IDS se sirven desde un contenedor en tu propio servidor.',
      cta: 'Solicitar un piloto',
      cta2: '',
      note: 'Una sede, alcance cerrado: instalación, configuración con tus requisitos, una sesión de formación y un periodo de soporte.',
      shots: [
        { alt: 'Validador IFC con la lista de perfiles de validación incluidos abierta: entrega básica, revisión de calidad, coordinación BIM, cumplimiento de ISO 19650 y diseño LOD 300', cap: 'Los perfiles incluidos. Durante el piloto se cargan tus propios perfiles y archivos IDS y se prueban con tus modelos.' },
        { alt: 'Resultado de una comprobación IDS en el validador IFC: una especificación fallida, 0 de 57 muros con una propiedad FireRating, con botones para resaltar, aislar y exportar', cap: 'Un modelo comprobado contra un archivo IDS: los 57 muros incumplen el requisito de resistencia al fuego. On-premise, el modelo y los requisitos se quedan en tu red.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Para quién es', h2: 'Cuando «no se sube nada» no es suficiente',
          cols: [
            { h: 'Encaja cuando', items: [
              'Los puestos de trabajo no tienen acceso a internet, o no pueden cargar software desde internet.',
              'Necesitas una única versión auditada que no cambie hasta que tú lo decidas.',
              'Los modelos de los contratistas deben comprobarse contra tu IDS o tu EIR sin pasar por un tercero.',
              'Quieres tener a quién llamar cuando no funcione.',
            ] },
            { h: 'No lo necesitas cuando', items: [
              'Tu política solo prohíbe subir modelos. El [validador público](validator) no los sube.',
              'Tienes personal para alojarlo vosotros mismos. El código tiene licencia MIT e incluye un Dockerfile: construye la imagen y sírvela. El piloto añade configuración, formación y soporte, no un producto distinto.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Qué recibes', h2: 'Qué se instala y qué no',
          head: ['', 'Detalle'],
          rows: [
            ['Software', 'El visor, las 44 reglas con el Health Score, IDS 1.0, BCF 2.1 y 3.0, varios modelos a la vez, medición y secciones. Una aplicación web estática servida por nginx desde un contenedor; la comprobación se ejecuta en el navegador de cada usuario.'],
            ['Servidor', 'Cualquier máquina que ejecute un contenedor. Solo sirve archivos, así que necesita poco: el trabajo lo hacen los puestos de trabajo.'],
            ['Conexiones', 'Ninguna conexión saliente y ninguna estadística de uso en esta versión.'],
            ['No disponible sin conexión', 'El contexto de mapa 3D (terreno, edificios de OpenStreetMap) y los modelos de ejemplo online, porque se descargan de internet.'],
            ['Tus requisitos', 'Tus archivos IDS, perfiles de validación y patrones de nomenclatura cargados y probados con tus propios modelos.'],
            ['Actualizaciones', 'Un nuevo archivo de imagen, entregado por el canal que elijas. Nada se actualiza solo.'],
            ['Hardware', 'Tu propio servidor o máquina virtual. Bajo petición se puede suministrar un gateway preconfigurado.'],
          ],
        },
        {
          kind: 'table', label: 'Alternativas', h2: 'La otra opción para redes aisladas que conocemos',
          sub: 'Si estás comparando, esto es lo que Solibri publica sobre su plan sin conexión.',
          head: ['', 'Solibri Security+', 'IFC Viewer Online on-premise'],
          rows: [
            ['Se describe como', '«Fully offline operation (no telemetry)», «Air-gapped by design», «Controlled update cycles»', 'Un contenedor en tu servidor; ninguna conexión saliente'],
            ['Precio', 'No publicado; «Talk with an expert»', 'Se presupuesta por piloto tras una llamada para definir el alcance'],
            ['Comprobaciones', 'La validación basada en reglas de Solibri', '44 reglas fijas e IDS 1.0; colisiones solo por caja envolvente'],
          ],
          after: [
            'Solibri es la opción más sólida cuando necesitas detección de colisiones entre disciplinas o reglas escritas para tu organización. Esta instalación es algo más pequeño: abrir una entrega, comprobarla contra tus requisitos y devolver las incidencias.',
          ],
          sources: ['solibriPricing'],
        },
        {
          kind: 'steps', label: 'Piloto', h2: 'Cómo funciona un piloto',
          steps: [
            ['Llamada de alcance', 'Las normas de tu red, el tamaño de tus modelos, tus requisitos y quién lo va a usar.'],
            ['Instalación', 'En tu servidor, con tus archivos IDS y perfiles cargados.'],
            ['Formación', 'Una sesión con tus coordinadores BIM, sobre tus propios modelos.'],
            ['Decisión', 'Tras el periodo de soporte decides si lo extiendes a otras sedes.'],
          ],
        },
        {
          kind: 'form', label: 'Solicitar un piloto', h2: 'Cuéntanos cómo es tu entorno',
          sub: 'El formulario abre un mensaje en tu propio programa de correo. No se envía nada a nuestros servidores.',
          org: 'Organización', sector: 'Sector',
          sectors: ['Defensa / seguridad', 'Energía / suministros', 'Transporte / infraestructuras', 'Administración pública', 'Industria / fabricación', 'Empresa AEC', 'Otro'],
          deploy: 'Red', deploys: ['Sin ningún acceso a internet', 'Red privada, internet restringido', 'Nube privada en nuestra región', 'Aún no lo sé'],
          hw: 'Hardware', hws: ['Nuestro propio servidor o máquina virtual', 'Un gateway preconfigurado', 'Aún no lo sé'],
          need: '¿Qué necesitas comprobar y qué tamaño aproximado tienen los modelos?',
          submit: 'Abrir el correo', direct: 'O escribe a', subject: 'Piloto de validación IFC on-premise',
        },
      ],
      faq: [
        ['¿Sale algo de nuestra red?', 'No. El contenedor sirve la aplicación a vuestros navegadores y no hace ninguna conexión saliente; esta versión no lleva estadísticas de uso. Los modelos se leen en el navegador de cada usuario y no se almacenan en el servidor.'],
        ['¿En qué se diferencia de la aplicación pública?', 'El programa es el mismo. Lo que cambia es desde dónde se sirve, que es una versión fija y que las funciones que necesitan internet (el contexto de mapa y los modelos de ejemplo online) no están disponibles.'],
        ['¿Podemos alojarlo nosotros sin vosotros?', 'Sí. El código fuente es público bajo licencia MIT e incluye un Dockerfile y una configuración de nginx. El piloto es para equipos que lo quieren configurado, explicado y con soporte.'],
        ['¿Qué tamaño pueden tener los modelos?', 'El mismo que en la aplicación pública: menos de 2 GB por archivo, limitado en la práctica por la memoria de cada puesto de trabajo, porque la comprobación se ejecuta en el navegador.'],
        ['¿Cuánto cuesta?', 'Un piloto se presupuesta después de la llamada de alcance, porque depende del número de sedes y del soporte que necesites. Todavía no hay una lista de precios pública.'],
      ],
      bottom: ['¿Tu red está conectada? Entonces ya es gratis', 'El validador público lee el archivo en tu navegador y no sube nada.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    solibri: {
      title: 'Alternativa a Solibri Gratis — Validar IFC en el Navegador',
      desc: 'Cuándo basta un validador gratuito en el navegador y cuándo necesitas Solibri: precios, colisiones, reglas e IDS según la web de Solibri, leída el 2026-11-10.',
      nav: 'Alternativa a Solibri',
      kicker: 'Gratis · En el navegador · Comparado con los planes publicados de Solibri',
      h1: ['Alternativa a Solibri gratuita', 'para comprobar un IFC antes de entregarlo'],
      lead: 'Solibri es una plataforma de comprobación basada en reglas que se vende en planes de 99 € a 2.772 € por licencia y año. IFC Viewer Online es una página web gratuita que abre un IFC, ejecuta 44 reglas fijas y tu IDS, y muestra qué falla. Sustituye a Solibri en algunos trabajos y en otros no; esta página dice en cuáles.',
      cta: 'Validar un archivo IFC',
      cta2: 'o abre el modelo de ejemplo',
      note: 'Sin cuenta, sin instalar nada, y el archivo no se sube.',
      heroSources: ['solibriPricing'],
      shots: [
        { alt: 'Modelo IFC comprobado en el navegador con la regla de colisiones activada: Health Score 70, 36 colisiones entre elementos en primer lugar en la lista de correcciones y los elementos implicados resaltados en la vista 3D', cap: 'El modelo de ejemplo con la regla de colisiones activada: 36 solapes entre cajas envolventes, y la puntuación baja de 77 a 70. Es un primer filtro dentro de un mismo modelo, no la detección de colisiones que vende Solibri.' },
        { alt: 'Comprobación IDS en el navegador: una especificación IDS que exige una resistencia al fuego en los muros, incumplida por los 57 muros del modelo IFC mostrado en 3D', cap: 'Un archivo IDS 1.0 comprobado contra el modelo, gratis y sin cuenta: a 57 muros les falta la resistencia al fuego que pide la especificación.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparativa', h2: 'Solibri e IFC Viewer Online, lado a lado',
          sub: 'La columna de Solibri dice solo lo que Solibri publica. Donde sus páginas no indican algo (sistemas operativos, límites de tamaño de archivo), no hay fila.',
          head: ['', 'Solibri', 'IFC Viewer Online'],
          rows: [
            ['Precio', 'Starter 99 €, Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €: precios de partida por licencia y año. Security+ bajo petición', 'Gratis. Los planes de pago para funciones de servidor todavía no están a la venta'],
            ['Comprobación de modelos', 'Desde Essential. Starter es para ver modelos y revisar resultados: «Model checking is performed in Solibri Essential, Advanced, or Premium»', 'Incluida: 44 reglas fijas, 25 activas por defecto'],
            ['Detección de colisiones', 'Essential: comprobación de colisiones basada en reglas, colisiones duras y blandas. Advanced: una matriz de colisiones entre disciplinas con tolerancias', 'Solo cajas envolventes, dentro de un mismo modelo, solape de 5 cm, hasta 800 elementos y 100 resultados. Desactivada por defecto'],
            ['Tus propias reglas', 'Advanced y Premium: «Custom rule creation and modification»', 'No hay editor de reglas. Puedes activar y desactivar reglas, cambiar su severidad y definir patrones de nomenclatura y conjuntos de propiedades obligatorios; todo lo demás entra como IDS'],
            ['IDS', 'Essential comprueba las propiedades obligatorias contra definiciones IDS. Advanced añade flujos de trabajo IDS, un editor de IDS y un validador de IDS', 'IDS 1.0 con sus seis facetas. Tres restricciones (totalDigits, fractionDigits, whiteSpace) no se leen'],
            ['BCF', 'Desde Essential: «BCF issue management and CDE integrations»', 'Lee y escribe archivos BCF 2.1 y 3.0. Sin conexión a un servidor BCF ni a un CDE'],
            ['Modelos nativos de Revit', 'Desde Essential: «IFC and native Revit model federation»', 'Solo IFC'],
            ['Mediciones', 'Advanced: «Quantity / Information Takeoff (QTO / ITO)»', 'Suma las cantidades ya escritas en el IFC. Sin reglas de medición'],
            ['Sin internet', 'Security+: «Fully offline operation (no telemetry)»', 'La página se carga desde internet; el archivo no se sube. Existe una [instalación on-premise](onprem)'],
          ],
          after: [
            'Elige Solibri cuando coordinas varias disciplinas y necesitas una detección de colisiones de verdad, cuando tu organización escribe sus propias reglas o cuando la comprobación tiene que gobernarse en muchos proyectos. Nada de esta página hace eso.',
            'Elige IFC Viewer Online cuando quieres saber hoy si un IFC está en condiciones de enviarse: identificadores, estructura, nombres, propiedades, tu IDS. También es la herramienta para quienes rodean a un equipo de Solibri y no tienen licencia: el arquitecto que exporta el modelo, el cliente que lo recibe.',
            'Muchos equipos usarán los dos: una comprobación rápida en el navegador antes de exportar, y Solibri para la coordinación.',
          ],
          sources: ['solibriPricing', 'solibriStarter', 'solibriEssential', 'solibriAdvanced'],
        },
        {
          kind: 'text', label: 'Solibri hoy', h2: 'Si buscas Solibri Office o Solibri Anywhere',
          ps: [
            'El sitio de Solibri lista Solibri Office, CheckPoint, Anywhere y Site como productos heredados que están «no longer available for new customers». Los planes actuales son Starter, Essential, Advanced, Premium y Security+.',
            'La versión gratuita de Solibri Anywhere sigue funcionando para quienes ya la tienen, en versiones anteriores a la 26.4.0; Solibri dice que el derecho de uso gratuito no está disponible en versiones más recientes. Si usabas Anywhere para abrir y ver archivos IFC, el [visor](viewer) lo hace gratis, en el navegador, en cualquier sistema operativo.',
          ],
          sources: ['solibriLegacy', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Alcance', h2: 'Qué obtienes aquí y qué no',
          cols: [
            { h: 'Obtienes', items: [
              'Un Health Score de 0 a 100 y las correcciones que recuperan más puntos.',
              'Los elementos que fallan resaltados en el modelo 3D y listados por regla, planta o clase.',
              'Comprobaciones IDS 1.0 y cinco perfiles de validación incluidos, desde entrega básica hasta ISO 19650 y LOD 300.',
              'Correcciones automáticas de GlobalIds y nombres, edición manual de nombres y valores de propiedad, y el IFC corregido.',
              'Las incidencias como BCF 2.1, CSV, JSON, un informe HTML o una hoja de cálculo COBie.',
            ] },
            { h: 'No obtienes', items: [
              'Detección de colisiones entre modelos, ni a nivel de la geometría real.',
              'Un editor de reglas, comprobación normativa (accesibilidad, incendios, recorridos de evacuación) ni análisis de espacios.',
              'Seguimiento de incidencias con asignaciones en un servidor. Los archivos BCF se intercambian a mano.',
              'Archivos de 2 GB o más. El límite depende de la memoria de tu ordenador.',
            ] },
          ],
        },
        { kind: 'shot', label: 'Pruébalo', h2: 'Ejecútalo con un modelo de ejemplo', sub: 'La demo de abajo carga el validador en esta página.' },
        {
          kind: 'text', label: 'Precio', h2: 'Cuánto cuesta',
          ps: [
            'El visor, las reglas, IDS, las correcciones y las exportaciones son gratis, sin cuenta, también para proyectos comerciales. El código fuente es público bajo licencia MIT en [GitHub](github).',
            'Los planes de pago (Pro a 19 € al mes, Team a 35 € por editor al mes) añadirán lo que necesita un servidor; todavía no están a la venta. Consulta la [página de precios](pricing).',
          ],
        },
      ],
      faq: [
        ['¿IFC Viewer Online sustituye a Solibri?', 'Para comprobar un IFC antes de la entrega (identificadores, estructura espacial, nombres, propiedades, IDS), sí. Para la detección de colisiones entre disciplinas, las reglas personalizadas y la gobernanza entre proyectos, no: para eso están Solibri Essential y Advanced.'],
        ['¿Cuánto cuesta Solibri?', 'Solibri publica precios de partida por licencia y año: Starter 99 €, Essential 1.428 €, Advanced 2.109 € y Premium 2.772 €. El precio de Security+ es bajo petición (solibri.com/pricing, consultado el 2026-11-10).'],
        ['¿Hay una versión gratuita de Solibri?', 'Solibri Anywhere, que tenía una versión gratuita, es ahora un producto heredado y no está disponible para nuevos clientes; los usuarios gratuitos actuales pueden conservar las versiones anteriores a la 26.4.0 (solibri.com/products/legacy-products, consultado el 2026-11-10). El plan actual más barato es Starter, a 99 € al año.'],
        ['¿El plan Starter de 99 € comprueba modelos?', 'Según Solibri, Starter es para la inspección visual y para revisar resultados hechos por otros: «Model checking is performed in Solibri Essential, Advanced, or Premium» (solibri.com/products/starter, consultado el 2026-11-10).'],
        ['¿Qué hace Solibri que esto no puede hacer?', 'Detección de colisiones sobre la geometría real y entre modelos, reglas escritas para tu organización, reglas de medición, modelos nativos de Revit, servidores BCF y conexiones con CDE, y un plan totalmente sin conexión. Consulta la tabla de arriba.'],
        ['¿Puedo usar los dos?', 'Sí, y es un reparto habitual: los autores y los clientes comprueban un archivo en el navegador antes de enviarlo, y el equipo de coordinación ejecuta Solibri sobre el modelo federado.'],
      ],
      faqSources: ['solibriPricing', 'solibriLegacy', 'solibriStarter'],
      bottom: ['Comprueba un archivo antes de decidir', 'Lleva un minuto, no cuesta nada y el modelo se queda en tu ordenador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    webchecker: {
      title: 'Alternativa a Solibri WebChecker — Comprobador IFC Gratis',
      desc: 'Solibri WebChecker pide un plan Advanced o Premium y sube el IFC. Esta alternativa gratis comprueba el archivo en tu navegador. Qué hace cada uno, con fuentes.',
      nav: 'Alternativa a Solibri WebChecker',
      kicker: 'Gratis · Sin plan de Solibri · El archivo no se sube',
      h1: ['Alternativa a Solibri WebChecker', 'que comprueba el IFC en tu propio navegador'],
      lead: 'Solibri WebChecker (Beta) ejecuta online el motor de comprobación de Solibri: subes un IFC, se comprueba en el servicio de Solibri y descargas un PDF o un BCF. Viene con los planes Advanced y Premium. Si necesitas una comprobación web sin plan, o sin subir el modelo, esta página la hace en tu navegador, con menos comprobaciones.',
      cta: 'Validar un archivo IFC',
      cta2: 'o abre el modelo de ejemplo',
      note: 'Sin cuenta y sin tokens. Hasta 2 GB por archivo.',
      heroSources: ['solibriWebchecker'],
      shots: [
        { alt: 'Comprobación IFC en la web: la lista de incidencias agrupadas por regla con el número de elementos que fallan, en el panel de validación del visor en el navegador', cap: 'Las incidencias de una comprobación, agrupadas por regla. No se subió nada para obtenerlas.' },
        { alt: 'Exportación de una comprobación IFC desde el navegador con los formatos BCF, CSV, JSON, informe de entrega y COBie', cap: 'Los resultados salen como BCF 2.1, CSV, JSON, un informe HTML o una hoja de cálculo COBie. No hay archivo PDF; el informe HTML se imprime desde el navegador.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparativa', h2: 'Solibri WebChecker e IFC Viewer Online',
          sub: 'La columna de WebChecker está tomada de la propia página de Solibri.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Acceso', 'Incluido en Solibri Advanced (desde 2.109 € al año) y Premium (desde 2.772 €). No está en Starter, Essential ni Security+, y es «not a standalone product». Necesita un Solibri ID', 'Abre la página. Sin cuenta'],
            ['Coste por comprobación', '50 tokens. Advanced incluye 1.750 tokens al año (unas 35 comprobaciones), Premium 17.500 (unas 350). Tokens adicionales: 5.000 por 250 €, 10.000 por 450 €, 25.000 por 750 €', 'Gratis, todas las comprobaciones que quieras'],
            ['A dónde va el modelo', 'Se sube. Residencia de los datos en la UE o en EE. UU., elegida al configurar el proyecto', 'Se queda en la pestaña de tu navegador'],
            ['Conservación de resultados', '30 días', 'Hasta que cierras la pestaña; exporta lo que necesites'],
            ['Tamaño de archivo', 'Hasta 5 GB por archivo IFC', 'Menos de 2 GB, y menos en un ordenador con poca memoria'],
            ['Comprobaciones', 'Comprobación Model Health (estructura y clasificación, nomenclatura e identificadores, propiedades clave mediante comprobaciones basadas en IDS, colisiones geométricas duras entre disciplinas), o un conjunto de reglas .cset personalizado hecho en la aplicación de escritorio', '44 reglas fijas y archivos IDS 1.0. Colisiones solo por caja envolvente dentro de un mismo modelo'],
            ['Resultados', 'PDF y BCF (1.0, 2.0, 2.1 o 3.0); archivos SMC para usuarios Premium', 'BCF 2.1, CSV, JSON, informe HTML, hoja de cálculo COBie'],
          ],
          after: [
            'WebChecker es la mejor herramienta cuando tu equipo BIM ya mantiene conjuntos de reglas de Solibri y quiere que los participantes del proyecto ejecuten exactamente esos, cuando los archivos superan los 2 GB o cuando necesitas colisiones duras entre disciplinas en el informe.',
            'Esta página es la mejor herramienta cuando no tienes un plan Advanced o Premium, cuando el modelo no se puede subir o cuando compruebas a menudo y no quieres contar tokens.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Alcance', h2: 'Qué cubre esta comprobación y qué no',
          cols: [
            { h: 'Comprueba', items: [
              'Identificadores, estructura espacial, plantas, nombres, valores de propiedad, tipos y materiales: 44 reglas, 25 activas por defecto.',
              'Archivos IDS 1.0 con sus seis facetas.',
              'Cinco perfiles de validación incluidos, o tus propios patrones de nomenclatura y conjuntos de propiedades obligatorios.',
            ] },
            { h: 'No comprueba', items: [
              'Conjuntos de reglas de Solibri. Aquí no se puede cargar un archivo .cset.',
              'Colisiones duras entre disciplinas, reglas de accesibilidad ni análisis de espacios.',
              'Archivos de 2 GB o más.',
            ] },
          ],
          sources: ['solibriWebchecker'],
        },
        {
          kind: 'text', label: 'Tu archivo', h2: 'Qué pasa con el archivo',
          ps: [
            'El IFC lo lee código que se ejecuta en la pestaña de tu navegador y no se sube. El navegador guarda una copia convertida de la geometría en su almacenamiento privado en tu ordenador (hasta 4 GB) para reabrirlo más rápido; borrar los datos del sitio la elimina.',
            'Las estadísticas de uso sin cookies registran el tamaño del archivo y el número de elementos, nunca el contenido, y se pueden desactivar. Un enlace para compartir, si lo creas, lleva la puntuación, el nombre del archivo y hasta 50 incidencias dentro de la URL.',
          ],
        },
        { kind: 'shot', label: 'Pruébalo', h2: 'Ejecuta una comprobación con un modelo de ejemplo', sub: 'La demo de abajo carga el validador en esta página.' },
        {
          kind: 'text', label: 'Precio', h2: 'Cuánto cuesta',
          ps: [
            'Nada, y no hay tokens. El visor, las reglas, IDS y las exportaciones son gratis y sin cuenta. El código es público bajo licencia MIT en [GitHub](github).',
            'Los planes de pago que añaden un servidor se describen en la [página de precios](pricing) y todavía no están a la venta. Los demás planes y precios se comparan en [una página aparte](solibri).',
          ],
        },
      ],
      faq: [
        ['¿Qué es Solibri WebChecker?', 'En palabras de Solibri, «a browser-based model validation service that runs Solibri\'s rules-based checking engine online». Los usuarios suben modelos IFC, ejecutan la comprobación Model Health o un conjunto de reglas personalizado y exportan PDF o BCF (solibri.com/solutions/webchecker, consultado el 2026-11-10).'],
        ['¿Solibri WebChecker es gratis?', 'No. Está incluido en Solibri Advanced y Premium y no se vende por separado. Cada comprobación gasta 50 tokens de la asignación anual del plan o de paquetes de tokens que empiezan en 250 € por 5.000 tokens (solibri.com/solutions/webchecker, consultado el 2026-11-10).'],
        ['¿WebChecker sube mi modelo?', 'Sí: Solibri lo describe como un servicio en el que los usuarios suben modelos IFC, con los datos almacenados en la UE o en EE. UU. y los resultados conservados durante 30 días (solibri.com/solutions/webchecker, consultado el 2026-11-10). IFC Viewer Online, en cambio, lee el archivo en tu navegador.'],
        ['¿Puedo ejecutar aquí mis conjuntos de reglas de Solibri?', 'No. Los conjuntos de reglas de Solibri (.cset) solo se ejecutan en Solibri. Los requisitos que se puedan escribir como IDS 1.0 sí se pueden comprobar aquí.'],
        ['¿Cuál de los dos encuentra más problemas?', 'Buscan cosas distintas. La comprobación Model Health de WebChecker incluye colisiones duras entre disciplinas, que esta página no hace. Esta página da una puntuación y correcciones automáticas de identificadores y nombres. Para la coordinación, usa Solibri.'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Ejecuta una comprobación web ahora', 'Sin plan, sin tokens, sin subida.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    mac: {
      title: 'Visor IFC para Mac — Gratis, sin Instalar, en Safari',
      desc: 'Abre archivos IFC en un Mac con Safari, Chrome o Firefox: vista 3D, propiedades, secciones, medición y validación. Sin instalar nada, sin cuenta, gratis.',
      nav: 'Visor IFC para Mac',
      kicker: 'macOS · Safari, Chrome, Firefox, Edge · Sin instalar nada · Gratis',
      h1: ['Visor IFC para Mac', 'que funciona en el navegador que ya tienes'],
      lead: 'No hay ninguna aplicación que descargar: el visor es una página web. Ábrela en Safari o Chrome en macOS, suelta un archivo IFC y tienes el modelo 3D, el árbol espacial, las propiedades de cada elemento, secciones, mediciones y un informe de validación. El archivo no se sube.',
      cta: 'Abrir el visor',
      cta2: 'o abre el modelo de ejemplo',
      note: 'Sin cuenta. IFC2x3, IFC4, IFC4x1 e IFC4x3, hasta 2 GB por archivo.',
      shots: [
        { alt: 'Visor IFC en una ventana de navegador de 1440 por 900, el tamaño de la pantalla de un MacBook: una casa de dos plantas en 3D, el árbol espacial a la izquierda y los atributos IFC y conjuntos de propiedades de un muro seleccionado a la derecha', cap: 'El visor en una ventana de 1440 × 900, el tamaño por defecto de la pantalla de un MacBook Air (capturado en Chrome). A la derecha, los atributos y conjuntos de propiedades del muro seleccionado.' },
        { alt: 'Plano de sección cortando un modelo IFC de una casa en el visor del navegador, con el mobiliario interior visible, en una ventana de 1440 por 900', cap: 'Un plano de sección a través del mismo modelo, que se mueve con el control deslizante o arrastrándolo en la vista. No interviene ningún plug-in.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'En un Mac', h2: 'Qué funciona en macOS y qué esperar',
          cols: [
            { h: 'Funciona', items: [
              'En Safari, Chrome, Firefox y Edge en macOS. La página necesita WebGL y WebAssembly, que esos navegadores incluyen.',
              'Abrir archivos .ifc, y archivos .ifczip o .zip, arrastrándolos a la ventana o con el botón Abrir.',
              'Varios modelos a la vez, cada uno con su propio árbol y sus propiedades.',
              'También en un iPad o un iPhone, con archivos más pequeños.',
            ] },
            { h: 'Ten en cuenta', items: [
              'No es una aplicación de macOS: no hay icono en el Dock ni previsualización con Vista Rápida, y los archivos .ifc no se abren con doble clic.',
              'La página tiene que cargarse desde internet. No funciona sin conexión.',
              'El límite de tamaño de archivo es de 2 GB y, en la práctica, la memoria del Mac: aparece una advertencia a partir de 1 GB, o a partir de 80 MB en equipos con 4 GB de memoria o menos y en iPad y iPhone.',
              'Las capturas de esta página se hicieron en Chrome. Si algo se ve mal en Safari, prueba con Chrome.',
            ] },
          ],
        },
        {
          kind: 'cols', label: 'Herramientas', h2: 'Qué puedes hacer con un modelo',
          cols: [
            { h: 'Ver', items: [
              'Orbitar, desplazar y hacer zoom; ocultar y aislar elementos; recorrer el árbol espacial.',
              'Planos de sección y plantas 2D cortadas del modelo, exportadas como DXF, SVG o PDF.',
              'Medir distancias, áreas, ángulos y distancias libres.',
              'Leer todos los conjuntos de propiedades y las cantidades escritas en el archivo.',
            ] },
            { h: 'Comprobar y corregir', items: [
              'Una validación con 44 reglas y un Health Score de 0 a 100; consulta el [validador IFC](validator).',
              'Comprobaciones IDS 1.0 contra tus propios requisitos.',
              'Editar nombres y valores de propiedad, corregir GlobalIds y exportar el IFC corregido o un GLB.',
              'Abrir y escribir archivos BCF 2.1 y 3.0.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Comparativa', h2: 'Otras formas de abrir un IFC en un Mac',
          sub: 'Flinker es el otro visor gratuito en el navegador por el que nos preguntan. Su columna dice lo que Flinker publica.',
          head: ['', 'Flinker', 'IFC Viewer Online'],
          rows: [
            ['Qué es', '«The IFC viewer for Microsoft»: SharePoint, Teams, Excel, Power BI, Windows y el navegador', 'Un visor, validador y editor en una página web'],
            ['En un Mac', 'El visor en el navegador. La aplicación de escritorio es para Windows; el sitio no menciona macOS', 'Cualquier navegador actual en macOS'],
            ['Para empezar', '«Open a model without creating an account»', 'Sin cuenta'],
            ['Formatos', 'IFC 2x3, 4 y 4x3; BCF 2.1 y 3.0; IDS 1.0; DXF; superposición de PDF', 'IFC2x3, IFC4, IFC4x1 e IFC4x3; BCF 2.1 y 3.0; IDS 1.0'],
            ['El archivo', 'Se procesa en el navegador; se queda en el dispositivo o en el almacenamiento de Microsoft que elijas', 'Se lee en el navegador; no se sube'],
            ['Comprobación', 'Comprobaciones de requisitos IDS con resaltado de lo que cumple y lo que no', '44 reglas con un Health Score, más IDS'],
            ['Precio', 'Community: gratis. Enterprise: precio por despliegue', 'Gratis'],
          ],
          after: [
            'Elige Flinker cuando tus proyectos ya viven en SharePoint y Teams: abrir el modelo junto a los documentos es para lo que está hecho, y este visor no se conecta a Microsoft 365.',
            'Elige IFC Viewer Online cuando además quieres saber si el modelo está bien: la validación, la puntuación y las correcciones son la diferencia.',
            'Sobre Solibri: las páginas de producto que leímos ese mismo día no indican en qué sistemas operativos funcionan sus planes, así que no lo decimos. Consulta los requisitos de sistema de Solibri antes de comprar para un Mac.',
          ],
          sources: ['flinkerViewer', 'solibriPricing'],
        },
        { kind: 'shot', label: 'Pruébalo', h2: 'Abre el modelo de ejemplo', sub: 'La demo de abajo se ejecuta en esta página, en el navegador que estás usando ahora.' },
        {
          kind: 'text', label: 'Precio', h2: 'Cuánto cuesta',
          ps: [
            'Nada. No hay licencia, ni periodo de prueba, ni cuenta. El código es público bajo licencia MIT en [GitHub](github). Los planes de pago que añaden un servidor están en la [página de precios](pricing) y todavía no están a la venta.',
          ],
        },
      ],
      faq: [
        ['¿Hay un visor IFC para Mac que no necesite instalación?', 'Sí: este es una página web. Ábrela en Safari, Chrome, Firefox o Edge en macOS y suelta el archivo. No hay nada que descargar ni instalar.'],
        ['¿Funciona en Safari?', 'Sí. Necesita WebGL y WebAssembly, que las versiones actuales de Safari incluyen. Las capturas de esta página se hicieron en Chrome, así que prueba con Chrome si un modelo no se ve bien.'],
        ['¿Se sube el IFC cuando lo abro?', 'No. El archivo lo lee código que se ejecuta en la pestaña del navegador. Solo salen del navegador las estadísticas de uso anónimas (tamaño del archivo y número de elementos), y se pueden desactivar.'],
        ['¿Puedo abrir archivos de Revit o Archicad?', 'No, solo IFC. Exporta antes un IFC desde el software de modelado.'],
        ['¿Funciona sin conexión en un Mac?', 'No. La página tiene que cargarse desde internet cada vez, aunque el modelo en sí nunca se envía.'],
        ['¿Flinker está disponible para Mac?', 'El visor de Flinker funciona en el navegador, así que se puede usar en un Mac de esa forma; su aplicación de escritorio se publica para Windows y su sitio no menciona macOS (flinker.app/products/ifc-viewer, consultado el 2026-11-10).'],
      ],
      faqSources: ['flinkerViewer'],
      bottom: ['Abre un IFC en tu Mac', 'En el navegador, gratis, sin instalar nada.'],
    },
  },
}
