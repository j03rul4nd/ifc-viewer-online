# Guion de entrevistas con design partners — IFC Health Score

> **Objetivo:** en 14 días, matar o validar con *evidencia conductual* (no opiniones) las 3 assumptions peligrosas del producto. Reemplazar el desk-research por realidad. Ver `memory/project_refocus_save_2026-06.md` §4 decisión 5.
>
> **Las 3 preguntas que esta ronda debe responder:**
> 1. **¿Existe el loop de handoff coordinador→exportador?** (assumption A5)
> 2. **¿Hay disposición real a pagar, y de quién?** (A6)
> 3. **¿Es D7 la métrica correcta, o el job es episódico?** (A9 / H3)

---

## Reglas de oro (si las rompes, los datos no valen nada)

El sesgo natural de toda entrevista es que la gente te miente para no herirte. El *Mom Test* lo evita:

- ❌ **NUNCA preguntes** "¿pagarías por esto?", "¿usarías un Health Score?", "¿te parece útil?" → todos dicen que sí por cortesía. Cero valor.
- ✅ **Pregunta por comportamiento pasado concreto**, no por intenciones futuras.
- ✅ Cuando elogien la idea, **redirige a hechos**: *"¿cuándo fue la última vez que te pasó? ¿qué hiciste exactamente?"*
- ✅ **Habla menos, escucha más.** No vendas el producto hasta el Bloque 4.
- ✅ Si dicen algo vago ("sería genial"), pide el caso real detrás ("¿me cuentas la última vez?").
- ✅ Toma notas **literales** (sus palabras exactas = oro para el copy y el posicionamiento).

---

## A quién reclutar (2 perfiles distintos)

| Perfil | Nº | Dónde | El "ask" exacto |
|--------|----|----|------|
| **Coordinador/Manager BIM** (comprador) — despacho 5-50 personas | 3 | LinkedIn (filtro "BIM Coordinator/Manager"; el cierre de Solibri Anywhere Q4-2026 es un abridor perfecto), capítulos buildingSMART | *"Estoy construyendo una herramienta de health-check de IFC. **No te vendo nada** — quiero 20 min para entender cómo validáis modelos hoy. A cambio, acceso anticipado."* |
| **Exportador** (arquitecto/ingeniero que hace el export) | 2 | Hilos Autodesk/Graphisoft sobre psets perdidos o GUIDs; responde con valor real y luego pide la llamada | Igual |

> **Si no consigues que 5 coordinadores te den 20 min en 14 días, eso YA es un dato crítico:** la persona no es accesible o el dolor no es lo bastante agudo. No lo ignores.

---

## El guion (≈20 min)

### Bloque 1 — El job real *(sin mencionar tu producto, ~7 min)*

1. *"Cuéntame la última vez que recibiste/enviaste un IFC para una entrega. ¿Qué hiciste, paso a paso?"*
   - EN: *"Walk me through the last time you sent/received an IFC for a delivery. Step by step — what did you actually do?"*
2. *"¿Cómo sabes si un IFC está bien antes de que llegue al cliente o al CDE? ¿Quién lo comprueba?"* ← **valida el Cluster 7 ("nadie comprueba lo que hay dentro")**
   - EN: *"How do you know an IFC is OK before it reaches the client or the CDE? Who checks it?"*
3. *"La última vez que un IFC vino mal, ¿cómo te enteraste y qué pasó después?"* ← **coste real del dolor**
4. *"¿Qué herramientas usas hoy para esto? ¿Qué pasó la última vez que usaste [Solibri / bSI validator / lo que mencionen]?"*

### Bloque 2 — El loop de handoff *(la assumption A5, sin guiarles, ~5 min)*

