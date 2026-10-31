// ─── authAppearance ───────────────────────────────────────────────────────────
// Theme for Clerk's embedded components (SignIn / SignUp / UserProfile) so they
// sit on OUR vibrancy glass instead of Clerk's default card: the Clerk card is
// made transparent and shadowless, and the brand/text/input colours follow the
// app's dark / light tokens. Kept as a plain factory (no @clerk import) so it
// can live wherever it's needed inside the lazy vendor-auth chunk.

export function authAppearance(light: boolean) {
  return {
    variables: {
      colorPrimary: light ? '#00696A' : '#0A8481',
      colorPrimaryForeground: '#FFFFFF',
      colorBackground: 'transparent',
      colorForeground: light ? '#1C1B16' : '#ECEBE7',
      colorMutedForeground: light ? '#414560' : '#A09E98',
      colorInput: light ? 'rgba(15,17,35,0.03)' : 'rgba(255,255,255,0.04)',
      colorInputForeground: light ? '#1C1B16' : '#ECEBE7',
      colorBorder: light ? 'rgba(15,17,35,0.12)' : 'rgba(255,255,255,0.12)',
      colorRing: light ? '#00696A' : '#0A8481',
      borderRadius: '12px',
    },
    elements: {
      // Let our glass wrapper be the surface — strip Clerk's own card chrome.
      cardBox: { boxShadow: 'none', border: 'none' },
      card: { background: 'transparent', boxShadow: 'none', border: 'none' },
      // The Clerk footer ("Secured by") on a transparent card reads better dim.
      footer: { background: 'transparent' },
    },
  } as const
}
