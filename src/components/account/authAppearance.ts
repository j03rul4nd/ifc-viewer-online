// ─── authAppearance ───────────────────────────────────────────────────────────
// Theme for Clerk's embedded components (SignIn / SignUp / UserProfile) so they
// sit on OUR plain card instead of Clerk's default card: the Clerk card is
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
      colorMutedForeground: light ? '#4E4D48' : '#A09E98',
      colorInput: light ? '#FEFDFC' : '#21201D',
      colorInputForeground: light ? '#1C1B16' : '#ECEBE7',
      colorBorder: light ? '#D5D4D0' : '#3A3933',
      colorRing: light ? '#00696A' : '#0A8481',
      borderRadius: '8px',
    },
    elements: {
      // Our card is the surface — strip Clerk's own card chrome.
      cardBox: { boxShadow: 'none', border: 'none' },
      card: { background: 'transparent', boxShadow: 'none', border: 'none' },
      // The Clerk footer ("Secured by") on a transparent card reads better dim.
      footer: { background: 'transparent' },
      // Clerk's social button keeps a light-theme label otherwise: unreadable on dark.
      socialButtonsBlockButton: { background: light ? '#FEFDFC' : '#21201D', border: `1px solid ${light ? '#D5D4D0' : '#3A3933'}` },
      socialButtonsBlockButtonText: { color: light ? '#1C1B16' : '#ECEBE7' },
    },
  } as const
}
