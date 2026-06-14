# Handoff — Páginas legales: Privacy Policy + Terms of Use

> **Estado:** NO construido. Spec autocontenido para implementarlo de una sola pasada.
> **Para empezar, di al chat:** _"Implementa `docs/HANDOFF_PRIVACY_TERMS.md`"_.
> **Verificado contra el código el 2026-06-04.** Las referencias a líneas/archivos son reales.

---

## TL;DR — orden de ejecución

1. `Route` += `'privacy' | 'terms'` en `src/types/index.ts`.
2. Routing en `App.tsx`: detección en init (`useState` de `route`), en `popstate`, render `{route === ...}`, y handlers `pushState`.
3. Componentes `PrivacyPolicy.tsx` + `TermsOfUse.tsx` (+ `LegalLayout` compartido). Cada uno fija `document.title` en un `useEffect` propio (ver §6 — **`useSeo` NO sirve para esto**).
4. Rellenar el texto legal (§7) tras **confirmar el comportamiento real** (§5).
5. Enlazar desde footer del Landing, pie del upload y `SharedReportView` (§8).
6. Añadir 2 `<url>` a `public/sitemap.xml` a mano (§9).
7. `npm run build` + navegación manual (incluido botón atrás).

**Datos del proyecto que vas a necesitar:**
- Base URL pública: `https://www.ifcvieweronline.eu/`
- `import.meta.env.BASE_URL` = `/ifc-viewer-online/` (todas las rutas se normalizan contra esto).
- Email de contacto: `joelbenitezdonari@gmail.com` (confirmar si se prefiere un alias `privacy@`).

---

## 1. Por qué (no borrar — es el "por qué" del ticket)

Origen: hilo de r/bim sobre un visor IFC competidor (bimsta.com). El comentario de `Smart-Philosophy5233` confirmó en vivo que **ningún negocio serio sube un modelo propietario a un visor online sin una política de privacidad y documentación legal publicada**. Es un *gate de credibilidad B2B*, no un moat — pero sin él, la persona objetivo (comprador/exportador BIM) ni evalúa el producto.

**Ángulo central, coherente con todo el posicionamiento:** procesamiento **100% en el navegador del cliente; los archivos IFC nunca se suben a un servidor.** La política debe *formalizar* esa promesa, no contradecirla. Es el diferenciador real frente a Dalux/Solibri (que procesan en servidor).

> ⚠️ **No inventar afirmaciones legales.** Documentar lo que el producto realmente hace. Si algo SÍ sale del navegador (analytics PostHog, el Worker de reportes, email capture), declararlo con honestidad. Ver §5. **Si el código contradice este borrador, gana el código.**

---

## 2. Arquitectura de routing (leer antes de tocar nada)

Routing **por estado, no React Router**. Vive en [`src/App.tsx`](../src/App.tsx). El patrón a copiar es el del **blog**. Piezas:

| Qué | Dónde | Acción |
|---|---|---|
| Tipo `Route` | [`src/types/index.ts:1`](../src/types/index.ts) | Añadir `'privacy' \| 'terms'` |
| Init de `route` | [`App.tsx:80-88`](../src/App.tsx) | Detectar `/privacy` y `/terms` en el `rel` path normalizado |
| Back/forward | `popstate` handler [`App.tsx:131-150`](../src/App.tsx) | Añadir los dos paths o el botón atrás se rompe |
| Render | bloques `{route === 'x' && <motion.div>}` [`App.tsx:640-696`](../src/App.tsx) | Copiar patrón del bloque blog (`AnimatePresence` + `motion.div className="absolute inset-0 overflow-y-auto"`) |
| Navegar a la página | tipo `handleNavigateToBlog` [`App.tsx:111-118`](../src/App.tsx) | Crear `handleNavigateToPrivacy/Terms`: `history.pushState(null,'',path)` + `setRoute(...)` |
| Volver al landing | `handleNavigateToLanding` [`App.tsx:607`](../src/App.tsx) | **Reutilizar tal cual** (ya hace `pushState` a base + limpia estado de modelo; inofensivo desde una página legal) |

