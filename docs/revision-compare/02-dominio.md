# 02 · Dominio: cómo se comunican las revisiones de diseño

> Investigación web, 2026-11-13. Cada afirmación lleva URL; lo que no tiene fuente se marca **SUPUESTO**.
> Usuario objetivo: jefe de obra (Tailandia, prefabricado/industrializado — **SUPUESTO**) que recibe planos/modelos revisados con cambios **sin marcar** y se le escapan algunos, lo que provoca conflictos en obra.

## 1. Convenciones en planos: nubes, deltas, tablas de revisión

- La práctica habitual es rodear el cambio con una **nube de revisión**, ponerle un **delta** (triángulo con el número de revisión) y añadir una fila al **cuadro de revisiones** del cajetín (rev, fecha, descripción, autor). **SUPUESTO** (práctica de oficio; no he buscado una fuente normativa).
- Es una convención manual: si el delineante no dibuja la nube, el cambio queda invisible. Ese es justo el fallo que describe el usuario. **SUPUESTO**.
- Lo habitual es que las nubes de la revisión anterior se borren en la siguiente, así que quien se salta una revisión pierde también sus marcas. **SUPUESTO**.

## 2. ISO 19650: códigos de estado, revisión y transmittals

- ISO 19650-2 (5.1.7.c) pide que el CDE asigne a cada contenedor metadatos de **estado** y **revisión**. El Anexo Nacional del Reino Unido define las revisiones preliminares como **P01, P02…** y las contractuales como **C01, C02…**. Fuentes: https://www.cdbb.cam.ac.uk/files/national_annex_guidance.pdf · https://www.ukbimframework.org/wp-content/uploads/2021/02/Guidance-Part-C_Facilitating-the-common-data-environment-workflow-and-technical-solutions_Edition-1.pdf
- Las versiones en curso (WIP) pueden llevar subrevisiones como **P01.01…P01.05**, que pasan a P01 al compartirse: https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/files-naming-standard/Revision_Codes.html
- Códigos de estado: **S0** = en curso (WIP); **S1–S4** = compartido, no contractual (S1 coordinación, S2 información, S3 revisión y comentarios, S4 aprobación de etapa); **A1…An** = publicado, aprobado y contractual (con revisión C). Fuentes: https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/files-naming-standard/Status_Codes.html · https://bimplus.co.uk/status-codes-why-complexity
- Las fuentes **no coinciden** en S5–S7: Autodesk da S5 por retirado y usa S6/S7 para autorizar el PIM/AIM; el Anexo Nacional usa S5/S6. Fuentes: Autodesk (enlace anterior) y https://www.cdbb.cam.ac.uk/files/national_annex_guidance.pdf
- **Transmittal**: documento que acompaña una entrega y lista contenedores, revisión, estado y motivo. Suele generarlo el CDE. **SUPUESTO** (no he buscado una fuente concreta).
- En Tailandia no he comprobado cuánto se usa ISO 19650 en obra; los códigos pueden ser propios de la empresa (A/B/C, Rev 0/1/2). **SUPUESTO**.

## 3. Estabilidad del GlobalId según la herramienta de autor

Un comparador IFC empareja elementos por `GlobalId`. Si el GUID cambia entre exportaciones, un elemento sin cambios aparece como "borrado + añadido".

