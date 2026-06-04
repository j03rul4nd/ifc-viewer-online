# Handoff — Banner de consentimiento de cookies (analytics)

> **Estado:** NO construido. Recurso de contexto para cuando se aborde la tarea, para no quemar cómputo de IA re-investigando.
> **Relación:** Esto es la **Opción B** de `docs/HANDOFF_PRIVACY_TERMS.md` §7.1. Léelo primero.
> **Verificado contra el código el 2026-06-04.**

---

## 0. ⚠️ Antes de construir NADA: ¿de verdad necesitas este banner?

Hay dos formas de cumplir GDPR/ePrivacy con PostHog. **Decide esto primero — cambia si este doc aplica o no:**

| Opción | Banner | Esfuerzo | On-brand |
|---|---|---|---|
| **A — Cookieless total** (`persistence: 'memory'`) | ❌ No necesario | 1 línea | ✅✅ "privacy-first" |
| **B — Cookies + consentimiento** (este doc) | ✅ Obligatorio | Componente + estado + bloqueo de init | ⚠️ |

**Recomendación fuerte: Opción A.** Para tu escala y tu posicionamiento ("100% cliente, sin trucos"), el analytics cookieless es suficiente y te ahorra TODO este componente. Cambias `src/lib/analytics.ts:64` de `persistence: 'localStorage+cookie'` a `persistence: 'memory'` y la política puede decir honestamente "no usamos cookies de tracking". **Si eliges A, este documento es innecesario — bórralo o archívalo.**

Construye el banner (resto del doc) **solo si** decides conscientemente conservar cookies para atribución cross-session.

---

## 1. TL;DR de la implementación (Opción B)

1. **No instalar ninguna librería nueva.** Ver §2 — todo el material ya está en el stack.
2. PostHog soporta consentimiento **nativo**: inicializar con `cookieless_mode: 'on_reject'` (o no llamar a `initAnalytics()` hasta el opt-in) y usar `posthog.opt_in_capturing()` / `opt_out_capturing()`.
3. Construir un banner ligero con `framer-motion` + Tailwind (o `@radix-ui/react-dialog` para el panel de preferencias), persistiendo la decisión.
4. **Bloquear analytics hasta el consentimiento** (no setear cookies antes).
5. Dar forma de **retirar** el consentimiento (link en footer / página de privacidad).

---

## 2. Librerías — qué instalar (spoiler: nada nuevo)

Tu `package.json` ya tiene todo lo necesario:

| Necesidad | Ya disponible | Versión |
|---|---|---|
| API de consentimiento + cookieless | **`posthog-js`** (nativo) | `^1.376.0` |
| Animación entrada/salida del banner | **`framer-motion`** | `^11.15.0` |
| Panel modal de preferencias (opcional) | **`@radix-ui/react-dialog`** | `^1.1.4` |
| Estado/persistencia del consentimiento | **`zustand`** | `^5.0.12` |
| Estilos | **`tailwindcss`** | `^3.4.17` |
| i18n de los textos | **`react-i18next`** | `^17.0.8` |

> **Conclusión:** la "librería conveniente" para este proyecto es **ninguna nueva**. Un CMP de terceros sería una dependencia muerta hoy (el componente no se construye aún) y duplicaría capacidades que ya tienes. Esto también es lo que recomienda la comunidad para casos simples (ver §6).

### Si aun así se quiere una librería llave-en-mano (NO recomendado aquí)

Solo si el equipo prefiere no escribir UI. Comandos para cuando se aborde la tarea (no ejecutar ahora — generaría dependencia sin uso):

```bash
# Opción idiomática React (banner básico listo):
npm i react-cookie-consent
# Banner oficial de PostHog (mapea categorías GDPR ↔ servicios):
#   https://github.com/PostHog/cookie-banner
# CMP agnóstico con categorías granulares (más pesado, impedance mismatch en React):
#   npm i vanilla-cookieconsent
```
Verdicto: para un solo proveedor (PostHog), `react-cookie-consent` o un banner propio bastan; `vanilla-cookieconsent` es overkill y "se integra peor en React" (npm-compare, §7).

---

## 3. Cambios de código (boceto, para la tarea futura)

### 3.1 — `src/lib/analytics.ts` — init con gate de consentimiento