Path a construir (respetando `BASE_URL`):
```ts
const legalUrl = (page: 'privacy' | 'terms') => {
  const base = import.meta.env.BASE_URL ?? '/'
  return base.endsWith('/') ? `${base}${page}` : `${base}/${page}`
}
```
Detección en init / popstate (replicando el patrón de [`App.tsx:84`](../src/App.tsx)):
```ts
const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
if (rel === '/privacy' || rel.startsWith('/privacy')) return 'privacy'
if (rel === '/terms'   || rel.startsWith('/terms'))   return 'terms'
```

> ⚠️ **GitHub Pages + deep links:** es un SPA en GH Pages. Entrar directo a `/ifc-viewer-online/privacy` por URL devolverá 404 salvo que exista el fallback `404.html → index.html` (el blog ya funciona con deep links, así que el fallback probablemente ya está; **confírmalo** — si el blog abre por URL directa, las legales también). No montar nada nuevo de infra para esto.

---

## 3. Componentes a crear

Estilo editorial sobrio (referencia de layout/tipografía: [`src/components/Blog.tsx`](../src/components/Blog.tsx)). Crear:

- `src/components/legal/LegalLayout.tsx` — wrapper DRY: header (logo + "volver al inicio" → `onNavigateToLanding`), `max-w-3xl mx-auto`, prosa legible, "Last updated" arriba, footer. **Fija `document.title` aquí** (§6).
- `src/components/legal/PrivacyPolicy.tsx`
- `src/components/legal/TermsOfUse.tsx`

Props: `{ onNavigateToLanding: () => void }`. Sin hero animado. Usar tokens existentes (`--accent`).

---

## 4. i18n — decisión tomada: **solo inglés en v1**

El sitio tiene 10 idiomas, pero el texto legal traducido ×10 multiplica el riesgo (un error de traducción en un documento legal es peor que no traducirlo) y la persona compradora B2B lee inglés. **Rutas simples sin prefijo: `/privacy`, `/terms`.** El contenido de §7 está en inglés por esto.

> No hacer i18n ahora. Si en el futuro se quiere, replicar el patrón `BLOG_LANGS`/`BLOG_LANG_RE` ([`App.tsx:64-66`](../src/App.tsx)) con `/<lang>/privacy`.

---

## 5. Verdades técnicas que la política DEBE reflejar (verificar en código antes de redactar)

La política no puede mentir. Confirmar cada punto leyendo el código y declararlo con honestidad:

1. **IFC = 100% cliente.** Parsing/validación corren en el navegador (web-ifc / `@thatopen` + worker). **Confirmar que el modelo NO se sube** a R2/Worker. Esta es la afirmación estrella.
2. **Analytics: PostHog.** Ver `src/lib/analytics.ts:50-71` (`initAnalytics`). **⚠️ 3 afirmaciones del borrador NO están confirmadas por el código — verificar antes de publicar (si no, la política mentiría):**
   - **Host:** el default es **`https://us.i.posthog.com` (US, no EU)** — `analytics.ts:57`. El host real depende de `VITE_POSTHOG_HOST` en el deploy. **Confirmar el valor desplegado antes de afirmar "EU-hosted".** Si está en US, decir "US-hosted" o cambiar el env a un host EU.
   - **IP masking:** **NO está configurado** en el `init`. PostHog guarda IP por defecto. **No afirmar "IP addresses are masked"** salvo que se active explícitamente (`property_blacklist`/proxy) y se verifique.
   - **Cookies:** `persistence: 'localStorage+cookie'` (`analytics.ts:64`) → **PostHog SÍ usa cookies**, no solo localStorage. Declarar cookies de analytics (relevante GDPR).
   - **Sí confirmado:** `autocapture: false` (solo eventos tipados explícitos), `person_profiles: 'identified_only'`, **sin session replay** (no se activa en el init → off por defecto, seguro afirmarlo). Eventos = UI, nunca contenido del modelo. Link: `https://posthog.com/privacy`.
