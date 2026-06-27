# Cumplimiento RGPD — Documento maestro de accountability

> **Responsable del tratamiento:** IFC Viewer Online (marca operada por su titular).
> **Contacto / DPO de facto:** `privacy@ifcvieweronline.eu`
> **Ámbito:** `https://www.ifcvieweronline.eu/` (SPA estática en Vercel; sin backend de datos de usuario).
> **Última revisión:** 2026-06-27
> **No es asesoría legal.** Refleja las mejores prácticas aplicadas y el comportamiento real verificado en el código. Conviene una revisión legal final para la jurisdicción (España / AEPD).

Este documento es el registro de *accountability* (RGPD Art. 5(2)) del producto: qué datos se tratan, con qué base, con quién se comparten, cuánto se conservan, cómo se ejercen los derechos y qué medidas de seguridad hay. Léelo junto con:
- [`LIA_ANALYTICS.md`](LIA_ANALYTICS.md) — evaluación de interés legítimo para la analítica.
- [`STRATEGY_B_CONSENT_CONTINGENCY.md`](STRATEGY_B_CONSENT_CONTINGENCY.md) — plan de contingencia (banner de consentimiento) si una autoridad lo exigiera.
- La Política de Privacidad pública: [`src/components/legal/PrivacyPolicy.tsx`](../../src/components/legal/PrivacyPolicy.tsx).

---

## 1. Principio rector: privacy by design / by default

El activo sensible —los **archivos IFC del usuario**— se procesa **100% en el navegador** (WebAssembly / web-ifc / `@thatopen` + Web Workers + caché OPFS). **Nunca se suben, transmiten ni almacenan** en ningún servidor del responsable. Por tanto, respecto a los modelos **no hay tratamiento de datos personales por parte del responsable**. Es el mejor cumplimiento posible y el diferenciador del producto.

---

## 2. Registro de Actividades de Tratamiento (RAT — Art. 30)

> Aunque la organización podría acogerse a la exención del Art. 30(5) (<250 personas), el tratamiento de email (marketing) y analítica no es plenamente ocasional, por lo que se mantiene este RAT ligero.

| # | Actividad | Categorías de datos | Interesados | Finalidad | Base legal (Art. 6) | Encargado | Ubicación | Conservación |
|---|---|---|---|---|---|---|---|---|
| 1 | **Procesado de modelos IFC** | Ninguno sale del dispositivo | Usuarios | Visualizar/validar/editar IFC | N/A (sin tratamiento por el responsable) | — | Navegador del usuario | No aplica |
| 2 | **Analítica de producto** | Eventos de uso agregados, dirección IP (en ingesta), id anónimo en memoria | Visitantes | Entender y mejorar el uso | **Interés legítimo** 6(1)(f) — ver LIA | PostHog | EE. UU. | Según retención de PostHog (ver §5) |
| 3 | **Atribución de campañas** | Etiqueta opaca de campaña (sin PII) | Visitantes de enlaces de invitación | Saber qué canal trae visitas | **Interés legítimo** 6(1)(f) | — (solo cliente) | `sessionStorage` (navegador) | Sesión de pestaña |
| 4 | **Suscripción a novedades** | Email, source, locale, timestamp | Suscriptores | Enviar avisos de producto solicitados | **Consentimiento** 6(1)(a) | Resend (vía Cloudflare Worker) | EE. UU. | Hasta baja / solicitud de borrado |
| 5 | **Reportes compartidos** | Lista de issues de validación (sin geometría) | Quien comparte y destinatarios | Compartir/indexar un reporte que el usuario eligió compartir | **Consentimiento / acción del usuario** | Cloudflare (Worker, stateless) | Edge global | Caducan a los 90 días (en la URL; nada se almacena) |
| 6 | **Benchmark de Health Score** | Solo el número de score (sin IP, sin id) | Visitantes (opt-in implícito al calcular) | Estadística agregada del sector | Interés legítimo / dato no personal | Cloudflare KV | Edge global | Agregado permanente (no reversible a persona) |
| 7 | **Protección anti-abuso / hosting** | IP (metadato de petición) | Visitantes | Rate limiting + entrega de contenido | **Interés legítimo** 6(1)(f) | Cloudflare, Vercel | EE. UU. / edge | Logs de infraestructura del proveedor |

