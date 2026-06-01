# Guía de despliegue del Cloudflare Worker (paso a paso)

Esta guía te lleva de cero a tener el Worker **desplegado y cableado** con la app.
El Worker hace dos cosas en un solo endpoint stateless:

1. `POST /subscribe` → captura de emails (proxy a Resend, oculta la API key).
2. `GET /r?d=…` → **reporte compartido crawleable** (HTML con title + OG + JSON-LD).
   Esto es lo que cierra el **moat #3** (cada reporte compartido = backlink + invitación viral).

**Tiempo estimado:** ~15 minutos. Todo es gratis (CF Workers 100k req/día, Resend 3k emails/mes).

> ⚠️ Importante: el código del Worker **ya está construido, verificado y commiteado**.
> No hay que tocar código. Esta guía es solo *deploy + configuración*.

---

## Requisitos previos (ten esto a mano antes de empezar)

- [ ] Una cuenta de **Cloudflare** (gratis): https://dash.cloudflare.com/sign-up
- [ ] Una cuenta de **Resend** (gratis): https://resend.com
- [ ] Node.js instalado (ya lo tienes, el proyecto corre con él).
- [ ] Una terminal abierta en `C:\repo\ifc`.

No necesitas instalar Wrangler globalmente: usaremos `npx wrangler` (ya tienes la 4.95.0).

---

## Paso 1 — Crear la audiencia en Resend (2 min)

1. Entra en https://resend.com e inicia sesión.
2. Menú lateral → **Audiences** → botón **Create Audience**.
3. Ponle un nombre, por ejemplo `IFC Viewer`.
4. Copia el **Audience ID** (tiene forma `e40fbb52-xxxx-xxxx-...`). Lo necesitarás en el Paso 3.

### Crear la API key de Resend

5. Menú lateral → **API Keys** → **Create API Key**.
6. Nombre: `ifc-worker`. Permiso: **Sending access** (o Full access, da igual para esto).
7. Copia la key (empieza por `re_...`). **Solo se muestra una vez** — guárdala. La usarás en el Paso 3.

---

## Paso 2 — Iniciar sesión en Cloudflare (1 min)

Desde `C:\repo\ifc`, en la terminal:

```bash
npx wrangler login
```

Se abrirá el navegador pidiendo autorizar Wrangler en tu cuenta de Cloudflare.
Acepta. Cuando la terminal diga *"Successfully logged in"*, sigue.

> Si el navegador no abre solo, copia la URL que imprime la terminal y pégala a mano.

---

## Paso 3 — Configurar los secrets del Worker (2 min)

Los secrets **nunca** se commitean: viven cifrados en Cloudflare. Desde `C:\repo\ifc`:

```bash
cd cf-worker

npx wrangler secret put RESEND_API_KEY
# Cuando te lo pida, pega la API key de Resend (re_...) y pulsa Enter

npx wrangler secret put RESEND_AUDIENCE_ID
# Cuando te lo pida, pega el Audience ID del Paso 1 y pulsa Enter
```

> Si te pregunta si quieres crear el Worker porque aún no existe, responde que sí.

---

## Paso 4 — Desplegar el Worker (1 min)

Sigues dentro de `cf-worker/`:

```bash
npx wrangler deploy
```

Cuando termine, **imprime la URL del Worker**. Será algo como:

```
https://ifc-viewer-email-capture.TU-CUENTA.workers.dev
```

📋 **Copia esa URL completa** — la necesitas en el Paso 5. (`TU-CUENTA` es el
subdominio de tu cuenta Cloudflare.)

### Sobre el rate-limiting

El `wrangler.toml` ya declara los bindings de rate-limit (`[[unsafe.bindings]]`).
Si el deploy se queja de esos bindings con tu versión de Wrangler, el Worker
**funciona igualmente** — está diseñado para *fail-open* (sin los bindings,
simplemente no aplica límite). No es bloqueante; puedes desplegar igual.

---

## Paso 5 — Cablear la app con la URL del Worker (3 min)

Hay que poner la URL en **dos sitios**: en local y en CI (GitHub Actions).

### 5a) En local — `.env.local`

Abre (o crea) `C:\repo\ifc\.env.local` y añade estas dos líneas,
**sustituyendo `TU-CUENTA`** por lo que imprimió el Paso 4:

```
VITE_SUBSCRIBE_URL=https://ifc-viewer-email-capture.TU-CUENTA.workers.dev/subscribe
VITE_REPORT_URL=https://ifc-viewer-email-capture.TU-CUENTA.workers.dev/r
```