3. **Reportes crawleables (Cloudflare Worker) — EN PRODUCCIÓN.** El Worker ya está desplegado en Cloudflare y los share links de health de los modelos IFC **ya funcionan en vivo** (no es pendiente). Ver `cf-worker/worker.js` + memoria `project_crawlable_reports.md`. Cuando el usuario **elige compartir**, el resumen de issues se codifica en la URL (base64url) y el Worker la renderiza server-side. Declarar: opt-in explícito, **sin geometría** del modelo (solo lista de issues), links caducan (`REPORT_MAX_AGE_DAYS`, default 90), rate limiting por IP.
4. **Email capture — ACTIVO EN PRODUCCIÓN.** Worker CF + Resend (memoria `project_strategy_distribution.md`) **ya está funcionando desde hace tiempo**. **Declararlo obligatoriamente** en la política: qué emails se recogen, con qué fin (p.ej. avisos de producto / lista), que se procesan vía Resend, y cómo darse de baja. Confirmar en el código del Worker el endpoint y el destino exactos.
5. **Hosting:** GitHub Pages estático, sin backend que almacene datos de usuario.
6. **localStorage:** preferencias de UI (`usePersistedPreferences`), idioma. No cookies de tracking de terceros más allá de PostHog.

---

## 6. SEO / título de página — **`useSeo` NO sirve aquí (corregido)**

[`src/seo/useSeo.ts`](../src/seo/useSeo.ts) sincroniza meta con el **idioma activo**, NO con la ruta: fija `document.title` desde `LOCALE_META[locale]` y reacciona solo a `[locale, meta]`. No es route-aware. **No lo modifiques** para esto (tocarías lógica compartida del landing).

**En su lugar**, cada página legal fija su propio título en un `useEffect` local (en `LegalLayout`):
```tsx
useEffect(() => {
  const prev = document.title
  document.title = `${pageTitle} · IFC Viewer Online`
  return () => { document.title = prev }
}, [pageTitle])
```
Nota: `useSeo` corre en el root y puede reescribir el título al cambiar idioma; como las legales son una vista a pantalla completa y la página no cambia de idioma estando ahí, el `useEffect` local basta para v1. No perseguir más precisión SEO aquí — el objetivo es **credibilidad para humanos que entran a leerlas**, no ranking.

`robots`: que sean indexables está bien (el `<meta robots>` global de `index.html` ya lo permite). No añadir `noindex`.

---

## 7. Contenido base (inglés) — versión GDPR-grade

> ⚠️ **No es asesoría legal.** Este borrador aplica las mejores prácticas investigadas (GDPR Arts. 13/14, ePrivacy, disclaimers de SaaS) pero el usuario debería darle un repaso final (o un abogado/generador reputado) antes de publicarlo. La estructura sigue los **8 elementos obligatorios GDPR**: identidad del responsable, qué datos, para qué, base legal, con quién se comparten, transferencias internacionales, plazos de conservación, derechos del usuario.

### 7.1 — Decisión de producto que condiciona la política: **cookies de PostHog**

