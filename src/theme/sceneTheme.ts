/**
 * Colours and light levels for the Three.js scene, per UI theme. Dark is the
 * current look (src/lib/viewer.ts, src/lib/scene/background.ts). Consumers
 * subscribe and update materials/colours in place; never rebuild the scene.
 * Not wired into the viewer yet (docs/theme-migration.md, phase 3).
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
  hemiSky: string
  hemiGround: string
  ambientIntensity: number
  directional: string
  directionalIntensity: number
}

export const SCENE_THEMES: Readonly<Record<ResolvedTheme, SceneTheme>> = {
  dark: {
    backgroundTop: '#100f0c',
    backgroundBottom: '#100f0c',
    fog: '#0a0a0c',
    grid: '#2a2d36',
    axes: { x: '#e0523f', y: '#3fa866', z: '#4c7dd9' },
    selection: '#55cac3',
    hover: '#6ce0ff',
    outline: '#55cac3',
    edges: '#1c1b16',
    gizmo: '#ecebe7',
    hemiSky: '#b8c4e0',
    hemiGround: '#1a1a22',
    ambientIntensity: 0.6,
    directional: '#fff5e8',
    directionalIntensity: 1.1,
  },
  light: {
    backgroundTop: '#ffffff',
    backgroundBottom: '#e9ebef',
    fog: '#eef0f3',
    grid: '#9aa3b2',
    axes: { x: '#c0392b', y: '#1f7a3f', z: '#2d5fb8' },
    selection: '#00696a',
    hover: '#0088aa',
    outline: '#00696a',
    edges: '#3a3933',
    gizmo: '#1c1b16',
    hemiSky: '#dfe6f2',
    hemiGround: '#8a8984',
    ambientIntensity: 0.8,
    directional: '#fffaf2',
    directionalIntensity: 1.0,
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
