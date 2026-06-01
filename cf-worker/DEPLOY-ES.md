# Guía COMPLETA de despliegue del Cloudflare Worker

> Guía pensada para entenderse sola, paso a paso, sin dar nada por supuesto.
> Si en algún punto tienes dudas, al final hay un **bloque de contexto para pegar
> en ChatGPT** que le explica exactamente qué estás haciendo.

---

## 0. ¿Qué es esto y por qué lo hago? (léelo, son 2 minutos)

Tu app (IFC Viewer Online) es una web **100% estática** alojada en GitHub Pages.
Una web estática no tiene "servidor": no puede ejecutar código propio, ni guardar
secretos, ni responder peticiones dinámicas. Pero necesitas dos cosas que **sí**
requieren un poquito de servidor:

1. **Capturar emails** (formulario de la landing). El email hay que mandarlo a
   Resend (el servicio de listas de correo). Para eso hace falta una *API key* de
   Resend, y esa key **no puede ir en el código de la web** (cualquiera la vería en
   el navegador y te la robaría). Solución: un intermediario que guarda la key en
   secreto y reenvía el email.

2. **Reportes compartibles "crawleables"**. Cuando alguien comparte un reporte de
   validación, queremos que ese enlace:
   - se vea bonito al pegarlo en WhatsApp/LinkedIn/Twitter (con título e imagen),
   - y que Google lo pueda indexar (= tráfico gratis = el "moat" más valioso).
   Una web estática no puede generar ese HTML al vuelo. El intermediario sí.

Ese "intermediario" es el **Cloudflare Worker**: un trocito de código que vive en
la red de Cloudflare, se ejecuta solo cuando alguien lo llama, y es **gratis** hasta
volúmenes que tú no vas a alcanzar en mucho tiempo.

**Concepto clave — privacidad intacta:** el Worker **nunca** ve tu modelo IFC. El
modelo se procesa entero en el navegador. Por el Worker solo pasa, y solo cuando tú
pulsas "Compartir", el resumen del reporte (la puntuación + lista de problemas) que
TÚ decidiste publicar. Nada se almacena: el Worker lee la petición, responde, y
olvida. No hay base de datos.

### Glosario rápido (para no perderte)

| Término | Qué es en cristiano |
|---|---|
| **Cloudflare** | Empresa de infraestructura web. Aquí vivirá tu Worker. Gratis. |
| **Worker** | El trocito de código intermediario. Ya está escrito (`cf-worker/worker.js`). |
| **Wrangler** | La herramienta de línea de comandos para subir/gestionar el Worker. |
| **Resend** | Servicio para guardar emails y enviar correos. Gratis hasta 3.000/mes. |
| **Audience (Resend)** | Una "lista de correo". Aquí caen los emails que captures. |
| **API key** | Una contraseña larga que da permiso a usar un servicio por código. |
| **Secret** | Una variable secreta guardada cifrada en Cloudflare (p.ej. la API key). |
| **Endpoint** | Una "puerta" del Worker. El tuyo tiene dos: `/subscribe` y `/r`. |
| **workers.dev** | El dominio gratis que Cloudflare te da (`tu-worker.tu-cuenta.workers.dev`). |
| **`.env.local`** | Archivo local (no se sube a git) con la config de tu copia del proyecto. |
| **GitHub Secret** | Como `.env.local` pero para los builds automáticos en GitHub. |

**Tiempo total:** ~15-20 minutos. **Coste:** 0 € (te enseño a poner límites para que
siga siendo 0 € pase lo que pase).

---

## 1. Crear las cuentas (si no las tienes)

### 1a) Cloudflare

1. Ve a https://dash.cloudflare.com/sign-up
2. Email + contraseña → verifica el email. Ya está, no hace falta tarjeta para Workers.
3. No necesitas añadir ningún dominio: usaremos el dominio gratis `workers.dev`.

### 1b) Resend

1. Ve a https://resend.com → **Sign Up** (puedes entrar con GitHub o Google).
2. El plan **Free** (3.000 emails/mes, 1 audiencia) es suficiente. No metas tarjeta.

> 💡 **Consejo:** usa el mismo gestor de contraseñas para guardar las dos cuentas.
> Vas a generar una API key que solo se muestra UNA vez — necesitarás guardarla bien.

---

## 2. Obtener los dos datos de Resend

