# Plan: resolver "SPA sin SSR" (prerender SEO del landing)

> Documento de arquitectura/planificación. **No es una tarea en curso** — es el
> pensamiento previo para cuando se decida abordarla, de modo que el ticket, la
> arquitectura, las dependencias y el paso a paso ya estén claros.
>
> Estado: **propuesta**. Última revisión: 2026-06-01.

---

## 1. El problema, con precisión

El proyecto es una **SPA Vite + React 18 servida estáticamente en GitHub Pages**
(`base: '/ifc-viewer-online/'`, deploy vía `.github/workflows/deploy.yml`). Hoy:

- El **routing es por estado, no por URL**. En [`src/App.tsx`](../src/App.tsx) hay un
  `route: 'landing' | 'viewer' | 'report'` en `useState`. No hay react-router. El
  landing, el visor y el reporte compartido viven **todos en la misma URL** (`/`),
  y el reporte usa un *hash* (`#report=…`).
- El **landing se renderiza en cliente** ([`src/components/Landing.tsx`](../src/components/Landing.tsx)),
  con todo el copy vía i18n (react-i18next, EN pre-bundle + resto lazy).
- Un crawler que **no ejecuta JS** ve únicamente:
  1. El `<noscript>` que inyecta [`vite.config.ts`](../vite.config.ts) (`injectLandingContent`)
     con FAQ + features + steps **solo en EN**.
  2. El JSON-LD estático del `<head>` de [`index.html`](../index.html).
  - **No ve** el H1 real, ni el copy del hero traducido, ni la nueva sección de
    guías, ni nada en los otros 9 idiomas.

Consecuencia: el contenido del landing (y su versión multi-idioma) depende de que
el bot renderice JS. Googlebot lo hace, pero con presupuesto de render limitado y
diferido; Bing, redes sociales (OG scraping a veces sí), y la mayoría de bots GEO/LLM
**no**. Las páginas `/fix/` ya son HTML plano (bien), pero el **landing — la página
de mayor autoridad — no lo es**.

### Lo que NO es el problema
- No es que falten enlaces internos (eso se resolvió: ver la sección "Fix guides"
  y el nav en `Landing.tsx`).
- No es performance del visor (otro tema).

---

## 2. Decisión central: **SSG/prerender en build, NO SSR en runtime**

"SSR" en sentido clásico = un servidor Node que renderiza HTML por cada request.
**Eso es la herramienta equivocada aquí**, por tres razones que son casi axiomas
del proyecto:

1. **No hay servidor.** GitHub Pages es hosting estático. Adoptar SSR implicaría
   mover el hosting a un runtime (Vercel/CF Pages Functions/Node) — un cambio de
   infraestructura grande y un coste recurrente.
2. **El posicionamiento es "0 servidor, 0 subida, 100% cliente"** (privacy = parte
   del producto, ver memoria de estrategia). Introducir un servidor de render
   contradice el mensaje, aunque el render no toque el IFC.
3. **No se gana nada con SSR vs SSG aquí.** El landing es contenido estático de
   marketing; no hay datos por-usuario ni por-request que justifiquen render
   dinámico. El HTML es idéntico para todos.

➡️ **La solución correcta es prerender en tiempo de build (SSG):** generar HTML
estático del landing — uno por idioma — en `dist/`, que el bot lee sin JS y que el
usuario **hidrata** al cargar. Esto encaja exactamente con el patrón que el repo
**ya usa** para `/fix/` ([`scripts/seo/generate-fix-pages.ts`](../scripts/seo/generate-fix-pages.ts),
invocado desde `closeBundle` en `vite.config.ts`).

---

## 3. Qué prerenderizar y qué dejar client-only

