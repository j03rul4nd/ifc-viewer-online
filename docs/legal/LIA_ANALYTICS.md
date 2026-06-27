# Evaluación de Interés Legítimo (LIA) — Analítica y atribución

> **Responsable:** IFC Viewer Online · **Fecha:** 2026-06-27 · **Revisión:** anual o ante cambios.
> Sustenta el uso del Art. 6(1)(f) (interés legítimo) para las actividades #2 (analítica) y #3 (atribución) del [RAT](GDPR_COMPLIANCE.md#2-registro-de-actividades-de-tratamiento-rat--art-30). No es asesoría legal.

El uso de interés legítimo exige un test de tres pasos (*purpose / necessity / balancing*). Esta es la evaluación documentada.

## 1. Test de finalidad (¿hay un interés legítimo?)

Sí. Medir de forma agregada cómo se usa una herramienta gratuita (qué funciones se usan, dónde abandonan los usuarios, qué tasa de fallo de parseo hay) es necesario para **mantener y mejorar el producto** y para **entender qué canales de difusión funcionan**. Es un interés reconocido (considerando 47 RGPD menciona el marketing directo y, por extensión, la analítica de producto de bajo impacto).

## 2. Test de necesidad (¿es proporcionado y mínimo?)

Sí, el tratamiento es deliberadamente mínimo:
- **Solo eventos tipados** definidos a mano (`autocapture: false`); nunca captura masiva del DOM.
- **Sin contenido del modelo**, sin nombres de archivo, sin valores de propiedades, sin coordenadas (invariante INV-5 en `src/lib/analytics.ts`).
- **Cookieless** (`persistence: 'memory'`): sin identificador persistente ni cookies; el `distinct_id` vive solo en memoria de la pestaña.
- **Sin session replay**, sin cross-site tracking, sin publicidad, sin enriquecimiento con terceros.
- **Atribución**: etiqueta de campaña **opaca y no personal**, en `sessionStorage`, borrada de la URL.
No existe una alternativa razonable menos intrusiva que siga permitiendo medir el producto.

## 3. Test de ponderación (¿prevalecen los derechos del interesado?)

| Factor | Valoración |
|---|---|
| Naturaleza de los datos | No sensibles. Eventos de uso agregados + IP (en ingesta). **Mitigación:** activar "Discard client IP" en PostHog (ver checklist). |
| Expectativa razonable | Alta: la analítica de producto agregada es esperable en una web; además se declara con transparencia en la política. |
| Impacto en el interesado | Muy bajo: sin perfilado, sin decisiones, sin identificación, sin seguimiento entre sesiones ni sitios. |
| Garantías | Cookieless; minimización; **derecho de oposición de un clic**; respeto automático de **GPC/Do-Not-Track**; sin venta de datos. |
| Balance | **Favorable al responsable**: el interés legítimo prevalece sin menoscabo desproporcionado, dado el impacto mínimo y las garantías. |

## 4. Garantías implementadas (cómo se materializa el balance)

- **Oposición (Art. 21):** interruptor en la Política de Privacidad (`AnalyticsChoice` en `PrivacyPolicy.tsx`) → `consentStore` → `disableAnalytics()`; efecto inmediato, sin servidor. Decisión persistida como un único flag funcional (`ifc-analytics-optout:v1`).
- **Señales del navegador:** `consentStore.readAnalyticsOptOut()` honra `navigator.globalPrivacyControl` y Do-Not-Track como oposición por defecto cuando no hay elección explícita.
- **No init sin permiso:** `main.tsx` solo llama a `initAnalytics()` si `analyticsAllowed()`.
- **Transparencia:** tabla de bases legales + lista de encargados en la política pública.

## 5. Conclusión

El tratamiento analítico y de atribución puede ampararse en el **interés legítimo (Art. 6(1)(f))** con riesgo residual bajo, condicionado a completar la acción operativa de **minimización de IP en PostHog**. Si una autoridad de control (p. ej. en DE/FR con criterios estrictos) exigiera consentimiento previo, existe el plan de contingencia [`STRATEGY_B_CONSENT_CONTINGENCY.md`](STRATEGY_B_CONSENT_CONTINGENCY.md), cuyos *hooks* técnicos ya están implementados.