El Worker necesita dos cosas de Resend: una **API key** y un **Audience ID**.

### 2a) Crear la Audience (la lista donde caen los emails)

1. Entra en https://resend.com y haz login.
2. Menú lateral izquierdo → **Audiences**.
3. Botón **Create Audience** (arriba a la derecha).
4. Nombre: `IFC Viewer` (o el que quieras). → **Create**.
5. Entra en la audiencia recién creada. En la URL o en la cabecera verás el
   **Audience ID**: una cadena tipo `e40fbb52-1a2b-3c4d-5e6f-7a8b9c0d1e2f`.
6. **Cópialo y guárdalo** (lo llamaremos `RESEND_AUDIENCE_ID`).

### 2b) Crear la API key

1. Menú lateral → **API Keys**.
2. Botón **Create API Key**.
3. **Name:** `ifc-worker`.
4. **Permission:** elige **Sending access** (es el permiso mínimo necesario).
   - ⚠️ Si tu plan no deja restringir y solo ofrece *Full access*, vale igual,
     pero entonces protege la key con más cuidado.
5. **Domain:** déjalo en "All domains" (no afecta a añadir contactos a audiencias).
6. **Add** → te mostrará la key **una sola vez**: empieza por `re_...`
7. **Cópiala YA y guárdala** (la llamaremos `RESEND_API_KEY`). Si la pierdes,
   no pasa nada: borras esta y creas otra.

> ⚠️ **Advertencia de seguridad:** la API key `re_...` es como la contraseña de tu
> Resend para enviar correos. **Nunca** la pegues en el código, ni en un commit, ni
> en un chat público, ni en el `.env.local` que se sube a git (el nuestro NO se sube,
> pero comprueba siempre). Si crees que se ha filtrado: Resend → API Keys → bórrala y
> crea otra. Tarda 5 segundos.

---

## 3. Instalar lo necesario en tu ordenador

Abre una terminal **en la carpeta del proyecto**: `C:\repo\ifc`.

> En Windows: abre la carpeta en el Explorador, escribe `cmd` en la barra de
> direcciones y pulsa Enter; o usa la terminal integrada de VS Code
> (`Ver → Terminal`). Asegúrate de que la ruta que muestra acaba en `...\repo\ifc`.

No hace falta instalar Wrangler aparte: el proyecto ya lo tiene (versión 4.95).
Lo invocaremos con `npx wrangler` (npx usa la copia local).

Comprueba que funciona:

```bash
npx wrangler --version
```

Debe imprimir algo como `4.95.0`. Si dice "command not found", primero corre
`npm install` en `C:\repo\ifc` y vuelve a intentarlo.

---

## 4. Iniciar sesión en Cloudflare desde la terminal

```bash
npx wrangler login
```

- Se abrirá el navegador pidiendo **autorizar Wrangler** en tu cuenta Cloudflare.
- Pulsa **Allow** / **Permitir**.
- Vuelve a la terminal: debe decir algo como *"Successfully logged in."*

> 🔧 **Si el navegador no se abre solo:** la terminal imprime una URL larga
> (`https://dash.cloudflare.com/oauth2/...`). Cópiala, pégala en el navegador a mano,
> autoriza, y vuelve a la terminal.

> 🔧 **Si tienes varias cuentas Cloudflare:** Wrangler te preguntará cuál usar, o
> puedes fijarla luego. Para este proyecto cualquiera de tus cuentas vale.

---

## 5. Configurar los secrets del Worker

Los secrets se guardan **cifrados en Cloudflare**, nunca en tu disco ni en git.
Entra en la carpeta del worker y mete los dos datos del Paso 2:

```bash
cd cf-worker

npx wrangler secret put RESEND_API_KEY
```

- Te pedirá el valor: **pega la API key `re_...`** y pulsa Enter. (No verás lo que
  pegas, es normal por seguridad.)
- Si te avisa de que el Worker aún no existe y pregunta si crearlo: responde **sí**.

```bash
npx wrangler secret put RESEND_AUDIENCE_ID
```

- Pega el **Audience ID** (`e40fbb52-...`) y pulsa Enter.

Para comprobar que ambos quedaron guardados (muestra los nombres, no los valores):

```bash
npx wrangler secret list
```

Debe listar `RESEND_API_KEY` y `RESEND_AUDIENCE_ID`.

---