| Superficie | ¿Prerender? | Por qué |
|---|---|---|
| Landing EN (`/`) | **Sí** | Página de mayor autoridad, target SEO principal. |
| Landing por idioma (`/es/`, `/de/`, … x10) | **Sí** | El moat i18n; hoy invisible sin JS. |
| Páginas `/fix/**` | Ya hecho | HTML estático generado desde el corpus. |
| Shells estáticos en `public/` (`ifc-validator/`, `solibri-alternative/`, `es/`, `tools/…`) | Consolidar | Hoy son HTML a mano; ver §5. |
| **Visor** (`route === 'viewer'`) | **No** | Interactivo, ~4 MB three.js + web-ifc WASM, WebGL, OPFS. No tiene valor SEO y rompería en SSR. |
| Reporte compartido (`#report=…`) | **No** (o ruta server aparte) | Datos en el hash (cliente). Ya existe la ruta crawleable del Worker (`/r?d=…`) para la versión indexable. |

**Regla de oro:** se prerenderiza la *cáscara de marketing*, no la *app*. La app
pesada debe quedar **lazy-loaded** detrás de la navegación al visor, para que el
HTML prerenderizado del landing no arrastre el bundle de three/web-ifc.

---

## 4. Opciones de implementación (evaluadas)

### Opción A — Crawl post-build con headless Chrome (react-snap / puppeteer)
Renderiza la SPA ya construida con Chrome y guarda el HTML resultante.
- ✅ Cero cambios en el código de la app.
- ❌ **Choca con el routing por estado**: crawleando `/` solo se obtiene el landing
  EN; no hay URL para `/es/` landing, así que no se pueden capturar los idiomas.
- ❌ **framer-motion** arranca con `opacity:0` / `y:16` → el snapshot puede congelar
  el contenido invisible o a medio animar.
- ❌ WebGL en headless es frágil; CI necesita Chrome.
- **Veredicto: descartada** salvo que antes se migre a routing por URL.

### Opción B — Framework SSG (Vike / vite-react-ssg / Astro islands)
Adoptar un framework que haga SSG con routing basado en archivos.
- ✅ Solución "de verdad", escalable.
- ❌ Refactor grande: routing, estructura de entrada, hacer SSR-safe todo el árbol.
- ❌ Sobredimensionado para *una* página de marketing + 10 idiomas.
- **Veredicto: solo si el producto crece a muchas rutas de contenido.**

### Opción C — Prerender propio con `ReactDOMServer.renderToString` ⭐ (recomendada)
Un script Node en `closeBundle` (mismo patrón que `generateFixPages`) que importa
`<Landing>`, lo renderiza a HTML estático **por locale** con i18n precargado, y
escribe `dist/index.html` + `dist/<lang>/index.html`. El cliente **hidrata**.
- ✅ Coherente con la arquitectura existente (ya generamos HTML en build).
- ✅ Sin framework nuevo, sin servidor, sin cambiar hosting.
- ✅ Reutiliza el componente real → el HTML del bot y el de la app no divergen.
- ⚠️ Exige hacer `<Landing>` **SSR-safe** (ver §6) y migrar a `hydrateRoot`.
- ⚠️ Los componentes WebGL del hero (LineWaves, ShapeGrid, BorderGlow…) deben
  renderizar placeholder en servidor y activarse solo en cliente.

### Opción D — Separar "marketing shell" de "app" (complementa C)
Hacer que `<Landing>` sea un módulo ligero independiente y que **todo el visor**
(`route === 'viewer'`) se cargue con `React.lazy` / import dinámico.
- ✅ El HTML prerenderizado del landing no incluye three/web-ifc.
- ✅ Mejora también el LCP/TTI del primer render real.
- ✅ Es la pieza que hace que la Opción C valga la pena.

➡️ **Recomendación: C + D.** Prerender propio del landing por idioma + lazy-load
del visor. SSR runtime explícitamente rechazado.

---

## 5. Arquitectura objetivo (cómo encaja con lo que ya hay)