Hoy ([`analytics.ts:50-71`](../src/lib/analytics.ts)) se inicializa siempre. Cambiar a modo consentimiento. PostHog tiene `cookieless_mode: 'on_reject'`: arranca sin cookies y solo las setea al hacer `opt_in_capturing()`.

```ts
// init (boceto)
posthog.init(key, {
  api_host: host ?? 'https://us.i.posthog.com', // ⚠️ confirmar región real (privacy handoff §5.2)
  person_profiles: 'identified_only',
  autocapture: false,
  capture_pageview: true,
  persistence: 'localStorage+cookie',
  cookieless_mode: 'on_reject', // no setea cookies hasta opt-in explícito
})

// helpers que consumirá el banner
export function grantAnalyticsConsent(): void { posthog.opt_in_capturing() }
export function revokeAnalyticsConsent(): void { posthog.opt_out_capturing() }
export function hasAnalyticsConsent(): boolean { return posthog.has_opted_in_capturing() }
```
> Verifica la firma exacta de `cookieless_mode` / `opt_in_capturing` contra la versión `posthog-js` instalada y los docs (los nombres han variado entre versiones). Tutorial oficial: https://posthog.com/tutorials/react-cookie-banner

### 3.2 — `src/main.tsx` — no inicializar a ciegas

Hoy [`main.tsx:11`](../src/main.tsx) llama `initAnalytics()` incondicionalmente. Con consentimiento:
- O bien inicializas con `cookieless_mode: 'on_reject'` (init siempre, pero sin cookies hasta opt-in) — **camino simple, recomendado**.
- O bien difieres `initAnalytics()` hasta que el banner reporte opt-in — más estricto, más cableado.

### 3.3 — Nuevo store de consentimiento (zustand, persistido)

```ts
// src/stores/consentStore.ts (boceto)
type Consent = 'unknown' | 'granted' | 'denied'
// persistir en localStorage SOLO la decisión (es necesaria/legítima, no es tracking)
```
Al montar la app: si `consent === 'granted'` → `grantAnalyticsConsent()`. Si `'unknown'` → mostrar banner.

### 3.4 — Componente `CookieConsent.tsx` (no construir todavía)

- Banner fijo abajo, animado con `framer-motion`.
- Botones: **"Accept"** y **"Reject"** con el **mismo peso visual** (requisito GDPR — rechazar tan fácil como aceptar).
- (Opcional) **"Preferences"** → modal `@radix-ui/react-dialog` con toggle (`@radix-ui/react-switch`, ya instalado) para la categoría "Analytics".
- Textos vía `react-i18next` (namespace nuevo `consent` o dentro de `common`).
- Persistir decisión en `consentStore`; ocultar banner tras elegir.
- Link "Cookie settings" en el footer para reabrir y **retirar** consentimiento.

---

## 4. Requisitos GDPR/ePrivacy que el banner DEBE cumplir

De la investigación (fuentes §7). Un banner que no cumpla esto no protege:

1. **Consentimiento previo:** ninguna cookie de analytics antes del opt-in (`cookieless_mode: 'on_reject'` lo garantiza a nivel PostHog).
2. **Rechazar = tan fácil como aceptar:** botón "Reject" visible al mismo nivel, sin pasos extra. Nada de solo "Aceptar" + X.
3. **Sin casillas premarcadas:** el opt-in debe ser acción afirmativa.
4. **Granular** (si hay varias categorías): aquí solo hay "Analytics", así que un toggle basta.
5. **Retirable** en cualquier momento, tan fácil como darlo (link en footer/privacidad → `revokeAnalyticsConsent()`).
6. **Registrar el consentimiento** (accountability): guardar al menos timestamp + versión de la política. PostHog registra el opt-in; el store local puede guardar la fecha.
7. **Sin "consent walls":** el producto debe funcionar igual si el usuario rechaza (tu visor es 100% cliente → funciona perfecto sin analytics).
8. **Respetar señales** tipo Global Privacy Control si es viable (nice-to-have).

---

## 5. Puntos de integración en el repo