**Categorías especiales (Art. 9):** ninguna. **Decisiones automatizadas / profiling (Art. 22):** ninguno.

---

## 3. Almacenamiento en el dispositivo (cookies / local storage)

Sin cookies de tracking ni de publicidad. PostHog corre en `persistence: 'memory'` → **no escribe cookies ni localStorage**. Lo único que se almacena es **funcional / estrictamente necesario**:

| Clave | Tipo | Finalidad |
|---|---|---|
| `ifc-locale` | localStorage | Idioma de interfaz |
| `ifc-viewer:prefs` | localStorage | Preferencias de UI (tamaños/visibilidad de paneles) |
| `ifc-geo-*` | localStorage | Consentimiento y opciones del modo mapa (opcional) |
| `ifc-analytics-optout:v1` | localStorage | Decisión de oposición a la analítica (para honrarla) |
| `ifc.entry_source` / `ifc.entry_segment` / `ifc.entry_source_kind` | sessionStorage | Etiqueta de campaña no personal (se borra al cerrar pestaña) |
| `coiReloaded`, `chunkReloaded` | sessionStorage | Técnicos (cross-origin isolation / recarga de chunks) |

Por su carácter funcional, **no requieren consentimiento previo** (ePrivacy). Al no usar PostHog almacenamiento en el dispositivo, **tampoco se dispara la obligación de banner**.

---

## 4. Encargados, sub-encargados y transferencias internacionales

| Proveedor | Rol | Datos | País | Mecanismo de transferencia | DPA |
|---|---|---|---|---|---|
| **PostHog** | Analítica | Eventos + IP (en ingesta) | EE. UU. | SCC / DPF — **confirmar y archivar** | **Confirmar DPA firmado** |
| **Resend** | Envío de email | Email del suscriptor | EE. UU. | SCC / DPF — **confirmar** | **Confirmar DPA** |
| **Cloudflare** | Worker (subscribe/report/bench) + anti-abuso | IP (metadato), email en tránsito (subscribe) | EE. UU. / edge | SCC / DPF — **confirmar** | **Confirmar DPA** |
| **Vercel** | Hosting estático + CDN | IP (metadato de petición) | EE. UU. / edge | SCC / DPF — **confirmar** | **Confirmar DPA** |

> ✅ La lista de encargados se publica además en la Política de Privacidad (transparencia + confianza B2B).
> ⚠️ **Acción pendiente (operativa):** confirmar y guardar copia del DPA y del mecanismo de transferencia (SCC y/o certificación EU-US Data Privacy Framework) de cada proveedor. Ver §8.

---

## 5. Conservación (data retention)

- **Analítica (PostHog):** según la política de retención del proyecto. **Acción:** fijar una retención explícita y razonable (p. ej. 12 meses) y documentarla aquí.
- **Email (Resend):** hasta baja o solicitud de borrado.
- **Reportes compartidos:** caducan a los 90 días (`REPORT_MAX_AGE_DAYS`, advisory; el dato vive solo en la URL).
- **Benchmark:** agregado, no reversible a persona.
- **Preferencias locales:** en el dispositivo del usuario hasta que las borre; el responsable no las ve.

---

## 6. Derechos de los interesados (Arts. 15–22) y procedimiento DSAR

Canal único: **`privacy@ifcvieweronline.eu`**. Plazo de respuesta: **1 mes** (prorrogable 2 meses, Art. 12(3)).

| Derecho | Cómo se atiende |
|---|---|
| Acceso (15) | Buscar el email en Resend; los eventos de analítica son anónimos (id en memoria) → no vinculables a una persona identificada. |
| Rectificación (16) | Corregir/actualizar el email en Resend. |
| Supresión (17) | Eliminar el contacto de Resend; la analítica no guarda identificadores persistentes. |
| Portabilidad (20) | Exportar el registro del email (CSV) desde Resend. |
| Limitación (18) | Marcar el contacto como no contactable / pausar envíos. |
| **Oposición (21)** | **Analítica:** interruptor de opt-out en la Política de Privacidad (efecto inmediato, sin servidor) + respeto automático de GPC/Do-Not-Track. **Email:** baja en cualquier email o por solicitud. |
| Retirada de consentimiento (7(3)) | Baja de email = tan fácil como darse de alta. |

