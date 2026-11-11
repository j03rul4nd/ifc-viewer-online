# Theming (light / dark)

Plan and progress: `docs/theme-migration.md`.

## How it works

- `data-theme="light" | "dark"` on `<html>` selects the palette in `src/index.css`.
- An inline script in `index.html` sets it before first paint (no flash). `src/theme/ThemeProvider.tsx` keeps it in sync; `useTheme()` returns `{ mode, resolvedTheme, setMode }` with `mode` = `light | dark | system`.
- Stored in `localStorage['ifc-theme']`. **Default is `dark`**, so nobody sees a change until they opt in. `system` follows `prefers-color-scheme` live.
- `?theme=light|dark` in the URL wins for that page view and is not stored (useful for embeds/SDK; without it embeds stay dark).
- 3D scene colours live in `src/theme/sceneTheme.ts` (`getSceneTheme()`, `subscribeSceneTheme(cb)` → unsubscribe). Update colours in place; never rebuild the scene. Not wired into `viewer.ts` yet (phase 3).

## Tokens

| Token | Use for |
|---|---|
| `--bg-app` | page / app background |
| `--bg-surface` | panels, cards, modals |
| `--bg-surface-raised` | inputs, nested cards, chips on a surface |
| `--bg-hover` | hover / pressed rows and buttons |
| `--border-subtle` | dividers, card outlines |
| `--border-strong` | emphasis dividers, selected-card outlines (decorative, not 3:1) |
| `--border-control` | **for inputs/form controls only** (text fields, selects, checkboxes): 3:1 on surface in light |
| `--text-primary` | body text, headings |
| `--text-secondary` | labels, secondary copy |
| `--text-tertiary` | captions, hints (smallest readable) |
| `--text-muted` | legacy only: undefined in dark (see quirk below); own step between secondary and tertiary in light (#5A5853) |
| `--accent` / `--accent-strong` | brand actions, links, selected state |
| `--accent-contrast` | text/icons on an `--accent` fill |
| `--success` / `--warning` / `--danger` | status |
| `--focus-ring` | `:focus-visible` outlines |
| `--shadow`, `--overlay` | `--shadow` only for popovers/menus; `--overlay` is the modal scrim (flat, no blur in light) |

Legacy names (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-dim`, `--text-faint`, `--accent-2`, `--warn`, `--ok`) are aliases of the above and keep working. New code uses the semantic names. Tailwind exposes both (`bg-bg-surface`, `text-text-secondary`…).

## Rules for migrations

1. Never hardcode a UI colour (`#fff`, `rgba(255,255,255,.1)`, `white`). Use a token; for translucency use `color-mix(in srgb, var(--text-primary) 10%, transparent)`.
2. Colours with business meaning stay as they are: IFC class colours, Health Score bands, discipline colours, map/data ramps, brand logos. Only check they stay readable on a light surface.
3. Text on an accent/status fill uses `--accent-contrast`, not `#fff`.
4. Do not touch the dark values: dark must stay pixel-identical.
5. Borders: dividers and card outlines use `--border-subtle`; only inputs/form controls use `--border-control`; `--border-strong` is for the rare emphasised divider.
6. Shadows (light): floating panels (`.glass`, `.glass-md`, mobile pill/sheet) are solid `--bg-surface` + 1px `--border-subtle`, no shadow. `--shadow` is reserved for popovers and menus.
7. Overlay (light): modals use `--overlay` (rgba(28,27,22,.20)) with no backdrop blur. Hover (`--bg-hover`) is a neutral step, never accent-tinted, so it never reads as selected.
8. Test both modes: in DevTools run `document.documentElement.dataset.theme = 'light'` (or `'dark'`), or open the page with `?theme=light`. Check text, borders, focus rings and hover states.

## Known quirk (clean up in phase 4)

`--text-muted` is **undefined in dark** on purpose: 162 uses without a fallback inherit the normal text colour and 21 uses with `var(--text-muted, #a09e98)` show that grey; defining it would change dark. In light it is its own step (#5A5853, between secondary and tertiary, AA on every surface). Phase 4: replace every use with `--text-primary` or `--text-secondary` explicitly and drop the token.

## Contrast (WCAG 2.x, script in PR description)

Light (app #F1F0ED, surface #FFFFFF, raised #F7F6F3) — against app bg / surface / raised:

| Token | Value | bg | surface | raised |
|---|---|---|---|---|
| text-primary | #1C1B16 | 15.13 | 17.25 | 15.96 |
| text-secondary | #4E4D48 | 7.43 | 8.47 | 7.84 |
| text-muted | #5A5853 | 6.23 | 7.11 | 6.57 |
| text-tertiary | #65635E | 5.27 | 6.00 | 5.55 |
| accent | #00696A | 5.71 | 6.50 | 6.02 |
| success | #206B38 | 5.72 | 6.52 | 6.03 |
| warning | #915C08 | 4.93 | 5.62 | 5.20 |
| danger | #AF2B25 | 5.77 | 6.57 | 6.08 |
| border-control (UI, 3:1) | #8A8984 | 3.08 | 3.50 | 3.24 |
| border-strong (decorative) | #C9C8C2 | 1.47 | 1.68 | 1.55 |
| white on accent | | 6.50 | | |

All light pairs pass AA (4.5:1 text, 3:1 UI). Dark is today's palette, unchanged; known pre-existing gaps there: `--accent` as text 3.95:1 on surface, `--text-faint` 4.30:1 on raised, `--danger` 4.23:1 on raised, `--border-strong` 1.55:1 (decorative).

## Colour guard

`scripts/colour-guard.test.ts` (runs with `npm test`) stops new hardcoded colours in `src/**/*.{ts,tsx,css}`: hex, `rgb()/rgba()/hsl()/hsla()`, Tailwind palette classes (`bg-gray-900`, `text-white`, `bg-white/10`) and arbitrary values (`bg-[#…]`, `bg-[rgba(…)]`).

- **Ratchet.** `scripts/colour-guard.baseline.json` holds today's count per file. The test fails if a file goes above its count or a new file has any, and prints every match as `file:line`. If a count goes down the test still passes and prints a hint to lower the baseline.
- **Allowed paths** (colours are content or tokens) are listed in `ALLOW` in `scripts/colour-guard.mjs`: token blocks (`:root`, `[data-theme…]`) in CSS, `src/theme/`, map/cover/layer/point-cloud/solar libs, reports, director looks, twin device-sim rules, sketch showcase, blog, reactbits, landing/marketing views, demo categories, tests.
- **Intentional colour** (business meaning: IFC classes, Health Score bands, brand logos): add `// theme-allow-color: <reason>` (or `/* … */` in CSS) on the same line or the line above.
- **Update the baseline** after removing colours: `npm run theme:colour-baseline`, commit the JSON. Never regenerate it to hide new colours.
