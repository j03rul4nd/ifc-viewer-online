import { describe, it, expect, beforeEach } from 'vitest'
import { SCENE_THEMES, getSceneTheme, getSceneThemeName, setSceneTheme, subscribeSceneTheme } from './sceneTheme'
import { DEFAULT_BACKGROUND, gridColorFor } from '../lib/scene/background'
import { resolveTheme, urlThemeOverride, isThemeMode } from './themeCore'

describe('sceneTheme', () => {
  beforeEach(() => setSceneTheme('dark'))

  it('dark matches the current scene defaults', () => {
    const d = SCENE_THEMES.dark
    expect(d.backgroundTop).toBe(DEFAULT_BACKGROUND.top)
    expect(d.grid).toBe(gridColorFor(DEFAULT_BACKGROUND))
    // applyBackground has always set the fog to the backdrop colour.
    expect(d.fog).toBe(DEFAULT_BACKGROUND.top)
    expect(d.ambientIntensity).toBe(0.6)
    expect(d.directionalIntensity).toBe(1.1)
  })

  it('light grid is a warm mid-grey ink, darker than the warm light backdrop', () => {
    const l = SCENE_THEMES.light
    expect(l.grid).toBe('#a8a69f')
    expect(gridColorFor({ mode: 'gradient', top: l.backgroundTop, bottom: l.backgroundBottom })).not.toBe('#2a2d36')
  })

  it('both themes define the same keys with hex colours', () => {
    expect(Object.keys(SCENE_THEMES.light).sort()).toEqual(Object.keys(SCENE_THEMES.dark).sort())
    for (const t of Object.values(SCENE_THEMES)) {
      for (const k of ['backgroundTop', 'fog', 'grid', 'selection', 'hover', 'outline', 'edges', 'gizmo'] as const) {
        expect(t[k]).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('highlight palette: dark is unchanged, light keeps hues and stays hex', () => {
    expect(SCENE_THEMES.dark.highlight).toEqual({ hover: '#0a8481', select: '#6c7cec', selectOpacity: 0.75, tint: false, selectBox: '#6c7cec', error: '#e5484d', warn: '#f5a623', info: '#5e9ed6', ghost: '#9aa0ae' })
    const l = SCENE_THEMES.light.highlight
    expect(l.hover).toBe('#0a8481')
    expect(l.select).toBe('#0a8481')
    expect(l.selectOpacity).toBeGreaterThan(SCENE_THEMES.dark.highlight.selectOpacity)
    expect(Object.keys(l).sort()).toEqual(Object.keys(SCENE_THEMES.dark.highlight).sort())
    for (const [k, v] of Object.entries(l)) if (typeof v === 'string') expect(v).toMatch(/^#[0-9a-f]{6}$/)
    expect(SCENE_THEMES.light.ambientIntensity).toBeGreaterThan(SCENE_THEMES.dark.ambientIntensity)
    expect(SCENE_THEMES.light.directionalIntensity).toBeGreaterThanOrEqual(SCENE_THEMES.dark.directionalIntensity)
  })

  it('notifies subscribers on change only, and unsubscribes', () => {
    const seen: string[] = []
    const off = subscribeSceneTheme((_, name) => seen.push(name))
    setSceneTheme('dark')
    setSceneTheme('light')
    expect(getSceneThemeName()).toBe('light')
    expect(getSceneTheme()).toBe(SCENE_THEMES.light)
    off()
    setSceneTheme('dark')
    expect(seen).toEqual(['light'])
  })
})

describe('themeCore', () => {
  it('resolves system from the preference', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
  })
  it('reads ?theme only for light/dark', () => {
    expect(urlThemeOverride('?embed=1&theme=light')).toBe('light')
    expect(urlThemeOverride('?theme=system')).toBeNull()
    expect(urlThemeOverride('')).toBeNull()
    expect(isThemeMode('blue')).toBe(false)
  })
})