## 6. Desplegar el Worker

Sigues dentro de `cf-worker/`:

```bash
npx wrangler deploy
```

Cuando termine, imprime la **URL del Worker**, algo como:

```
https://ifc-viewer-email-capture.TU-CUENTA.workers.dev
```

📋 **Copia esa URL completa.** `TU-CUENTA` es el subdominio de tu cuenta Cloudflare
(lo eliges la primera vez que entras a Workers; si no lo has elegido, Cloudflare te
lo pedirá ahora). La necesitarás en el Paso 7.

### Sobre un aviso que puede salir (rate-limiting)

El archivo `wrangler.toml` declara unos "límites de peticiones por IP"
(`[[unsafe.bindings]]` de tipo `ratelimit`). Sirven para frenar abusos.

- Si tu cuenta/versión los soporta: perfecto, se aplican.
- Si el deploy se queja de esos bindings: **no es bloqueante**. El Worker está
  diseñado para *fail-open* (si el límite no está disponible, simplemente no limita,
  y todo sigue funcionando). Puedes desplegar igual e ignorar el aviso.

---

## 7. Conectar la app con la URL del Worker

La URL del Worker tiene que estar en **dos sitios**: tu copia local y los builds
automáticos de GitHub.

El Worker tiene dos "puertas":
- `…/subscribe` → para los emails.
- `…/r` → para los reportes crawleables.

### 7a) En local — archivo `.env.local`

1. Abre (o crea si no existe) el archivo `C:\repo\ifc\.env.local`.
2. Añade estas dos líneas, **cambiando `TU-CUENTA`** por lo que salió en el Paso 6:

```
VITE_SUBSCRIBE_URL=https://ifc-viewer-email-capture.TU-CUENTA.workers.dev/subscribe
VITE_REPORT_URL=https://ifc-viewer-email-capture.TU-CUENTA.workers.dev/r
```

> ✅ `.env.local` está en `.gitignore` → no se sube a git. Correcto y seguro.
> 💡 Hay un `.env.example` en la raíz con estas mismas variables de referencia.

### 7b) En GitHub — Secrets de Actions (para producción)

Para que la web publicada (GitHub Pages) también use el Worker:

1. En GitHub, abre tu repo → pestaña **Settings**.
2. Menú lateral → **Secrets and variables** → **Actions**.
3. Botón **New repository secret**. Crea **dos** (mismo valor que en local):
   - **Name:** `VITE_SUBSCRIBE_URL` → **Secret:** `https://…workers.dev/subscribe`
   - **Name:** `VITE_REPORT_URL` → **Secret:** `https://…workers.dev/r`

> ✅ El workflow de build (`.github/workflows/deploy.yml`) **ya está preparado** para
> pasar ambas variables al build. No tienes que tocar nada de YAML. El próximo push a
> `main` (o un *Actions → Deploy → Run workflow* manual) recogerá los valores y
> publicará la versión con reportes crawleables.

---

## 8. Probar que todo funciona

### 8a) Probar la captura de email

En cualquier terminal (cambia `TU-CUENTA`):

```bash
curl -X POST https://ifc-viewer-email-capture.TU-CUENTA.workers.dev/subscribe -H "Content-Type: application/json" -H "Origin: https://j03rul4nd.github.io" -d "{\"email\":\"test@example.com\",\"source\":\"landing\"}"
```

- **Respuesta esperada:** `{"ok":true}`
- Luego entra en Resend → **Audiences** → tu audiencia: debería aparecer
  `test@example.com`. (Bórralo después si quieres.)

> 🔧 **Si responde `403`:** el "Origin" no está permitido. El Worker solo acepta
> `j03rul4nd.github.io` y `localhost`. Asegúrate de copiar el `-H "Origin: ..."` tal cual.
> 🔧 **Si responde `{"ok":false,...}`:** revisa los secrets (`npx wrangler secret list`)
> y que la API key de Resend sea válida.

### 8b) Probar el reporte crawleable

La forma fácil:

1. Arranca la app en local: en `C:\repo\ifc`, ejecuta `npm run dev`.
2. Abre la app, carga un IFC (o el modelo demo), pulsa **Validar**.
3. Pulsa **Compartir** (Share) → copia el enlace.
4. Pega ese enlace en el navegador. Debe salir una **página HTML** con la puntuación
   de salud, la lista de problemas y la sección "cómo arreglar" — **no** un texto JSON
   en crudo.