```
build (vite)
 ├─ bundle SPA normal (main.tsx → hydrateRoot)
 └─ closeBundle:
      ├─ injectLandingContent()      (existente — se puede retirar tras prerender)
      ├─ generateFixPages()          (existente — /fix/**)
      └─ prerenderLanding()  ← NUEVO
           para cada lang en [en, es, de, fr, pt, it, ca, zh, ja, th]:
             1. i18n.changeLanguage(lang) con recursos cargados desde src/locales/<lang>
             2. html = renderToString(<I18nProvider lang><Landing ssr/></I18nProvider>)
             3. plantilla = dist/index.html (head con meta/OG/JSON-LD por idioma)
             4. inyectar html en <div id="root">…</div>
             5. escribir dist/index.html (en) | dist/<lang>/index.html (resto)
             6. añadir <link hreflang> + canonical + og:locale por idioma
```

Puntos de integración concretos:
- **Entrada cliente:** `src/main.tsx` pasa de `createRoot().render()` a
  `hydrateRoot()` cuando `#root` ya tiene HTML (detectar con `firstElementChild`).
- **Plantilla `<head>`:** hoy `index.html` tiene meta/OG/JSON-LD EN hardcodeados.
  El prerender debe **parametrizar por idioma** (title, description, canonical,
  `og:locale`, hreflang). Las `/fix/` ya hacen esto vía helpers (`pageHead`,
  `langSwitcher`) — reutilizar la misma estética.
- **`<noscript>` actual:** una vez el `<div id="root">` lleva HTML real, el bloque
  `injectLandingContent` se vuelve redundante y puede retirarse (o quedar como
  defensa). No mantener dos fuentes de verdad del copy.
- **Shells a mano en `public/`** (`es/index.html`, `ifc-validator/`,
  `solibri-alternative/`, `ifc-viewer-mac/`): evaluar si el prerender por idioma
  los hace innecesarios o si siguen siendo landings de keyword distintas. Evitar
  contenido duplicado / canibalización (canonical correcto).
- **GitHub Pages SPA fallback:** las rutas nuevas (`/es/`, …) son carpetas con su
  propio `index.html`, así que cargan directo (no necesitan el truco de
  `404.html`). El reporte por hash sigue funcionando porque el hash no cambia el
  path. Verificar que el `404.html` (si existe) no rompa estas rutas.

---

## 6. Dependencias, riesgos y cosas a tener en cuenta

Ordenado por probabilidad de morder:

1. **Componentes WebGL/canvas en el hero** — `LineWaves`, `ShapeGrid`, `BorderGlow`,
   `GradientText`, `GradualBlur`, `TextType` (gsap), `CountUp`/`DecryptedText`
   (framer-motion). En servidor **no hay `window`/`canvas`/WebGL**.
   - Patrón: cada uno debe renderizar un **placeholder estático SSR-safe** y montar
     el efecto en `useEffect` (que no corre en servidor). O envolver en un
     `<ClientOnly>` (render condicionado a un flag `mounted` que solo pasa a `true`
     tras hidratar).
   - Riesgo de **hydration mismatch** si el primer render cliente difiere del HTML
     servidor. Mantener el markup idéntico; diferir solo el efecto, no la estructura.
2. **framer-motion `initial`** — `initial={{opacity:0}}` produce HTML con opacidad 0.
   Un bot que lee el DOM lo ve igual (el texto está en el HTML), pero conviene que
   el contenido textual no dependa de animación. Considerar `initial={false}` en
   SSR o asegurarse de que el texto esté siempre presente en el árbol.
3. **i18n en build** — react-i18next debe inicializarse **síncrono** con el idioma
   correcto antes de `renderToString`. Hoy EN es pre-bundle y el resto lazy (async).
   Para el prerender hay que **cargar el JSON del locale desde disco** (como hace
   `generate-fix-pages.ts` con `readFileSync`) y montar los recursos antes de render.
   El `Suspense`/`useSuspense:false` ya está desactivado — bien.
4. **`import.meta.env.BASE_URL`** — en build vale `/ifc-viewer-online/`. Las URLs
   absolutas en meta/OG/canonical deben usar el dominio completo
   (`https://j03rul4nd.github.io/ifc-viewer-online`), igual que `SITE` en el generador.
