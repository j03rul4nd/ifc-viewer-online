// ─── scene-demos ──────────────────────────────────────────────────────────────
// Demos that are whole SCENES (docs/SCENE_FORMAT.md), not model sets: models,
// live data layers, devices painting IFC elements, map and camera, opened with
// `?scene=`. Each scene file lives in public/scenes/ and is also the example a
// developer copies (docs/DEMOS.md describes each one for articles).

export interface SceneDemo {
  id: string
  /** Same-origin path of the scene document. */
  scene: string
  /** i18n key suffix under layers:scene.demos.<key>.{name,description}. */
  key: string
  models: number
  /** Live sources: data layers that refresh + device sources. */
  live: number
}

export const SCENE_DEMOS: SceneDemo[] = [
  { id: 'barcelona-placa-catalunya', scene: '/scenes/barcelona-placa-catalunya.scene.json', key: 'barcelona', models: 8, live: 6 },
  { id: 'helsinki-rautatientori', scene: '/scenes/helsinki-rautatientori.scene.json', key: 'helsinki', models: 3, live: 3 },
  { id: 'tokyo-tochomae', scene: '/scenes/tokyo-tochomae.scene.json', key: 'tochomae', models: 1, live: 4 },
  { id: 'tokyo-waseda', scene: '/scenes/tokyo-waseda.scene.json', key: 'waseda', models: 1, live: 2 },
]

/** Where a scene demo opens: this app, with the scene as its only parameter. */
export function sceneDemoUrl(d: SceneDemo, base: string = import.meta.env.BASE_URL ?? '/'): string {
  const root = base.endsWith('/') ? base : `${base}/`
  const path = d.scene.startsWith('/') && root !== '/' ? `${root}${d.scene.slice(1)}` : d.scene
  return `${root}?scene=${encodeURIComponent(path)}`
}
