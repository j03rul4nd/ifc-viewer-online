# Estrategia B (contingencia) — Consentimiento opt-in para la analítica

> **Estado:** NO activa. Plan de contingencia. La estrategia vigente es **A** (cookieless + interés legítimo + oposición fácil), ver [`LIA_ANALYTICS.md`](LIA_ANALYTICS.md).
> **Cuándo activarla:** solo si una autoridad de control exige consentimiento previo para la analítica, o si se decide deliberadamente un posicionamiento de "consent-first".

## Por qué esto ya es barato de activar

La decisión de diseño de la Estrategia A dejó **los hooks técnicos del consentimiento ya construidos**, así que pasar a opt-in es un delta pequeño de UI, no una refactorización:

- `src/stores/consentStore.ts` — ya persiste la decisión y respeta GPC/DNT. Hoy el **default** es "permitido salvo objeción". Para opt-in, cambiar el default a "no permitido hasta consentimiento explícito".
- `src/lib/analytics.ts` — ya expone `initAnalytics()` (con gate `_optedOut`), `enableAnalytics()`, `disableAnalytics()`, `isAnalyticsOptedOut()`.
- `src/main.tsx` — ya inicializa solo si `analyticsAllowed()`.

## Pasos para activar la Estrategia B

1. **Default a denegado:** en `consentStore`, tratar "sin elección" como *no consentido* (no inicializar analítica hasta opt-in). Mantener GPC/DNT como denegación.
2. **Banner de consentimiento:** construir `CookieConsent.tsx` con **Aceptar / Rechazar del mismo peso visual** (requisito GDPR), sin casillas premarcadas, montado en `App.tsx`. Al aceptar → `useConsentStore.getState().setAnalyticsOptOut(false)`; al rechazar → `setAnalyticsOptOut(true)`.
3. **Registro del consentimiento:** guardar timestamp + versión de la política junto al flag (accountability).
4. **Reabrir preferencias:** enlace "Cookie settings" en el footer (reutiliza el toggle ya existente en la Política de Privacidad).
5. **Política:** cambiar la base legal de la analítica de *Interés legítimo* a *Consentimiento (Art. 6(1)(a))* en `PrivacyPolicy.tsx` y añadir mención al banner.
6. **i18n:** textos del banner en los 10 idiomas.

## Material de referencia ya investigado

La especificación detallada (librerías, requisitos ePrivacy del banner, integración PostHog `opt_in/opt_out_capturing`, fuentes) está en [`../HANDOFF_COOKIE_CONSENT.md`](../HANDOFF_COOKIE_CONSENT.md). No re-investigar: leer ese handoff y aplicar los 6 pasos de arriba sobre los hooks ya existentes.

## NO hacer

- ❌ No instalar un CMP pesado para una sola categoría (PostHog) — basta un banner propio con el stack actual.
- ❌ No mostrar solo "Aceptar" ni casillas premarcadas.
- ❌ No bloquear el visor si el usuario rechaza (es 100% cliente: funciona igual sin analítica).