5. *(Al coordinador)* *"Cuando un exportador te manda un modelo con problemas, ¿qué le dices exactamente? ¿Le mandas algo — un email, un PDF, un link, una captura?"* ← **¿existe el handoff y por qué canal?**
6. *(Al exportador)* *"Cuando el coordinador te rechaza un modelo, ¿cómo te llega el rechazo? Si tuvieras una forma de comprobarlo tú en 1 clic antes de enviar, ¿lo harías? ¿Cuándo?"*

> 🎯 **Lo que busco:** que el handoff salga **espontáneamente**, sin que yo lo sugiera. Si tengo que explicárselo, probablemente no existe como ellos lo viven.

### Bloque 3 — Frecuencia *(la métrica, H3, ~2 min)*

7. *"¿Cada cuánto validas/entregas un IFC? ¿Por proyecto, por semana, por hito?"* ← **me dice si D7 es realista o absurdo**

### Bloque 4 — AHORA enseña el producto *(~5 min)*

8. Comparte un **report de Health Score real** (un link `/r?d=…`). **Cállate. Observa:**
   - ¿Pregunta *"¿82 es bueno?"*? → **confirma que el benchmark es imprescindible** (decisión 4). Apúntalo.
   - ¿Pregunta *"¿puedo mandarle esto a mi cliente / adjuntarlo a la entrega?"*? → **señal del certificado/badge** (monetización). Apúntalo.
   - ¿Se fija en *"no se sube nada"*? → señal del ángulo privacidad/NDA.

### Cierre — el test de WTP conductual *(no declarativo)*

No preguntes el precio. Mide **3 comportamientos**:

- **a) Test del artefacto:** *"Si pudieras adjuntar a tu entrega un report fechado y firmado — 'este modelo sacó 88/100' — ¿lo harías?"* Si dicen sí → pídeles que te reenvíen (anonimizado) un email de entrega real donde encajaría. **La fricción de hacerlo revela el interés real.**
- **b) Fake-door de precio:** *(en el producto, en paralelo)* botón "Download signed certificate (Pro)" → modal con 3 precios + email "avísame". Mide click-rate y qué precio eligen. **Intent puro, cero ingeniería de pago.**
- **c) Pre-venta dura** *(la prueba definitiva, a los 2-3 más calientes)*: *"Saco el tier Pro en X semanas. ¿Pre-pagas 3 meses con 50% dto. ahora?"* Un Stripe Payment Link, 10 min de setup. **El dinero es la única encuesta que no miente.**

---

## Reglas de decisión (qué significa cada resultado)

| Señal observada | Interpretación | Acción |
|---|---|---|
| ≥3/5 describen el handoff **espontáneamente** (Bloque 2) | Loop real | Construir el report crawleable + badge como prioridad absoluta |
| Nadie menciona handoff sin que lo guíes | Loop **imaginado** | El growth loop no es viral → replantear a SEO/directo |
| Preguntan *"¿82 es bueno?"* (Bloque 4) | El número no significa nada solo | **Benchmark = P0** (decisión 4) |
| Se fijan en *"puedo adjuntarlo a la entrega"* | Valor en el artefacto | Priorizar certificado/badge |
| ≥1 pre-paga (cierre-c) | WTP individual existe | Seguir con Pro, acotado |
| 0 pre-pagan, pero piden *"para mi equipo/proyecto"* | WTP está en **governance**, no individual | Pivotar a modelo team/embed (no $9 individual) |
| *"Lo uso, pero 1×/mes"* (Bloque 3) | D7 es la métrica equivocada | Cambiar gate a cadencia por entrega / D30-45 |

---

## Entregable de esta ronda

Un doc de **1 página**: las 5 transcripciones (o bullets literales) + un **veredicto por assumption**: `validada` / `muerta` / `pivota`. Esto reemplaza ~6 meses de construir a ciegas.

> Guarda los hallazgos en una nueva memoria `project_customer_dev_2026-06.md` y enlázala desde `MEMORY.md`. Actualiza `project_refocus_save_2026-06.md` §8 (qué debe ser verdad) con lo aprendido.