**Reclamación:** ante la **AEPD** (España) — [aepd.es](https://www.aepd.es).

**Brecha de seguridad (Arts. 33/34):** ante un incidente con datos personales (p. ej. fuga de la lista de Resend), notificar a la AEPD en 72 h y a los afectados si hay alto riesgo. Mantener un registro interno de incidentes.

---

## 7. Medidas de seguridad (Art. 32)

- **Minimización en analítica:** solo eventos tipados, `autocapture: false`, sin session replay, sin contenido de modelo, sin nombres de archivo ni PII (invariante INV-5 en `src/lib/analytics.ts`).
- **Cookieless:** PostHog en modo memoria; opt-out con respeto a GPC/DNT.
- **Worker:** allowlist CORS, validación de entrada, hardening XSS (escape + unicode-escape en JSON-LD), rate limiting por IP (fail-open), secretos solo como Worker Secrets (la API key de Resend nunca llega al front). Los logs **no** registran el email (solo estado).
- **Fuentes self-hosted:** las webfonts se sirven desde el propio origen → **no se envía la IP del usuario a Google** (se eliminó Google Fonts CDN).
- **Cabeceras HTTP** (`vercel.json`): `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Permissions-Policy` (cámara/micro/geo/topics deshabilitados), y **CSP en modo Report-Only** (ruta de promoción a enforce en §8).
- **Transporte:** HTTPS forzado (HSTS).
- **Atribución sin fugas:** la etiqueta de campaña se borra de la URL tras capturarla (evita fuga por `Referer`/capturas).

---

## 8. Checklist operativa (acciones manuales fuera del código)

> Estas acciones **no son código** y deben realizarse en los paneles de los proveedores. Sin ellas, parte del cumplimiento documentado aquí no se materializa.

- [ ] **Buzón `privacy@ifcvieweronline.eu`**: crear y enrutar a un correo monitorizado. **Hasta que exista, el contacto RGPD no funciona** → si no se puede, revertir el contacto a un email real atendido en `PrivacyPolicy.tsx`/`TermsOfUse.tsx`/estos docs.
- [ ] **PostHog → "Discard client IP data"**: activar en *Project settings* para no almacenar la IP (refuerza el interés legítimo y la postura "exento de consentimiento"). Confirmar también la **región** del proyecto (`VITE_POSTHOG_HOST`): si es US, la política ya lo declara; valorar host EU.
- [ ] **PostHog retención**: fijar retención explícita (p. ej. 12 meses) y anotarla en §5.
- [ ] **DPAs + transferencias**: firmar/confirmar DPA y mecanismo SCC/DPF con PostHog, Resend, Cloudflare y Vercel; archivar copia. Actualizar §4.
- [ ] **Resend doble opt-in + unsubscribe**: activar confirmación de suscripción (recomendado; de facto exigido en algunos países como Alemania) y verificar el enlace de baja en cada email.
- [ ] **CSP → enforce**: tras observar el `Content-Security-Policy-Report-Only` contra el deploy real (incluidos `VITE_POSTHOG_HOST`, dominio del Worker y proveedores de tiles GIS activos), promover a `Content-Security-Policy`.
- [ ] **Build OG (build-time)**: los scripts `scripts/og/*` descargan Google Fonts en build (no afecta a usuarios finales). Opcional: self-host también ahí por pureza.

---

## 9. Evaluación de impacto (DPIA — Art. 35)

**No se requiere DPIA.** El tratamiento no es de alto riesgo: no hay categorías especiales, ni observación sistemática a gran escala, ni decisiones automatizadas, ni profiling. La analítica es agregada, cookieless y con oposición fácil. Se deja constancia de esta valoración como parte de la accountability.

---

## 10. Coherencia código ↔ texto (el mayor riesgo legal)

La promesa de marca debe coincidir con el código:
- "100% cliente / los IFC no se suben" → verificado (procesado en navegador, sin subida a R2/Worker).
- "cookieless / sin cookies de tracking" → `persistence: 'memory'`.
- "self-hosted fonts / sin Google" → Google Fonts eliminado de `index.html` y del generador de páginas `/fix/`.
- "puedes oponerte a la analítica" → interruptor real + GPC/DNT.
Cualquier cambio futuro que afecte a flujos de datos **debe** actualizar este documento y la Política de Privacidad.