| Herramienta | Comportamiento | Fuente |
|---|---|---|
| **Revit** | Por defecto el proyecto no guarda GlobalId. La opción *Store the IFC GUID in an element parameter after export* lo guarda en `IfcGUID` y las exportaciones siguientes lo reutilizan. Problemas conocidos: los elementos creados después de la última exportación no tienen GUID hasta la siguiente; los grupos a veces fallan; hay casos de GUID ligeramente distinto en tejados. | https://help.autodesk.com/cloudhelp/2023/ENU/Revit-DocumentPresent/files/GUID-E029E3AD-1639-4446-A935-C9796BC34C95.htm · https://wiki.osarch.org/revit-setup-for-openbim/ · https://forums.autodesk.com/t5/revit-architecture-forum/ifc-guid-lost-after-ifc-export/m-p/7924393 · https://forums.autodesk.com/t5/revit-api-forum/ifc-guid-is-different-in-the-ifcguid-parameter-written-by-revit/m-p/12650094 · https://github.com/Autodesk/revit-ifc/issues/100 |
| **Revit (relación con UniqueId)** | El GUID IFC se deriva del UniqueId del elemento. Si se borra y se vuelve a crear el elemento (o se copia), el GUID es nuevo. | https://blog.autodesk.io/consistency-of-ifc-guid-and-uniqueid/ · https://jeremytammik.github.io/tbc/a/0104_uniqueid_dwf_ifc_guid.htm (regeneración al recrear: **SUPUESTO** razonado a partir de estas fuentes) |
| **Archicad** | Hay dos opciones: *conservar los IFC GlobalId existentes* (recomendada para el ida y vuelta con BCF) o *generar nuevos en cada exportación*, que hace que cada versión parezca un proyecto distinto. | https://help.graphisoft.com/AC/22/INT/_AC22_Help/115_IFC/115_IFC-41.htm · https://help.graphisoft.com/AC/23/RUS/_AC23_Help/115_IFC/115_IFC-43.htm |
| **Tekla Structures** | No he encontrado documentación oficial sobre la persistencia del GUID. Hay usuarios que dicen que cada exportación "resetea" los GUID en Navisworks y otros que pasan los IFC por un parser para conservarlos. | https://forums.autodesk.com/t5/navisworks-forum/steel-exporting-ifc-changes-guid-in-navisworks-manage/m-p/12204994 · https://society.solibri.com/post/5152 · https://support.tekla.com/doc/tekla-structures/2026/int_exporting_into_ifc |
| **Allplan, Civil 3D** | No investigado. **SUPUESTO**: comportamiento variable; hay que medirlo con dos exportaciones del mismo modelo sin cambios. | — |

## 4. IfcOwnerHistory y ChangeAction

- En IFC2x3, `ChangeAction` era obligatorio; en IFC4 pasa a OPTIONAL, con una regla WHERE: sin `LastModifiedDate` debe ser NOTDEFINED. Fuentes: https://iaiweb.lbl.gov/Resources/IFC_Releases/R2x3_final/ifcutilityresource/lexical/ifcownerhistory.htm · https://www.steptools.com/stds/ifc/html/t_ifcownerhistory.html
- IFC4.3: si hay `LastModifiedDate` y no hay `ChangeAction`, se interpreta como UNDEFINED. Fuentes: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcOwnerHistory.htm · https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/concepts/Object_Attributes/Revision_Control/content.html
- Límite práctico: los exportadores suelen escribir un único OwnerHistory con ADDED/NOCHANGE para todo el fichero, así que no sirve como registro fiable de cambios. **SUPUESTO**; hay discusión en https://forums.buildingsmart.org/t/ifcownerhistory/2246

## 5. Diferencias entre IFC2x3, IFC4 e IFC4.3 que afectan al diff

- **StandardCase**: IFC4.3 elimina IfcBeamStandardCase, IfcColumnStandardCase, IfcDoorStandardCase, IfcBuildingElement y otras. IfcWallStandardCase sigue existiendo pero está *deprecated*. Fuentes: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/content/introduction.htm · https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWallStandardCase.htm · https://downloads.steptools.com/docs/ifcbim/notes_schema.html
  → Si se compara una versión IFC2x3/IFC4 con otra IFC4.3, el mismo muro puede cambiar de clase. Hay que normalizar al supertipo.
- **Unidades**: cada fichero declara las suyas en `IfcUnitAssignment` (mm o m). **SUPUESTO** (no buscado): conviene normalizar antes de comparar geometría o cantidades.
- **Georreferencia**: `IfcMapConversion` existe en IFC4/IFC4.3 y no en IFC2x3, donde se usan Psets o `IfcSite` lat/long. **SUPUESTO**: no he encontrado fuente en esta búsqueda. Si cambia la georreferencia, todo el modelo puede parecer movido.

## 6. BCF 3.0