- [`src/lib/analytics.ts:50`](../src/lib/analytics.ts) — `initAnalytics()` (cambiar config + exportar helpers de consentimiento).
- [`src/main.tsx:11`](../src/main.tsx) — call-site de `initAnalytics()`.
- `src/App.tsx` — montar `<CookieConsent />` a nivel raíz (junto a toasts/overlays).
- [`src/components/Landing.tsx`](../src/components/Landing.tsx) `<footer>` (~línea 980) — link "Cookie settings".
- Página de privacidad (cuando exista, ver `HANDOFF_PRIVACY_TERMS.md`) — sección de cookies + link para retirar.
- `src/locales/*/common.json` (o nuevo `consent.json`) — textos i18n en los 10 idiomas.

---

## 6. Qué dicen foros/comunidades

- **PostHog (oficial):** no hace falta CMP de terceros para un solo proveedor; su SDK gestiona el consentimiento con `cookieless_mode` + `opt_in/opt_out_capturing`. Tienen tutorial React paso a paso y un repo `PostHog/cookie-banner`.
- **npm-compare:** en codebase React, evitar `vanilla-cookieconsent` ("impedance mismatch… código más difícil de mantener"); `react-cookie-consent` integra mejor si quieres lib. Para casos simples, banner propio.
- **Consenso indie/SaaS:** para 1 categoría de cookies, un CMP completo es overkill; añade peso y otra dependencia que mantener. Construir ligero con el stack existente o ir cookieless.
- **Tendencia 2026:** el tracking **cookieless** gana terreno precisamente para evitar todo el aparato de consentimiento — refuerza la recomendación de la Opción A.

---

## 7. Fuentes

- [PostHog — Building a React cookie banner](https://posthog.com/tutorials/react-cookie-banner)
- [PostHog — Cookieless tracking](https://posthog.com/tutorials/cookieless-tracking)
- [PostHog — GDPR compliance](https://posthog.com/docs/privacy/gdpr-compliance)
- [PostHog — Controlling data collection](https://posthog.com/docs/privacy/data-collection)
- [PostHog/cookie-banner (GitHub)](https://github.com/PostHog/cookie-banner)
- [Probo — PostHog cookie banner GDPR/CCPA (2026)](https://www.probo.com/blog/2026-05-27-posthog-cookie-banner-gdpr-ccpa-compliance)
- [GDPR Cookie Consent Requirements 2025 (Secure Privacy)](https://secureprivacy.ai/blog/gdpr-cookie-consent-requirements-2025)
- [npm-compare — cookieconsent vs react-cookie-consent](https://npm-compare.com/cookieconsent,react-cookie-consent)
- [npm-compare — cookieconsent vs vanilla-cookieconsent](https://npm-compare.com/cookieconsent,vanilla-cookieconsent)

---

## 8. Checklist (cuando se aborde la tarea)

- [ ] **Confirmada la Opción B** (si es A, este doc no aplica).
- [ ] `analytics.ts`: `cookieless_mode: 'on_reject'` + helpers `grant/revoke/hasAnalyticsConsent` (firmas verificadas contra `posthog-js` instalado).
- [ ] `consentStore` (zustand persistido) con `unknown | granted | denied`.
- [ ] `CookieConsent.tsx` con Accept/Reject del mismo peso + (opcional) preferencias.
- [ ] Montado en `App.tsx`; link "Cookie settings" en footer.
- [ ] Bloqueo real: sin cookies de analytics antes del opt-in (verificar en DevTools → Application → Cookies).
- [ ] Retirada de consentimiento funciona (`opt_out_capturing` + cookies borradas).
- [ ] i18n en los 10 idiomas.
- [ ] Política de privacidad actualizada: base legal de analytics = **Consent** (no legitimate interest) + sección de cookies.
- [ ] `npm run build` + `npm run lint` OK.

## 9. NO hacer

- ❌ No instalar un CMP pesado (vanilla-cookieconsent/iubenda/etc.) para una sola categoría.
- ❌ No mostrar solo "Aceptar" (rechazar debe ser igual de fácil) ni casillas premarcadas.
- ❌ No setear cookies de analytics antes del consentimiento.
- ❌ No bloquear el visor si el usuario rechaza (debe funcionar igual).
- ❌ Si finalmente se va por cookieless (Opción A), **no construyas este banner** — sería trabajo y UX para nada.