> Fíjate en los paths: `/subscribe` para emails, `/r` para reportes crawleables.
> `.env.local` está en `.gitignore` — no se commitea, es correcto.

### 5b) En CI — GitHub Actions Secrets

Para que los builds de producción (GitHub Pages) también usen el Worker:

1. Ve a tu repo en GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Botón **New repository secret**. Crea estos dos (mismo valor que en local):
   - Nombre: `VITE_SUBSCRIBE_URL` → valor: `https://...workers.dev/subscribe`
   - Nombre: `VITE_REPORT_URL` → valor: `https://...workers.dev/r`
3. El workflow de build (`.github/workflows/deploy.yml`) **ya pasa ambas
   variables** al step de `npm run build` (`VITE_SUBSCRIBE_URL` + `VITE_REPORT_URL`).
   No tienes que tocar el YAML — solo crear los dos secrets de arriba. El próximo
   push a `main` (o un *Run workflow* manual) recogerá los valores y publicará la
   versión con reportes crawleables.

---

## Paso 6 — Probar que funciona (2 min)

### Probar la captura de email

```bash
curl -X POST https://ifc-viewer-email-capture.TU-CUENTA.workers.dev/subscribe ^
  -H "Content-Type: application/json" ^
  -H "Origin: https://j03rul4nd.github.io" ^
  -d "{\"email\":\"test@example.com\",\"source\":\"landing\"}"
```

Respuesta esperada: `{"ok":true}`. Luego verás el contacto en Resend → Audiences.

> En PowerShell el `^` de continuación de línea no funciona igual; si falla,
> pon todo el comando en una sola línea.

### Probar el reporte crawleable

La forma fácil: abre la app en local (`npm run dev`), carga un IFC, valida,
pulsa **Share** y copia el link. Ese link ahora apunta al Worker (`?d=…`).
Pégalo en el navegador: debe salir una página HTML con el Health Score, los
issues y la prosa "how to fix" — no el JSON crudo.

Para comprobar el unfurl social, pega el link en:
https://www.opengraph.xyz/ (debe mostrar el preview con title + imagen).

---

## ✅ Hecho

Cuando los dos curls/links respondan bien:

- La captura de emails funciona (alimenta el indicador líder "email list > 200").
- Los reportes compartidos son crawleables → **moat #3 cerrado**.

---

## Notas de mantenimiento

- **Dominio propio:** mientras uses `workers.dev` no hay que hacer nada. Si más
  adelante pones dominio propio, descomenta el bloque `[[routes]]` de
  `wrangler.toml` y añade ese origen a `ALLOWED_ORIGINS` en `worker.js`
  (línea ~27) para que el CORS de `/subscribe` lo acepte.
- **Orígenes CORS permitidos hoy** (en `worker.js`): `j03rul4nd.github.io`,
  `localhost:5173`, `localhost:4173`. El endpoint `/r` no necesita CORS (es
  navegación top-level), así que funciona desde cualquier sitio.
- **Sync de contenido:** el mapa `RULE_FIX` en `worker.js` es un *mirror* de los
  38 summaries EN de `src/i18n/rule-remediation.ts`. Si cambias esos summaries,
  actualiza también `RULE_FIX`. (Está documentado en el README del worker.)
- **Caducidad de links:** los reportes caducan a los `REPORT_MAX_AGE_DAYS` días
  (90 por defecto, configurable en `wrangler.toml`). Pasado ese plazo devuelven
  410 Gone + noindex. Es advisory (stateless), no hay datos sensibles.
- **Coste:** gratis hasta varios miles de suscriptores. No hay servidor que
  parchear ni contenedores que mantener.

---

## Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| `wrangler login` no abre navegador | Terminal sin GUI | Copia la URL impresa y ábrela a mano |
| Deploy se queja de `unsafe.bindings` | Wrangler/cuenta sin rate-limit API | No bloquea: el Worker hace fail-open. Despliega igual |
| `/subscribe` devuelve 403 | Origen no permitido | Revisa `ALLOWED_ORIGINS` en `worker.js` |
| El botón Share sigue dando link con `#report=` | Falta `VITE_REPORT_URL` o no se rebuildeó | Revisa `.env.local` y reinicia `npm run dev` |
| Email no aparece en Resend | API key o Audience ID mal | Revisa los secrets: `npx wrangler secret list` |
