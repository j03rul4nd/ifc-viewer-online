# 03 · Competencia en comparación de versiones/revisiones

Investigación web del 2026-11-13. Cada afirmación lleva URL; si la página no muestra fecha, se indica «consultado 2026-11-13». Lo que no se pudo comprobar va marcado **SUPUESTO**.

Contexto: nuestro producto es un visor IFC gratuito en el navegador (local-first, los ficheros no salen del equipo). Usuario objetivo: jefe de obra o ingeniero de obra que recibe revisiones **sin marcar** (sin nube de revisión ni lista de cambios).

---

## 1. Ficha por herramienta

### Solibri (regla 206 «Model Comparison»)
- **Qué detecta:** primero empareja por GUID y, si cambia, recurre a la geometría y la posición para encontrar componentes modificados. https://help.solibri.com/hc/en-us/articles/1500004610621 · https://society.solibri.com/post/10829 (consultados 2026-11-13)
- **Cómo lo muestra:** una incidencia por cada componente modificado, con las propiedades cambiadas y sus valores antiguo y nuevo; los componentes sin cambios se omiten. https://help.solibri.com/hc/en-us/articles/1500004610621
- **Exporta:** informes y BCF desde el flujo de incidencias de Solibri. **SUPUESTO** (no se comprobó para la regla 206 en concreto).
- **Precio:** desde 99 €/año (Starter), 1.428 € (Essential), 2.109 € (Advanced) y 2.772 € (Premium) por licencia y año. https://www.solibri.com/pricing (consultado 2026-11-13). **SUPUESTO:** la regla 206 no está en Starter.
- **Nube o local:** escritorio (Windows/Mac).
- **Dónde falla:**
  - la opción «identificar componentes solo por GUID» no se comporta como se espera: https://society.solibri.com/post/2868
  - se pierden resultados cuando cambia el tipo del componente aunque el GUID sea el mismo: https://society.solibri.com/post/2034
  - la versión 9.13.5 corrigió resultados erróneos con más de dos modelos: https://society.solibri.com/post/3460
  - hay que ajustar a mano qué propiedades se informan: https://society.solibri.com/post/2957

### BIMcollab Zoom / WebViewer
- **Qué detecta:** no se encontró una comparación propia en Zoom. Las notas de versión de julio de 2026 añaden historial de versiones en el WebViewer para «ver versiones anteriores y comparar cambios». https://helpcenter.bimcollab.com/en/articles/326485-release-notes (consultado 2026-11-13)
- **Cómo lo muestra:** al parecer por inspección visual de una versión anterior. **SUPUESTO:** no hay lista de diferencias por elemento.
- **Precio:** **SUPUESTO**, no se consultó.
- **Nube o local:** Zoom es escritorio; el WebViewer está en la nube.
- **Dónde falla:** para actualizar un modelo hay que quitar el antiguo y cargar el nuevo; no hay diff. https://helpcenter.bimcollab.com/articles/425095