Para ver cómo queda al compartir en redes (la "tarjeta" con título e imagen):

- Pega el enlace en https://www.opengraph.xyz/ y comprueba que muestra título +
  imagen + descripción.

> 🔧 **Si el botón Compartir sigue dando un enlace con `#report=`** (con almohadilla),
> es que falta `VITE_REPORT_URL` o no reiniciaste `npm run dev` tras editar `.env.local`.
> Para los cambios de `.env.local` hay que **parar y volver a arrancar** el dev server.

---

## 9. ⭐ Poner LÍMITES DE CONSUMO (para no llevarte sustos)

Aunque todo es gratis en condiciones normales, conviene blindarse. Esto es lo
importante de verdad para dormir tranquilo:

### 9a) Cloudflare Workers — el plan Free ya es tu límite

- El plan **Free** de Workers da **100.000 peticiones/día**. Si lo superas, las
  peticiones extra simplemente se **rechazan** hasta el día siguiente: **NO te cobran
  de más** (no es como AWS). Es un límite duro, no una factura sorpresa.
- **Acción recomendada:** quédate en el plan Free y **no añadas tarjeta** a
  Cloudflare. Sin tarjeta, es imposible que te cobren nada.
- **Activa alertas de uso** (opcional pero recomendable):
  - Cloudflare dashboard → tu cuenta → **Notifications** → **Add** →
    busca notificaciones de **Workers** (uso/errores) → configura que te avise por
    email si el uso sube. Así te enteras si algo se dispara (p.ej. un bot abusando).
- El **rate-limiting** del Worker (Paso 6) ya frena a un mismo visitante: 5
  peticiones/min en `/subscribe` y 60/min en `/r`. Es tu primera línea de defensa.

### 9b) Resend — protege la cuota de 3.000 emails/mes

- El plan **Free** son **3.000 emails/mes** y **100/día**. Superado el límite,
  Resend **deja de enviar** hasta el siguiente ciclo: tampoco hay cargo sorpresa.
- ⚠️ **Importante:** "añadir contacto a una audiencia" (lo que hace tu formulario)
  **no consume** la cuota de envío de emails. La cuota se gasta solo si **envías**
  correos (newsletters, etc.), cosa que de momento no haces. O sea: la captura de
  emails es esencialmente ilimitada para tu escala.
- **Acción recomendada:** no metas tarjeta en Resend. Quédate en Free.
- Resend → **Settings** → revisa si hay alertas de uso disponibles y actívalas.

### 9c) Regla de oro

> **No añadas ningún método de pago en Cloudflare ni en Resend.** Sin tarjeta, el
> peor caso posible es que un servicio deje de funcionar temporalmente al tocar el
> tope gratuito — nunca una factura. Para el tráfico que tendrás al principio, ni te
> acercarás a los límites.

---

## 10. ✅ Checklist final

- [ ] Cuenta Cloudflare creada (sin tarjeta).
- [ ] Cuenta Resend creada (sin tarjeta).
- [ ] Audience creada en Resend → tengo el `RESEND_AUDIENCE_ID`.
- [ ] API key creada en Resend → tengo la `re_...` guardada.
- [ ] `npx wrangler login` hecho.
- [ ] Los 2 secrets puestos (`npx wrangler secret list` los muestra).
- [ ] `npx wrangler deploy` hecho → tengo la URL `…workers.dev`.
- [ ] `.env.local` con `VITE_SUBSCRIBE_URL` y `VITE_REPORT_URL`.
- [ ] 2 GitHub Secrets creados con los mismos valores.
- [ ] `curl` de `/subscribe` devuelve `{"ok":true}` y veo el email en Resend.
- [ ] El botón Compartir genera un enlace `…/r?d=…` que abre una página HTML.
- [ ] Sin tarjeta en ninguno de los dos servicios (límites de consumo blindados).

Cuando todo esté marcado: **moat #3 cerrado** (reportes crawleables en producción) y
captura de emails operativa.

---

## 11. Mantenimiento y notas útiles

- **Re-desplegar tras cambios en el Worker:** repite solo `npx wrangler deploy` desde
  `cf-worker/`. Los secrets se conservan entre despliegues.
