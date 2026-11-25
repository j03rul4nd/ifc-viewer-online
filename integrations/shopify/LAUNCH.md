# Lanzamiento en la Shopify App Store — guion único (en orden)

Un solo recorrido para mañana. Junta `worker/DEPLOY.md` (Worker de cobro),
`listing/v3/SUBMIT.md` (ficha; está en la rama `origin/feat/shopify-listing-v3`, puede
no estar fusionada todavía: ábrelo con
`git show origin/feat/shopify-listing-v3:integrations/shopify/listing/v3/SUBMIT.md`)
y la configuración de **Shopify App Pricing**. Haz los pasos en este orden: el Worker
va antes que `shopify app deploy` porque la app apunta a él.

Comandos en PowerShell. Gasto: **19 USD una vez** (registro). Todo lo demás es gratis
y debe seguir así (Workers Free, sin tarjeta en Cloudflare para esto).

---

## Paso A — Pagar el registro de desarrollador (19 USD)

1. Entra en el **Dev Dashboard** (https://dev.shopify.com/dashboard) con la cuenta dueña
   de la app.
2. **App Store registration** (paso "App Store registration info") → **Pay now**. Si no
   hay tarjeta, añádela ahí. Si la cuenta es antigua y está exenta, el botón dice
   **Complete registration** y no cobra nada.

**Resultado esperado:** el paso aparece como completado.
**Si falla:** pago rechazado → otra tarjeta; el botón no aparece → comprueba que estás en
la organización que es dueña de "IFC Viewer Online" (selector de organización arriba).

---

## Paso B — Cloudflare: comprobar plan gratuito y desplegar el Worker

### B1. Comprobaciones (sin tarjeta, sin plan de pago)

- Panel de Cloudflare → **Workers & Pages → Plans**: debe decir **Workers Free**.
  **No** pulses "Upgrade to Paid".
- **Billing → Subscriptions**: sin Workers Paid (R2 Paid ya existe por `besco-*`; este
  Worker no usa R2).
- `integrations/shopify/worker/wrangler.jsonc` solo tiene `kv_namespaces`,
  `triggers.crons` (1 cron horario), `vars` y `workers_dev: true`.

### B2. KV y secretos

```powershell
cd C:\repo\ifc-cf-pages
git fetch
git checkout --detach origin/main
cd integrations\shopify\worker
npx wrangler login
npx wrangler kv namespace create SHOPS
```

**Resultado esperado:** imprime un `id = "…"`. Pégalo en `wrangler.jsonc` →
`kv_namespaces[0].id` (sustituye `REPLACE_WITH_KV_NAMESPACE_ID`). No lo commitees si no
quieres; solo hace falta en local para desplegar.
**Si falla:** "already exists" → `npx wrangler kv namespace list` y copia el id de
`ifcvo-billing-SHOPS` (o el que se llame SHOPS).

Secretos (los dos de la misma pantalla del **Dev Dashboard → Apps → IFC Viewer Online →
Settings → Credentials**: *Client ID* = `26585d50…` y *Client secret*, botón de copiar):

```powershell
npx wrangler secret put SHOPIFY_API_KEY
npx wrangler secret put SHOPIFY_API_SECRET
```

Cada uno pide el valor: pega y Enter. **Resultado esperado:** `Success! Uploaded secret`.
**Si falla:** "Worker not found" en el primer secreto → haz antes B3 (`wrangler deploy`)
y repite.

### B3. Desplegar

```powershell
npx wrangler deploy --dry-run --outdir $env:TEMP\ifcvo-dist
npx wrangler deploy
```

**Resultado esperado:** el dry-run lista solo `env.SHOPS (KV Namespace)` y 4 variables;
el deploy imprime `https://ifcvo-billing.joelbenitezdonari.workers.dev` y
`schedule: 17 * * * *`.
**Si falla:** subdominio distinto → cambia las tres URLs de
`integrations/shopify/app/shopify.app.toml` (application_url, redirect_urls, webhooks)
antes del paso D.

Comprobación:

```powershell
curl.exe -i https://ifcvo-billing.joelbenitezdonari.workers.dev/app
curl.exe -i -X POST https://ifcvo-billing.joelbenitezdonari.workers.dev/webhooks
```

**Esperado:** ambos `401` (el primero con "Open IFC Viewer Online from your Shopify admin").

### B4. (OPCIONAL) Partner API — no hace falta

Sin secretos de Partner API el cron horario ya revisa las tiendas de pago guardadas en KV
(ver "Cómo se detectan las cancelaciones" abajo). Solo si quieres detección por eventos:
Partner Dashboard → Settings → Partner API clients → crear con "Manage apps", y
`npx wrangler secret put PARTNER_API_TOKEN`, `PARTNER_ORG_ID`, `APP_GID`
(`gid://shopify/App/<id>`). **Sáltalo mañana.**

---

## Paso C — Planes en Shopify App Pricing

Partner Dashboard → **Apps → IFC Viewer Online → Distribution → Manage listing →
(English) Edit → Pricing content → Manage → Settings → Shopify App Pricing → Switch**.
Frecuencia por defecto: mensual. Crea planes públicos con **estos nombres exactos**
(el Worker decide el plan por el nombre):

| Nombre | Precio | Prueba | Welcome link |
|---|---|---|---|
| Free | 0 USD | — | `/app` |
| Starter | 9 USD / mes | 14 días | `/app` |
| Business | 29 USD / mes | — | `/app` |

Lista de funciones de cada plan: `listing/v3/SUBMIT.md` §3 (o `listing/LISTING.md`).
Marca los planes de pago como gratis para partners y tiendas de desarrollo, para que el
revisor pueda elegirlos.

**Resultado esperado:** los tres planes aparecen en la pestaña de precios de la ficha.
**Si falla:** no aparece "Shopify App Pricing" → la ficha aún no tiene la sección de
precios abierta; guarda primero la ficha (paso F1) y vuelve aquí.

---

## Paso C2 — Publicar el visor y el SDK 1.20

La extensión carga `https://www.ifcvieweronline.eu/sdk/1.20.0/ifc-viewer.es.js` y usa
`?grid=0&finish=daylight`; las dos cosas tienen que estar en producción **antes** de
`shopify app deploy`. Requisito: esta rama ya fusionada en `main`. **Nunca dos builds a
la vez** en `C:\repo\ifc-cf-pages` (vite vacía `dist/`): si otra sesión está
construyendo, espera.

```powershell
cd C:\repo\ifc-cf-pages
git fetch
git checkout -- public
git checkout --detach origin/main
npm ci
$env:NODE_OPTIONS="--max-old-space-size=8192"; npm run build; if ($LASTEXITCODE -eq 0 -and (Test-Path dist\de\preise\index.html)) { npm run deploy:pages }
```

(`deploy:pages` no construye: sube lo que haya en `dist/`, por eso va en la misma línea
que el build y solo si este acabó bien.)

**Comprobar:**

1. `curl.exe -sI https://www.ifcvieweronline.eu/sdk/1.20.0/ifc-viewer.es.js` →
   **`HTTP/1.1 200`** y `content-type: ...javascript`. Un 404 = el deploy no subió
   `public/sdk/1.20.0/`.
2. Abre `https://www.ifcvieweronline.eu/?ui=article&grid=0&finish=daylight&model=https://www.ifcvieweronline.eu/Ifc2x3_Duplex_Architecture.ifc`.
   **Esperado:** el modelo con luz de día y **sin
   rejilla** en el suelo. Con `grid=1` la rejilla vuelve.
3. `curl.exe -s https://www.ifcvieweronline.eu/sdk/versions.json` → `"latest": "1.20.0"`.

---

## Paso D — Desplegar la app (`shopify app deploy`)

```powershell
cd C:\repo\ifc-cf-pages
git fetch
git checkout --detach origin/main
cd integrations\shopify\app
npm ci
npm run deploy
```

(`npm run deploy` = `node ../build-extension.mjs` + `shopify app deploy`.) Si pregunta
qué app/configuración: **IFC Viewer Online** / `shopify.app.toml`. Confirma la versión
nueva con **Yes, release**.

**Resultado esperado:** "New version released" y suscripciones a `app/uninstalled` y los
tres temas GDPR (ya no `app_subscriptions/update`, ver abajo).
**Si falla:** pide login → `npx shopify auth logout` y repite; errores de Theme Check →
`npm run check` y mira el bloque que cita; URL del Worker inaccesible → vuelve a B3.

---

## Paso E — Probar en la tienda de desarrollo

1. Dev Dashboard → la app → **Test on development store** (o instálala desde el enlace
   de instalación) en tu tienda de desarrollo.
2. Abre la app en el admin. **Esperado:** "Current plan: **Free**".
   **Si dice "unavailable":** `npx wrangler tail` en `integrations\shopify\worker`,
   recarga la página y mira el error (lo típico: secreto mal copiado → repite B2).
3. **Change plan** → página de planes de Shopify → elige **Starter** (en tienda de
   desarrollo no cobra). Vuelves a `/app`. **Esperado:** "Current plan: Starter".
4. Comprueba el metacampo: admin de la tienda → abre
   `https://<tienda>.myshopify.com/admin/apps` → la app; o en el editor de temas: un bloque
   Starter (p. ej. *IFC element details*) se ve y un bloque Business muestra el aviso
   "needs the Business plan" solo en el editor. Eso confirma
   `app.metafields.ifcvo.plan = starter`.
5. Cambia a **Business** y repite → el bloque Business se ve. Cambia a **Free**
   (cancelar) y vuelve a abrir la app → "Free".
6. Cancelación sin abrir la app: cancela el plan de pago, **no** abras la app y espera a
   la siguiente hora y 17 minutos. `npx wrangler tail` muestra la ejecución del cron; el
   bloque Starter deja de verse en la tienda. (Opcional: si no quieres esperar, Cloudflare
   → Worker → Settings → Triggers → Cron → "Trigger" lanza el cron a mano.)
7. Desinstala la app → `npx wrangler kv key list --binding SHOPS --remote` ya no lista
   `shop:<tienda>` (una sola llamada; las listas son 1.000/día en Free).

8. Ajuste de la tienda para el revisor (las capturas de la ficha se hicieron así): admin →
   **Settings → Metafields and metaobjects (Custom data) → Shop** → *Add definition* →
   "Namespace and key" `ifcvo.config`,
   tipo **JSON** → guarda y pon el valor
   `{"grid": false, "finish": "daylight"}`. **Esperado:** el visor de la ficha de
   producto sale con luz de día y sin rejilla, igual que en las capturas. Si ya existe la
   definición, solo edita el valor (conserva las otras claves que tenga).

**Si el plan no cambia en el tema:** recarga la página de la app (sincroniza al abrir),
y comprueba que los nombres de los planes son exactamente Free / Starter / Business.

---

## Paso F — Ficha, imágenes, vídeo, contacto y envío

Todo el texto está en `listing/v3/SUBMIT.md` (rama `origin/feat/shopify-listing-v3`).

1. **Campos de la ficha** (inglés y español): §1 y §2 de SUBMIT.md, copiar y pegar.
2. **Imágenes**: §6 (icono 1200×1200, feature 1600×900, 6 capturas de escritorio, 3 de
   móvil opcionales) con su texto alternativo. Los PNG están en `listing/v3/`; si la rama
   no está fusionada:
   ```powershell
   cd C:\repo\ifc-cf-pages
   git checkout --detach origin/feat/shopify-listing-v3
   explorer integrations\shopify\listing\v3
   ```
   (vuelve después con `git checkout --detach origin/main`).
3. **URLs**: §4 (privacy, terms, soporte `hola@ifcvieweronline.eu`, ayuda).
4. **Screencast**: §5 de SUBMIT.md (grabar en la tienda de desarrollo: instalar, abrir
   la app, cambiar plan, ver los bloques en el producto). Súbelo como enlace (YouTube no
   listado o similar, gratis).
5. **Contacto de emergencia**: Dev Dashboard → ajustes de la cuenta → nombre, email,
   teléfono.
6. **Instrucciones para el revisor**: §5 de SUBMIT.md, con la contraseña de la tienda.
7. Repasa la checklist §7 de SUBMIT.md → **Submit for review**.

**Resultado esperado:** estado "Submitted / In review".
**Si falla:** el formulario indica el campo; los límites de caracteres ya están medidos
en SUBMIT.md.

---

## Cómo se detectan las cancelaciones (sin Partner API)

- Shopify App Pricing **no envía `app_subscriptions/update` desde el 28-04-2026**: "After
  April 28, 2026, Shopify App Pricing no longer sends webhooks for subscription changes"
  (https://shopify.dev/docs/apps/launch/billing/managed-pricing, "Webhook-based
  subscription notifications"). Por eso ya no se suscribe; `app/uninstalled` sigue.
- Altas y cambios de plan vuelven por el *welcome link* `/app`, que sincroniza al abrir.
- Cancelaciones/congelaciones: un **cron horario** recorre las tiendas guardadas en KV,
  7 por ejecución, con un cursor en KV. Las tiendas Free no gastan nada (las subidas de
  plan siempre vuelven por el welcome link `/app`). Por tienda de pago: refresco del
  token (1), guardar enseguida el refresh token rotado (1 escritura KV), consulta del
  plan (1) y, solo si cambió, `metafieldsSet` (1) + otra escritura (1). Máximo ≤ 45 subpeticiones por
  ejecución (límite Free: 50).
- Escrituras KV: ≤ 15 por hora → **≤ 360/día** en el peor caso (límite 1.000).
- Retraso máximo de una cancelación: `ceil(tiendas / 7)` horas, o sea tiendas/168 días
  (168 tiendas → 1 día; 1.680 → 10 días). Sin coste por más tiendas: solo más retraso.
- Tokens offline **no caducables** no son una opción: las apps públicas están obligadas a
  usar tokens caducables desde 2026-04-01 y las que no, se retiran el 2027-01-01
  (https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens).

## Marcha atrás

`shopify app deploy` de la versión anterior mantiene las tiendas funcionando (sin
metacampo todas son Free). `npx wrangler delete` en `integrations\shopify\worker` no cuesta
nada.
