// Spanish copy of the two solution pages. Source: copy-en.ts.
// Rules for translators: scripts/seo/solution-landings/TRANSLATING.md.
import type { LangCopy } from './types'

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fuentes',
    readOn: 'leído el',
    preview: 'Vista previa',
    faqLabel: 'Preguntas frecuentes',
    faqTitle: 'Lo que preguntan los compradores',
    related: 'Relacionado',
    pricing: 'Planes y precios',
    postReception: 'Revisar los modelos IFC de las subcontratas',
    postClash: 'Detección de colisiones en el navegador',
    postBatch: 'Validar muchos archivos IFC a la vez',
  },
  pages: {
    contractors: {
      title: 'Recepción de modelos IFC para constructoras y promotoras',
      desc: 'Las subcontratas comprueban su IFC con tus requisitos gratis antes de enviarlo; tú solo revisas lo que pasa. Plan Reception en vista previa.',
      nav: 'Para constructoras',
      kicker: 'Para constructoras y promotoras · Plan Reception · Vista previa',
      h1: ['Recibe solo modelos IFC que ya cumplen', 'para constructoras y promotoras que reciben modelos de sus subcontratas'],
      lead: 'Publica tus requisitos en un solo enlace. Cada subcontrata comprueba su modelo con él gratis, en el navegador, y lo corrige antes de enviarlo. Tú ves quién ha entregado, qué cumple y por qué se devuelve el resto, con un informe listo para el cliente.',
      cta: 'Hablar con nosotros',
      cta2: 'Cómo funciona la revisión',
      note: 'Vista previa: el plan Reception está diseñado y se muestra aquí con datos de ejemplo. Aún no está a la venta y no se guarda nada. Comprobar un modelo es gratis y funciona hoy.',
      hero: {
        alt: 'Resumen de Reception de un proyecto residencial con datos de ejemplo: acciones de hoy, horas y euros ahorrados estimados y proveedores por hito',
        cap: 'La obra de un vistazo, con datos de ejemplo: qué revisar hoy, el ahorro estimado con sus supuestos y cada proveedor por hito.',
      },
      sections: [
        {
          kind: 'text', label: 'El problema', h2: 'Los modelos malos los descubre quien los recibe',
          ps: [
            'Según la ISO 19650-2, revisar y aceptar el modelo de información es tarea de la parte que designa: la constructora o promotora que lo recibe. La guía del UK BIM Framework describe esa comprobación como parte del flujo del entorno común de datos.',
            'Skanska UK afirma que sus objetivos dependen "critically" (de forma crítica) de recibir información de calidad de su cadena de suministro. Los BIM managers de constructoras describen dificultades considerables para mover la información por la cadena con correo y FTP.',
            'En la práctica, un coordinador abre cada entrega, encuentra las mismas propiedades que faltan y los mismos nombres mal puestos, redacta los motivos a mano y espera la siguiente versión. La subcontrata solo conoce las reglas cuando ya la han rechazado.',
          ],
          sources: ['ukbimPartC', 'skanska', 'cmTier2'],
        },
        {
          kind: 'flow', label: 'Cómo funciona', h2: 'De tus requisitos al informe para el cliente',
          sub: 'Todas las capturas son el diseño de Reception con datos de ejemplo (proyecto «Mirador del Turia», diez proveedores).',
          steps: [
            { h: 'Publica tus requisitos como enlace', p: 'Reglas, IDS y puntuación mínima por estado ISO 19650. Las subcontratas reciben la versión aprobada; un enlace antiguo sigue funcionando.', alt: 'Biblioteca de reglas con un cambio de versión, su efecto sobre el mismo modelo y un botón para crear el enlace para subcontratas', cap: 'Qué cambia entre versiones de reglas y el enlace que va a las subcontratas.' },
            { h: 'Las subcontratas comprueban gratis antes de enviar', p: 'Sin cuenta. Ven la puntuación, qué falla, los elementos afectados y la [guía de corrección](fix) de cada regla, así que la mayoría de errores se corrigen antes de llegarte.', alt: 'Página de proveedor sin cuenta con una puntuación de 84, un nombre de archivo incorrecto y la lista de qué corregir', cap: 'La página que ve una subcontrata: qué cumple, qué falla y cómo renombrar el archivo.' },
            { h: 'Revisa una cola, no una bandeja de entrada', p: 'Las entregas llegan ya comprobadas, con el nombre de archivo leído según ISO 19650 y un antes y después respecto a la versión anterior. Los atajos de teclado te llevan por la cola.', alt: 'Diálogo de revisión con cuatro versiones de una entrega, el nombre de archivo ISO 19650 separado en campos y la puntuación de requisitos', cap: 'Una entrega: sus versiones, su nombre de archivo campo a campo y sus requisitos.' },
            { h: 'Devuélvelo con motivos con los que el proveedor pueda actuar', p: 'Cada motivo apunta a los elementos en 3D y a cómo corregirlos. Todo queda registrado con un hash encadenado y se exporta a CSV.', alt: 'Decisión de devolver una entrega con los motivos fallidos marcados y los elementos listados', cap: 'Devolver un modelo: los motivos, los elementos y una nota para el proveedor.' },
            { h: 'Ve las colisiones entre disciplinas en el tiempo', p: 'Las colisiones se calculan en el navegador, ordenadas por coste estimado, con la tendencia entre ejecuciones.', alt: 'Panel de colisiones con la tendencia entre ejecuciones y las colisiones ordenadas por coste estimado', cap: 'Colisiones con su tendencia y coste estimado (hotel federado de ejemplo).' },
            { h: 'Mantén informado al cliente sin redactarlo', p: 'Una página de proyecto con la última puntuación, las entregas aceptadas, las colisiones resueltas y el próximo hito. En la vista previa el envío es simulado.', alt: 'Página de proyecto para el cliente con el Health Score del modelo, las colisiones resueltas y la cronología', cap: 'Lo que ve el cliente al abrir el enlace de actualización.' },
            { h: 'Envía el informe semanal a la dirección de obra', p: 'Recibido, aprobado, pendiente y el tiempo ahorrado estimado, redactado para que lo copies o descargues.', alt: 'Informe semanal de entregas para la dirección de obra con un resumen por proveedor', cap: 'El informe semanal, generado a partir de las entregas.' },
          ],
        },
        {
          kind: 'table', label: 'Ahorro estimado', h2: 'Unas 22 horas al mes de un coordinador, según nuestros supuestos',
          sub: 'Una estimación, no una medición. Cambia las cifras por las tuyas: el resumen de Reception te deja editar cada supuesto.',
          head: ['Tarea', 'Supuesto', 'Parte ahorrada (supuesta)', 'Minutos al mes'],
          rows: [
            ['Revisar entregas a mano', '40 entregas × 25 min', '80 %', '800'],
            ['Preparar la reunión de colisiones', '4 reuniones × 90 min', '70 %', '252'],
            ['Redactar el informe para el cliente', '8 informes × 45 min', '80 %', '288'],
            ['Total', '', '', '1.340 min ≈ 22 h'],
          ],
          after: [
            'A 45 € la hora son unos 1.000 € al mes. El plan Reception está previsto desde 290 € por proyecto al mes, así que con estos supuestos recupera unas tres veces su coste. No se cuentan el retrabajo ni las penalizaciones evitadas.',
          ],
        },
        {
          kind: 'table', label: 'Comparativa', h2: 'Junto a un entorno común de datos',
          sub: 'Cada columna de un fabricante dice solo lo que decía su propia página el día que la leímos. Si la página no dice nada, la celda lo indica.',
          head: ['', 'Catenda Hub', 'Dalux Box', 'Autodesk Construction Cloud', 'IFC Viewer Online Reception (vista previa)'],
          rows: [
            ['Precio publicado', 'Por proyecto, según el presupuesto de obra: unos 400 € al mes para un proyecto de 10 M€, unos 1.100 € para 50 M€; presupuesto a petición', 'Ninguno en la página del producto; formulario de contacto', 'Ninguno; presupuesto por paquete, con precios por usuario, proyecto y cuenta', 'Previsto: desde 290 € por proyecto al mes con 15 proveedores, o 790 € ilimitado. Aún no está a la venta'],
            ['Los proveedores necesitan licencia', 'No: "Your subs don\'t need a licence to log a defect" (tus subcontratas no necesitan licencia para registrar un defecto)', 'No consta en la página', 'No consta en la página', 'Sin cuenta: comprueban gratis en el navegador'],
            ['Comprobar modelos con requisitos', 'No consta en la página de precios', 'Sí: validar datos y geometría del modelo con los requisitos del proyecto', 'El paquete Model Management incluye acondicionamiento de modelos, coordinación y detección de colisiones', 'Reglas e IDS 1.0 con una puntuación por entrega. Comprobar es gratis hoy; la bandeja de entrada está en vista previa'],
            ['Aprobación de los modelos recibidos', 'No consta en la página de precios', 'Flujos de aprobación y una convención de nombres de archivo obligatoria', 'No consta en la página de precios', 'Aceptar o devolver con motivos y elementos en 3D (vista previa)'],
          ],
          after: [
            'No sustituye a tu CDE. Va antes: uses el CDE que uses, el modelo llega ya comprobado con tus requisitos, y el proveedor los conocía antes de enviarlo.',
          ],
          sources: ['catenda', 'dalux', 'acc'],
        },
        {
          kind: 'cols', label: 'Gratis y vista previa', h2: 'Qué funciona hoy y qué es vista previa',
          cols: [
            { h: 'Gratis, disponible hoy', items: ['Abrir y comprobar cualquier IFC en el navegador, sin subir nada', 'Tus archivos IDS 1.0 y 44 reglas con Health Score', 'Importar y exportar BCF, comparar versiones', 'Las [guías de corrección](fix) de cada regla'] },
            { h: 'Plan Reception, en vista previa', items: ['Enlace de requisitos con versiones por estado ISO 19650', 'Cola de entregas con aceptar o devolver y motivos', 'Ficha de proveedor y registro con hash encadenado', 'Página para el cliente e informe semanal'] },
          ],
        },
      ],
      faq: [
        ['¿Puedo usar Reception hoy?', 'Todavía no. Está diseñado y se muestra con datos de ejemplo. Si recibes modelos de subcontratas, [habla con nosotros](pricing): buscamos unos pocos proyectos piloto. Comprobar un modelo con tus requisitos es gratis y funciona hoy en el [visor](viewer).'],
        ['¿Las subcontratas pagan o necesitan cuenta?', 'No. Abren tu enlace y comprueban su modelo gratis en el navegador. Paga quien recibe y gestiona las entregas.'],
        ['¿Sustituye a Catenda, Dalux o Autodesk Construction Cloud?', 'No. Comprueba el modelo antes de que llegue a tu CDE y funciona con cualquier CDE. Cada CDE tiene su propio flujo; mira la comparativa de arriba con la fecha en que leímos sus páginas.'],
        ['¿Se sube el modelo para comprobarlo?', 'En la comprobación gratuita, no: se ejecuta en el navegador de la subcontrata. En Reception, la entrega que aceptas se guarda para ti en la UE.'],
        ['¿Cuánto costará?', 'Está previsto desde 290 € por proyecto al mes con 15 proveedores, o 790 € para proyectos ilimitados. Los precios pueden cambiar antes del lanzamiento; consulta los [planes](pricing).'],
        ['¿De dónde sale la cifra de ahorro?', 'De los supuestos de la tabla de arriba: número de entregas, minutos por tarea y la parte que ahorra cada tarea. Son supuestos, no mediciones, y puedes cambiarlos en el resumen.'],
      ],
      faqSources: ['catenda', 'dalux', 'acc'],
      bottom: ['¿Recibes modelos de subcontratas?', 'Cuéntanos cuántos proyectos y proveedores tienes. Estamos eligiendo unos pocos proyectos piloto para Reception.'],
    },
    engineering: {
      title: 'Coordinación BIM para ingenierías y estudios — plan Team',
      desc: 'Entrega modelos que el cliente acepta a la primera: reglas compartidas, colisiones, incidencias con corrección y control de publicación. Team en vista previa.',
      nav: 'Para ingenierías',
      kicker: 'Para ingenierías y estudios · Plan Team · Vista previa',
      h1: ['Entrega modelos que el cliente acepta a la primera', 'para ingenierías y estudios que coordinan varias disciplinas'],
      lead: 'Un único conjunto de reglas de empresa, colisiones en el navegador, incidencias con la cámara y una corrección sugerida, y un control que impide publicar un modelo por debajo de tu puntuación mínima. El cliente ve el avance sin que tengas que redactarlo.',
      cta: 'Apuntarme a la lista de Team',
      cta2: 'Detección de colisiones en el navegador',
      note: 'Vista previa: el plan Team está diseñado y se muestra aquí con datos de ejemplo. Aún no está a la venta y no se guarda nada. Comprobar un modelo con tu IDS es gratis y funciona hoy.',
      hero: {
        alt: 'Panel de Team con datos de ejemplo: Health Score por proyecto y su tendencia, incidencias abiertas por persona y plazos en riesgo',
        cap: 'El panel del equipo, con datos de ejemplo: salud de cada proyecto, carga por persona y plazos en riesgo.',
      },
      sections: [
        {
          kind: 'text', label: 'El problema', h2: 'Los rechazos vienen de detalles que nadie comprobó',
          ps: [
            'Los clientes ya envían sus propios requisitos de información, a menudo como IDS. Una entrega a la que le falta un nombre de propiedad o una clasificación vuelve, y corregirla cuesta más de lo que habría costado comprobarla.',
            'Un consultor BIM describe un problema de validación de datos IFC que costó semanas, causado por nombres de propiedad que no coincidían con lo exigido. La ISO 19650-2 hace de la comprobación antes de compartir un paso del equipo de entrega, no del cliente.',
            'En un estudio las reglas viven en la cabeza o la hoja de cálculo de una persona, las colisiones se revisan en una reunión y las incidencias acaban en hilos de correo sin la vista que las explica.',
          ],
          sources: ['bimCorner', 'ukbimPartC'],
        },
        {
          kind: 'flow', label: 'Cómo funciona', h2: 'De las reglas de empresa a un modelo publicado',
          sub: 'Todas las capturas son el diseño de Team con datos de ejemplo.',
          steps: [
            { h: 'Escribe las reglas una vez, como frases', p: 'Clase, condición, requisito y gravedad, incluida la geometría (espacio libre delante de puertas, altura libre) y las relaciones (puerta en un muro). Cada regla es IDS 1.0.', alt: 'Editor de reglas con reglas de geometría y de relación, resultados sobre el modelo de ejemplo y una incidencia creada con su corrección', cap: 'Reglas de geometría y de relación comprobadas en un modelo de ejemplo.' },
            { h: 'Gestiónalas como empresa', p: 'Una biblioteca compartida con versiones, autor, revisión y aprobación (el autor no aprueba su propia regla), comentarios y exportación a IDS.', alt: 'Biblioteca de reglas de empresa con una versión en revisión, los cambios de v2 a v3 y comentarios', cap: 'Un conjunto de reglas en revisión: qué cambió, quién lo aprueba y el historial.' },
            { h: 'Calcula colisiones en el navegador', p: 'Colisiones duras y de holgura entre disciplinas, agrupadas, con reglas para ignorar lo aceptado y un coste estimado para cada una.', alt: 'Panel de colisiones sobre el modelo de una torre con reglas de ignorar que ocultan colisiones aceptadas', cap: 'Reglas de ignorar en el modelo de una torre: 1.569 de 4.827 resultados ocultos.' },
            { h: 'Convierte cada fallo en una incidencia con corrección', p: 'Asignada, con plazo, la cámara guardada y una corrección sugerida por herramienta de autoría a partir de nuestras guías de corrección. Los invitados comentan gratis; BCF de entrada y salida.', alt: 'Incidencia con una corrección sugerida para varias herramientas de autoría, responsable, plazo y comentarios', cap: 'Una incidencia con su corrección sugerida, responsable y plazo.' },
            { h: 'Detén un modelo flojo antes de publicarlo', p: 'Nada llega a Publicado por debajo de tu puntuación mínima, con un revisor opcional y un historial de qué pasó y por qué.', alt: 'Control de publicación con una puntuación mínima de 80 y el historial de modelos publicados y retenidos', cap: 'El control de publicación y su historial.' },
            { h: 'Mantén informado al cliente', p: 'Actualizaciones por fase construidas con datos en vivo: puntuación, entregas, incidencias e hitos. En la vista previa el envío es simulado.', alt: 'Pantalla de actualización al cliente eligiendo una fase, una plantilla y los destinatarios', cap: 'Una actualización al cliente por fase del proyecto.' },
          ],
        },
        {
          kind: 'table', label: 'Ahorro estimado', h2: 'Unas 17 horas al mes, según nuestros supuestos',
          sub: 'Una estimación para un equipo de tres, no una medición. Cambia las cifras por las tuyas.',
          head: ['Tarea', 'Supuesto', 'Parte ahorrada (supuesta)', 'Minutos al mes'],
          rows: [
            ['Comprobar entregas antes de enviarlas', '12 entregas × 60 min', '60 %', '432'],
            ['Preparar la reunión de colisiones', '4 reuniones × 90 min', '70 %', '252'],
            ['Rehacer entregas devueltas', '3 devoluciones × 120 min', '50 %', '180'],
            ['Redactar actualizaciones al cliente', '8 actualizaciones × 30 min', '70 %', '168'],
            ['Total', '', '', '1.032 min ≈ 17 h'],
          ],
          after: [
            'A 45 € la hora son unos 775 € al mes. Team está previsto a 59 € por editor al mes con facturación anual, con un mínimo de tres editores (177 € al mes), así que con estos supuestos recupera unas cuatro veces su coste.',
          ],
        },
        {
          kind: 'table', label: 'Comparativa', h2: 'Junto a las herramientas de coordinación habituales',
          sub: 'Cada columna de un fabricante dice solo lo que decía su propia página el día que la leímos.',
          head: ['', 'BIMcollab', 'Solibri', 'IFC Viewer Online Team (vista previa)'],
          rows: [
            ['Precio publicado', 'Basic 12,50 €, Advanced 18,75 €, Enterprise 25 € por usuario al mes con facturación anual', 'Por licencia al año: Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €', 'Previsto: 59 € por editor al mes con facturación anual, mínimo tres editores. Aún no está a la venta'],
            ['Incidencias', 'Gestión de incidencias basada en BCF con plug-ins para herramientas BIM', 'Gestión de incidencias BCF desde Essential', 'Incidencias con cámara, plazo y corrección sugerida; BCF de entrada y salida (vista previa)'],
            ['Reglas', 'Reglas de colisión y smart views compartidas para usar en BIMcollab Zoom', 'Reglas predefinidas desde Essential; reglas propias desde Advanced; gobierno de reglas en Premium', 'Reglas como frases, IDS 1.0, biblioteca compartida con aprobación (vista previa)'],
            ['Invitados', 'Una o dos cuentas de invitado por usuario de pago, según el plan', 'No consta en la página de precios', 'Los invitados comentan gratis'],
          ],
          after: [
            'Solibri es la mejor opción para una comprobación profunda por reglas en el escritorio y BIMcollab para un flujo de incidencias amplio entre herramientas. Team es para estudios que quieren reglas, colisiones, incidencias y la actualización al cliente en un solo sitio, en el navegador.',
          ],
          sources: ['bimcollab', 'solibri'],
        },
        {
          kind: 'cols', label: 'Gratis y vista previa', h2: 'Qué funciona hoy y qué es vista previa',
          cols: [
            { h: 'Gratis, disponible hoy', items: ['Abrir y federar varios archivos IFC en el navegador', 'Comprobar cada modelo con tu IDS 1.0 y 44 reglas', 'Importar y exportar BCF, comparar versiones', 'Las [guías de corrección](fix) de cada regla'] },
            { h: 'Plan Team, en vista previa', items: ['Biblioteca de reglas de empresa con aprobación', 'Detección de colisiones entre disciplinas', 'Incidencias compartidas con corrección sugerida, control de publicación', 'Actualizaciones al cliente por fase'] },
          ],
        },
      ],
      faq: [
        ['¿Puedo usar Team hoy?', 'Todavía no. Está diseñado y se muestra con datos de ejemplo. [Apúntate a la lista de espera](pricing) para saber cuándo abre. Comprobar un modelo con tu IDS es gratis y funciona hoy en el [visor](viewer).'],
        ['¿La detección de colisiones es gratis?', 'No. La detección de colisiones entre disciplinas es una herramienta nueva y será de pago. Abrir, federar y comprobar cada modelo sigue siendo gratis. Más en el artículo sobre [detección de colisiones en el navegador](postClash).'],
        ['¿Podemos usar el IDS de nuestro cliente?', 'Sí, y esa parte es gratis hoy. En Team también puedes importar un IDS a la biblioteca de la empresa y conservar sus versiones.'],
        ['¿Sustituye a BIMcollab o Solibri?', 'No para todos los equipos. Mira la comparativa de arriba, con los precios de sus páginas y la fecha en que las leímos.'],
        ['¿Cuánto costará?', 'Está previsto a 59 € por editor al mes con facturación anual, mínimo tres editores; los invitados son gratis. Los precios pueden cambiar antes del lanzamiento; consulta los [planes](pricing).'],
        ['¿Podemos comprobar una carpeta entera de modelos?', 'Eso también forma parte de la vista previa de pago: lee cómo funciona la [validación por lotes](postBatch).'],
      ],
      faqSources: ['bimcollab', 'solibri'],
      bottom: ['¿Coordinas varias disciplinas?', 'Apúntate a la lista de espera de Team y cuéntanos cuántos editores tenéis. Te escribiremos cuando abra.'],
    },
  },
}