### Navisworks Manage (Compare)
- **Qué detecta:** compara dos elementos o modelos de la jerarquía (geometría, propiedades, transformaciones). La «Linear Tolerance» solo se aplica a traslaciones y desfases, y vale 0,0 por defecto. https://help.autodesk.com/cloudhelp/2016/ENU/Navisworks/files/GUID-15F2C66B-327B-4482-A2B9-BBA1990BE075.htm (ayuda de 2016)
- **Cómo lo muestra:** resalta en color y genera conjuntos de selección y búsqueda con los resultados. https://help.autodesk.com/cloudhelp/2020/ENU/Navisworks/files/GUID-AFAF164A-834F-4BF8-BE20-733A98B56459.htm
- **Exporta:** conjuntos de selección; no hay informe de cambios nativo. **SUPUESTO.**
- **Precio:** suscripción de Autodesk, más de 2.000 €/año. **SUPUESTO**, no se consultó en esta sesión.
- **Nube o local:** escritorio Windows.
- **Dónde falla:** Autodesk reconoce un problema identificado en Compare con modelos de Revit (respuesta de 2024 en el foro, recogida por Arkance: https://emea.support.arkance.world/hc/lb/articles/36465402792466-Navisworks-Compare-Tool). Es un proceso manual, árbol contra árbol.

### Autodesk Docs / ACC (Compare 2D/3D)
- **Qué detecta:** objetos añadidos, eliminados y modificados entre versiones **del mismo modelo** (no entre modelos distintos). https://help.autodesk.com/cloudhelp/ENU/BIM360D-Document-Management/files/About-Comparing-2D-and-3D/GUID-1872D1A7-1973-4715-BD99-13D766C18DFB.html
- **Cómo lo muestra:** colores verde, rojo y amarillo, con lista de cambios y propiedades. En 2D, superposición de hojas.
- **Formatos:** IFC aparece entre los admitidos según un blog de distribuidor, no según la ayuda oficial. https://www.symetri.co.uk/insights/blog/autodesk-bim-360-docs-overview-part-2/
- **Precio:** **SUPUESTO**, de pago por usuario y año.
- **Nube o local:** solo nube (hay que subir el modelo).
- **Dónde falla:** las comparaciones entre modelos distintos no están admitidas; la ayuda está pensada para Revit, y el soporte de IFC no se confirma en la documentación actual.

### Trimble Connect (3D Model Comparison)
- **Qué detecta:** dos versiones de un modelo o dos modelos cualesquiera. Crea un «Diff Model» que contiene solo las diferencias. Tiene comparación por lotes con 3 o más modelos, que guarda los resultados en la carpeta «Model Comparisons». https://help.trimble.com/doc/trimble-connect/trimble-connect/connect-for-windows/3d-model-comparison (consultado 2026-11-13)
- **Cómo lo muestra:** objetos fantasma activables; las propiedades se comparan en la tabla de datos del cliente web.
- **Precio:** **SUPUESTO**, de pago (Business).
- **Nube o local:** la comparación está en Connect para Windows; en el foro se pregunta si llegará a la web. https://community.trimble.com/question/compare-model-in-trimble-connect
- **Dónde falla:** un usuario informa de que no se ve la versión de cada modelo y el botón de comparar se queda congelado. https://community.trimble.com/question/trimble-connect-model-version-checking-for-differences

### Dalux (Box / Field)
- **Qué detecta:** «Compare versions» en modelos con dos o más versiones; planos con alineación por un punto (requiere Box Pro); comparación directa de PDF. https://support.dalux.com/hc/articles/10022982079004 (consultado 2026-11-13)
- **Precio:** el visor de Dalux es gratuito; Box Pro es de pago. **SUPUESTO** el importe.
- **Nube o local:** nube y app móvil.
- **Dónde falla:** **SUPUESTO**, no se encontraron reseñas sobre el criterio de emparejamiento ni sobre la exportación.

### Speckle (comparación de versiones / DiffExtension)
- **Qué detecta:** objetos añadidos, eliminados, cambiados y sin cambios. Empareja por el id de la aplicación de origen y el hash del objeto. https://docs.speckle.systems/3d-viewer/compare-versions · https://docs.speckle.systems/developers/viewer/extensions/diff-extension-api
- **Cómo lo muestra:** en el visor web, con colores y transición de opacidad entre la versión actual y la nueva.
- **Precio:** tiene plan gratuito. **SUPUESTO** el detalle.
- **Nube o local:** nube (o autoalojado); el modelo se envía con conectores.
- **Dónde falla:** si cambia el id de origen, el elemento sale como borrado y añadido, no como cambiado. https://speckle.community/t/receive-revit-data-view-changes-on-speckle-web-app/10275 · https://speckle.community/t/model-comparison-unique-id/8014/2 . También se pide poder inspeccionar los cambios antes de cargar: https://speckle.community/t/show-diffing-of-impending-receive-action-blender-and-beyond/20973

### IfcOpenShell IfcDiff (incluido en Bonsai)
- **Qué detecta:** elementos añadidos, eliminados y cambiados, por GlobalId; atributos, propiedades y geometría, con tolerancia tomada de la precisión del modelo nuevo. Una forma extruida en un fichero y mallada en el otro cuenta como cambio. https://docs.ifcopenshell.org/ifcdiff.html (**SUPUESTO** la URL canónica; el contenido se vio en un espejo del repositorio: https://dev.glassvision.dedyn.io/Glassvision/IfcOpenShell/src/branch/fix-3096-git-describe-titleblock/src/ifcdiff)
- **Exporta:** JSON.
- **Precio:** gratis (LGPL).
- **Nube o local:** local (Python/CLI, Blender).
- **Dónde falla:** depende por completo del GlobalId; es una herramienta de línea de comandos o de Blender, no apta para obra. Hasta hace poco no detectaba por defecto los cambios de atributos como PredefinedType (commit #8214, en el mismo espejo; **SUPUESTO** que ya esté en la versión oficial).

### Bluebeam Revu (2D: Compare Documents / Overlay Pages)
- **Qué detecta:** Overlay apila PDF en capas de color (va mejor con PDF vectoriales); Compare Documents marca las diferencias con nubes revisables en la lista de marcas (va mejor con escaneados). https://support.bluebeam.com/user-manual/menus/document/compare-documents.html · https://support.bluebeam.com/es/user-manual/menus/document/overlay-pages.html
- **Precio:** suscripción de pago por usuario y año. **SUPUESTO.**
- **Nube o local:** escritorio Windows (y Revu web).
- **Dónde falla:** si los elementos se mueven o cambian de tamaño, la alineación de 3 puntos puede necesitar varios intentos y aun así no quedar bien; los cambios de tamaño de página o de cajetín dan falsos cambios. https://community.bluebeam.com/bluebeam-community/discussion/4429/feature-highlight-overlay-pages

### Gratuitas o de navegador
- **BIMvision + módulo Compare:** el visor es gratis; el módulo cuesta 20 € sin IVA y compara la geometría y las propiedades de dos revisiones. https://store.bimvision.eu/plugin/modulecolonn__compare-a1 · https://bimvision.eu/products-and-functionalities/change-analysis-comparing-revisions-in-bimvision/ (consultados 2026-11-13). Es escritorio Windows.
- **Graphisoft Archicad «Detect IFC Model Changes»:** empareja por GlobalId; sin coincidencia, el elemento se trata como nuevo o borrado. https://help.graphisoft.com/AC/22/INT/_AC22_Help/115_IFC/115_IFC-9.htm
- **Procore Drawings:** superposición y vista lado a lado de revisiones, solo para PDF; en móvil está en beta abierta. https://support.procore.com/products/online/user-guide/project-level/drawings/tutorials/compare-drawing-revisions
- **Drawboard Projects:** superposición de hasta 5 planos en la web. https://support.drawboard.com/hc/en-us/articles/360000375555
- **xBIM:** **SUPUESTO**, no se encontró una herramienta de diff para usuario final, solo librerías .NET.

---

## 2. Matriz de funciones

| Herramienta | Emparejamiento | Geometría | Propiedades | Vista | Exporta | Precio (fuente) | Nube/local |
|---|---|---|---|---|---|---|---|
| Solibri 206 | GUID, luego geometría y posición | Sí | Sí, antiguo→nuevo | Incidencias | Informe/BCF (SUPUESTO) | 1.428–2.772 €/año (solibri.com, 2026-11) | Escritorio |
| BIMcollab | — | Visual | No (SUPUESTO) | Versión anterior | — | SUPUESTO | Escritorio + web |
| Navisworks | Árbol de selección | Sí | Sí | Colores + conjuntos | Conjuntos | SUPUESTO | Escritorio |
| ACC/Docs | Id de objeto (SUPUESTO) | Sí | Sí | Verde/rojo/amarillo | — | SUPUESTO | Nube |
| Trimble Connect | Versiones/modelos | Sí | Tabla de datos | Diff Model + fantasmas | Modelo diff | SUPUESTO | Escritorio |
| Dalux | SUPUESTO | Sí | SUPUESTO | Visor | SUPUESTO | Visor gratis; Box Pro de pago | Nube/app |
| Speckle | applicationId + hash | Hash | Hash | Colores + opacidad | API | Plan gratis | Nube |
| IfcDiff | GlobalId | Sí, con tolerancia | Sí | Ninguna (JSON) | JSON | Gratis | Local CLI |
| BIMvision Compare | SUPUESTO GUID | Sí | Sí | Visor | SUPUESTO | 20 € (store, 2026-11) | Escritorio |
| Bluebeam | Píxel/vector 2D | 2D | No | Capas de color + nubes | PDF con marcas | SUPUESTO | Escritorio |
| Procore/Drawboard | 2D | 2D | No | Superposición | — | Incluido en la suscripción (SUPUESTO) | Nube |

---

## 3. Huecos aprovechables

1. **Dependencia del GUID** (IfcDiff, Archicad, Speckle; Solibri a medias). Cuando el autor reexporta y cambian los GlobalId, todo sale como borrado y añadido. Hueco: emparejar en el navegador por GlobalId, luego por tipo + nombre/etiqueta y luego por caja envolvente/centroide, indicando la confianza de cada emparejamiento.
2. **Ruido de geometría** (IfcDiff: extrusión frente a malla = cambio; Navisworks con tolerancia 0). Hueco: comparar por caja envolvente, volumen y centroide con tolerancia en mm, y separar «se movió» de «cambió de forma».
3. **Nada es local, gratuito y en el navegador a la vez.** ACC, Trimble, Speckle y Dalux obligan a subir el modelo; Solibri, Navisworks y BIMvision son escritorio Windows o de pago. Nuestro diferencial: soltar dos IFC en el navegador sin subir nada y sin instalar.
4. **Pensado para el coordinador, no para la obra.** Las salidas son incidencias, conjuntos de selección o JSON. Hueco: una lista legible tipo «qué cambió en mi tajo», filtrable por planta, disciplina o zona, con informe PDF/CSV y BCF por cambio para devolver dudas al proyectista.
5. **Tipo cambiado con el mismo GUID** (Solibri pierde resultados). Hueco: informar del cambio de clase IFC como cambio de primer nivel.
6. **Comparación 2D y 3D separadas.** Bluebeam y Procore comparan PDF, los BIM comparan modelos. Hueco (más adelante): mismo flujo para el plano de planta generado desde el IFC.
7. **Alineación frágil en 2D** (Bluebeam). En IFC no hace falta si se usa la georreferencia o la ubicación; avisar si el origen se ha movido entre versiones.
8. **Fiabilidad y rendimiento con modelos grandes** (Trimble se congela, Navisworks falla con Revit). Hueco: diff en un worker con progreso y límite de memoria declarado. **SUPUESTO** que nuestro motor escale, a medir.
9. **Precio:** lo útil cuesta entre 1.400 y 2.800 €/año (Solibri), lo barato es escritorio (BIMvision, 20 €). Lo básico, gratis y local, encaja con la regla de producto; si se cobra algo, que sea una herramienta nueva de productividad (lotes, informes con firma), según doc 19 §5.