- BCF tiene un formato de fichero (BCF-XML) y una API REST (BCF-API). La 3.0 se basa en la 2.1 y traslada lo común a la **OpenCDE Foundation API**. Fuentes: https://www.github.com/buildingSMART/BCF-API · https://github.com/buildingSMART/foundation-API
- **Topic** = incidencia (estado, tipo, asignado, comentarios). Un topic puede no tener viewpoint, pero todo viewpoint pertenece a un topic. Los **viewpoints** guardan la cámara y referencias a elementos IFC por GUID (**components**: selección, visibilidad, coloreado). Fuentes: https://www.github.com/buildingSMART/BCF-API · https://docs.safe.com/fme/html/FME-Form-Documentation/FME-ReadersWriters/bcf/Feature_Representation.htm
- La 3.0 añade **documentos** complementarios (carpeta `Documents`) y un endpoint de *extensions* con los valores válidos. Fuentes: https://github.imc.re/buildingSMART/BCF-XML/wiki/What's-new-in-BCF-3.0 · https://www.github.com/buildingSMART/BCF-API
- Lo soportan Trimble Connect, IfcOpenShell y Catenda, entre otros: https://developer.trimble.com/docs/connect/topics · https://support.catenda.com/en/articles/15705690-exporting-topics-to-bcf-3-0
- Al depender del GUID, BCF falla igual que el diff si los GlobalId no son estables (**SUPUESTO** derivado de lo anterior; Archicad lo indica explícitamente en el enlace de la §3).

## 7. Papel de IDS

- IDS 1.0 (estándar buildingSMART desde junio de 2024) es un XML legible por máquina que define qué información debe contener un modelo y permite comprobarlo. Fuentes: https://en.wikipedia.org/wiki/Information_Delivery_Specification · https://www.ingenieur.de/neuer-standard-ids-v1-0-von-buildingsmart-46becd27-fe24-4c77-a8c9-d61cbd38f895/
- Encaje en el comparador: IDS no detecta cambios. Sirve para (a) comprobar que la nueva revisión sigue cumpliendo y (b) decir qué propiedades importan, para filtrar el ruido del diff. **SUPUESTO** de diseño.

## 8. Implicaciones de diseño

1. **El diff no puede fiarse solo del GlobalId.** Hace falta un emparejamiento de respaldo (clase normalizada + tipo + posición/bbox + Name/Tag) y un aviso: "X % de los GUID cambió; ¿exportación sin GUID estable?".
2. **Detectar regeneración masiva** (más del 50 % añadidos y borrados con geometría casi igual) y explicar la causa probable por herramienta (opción de Revit, opción de Archicad, Tekla).
3. **Normalizar el esquema** antes de comparar: StandardCase → supertipo, unidades a metros, georreferencia/origen. Separar "movido todo el modelo" de "movido un elemento".
4. **No usar `IfcOwnerHistory.ChangeAction` como verdad**; como mucho, como pista.
5. **Leer los metadatos ISO 19650** (P01→P02, S2→A1) del nombre o del transmittal para etiquetar las versiones, y aceptar también códigos locales (Rev A/B, Rev 0/1).
6. **Ser la "nube de revisión automática"**: generar marcas visuales (resaltado 3D + lista) de *todo* lo cambiado, sobre todo lo que el autor no marcó.
7. **Priorizar por impacto en obra** (prefabricado: geometría, cotas de conexión, huecos, armado/anclajes) frente a cambios solo de datos. Usar perfiles tipo IDS para elegir las propiedades relevantes.
8. **Exportar los cambios como BCF 3.0** (un topic por cambio o grupo, con viewpoint y components), para que entren en Solibri, Trimble Connect, etc., sin herramienta propia.
9. **Comparar también planos (PDF/DWG)**: los cambios sin marcar llegan sobre todo en planos 2D; el comparador IFC solo cubre una parte. **SUPUESTO** sobre el flujo del usuario: validarlo con él.
10. **Funcionar en el navegador y sin servidor** para el caso básico, coherente con las reglas del proyecto (gasto 0, gratis lo que corre en el navegador). Dejar el historial, los transmittals y la API BCF para el plan de pago.
11. **Validar los SUPUESTOS** con el usuario real: herramienta de autor de sus proveedores, formato de entrega (PDF, IFC o ambos), códigos de revisión que usan.