La investigación es clara: **las cookies de analytics requieren consentimiento previo (banner) bajo GDPR + ePrivacy** — el "interés legítimo" NO es base válida para analytics ([PostHog GDPR docs](https://posthog.com/docs/privacy/gdpr-compliance), [Secure Privacy](https://secureprivacy.ai/blog/gdpr-cookie-consent-requirements-2025)). El código usa hoy `persistence: 'localStorage+cookie'` (`analytics.ts:64`), lo que **dispara esa obligación**. Hay dos caminos — **elegir uno antes de redactar**:

| Opción | Qué implica | Recomendación |
|---|---|---|
| **A. Modo cookieless** (`persistence: 'memory'` en PostHog, o cookieless mode "always") | No guarda cookies → **no necesitas banner de consentimiento**. Coherente con el posicionamiento "privacy-first / 100% cliente". Ya hay precedente: las páginas SEO estáticas usan `persistence:memory` (memoria `project_analytics_system.md`). | ✅ **RECOMENDADO.** Cambia `analytics.ts:64` a `persistence: 'memory'`, evitas todo el aparato de banner, y la política puede decir honestamente "no usamos cookies de tracking". Pierdes algo de fidelidad de atribución cross-session, aceptable para tu escala. |
| **B. Mantener cookies + banner de consentimiento** | Tienes que montar un cookie consent banner que **bloquee `initAnalytics()` hasta el opt-in** del usuario EU, con registro del consentimiento. | ❌ Más trabajo, peor UX, contradice la marca. Solo si necesitas atribución cross-session fuerte. |

> El borrador de Privacy de abajo está redactado para la **Opción A (cookieless)**. Si se elige B, hay que añadir la sección de cookies + banner.

### 7.2 — Privacy Policy (borrador)

```
# Privacy Policy
_Last updated: <FECHA>_

This Privacy Policy explains how <ENTIDAD/NOMBRE> ("we", "us") handles your
information when you use <DOMINIO> (the "Service"). We are the data controller.
Contact: <EMAIL>.

## The short version
Your IFC files are processed entirely inside your browser. They are never
uploaded to, stored on, or transmitted to any server we control. We cannot see
your models.

## What we process locally (never sent anywhere)
When you open an IFC file, all parsing, 3D rendering, and validation happen on
your device using WebAssembly. The file content never leaves your browser. We
have no access to it and never receive it.

## What we collect, why, and our legal basis
| Data | Purpose | Legal basis (GDPR Art. 6) |
|---|---|---|
| Anonymous usage events (e.g. "file opened", "validation run", "report shared") via PostHog | Understand and improve how the Service is used | Legitimate interest (Art. 6(1)(f)) — aggregate, non-cookie analytics |
| Your email address, only if you submit it | Send product updates you asked for | Consent (Art. 6(1)(a)) — withdrawable anytime |
| UI preferences (language, layout) in your browser's local storage | Remember your settings | Strictly necessary / legitimate interest |

We do NOT record the contents of your models, we do NOT use session replay, and
we do NOT use advertising or cross-site tracking cookies.
<!-- ⚠️ Esta tabla asume Opción A (cookieless). Confirma en el deploy que el host
     PostHog y el modo coinciden con lo que dices (§5.2). Si sigues con cookies
     (Opción B), cambia la base legal de analytics a "Consent" y añade banner. -->

## Shared reports (opt-in only)
If you explicitly choose to share a validation report, the issue summary is
encoded into a shareable link and rendered by a Cloudflare Worker so it can be
viewed and indexed by search engines. This does NOT include your model geometry
— only the list of validation issues you chose to share. Shared links
automatically expire after <N> days.

## Who we share data with (processors)
We use a small set of service providers ("processors") who act on our behalf:
- **PostHog** — product analytics. Hosted in the <REGION: US o EU — confirmar>.
- **Resend** — sending the email updates you subscribed to.
- **Cloudflare** — running the shared-report function and basic abuse protection.
- **GitHub Pages** — hosting the static site.
We never sell your data or share it with advertisers.

## International data transfers
Some processors (e.g. PostHog/Cloudflare) may process data outside the EEA.
Where that happens, transfers rely on appropriate safeguards such as Standard
Contractual Clauses. <!-- Confirmar región real de PostHog — §5.2 -->

## How long we keep it
- Analytics events: retained by PostHog for <X meses> then deleted/aggregated.
- Email: until you unsubscribe or ask us to delete it.
- Shared-report links: expire after <N> days (the link stops resolving).
- Local preferences: live in your browser until you clear them; we never see them.

## Your rights
If you are in the EEA/UK you have the right to access, rectify, erase, restrict,
port, and object to processing of your personal data, and to withdraw consent at
any time. To exercise any right, email <EMAIL>. You also have the right to lodge
a complaint with your local data protection authority
(<p.ej. AEPD en España — agpd.es / aepd.es>).

Because we never receive your IFC files, there is nothing to access or delete on
our side regarding your models.

## Children
The Service is not directed to children under 16 and we do not knowingly collect
their data.

## Changes
We may update this policy; the "Last updated" date reflects the latest version.
Material changes will be highlighted on this page.

## Contact
<EMAIL>
```

### 7.3 — Terms of Use (borrador)

```
# Terms of Use
_Last updated: <FECHA>_

## 1. Acceptance
By accessing or using <DOMINIO> (the "Service") you agree to these Terms. If you
do not agree, do not use the Service.

## 2. The Service
The Service is a free, browser-based IFC viewer and validation tool. Validation
results, issue lists, and health scores are provided for INFORMATIONAL purposes
only. They are not, and must not be relied upon as, professional, engineering,
surveying, or legal certification of a model's correctness, compliance, or
fitness for any purpose. You remain solely responsible for verifying your IFC
deliverables.

## 3. Third-party and demo content
The Service may load demo models and link to third-party resources we do not
control. We are not responsible for third-party content or its accuracy.

## 4. Acceptable use
Use the Service only for lawful purposes. You agree not to: disrupt or overload
the Service or its infrastructure (including the rate-limited shared-report
endpoint); attempt to gain unauthorized access; or misuse it to infringe others'
rights.

## 5. Disclaimer of warranties
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY
KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND
NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
ERROR-FREE, OR THAT ANY OUTPUT (INCLUDING VALIDATION RESULTS OR HEALTH SCORES)
IS ACCURATE OR COMPLETE.

## 6. Limitation of liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT,
INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS,
DATA, OR GOODWILL, ARISING FROM YOUR USE OF (OR INABILITY TO USE) THE SERVICE.
OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS SHALL NOT EXCEED EUR 50.

Nothing in these Terms excludes or limits liability that cannot be excluded by
law, including liability for death or personal injury caused by negligence,
fraud, gross negligence, or willful misconduct, or your statutory consumer rights.

## 7. Indemnity
You agree to hold us harmless from claims arising out of your misuse of the
Service or violation of these Terms, to the extent permitted by law.

## 8. Changes and availability
We may modify, suspend, or discontinue the Service or these Terms at any time.
The "Last updated" date reflects the latest version.

## 9. Governing law
These Terms are governed by the laws of <PAÍS/REGIÓN — p.ej. España>, without
prejudice to mandatory consumer-protection rights you may have in your country
of residence.

## 10. Contact
<EMAIL>
```

**Placeholders a rellenar:** `<FECHA>` (ISO), `<ENTIDAD/NOMBRE>` (persona física o marca — ver §7.4), `<DOMINIO>`, `<EMAIL>`, `<N>` (caducidad reportes — `REPORT_MAX_AGE_DAYS`, default 90, `worker.js:40`), `<REGION/X meses>` (analytics — confirmar en deploy), `<PAÍS/REGIÓN>` (jurisdicción), autoridad de control (AEPD si España).

### 7.4 — Playbook de protección (mejores prácticas investigadas)

Trucos y consejos de la comunidad/legal para que estos documentos **realmente protejan**:

1. **Disclaimers en MAYÚSCULAS y "conspicuos".** Los tribunales exigen que el disclaimer de garantías y la limitación de responsabilidad sean *clear and conspicuous* — por eso van en MAYÚSCULAS (convención legal real, no estética). Mantenlas así ([TermsFeed](https://www.termsfeed.com/blog/disclaimer-warranties-limitation-liability-clause/), [terms.law](https://www.terms.law/2025/01/15/the-legal-limits-of-disclaiming-warranties/)).
2. **Cap de responsabilidad con cifra nominal.** El estándar SaaS es "12 meses de fees", pero en un producto **gratis** eso = 0 € y un cap de 0 puede verse como inejecutable. Usa una cifra simbólica baja (**EUR 50** en el borrador) para que el cap sea válido ([TermsFeed SaaS](https://www.termsfeed.com/blog/saas-limitation-liability/), [toslawyer](https://toslawyer.com/limitation-of-liability-saas-guide/)).
3. **Carve-outs obligatorios.** NO puedes excluir responsabilidad por dolo, negligencia grave, fraude, muerte/lesiones personales, ni los derechos no renunciables del consumidor. Incluir esa frase **refuerza** la validez del resto (cláusula 6) — sin ella, un juez puede tumbar toda la limitación.
4. **El disclaimer "informational only" es tu escudo clave.** Tu riesgo real: alguien confía en un Health Score / validación y entrega un IFC malo. La cláusula 2 ("not professional certification… you remain responsible for verifying") es la que te protege de eso. **No la suavices.**
5. **Base legal correcta para cada dato** (tabla en Privacy). Es requisito GDPR Art. 13 explícito; sin ella la política está incompleta ([gdpr-info Art.13](https://gdpr-info.eu/art-13-gdpr/)).
6. **Lista de procesadores/sub-procesadores** (PostHog/Resend/Cloudflare/GitHub). Transparencia exigida y, además, da confianza al comprador B2B (justo lo que pedía el hilo de Reddit).
7. **Derecho a reclamar ante la autoridad de control** + cómo ejercer derechos: obligatorio nombrarlos (AEPD en España).
8. **Versionado + aviso de cambios materiales.** "Last updated" visible y resaltar cambios importantes — práctica de accountability.
9. **Hazlas fáciles de encontrar** (footer, §8) y en **lenguaje llano**. Un comprador no firma con quien esconde la política.
10. **"Not legal advice" para ti, no para el usuario.** El consejo de la comunidad indie: usa un generador reputado (TermsFeed, websitepolicies, iubenda) o una revisión legal barata como sanity check final — especialmente para la jurisdicción y los derechos del consumidor de tu país ([Heart of Dev — Indie Legal Survival Kit](https://heartof.dev/blog/indie-app-dev-legal-survival-kit)).
11. **Identidad del responsable = decisión real.** GDPR exige nombrar al *controller*. Si no quieres exponer tu nombre/dirección personal, valora una marca/seudónimo con un email de contacto operativo, o (a futuro) una entidad. **Pero un email real y atendido es obligatorio.**
12. **Coherencia código↔texto.** El mayor riesgo legal no es el wording, es **prometer algo que el código no hace** (§5). Si dices "cookieless", el código debe ser cookieless. Si dices "EU-hosted", el `VITE_POSTHOG_HOST` debe serlo. Verifica antes de publicar.

---

## 8. Enlazado (para que no queden huérfanas)

1. **Footer del Landing** ([`src/components/Landing.tsx`](../src/components/Landing.tsx) — buscar `<footer>`): "Privacy" + "Terms" junto a fix guides / blog. Pasar `onNavigateToPrivacy/Terms` como props desde `App.tsx` (igual que `onNavigateToBlog`).
2. **Pie de la zona de upload/drop:** línea sutil _"Files are processed in your browser and never uploaded. [Privacy](/privacy)"_ — refuerza el mensaje en el momento de ansiedad (subir el archivo). Alto valor de conversión.
3. **`SharedReportView`** ([`src/components/SharedReportView.tsx`](../src/components/SharedReportView.tsx)): enlazar Privacy en el pie — lo ven terceros que reciben un reporte.

---

## 9. Sitemap (estático, a mano)

El sitemap base es **estático**: [`public/sitemap.xml`](../public/sitemap.xml). El generador [`scripts/seo/generate-fix-pages.ts`](../scripts/seo/generate-fix-pages.ts) **solo añade las páginas `/fix/`** a `dist/sitemap.xml` en build (función `sitemapEntries`, ~línea 1297; inserta antes de `</urlset>`). **No toques el generador.**

Añadir a mano dos `<url>` en `public/sitemap.xml` (prioridad baja, p.ej. `0.3`):
```xml
  <url>
    <loc>https://www.ifcvieweronline.eu/privacy</loc>
    <lastmod>2026-06-XX</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://www.ifcvieweronline.eu/terms</loc>
    <lastmod>2026-06-XX</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
```

> **Crawlabilidad:** si añades el generador de shells estáticos (§A.6), el `<head>` de `/privacy` y `/terms` lo leen los bots sin JS — quedan crawlables y los `<url>` del sitemap son legítimos. Si NO lo añades (solo navegación in-app), el sitemap sigue siendo válido pero los bots no-JS verán el `<head>` genérico del SPA. Recomendado: añadir el generador (es barato y reusa el patrón del blog).

---

## 10. Checklist de aceptación

- [ ] `Route` += `'privacy' | 'terms'` (`src/types/index.ts`).
- [ ] Init de ruta + `popstate` en `App.tsx` (back/forward funciona).
- [ ] `PrivacyPolicy.tsx`, `TermsOfUse.tsx` (+ `LegalLayout`) renderizan.
- [ ] Handlers `pushState` (`handleNavigateToPrivacy/Terms`); volver reutiliza `handleNavigateToLanding`.
- [ ] `document.title` por página vía `useEffect` local (NO `useSeo`).
- [ ] **Decisión de cookies tomada (§7.1):** Opción A (cookieless → `analytics.ts:64` a `persistence: 'memory'`, sin banner — recomendado) o B (banner de consentimiento que bloquee `initAnalytics()`). La política debe coincidir con la opción elegida.
- [ ] Contenido verificado contra el código real (§5) — sin afirmaciones falsas (host PostHog real, región, sin "IP masked" salvo verificado).
- [ ] Placeholders rellenados (fecha, entidad, dominio, email, N días, región/retención, jurisdicción, autoridad de control).
- [ ] Enlaces: footer Landing + pie upload + `SharedReportView`.
- [ ] 2 `<url>` en `public/sitemap.xml`.
- [ ] Generador de shells estáticos para `dist/privacy/index.html` + `dist/terms/index.html` (patrón de `generate-blog-pages.ts`, enganchado en `vite.config.ts`), para que el deep link directo no dé 404 y sea crawlable (§A.6).
- [ ] `npm run build` pasa + navegación manual OK.

---

## 11. NO hacer (anti scope-creep)

- ❌ No introducir React Router ni cambiar el routing por-estado.
- ❌ No traducir a 10 idiomas en v1 (riesgo legal > beneficio — §4).
- ❌ No modificar `useSeo` ni el generador de sitemap.
- ❌ No prometer en la política nada que el producto no haga (honestidad > marketing).
- ❌ No montar SSR/prerender ni infra nueva de GH Pages.
- ❌ No tocar corpus de remediación, validador ni Worker salvo para *leer* y confirmar comportamiento.

---

### Memoria relevante
- `project_strategic_direction_2026.md` — persona, posicionamiento.
- `project_analytics_system.md` — qué captura PostHog.
- `project_crawlable_reports.md` — Worker de reportes, caducidad, rate limiting.
- `project_competitive_intelligence.md` — "privacy" como table stakes.
- `project_blog.md` — patrón de routing SPA por estado (el modelo a copiar).

---

## Apéndice A — Hallazgos de código verificados (2026-06-04)

Búsqueda hecha para ahorrar trabajo al próximo chat. **Todo confirmado en el repo.** Aun así, el dato que dependa del *deploy* (env vars, host PostHog) debe re-confirmarse contra el entorno de producción real.

### A.1 — Infra ya en producción (no es pendiente)
- **Cloudflare Worker:** `ifc-viewer-email-capture.<cuenta>.workers.dev`. Código: [`cf-worker/worker.js`](../cf-worker/worker.js). Guía de despliegue: [`cf-worker/DEPLOY-ES.md`](../cf-worker/DEPLOY-ES.md). **Dos endpoints:**
  - `POST /subscribe` → email capture vía **Resend Audiences API** (`worker.js:626` → `handleSubscribe`). Frontend lo llama con `VITE_SUBSCRIBE_URL`.
  - `GET /r` (alias `/report`) → render server-side del reporte crawlable (`worker.js:621` → `handleReport`). Frontend usa `VITE_REPORT_URL`.
- **Resend:** plan Free (3.000 emails/mes, 1 audiencia). Secretos del Worker: `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` (`DEPLOY-ES.md:161-180`). La API key vive solo como secret del Worker, nunca en el front.
- **Caducidad de reportes:** `DEFAULT_REPORT_MAX_AGE_DAYS = 90` (`worker.js:40`), override con env `REPORT_MAX_AGE_DAYS` (`worker.js:550-552`).
- **Rate limiting** por IP, fail-open (`worker.js:97-105`): `/subscribe` 5/min, `/r` 60/min (`DEPLOY-ES.md:311`).

### A.2 — Email capture en el frontend
- Form en el **footer del Landing**: [`Landing.tsx:980`](../src/components/Landing.tsx) (`<footer>`), submit en `Landing.tsx:215` → `subscribeEmail(email, 'landing_footer', i18n.language)`.
- Lógica: [`src/lib/subscribe.ts`](../src/lib/subscribe.ts) — requiere `VITE_SUBSCRIBE_URL`; si no está set, es no-op (solo log). Devuelve `{ already }`.
- Evento analytics: `trackEmailCaptured({ source, already_subscribed, locale })` ([`analytics.ts:104`](../src/lib/analytics.ts)).
- Copy ya presente: _"no spam, unsubscribe anytime"_ (`Landing.tsx:936,943`). **Coherente con la cláusula de email de la política.**

### A.3 — Share reports en el frontend
- Botón "Share": [`ValidationPanel.tsx:1982`](../src/components/ValidationPanel.tsx) → `handleShareReport` (`ValidationPanel.tsx:1686`).
- Construcción de URL: [`src/lib/share-report.ts`](../src/lib/share-report.ts) → `buildShareUrl(payload, VITE_REPORT_URL, appBase)`. Con `VITE_REPORT_URL` usa la ruta crawlable del Worker `?d=<base64url>`; sin él, cae al hash legacy. **Payload = solo issues, sin geometría** (mirror de tipos en `SharedReportView.tsx:24`).

### A.4 — PostHog (config exacta) — ver alertas en §5.2
- [`src/lib/analytics.ts:50-71`](../src/lib/analytics.ts). Default host **US** (`analytics.ts:57`), `persistence: 'localStorage+cookie'` (`:64`), `autocapture: false`, `person_profiles: 'identified_only'`, `capture_pageview: true`. **Sin** `session_recording` → replay off. Sin enmascarado de IP explícito. Env: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`.

### A.5 — Componentes que tocar
- **Footer Landing:** [`Landing.tsx:980`](../src/components/Landing.tsx) — añadir enlaces Privacy/Terms aquí.
- **Upload overlay:** [`src/components/UploadOverlay.tsx`](../src/components/UploadOverlay.tsx) — añadir la microcopy "processed in your browser… [Privacy]".
- **Shared report:** [`src/components/SharedReportView.tsx`](../src/components/SharedReportView.tsx) — enlazar Privacy en el pie.

### A.6 — Deep links / 404 — RESUELTO (mecanismo identificado)
No hay `public/404.html`, pero **no hace falta**: el patrón del proyecto es **generar shells HTML estáticos en build**. Ver [`scripts/seo/generate-blog-pages.ts`](../scripts/seo/generate-blog-pages.ts):
- Escribe `dist/blog/index.html` (y `dist/blog/<slug>/index.html`) como **copias de `dist/index.html`** con el `<head>` parcheado (title, description, canonical, OG, JSON-LD).
- GitHub Pages entonces sirve `dist/privacy/index.html` para una visita directa a `/privacy`, y el SPA lee `location.pathname` al montar y muestra la ruta correcta. **Sin SSR** (los assets de Vite son URLs absolutas `/assets/*` y funcionan desde cualquier profundidad).
- Se invoca desde `vite.config.ts` (`closeBundle`), después de `generateRuleFixPages()`.

**Acción para las legales:** añadir un generador análogo (o extender `generate-blog-pages.ts`) que emita `dist/privacy/index.html` y `dist/terms/index.html` parcheando el `<head>` (title/description/canonical/OG). Engancharlo en `vite.config.ts` junto a los otros. Con eso, los deep links directos a `/privacy` y `/terms` **no dan 404** y además quedan crawlables sin JS (el `<head>` lo leen los bots). `SITE = 'https://www.ifcvieweronline.eu'` (`generate-blog-pages.ts:29`).