5. **COOP/COEP / `coi-serviceworker.js`** — el `<head>` registra el SW para
   SharedArrayBuffer. El prerender **no debe** romper ese `<script>` ni el orden de
   carga. El SW solo afecta al visor; el landing no lo necesita, pero la plantilla
   debe conservarlo intacto.
6. **Tamaño del bundle / lazy-load del visor (Opción D)** — al separar el visor con
   `React.lazy`, cuidar que el `manualChunks` de `vite.config.ts`
   (`vendor-three`, `vendor-ifc`, `vendor-ui`) siga agrupando bien y que el chunk del
   landing **no** importe transitividamente three/web-ifc.
7. **Estado `route` inicial** — App arranca en `'landing'` salvo hash de reporte. El
   HTML prerenderizado es el del landing → coherente. Verificar que al hidratar no
   haya parpadeo (el visor no debe montarse en el primer render).
8. **Mantener una sola fuente de copy** — el copy vive en `src/locales/*/landing.json`.
   El prerender debe leer de ahí (no duplicar en la plantilla), igual que el resto.
9. **CI / build determinista** — `renderToString` en Node necesita que el código del
   componente sea importable fuera del navegador (sin top-level `document`). Auditar
   imports de `Landing.tsx` y sus hijos (algunos `reactbits/*` tocan `window` en
   módulo, no en efecto → habrá que moverlos a `useEffect`).
10. **Pruebas de no-regresión** — el generador `/fix/` tiene 13 tests. Añadir tests
    equivalentes para el prerender (que cada `dist/<lang>/index.html` contenga el H1,
    el canonical y el hreflang correctos).

---

## 7. Plan paso a paso (fases)

### Fase 0 — Stopgap barato (horas, opcional, sin refactor)
Mientras no se haga el prerender real: ampliar `injectLandingContent` en
`vite.config.ts` para incluir **la sección de guías + enlaces** y, si se quiere,
emitir el `<noscript>` **por idioma** leyendo cada `landing.json`. No es hidratación
real, pero da contenido textual a bots no-JS sin tocar la app.
> Aceptación: `curl` del HTML muestra H1 + copy + enlaces a `/fix/`.

### Fase 1 — Hacer `<Landing>` SSR-safe
- Auditar `Landing.tsx` + `components/reactbits/*` por accesos a `window`/`document`/
  WebGL en tiempo de módulo o render.
- Introducir `<ClientOnly>` (o flag `mounted`) para los efectos WebGL/gsap.
- Asegurar que el **texto** está siempre en el árbol (independiente de animación).
> Aceptación: `renderToString(<Landing/>)` en un test Node no lanza ni accede a `window`.

### Fase 2 — i18n para build
- Helper que cargue `src/locales/<lang>/{landing,validation,common}.json` desde disco
  y construya una instancia i18n síncrona por idioma (reutilizar la idea de
  `loadLocaleData` del generador `/fix/`).
> Aceptación: render de `<Landing>` en `de` produce copy alemán en el HTML.

### Fase 3 — Script `prerenderLanding()` + plantilla `<head>` por idioma
- Nuevo `scripts/seo/prerender-landing.ts` invocado desde `closeBundle`.
- Parametrizar title/description/canonical/OG/hreflang por idioma.
- Escribir `dist/index.html` (en) y `dist/<lang>/index.html` (resto).
- Inyectar el HTML renderizado dentro de `<div id="root">`.
> Aceptación: existen `dist/index.html` + `dist/{es,de,…}/index.html` con contenido
> y `<head>` localizado.

### Fase 4 — Hidratación en cliente
- `src/main.tsx`: `hydrateRoot` si `#root` tiene hijos; `createRoot` si no (dev).
- Verificar **cero** warnings de hydration mismatch en consola.
> Aceptación: navegar a `/es/` carga sin parpadeo ni warnings; interacción OK.

