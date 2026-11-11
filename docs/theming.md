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
| `--border-strong` | input borders, controls that must be seen (3:1 in light) |
| `--text-primary` | body text, headings |
| `--text-secondary` | labels, secondary copy |
| `--text-tertiary` | captions, hints (smallest readable) |
| `--text-muted` | legacy only: undefined in dark (see quirk below); = text-secondary in light |
| `--accent` / `--accent-strong` | brand actions, links, selected state |
| `--accent-contrast` | text/icons on an `--accent` fill |
| `--success` / `--warning` / `--danger` | status |
| `--focus-ring` | `:focus-visible` outlines |
| `--shadow`, `--overlay` | elevation and modal scrims (light prefers borders over shadows) |

Legacy names (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-dim`, `--text-faint`, `--accent-2`, `--warn`, `--ok`) are aliases of the above and keep working. New code uses the semantic names. Tailwind exposes both (`bg-bg-surface`, `text-text-secondary`…).

## Rules for migrations

1. Never hardcode a UI colour (`#fff`, `rgba(255,255,255,.1)`, `white`). Use a token; for translucency use `color-mix(in srgb, var(--text-primary) 10%, transparent)`.
2. Colours with business meaning stay as they are: IFC class colours, Health Score bands, discipline colours, map/data ramps, brand logos. Only check they stay readable on a light surface.
3. Text on an accent/status fill uses `--accent-contrast`, not `#fff`.
4. Do not touch the dark values: dark must stay pixel-identical.
5. Test both modes: in DevTools run `document.documentElement.dataset.theme = 'light'` (or `'dark'`), or open the page with `?theme=light`. Check text, borders, focus rings and hover states.

## Known quirk (clean up in phase 4)

`--text-muted` is **undefined in dark** on purpose: 162 uses without a fallback inherit the normal text colour and 21 uses with `var(--text-muted, #a09e98)` show that grey; defining it would change dark. In light it equals `--text-secondary` (#4E4D48), so no-fallback uses render slightly dimmer than in dark. Phase 4: replace every use with `--text-primary` or `--text-secondary` explicitly and drop the token.

## Contrast (WCAG 2.x, script in PR description)

Light — against app bg / surface / raised:

| Token | Value | bg | surface | raised |
|---|---|---|---|---|
| text-primary | #1C1B16 | 15.94 | 17.25 | 15.00 |
| text-secondary / muted | #4E4D48 | 7.83 | 8.47 | 7.37 |
| text-tertiary | #65635E | 5.55 | 6.00 | 5.22 |
| accent | #00696A | 6.01 | 6.50 | 5.66 |
| success | #206B38 | 6.02 | 6.52 | 5.67 |
| warning | #915C08 | 5.19 | 5.62 | 4.89 |
| danger | #AF2B25 | 6.07 | 6.57 | 5.72 |
| border-strong (UI, 3:1) | #8A8984 | 3.24 | 3.50 | 3.05 |
| white on accent | | 6.50 | | |

All light pairs pass AA (4.5:1 text, 3:1 UI). Dark is today's palette, unchanged; known pre-existing gaps there: `--accent` as text 3.95:1 on surface, `--text-faint` 4.30:1 on raised, `--danger` 4.23:1 on raised, `--border-strong` 1.55:1 (decorative).
