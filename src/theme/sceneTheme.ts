/**
 * Colours and light levels for the Three.js scene, per UI theme. Dark is the
 * current look (src/lib/viewer.ts, src/lib/scene/background.ts). Consumers
 * subscribe and update materials/colours in place; never rebuild the scene.
 */
import type { ResolvedTheme } from './themeCore'

export interface SceneTheme {
  backgroundTop: string
  backgroundBottom: string
  fog: string
  grid: string
  axes: { x: string; y: string; z: string }
  selection: string
  hover: string
  outline: string
  edges: string
  gizmo: string
  /** Rubber-band line while measuring (neutral, max contrast on the background). */
  measurePreview: string
  /** Snapped edge/face highlight and section plane/box gizmos. */
  measureHighlight: string
  hemiSky: string
  hemiGround: string
  ambientIntensity: number
  directional: string
  directionalIntensity: number
  /** Element overlay colours in the 3D viewer (src/lib/viewer.ts), updated in place. */
  highlight: HighlightPalette
}

export interface HighlightPalette {
  hover: string
  select: string
  /** Opacity of the selection tint over the element. */
  selectOpacity: number
  /**
   * Paint hover/selection colour over the element. Fragments ignores the colour of a
   * preserveOriginalMaterial highlight unless it is listed as explicit; both themes
   * list it so the brand teal reads on grey walls and on the dark scene.
   */
  tint: boolean
  /** Selection bounding box. */
  selectBox: string
  error: string
  warn: string
  info: string
  /** Faint neutral for unflagged elements while issues are isolated. */
  ghost: string
}

export const SCENE_THEMES: Readonly<Record<ResolvedTheme, SceneTheme>> = {
  dark: {
    backgroundTop: '#100f0c',
    backgroundBottom: '#100f0c',
    fog: '#100f0c',
    grid: '#2a2d36',
    axes: { x: '#e0523f', y: '#3fa866', z: '#4c7dd9' },
    selection: '#55cac3',
    hover: '#6ce0ff',
    outline: '#55cac3',
    edges: '#1c1b16',
    gizmo: '#ecebe7',
    measurePreview: '#ffffff',
    measureHighlight: '#6ce0ff',
    hemiSky: '#b8c4e0',
    hemiGround: '#1a1a22',
    ambientIntensity: 0.6,
    directional: '#fff5e8',
    directionalIntensity: 1.1,
    // Dark keeps the viewer's historic colours exactly (selection is still the old indigo).
    highlight: { hover: '#3cc4bf', select: '#14a39f', selectOpacity: 0.88, tint: true, selectBox: '#3cc4bf', error: '#e5484d', warn: '#f5a623', info: '#5e9ed6', ghost: '#9aa0ae' },
  },
  light: {
    backgroundTop: '#faf9f7',
    backgroundBottom: '#ecebe7',
    fog: '#efeeea',
    grid: '#a8a69f',
    axes: { x: '#c0392b', y: '#1f7a3f', z: '#2d5fb8' },
    selection: '#00696a',
    hover: '#0a8481',
    outline: '#00696a',
    edges: '#3a3933',
    gizmo: '#1c1b16',
    measurePreview: '#1c1b16',
    measureHighlight: '#00696a',
    hemiSky: '#dfe6f2',
    hemiGround: '#8a8984',
    ambientIntensity: 1.15,
    directional: '#fffaf2',
    directionalIntensity: 1.2,
    // Same hues, darker so they hold contrast on the warm-grey backdrop.
    highlight: { hover: '#0a8481', select: '#0a8481', selectOpacity: 0.92, tint: true, selectBox: '#00504f', error: '#c62f35', warn: '#c77a0a', info: '#2f6fb0', ghost: '#5e5d57' },
  },
}

type Listener = (theme: SceneTheme, name: ResolvedTheme) => void

let current: ResolvedTheme = 'dark'
const listeners = new Set<Listener>()

export function getSceneTheme(name: ResolvedTheme = current): SceneTheme {
  return SCENE_THEMES[name]
}

export function getSceneThemeName(): ResolvedTheme {
  return current
}

/** Called by ThemeProvider. Notifies only on an actual change. */
export function setSceneTheme(name: ResolvedTheme): void {
  if (name === current) return
  current = name
  for (const cb of [...listeners]) cb(SCENE_THEMES[name], name)
}

/** Subscribe to theme changes; returns the unsubscribe function. */
export function subscribeSceneTheme(cb: Listener): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