### Fase 5 — Lazy-load del visor (Opción D)
- `const Viewer = React.lazy(…)` / dividir `route === 'viewer'` en un chunk aparte.
- Confirmar con `rollup` que el chunk del landing no arrastra `vendor-three`/`vendor-ifc`.
> Aceptación: el HTML inicial + JS de hidratación del landing no descarga three/web-ifc.

### Fase 6 — Limpieza y consolidación
- Retirar (o degradar a defensa) `injectLandingContent`.
- Revisar shells a mano en `public/` para evitar duplicados / fijar canonical.
- Actualizar `sitemap.xml` para incluir los landings por idioma con hreflang
  (el generador ya escribe sitemap; centralizar).
> Aceptación: una sola fuente de copy; sitemap + hreflang coherentes; sin contenido duplicado.

---

## 8. Cómo verificar

- **No-JS real:** `curl -s https://…/es/ | grep -i "<h1"` y revisar que el copy y los
  enlaces a `/fix/` estén en el HTML (no en `<noscript>`).
- **Hydration:** abrir con devtools; **cero** warnings `Hydration failed` / `mismatch`.
- **Build assertions:** test que parsea cada `dist/<lang>/index.html` y comprueba H1,
  `<link rel=canonical>`, `<link hreflang>`, `og:locale`.
- **Lighthouse SEO** en `/` y `/es/` (debe ver título/meta/contenido sin JS).
- **Rich Results / Search Console:** "Probar URL en vivo" → "HTML renderizado" debe
  coincidir con "HTML de origen" en el copy clave.
- **Social scrapers:** validador de OG de LinkedIn/Twitter sobre `/de/`, `/ja/`.
- **Regresión visor:** cargar un IFC y validar — confirmar que el lazy-load del visor
  no rompió el pipeline (ver `docs/DEPLOYMENT.md`, el bug de `external: ['three']`).

---

## 9. Cómo plantear el ticket

**Título:** Prerender (SSG) del landing por idioma + lazy-load del visor.

**Objetivo / valor:** que el contenido del landing (10 idiomas) sea HTML indexable
sin ejecutar JS, sin introducir servidor, manteñendo el posicionamiento "100%
cliente". Mejora SEO/GEO y LCP del primer render.

**Alcance (in):** Fases 1–6. **No-goals (out):** SSR runtime, cambio de hosting,
prerender del visor o del reporte por hash, framework SSG completo (Vike/Astro).

**Criterios de aceptación (resumen):**
- `dist/index.html` y `dist/<lang>/index.html` para los 10 idiomas, con H1 + copy +
  enlaces + `<head>` localizado (canonical/OG/hreflang).
- App hidrata sin warnings; interacción y cambio de idioma intactos.
- El chunk del landing no incluye three/web-ifc.
- Tests de build que validan estructura por idioma.
- Sin contenido duplicado vs shells de `public/`.

**Riesgo principal:** hydration mismatch por los componentes WebGL/animados del hero
(Fase 1 es la que más esfuerzo lleva). **Estimación grosso modo:** Fase 1 es la
mayoría del trabajo; el resto es plomería conocida (ya existe el patrón en `/fix/`).

**Dependencias:** ninguna externa nueva (no se añade framework). Solo
`react-dom/server` (ya viene con React).

---

## 10. TL;DR

- No queremos **SSR** (no hay servidor, contradice el producto, no aporta nada aquí).
- Queremos **SSG/prerender en build**, exactamente como ya hacemos con `/fix/`,
  extendido al **landing por idioma**, con **hidratación** en cliente.
- La parte difícil no es el render: es hacer el **hero SSR-safe** (WebGL/animaciones)
  sin hydration mismatch.
- Complementar con **lazy-load del visor** para que el HTML del landing sea ligero.
- Patrón a copiar: [`scripts/seo/generate-fix-pages.ts`](../scripts/seo/generate-fix-pages.ts)
  + el `closeBundle` de [`vite.config.ts`](../vite.config.ts).