- **Sincronización de contenido:** el archivo `worker.js` tiene un mapa `RULE_FIX`
  con los 38 textos "cómo arreglar" en inglés, copiados de
  `src/i18n/rule-remediation.ts`. Si algún día cambias esos textos en el corpus,
  acuérdate de actualizar también `RULE_FIX` en `worker.js` (es una copia manual
  deliberada, porque el Worker no puede importar TypeScript).
- **Caducidad de enlaces:** los reportes compartidos caducan a los 90 días (devuelven
  "expirado" y dejan de indexarse). Configurable con `REPORT_MAX_AGE_DAYS` en
  `wrangler.toml`. No hay datos sensibles, así que es solo higiene de SEO.
- **Dominio propio (futuro, opcional):** mientras uses `workers.dev` no hay que hacer
  nada. Si algún día pones dominio propio, hay que (1) descomentar el bloque
  `[[routes]]` de `wrangler.toml` y (2) añadir ese origen a la lista
  `ALLOWED_ORIGINS` (arriba en `worker.js`, ~línea 27) para que la captura de emails
  acepte peticiones desde ahí.
- **Ver logs en vivo (para depurar):** `npx wrangler tail` desde `cf-worker/` te
  muestra en tiempo real las peticiones que llegan al Worker. Útil si algo no va.

---

## 12. 📋 Bloque de contexto para pegar en ChatGPT (si te atascas)

> Copia todo lo que hay entre las líneas y pégalo en ChatGPT junto con tu duda o el
> mensaje de error que te salga. Le da el contexto exacto para ayudarte bien.

```
Estoy desplegando un Cloudflare Worker para mi web estática (IFC Viewer Online,
alojada en GitHub Pages). El Worker es stateless y tiene dos endpoints:
- POST /subscribe : reenvía un email a la API de Resend (Audiences) para capturar
  suscriptores. Usa dos secrets de Worker: RESEND_API_KEY y RESEND_AUDIENCE_ID.
  Solo acepta peticiones con Origin = https://j03rul4nd.github.io o localhost (CORS).
- GET /r?d=<base64url> : renderiza en el servidor un reporte de validación como HTML
  crawleable (title + Open Graph + JSON-LD). El payload va codificado en la URL; el
  Worker no guarda nada (no hay base de datos).

Lo despliego con Wrangler (npx wrangler, v4.95) usando estos comandos:
  npx wrangler login
  cd cf-worker
  npx wrangler secret put RESEND_API_KEY
  npx wrangler secret put RESEND_AUDIENCE_ID
  npx wrangler deploy
La URL resultante es del tipo https://ifc-viewer-email-capture.<cuenta>.workers.dev

Luego conecto la web poniendo estas variables en .env.local (local) y en GitHub
Actions Secrets (producción):
  VITE_SUBSCRIBE_URL=https://<worker-url>/subscribe
  VITE_REPORT_URL=https://<worker-url>/r

Estoy en Windows, terminal en C:\repo\ifc. Quiero quedarme en los planes gratuitos
de Cloudflare (100k req/día) y Resend (3.000 emails/mes) sin añadir tarjeta.

Mi duda / el error que me sale es el siguiente:
[ESCRIBE AQUÍ TU DUDA O PEGA EL MENSAJE DE ERROR]
```

---

## 13. Tabla rápida de problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `npx wrangler` → "command not found" | Falta instalar deps | `npm install` en `C:\repo\ifc` |
| `wrangler login` no abre el navegador | Terminal sin entorno gráfico | Copia la URL impresa y ábrela a mano |
| Deploy se queja de `unsafe.bindings` | Rate-limit no disponible en tu cuenta | No bloquea: el Worker hace fail-open. Despliega igual |
| `/subscribe` devuelve `403` | El `Origin` no está permitido | Usa el `-H "Origin: https://j03rul4nd.github.io"` exacto |
| `/subscribe` devuelve `{"ok":false}` | Secret mal o key Resend inválida | `npx wrangler secret list` y revisa la API key |
| El email no aparece en Resend | Audience ID incorrecto | Revisa el `RESEND_AUDIENCE_ID` (Resend → Audiences) |
| Botón Compartir da enlace con `#report=` | Falta `VITE_REPORT_URL` o no reiniciaste dev | Revisa `.env.local` y reinicia `npm run dev` |
| Quiero ver qué pasa en el Worker | Necesitas logs | `npx wrangler tail` desde `cf-worker/` |
