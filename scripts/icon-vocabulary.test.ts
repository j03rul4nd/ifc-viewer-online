// ─── icon vocabulary ──────────────────────────────────────────────────────────
// One glyph per data concept. Point clouds were a lightning bolt on the rail
// and a hand-drawn dot cloud in the toolbar; 3D models were a building on the
// rail and an inline cube elsewhere. Icons.tsx now has PointCloud, Mesh, Video
// and DataLayers, and this source guard keeps every surface on them.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

function railIcons(): Record<string, string> {
  const app = read('src/App.tsx')
  const m = /const railIcons = useMemo\(\(\) => \(\{([\s\S]*?)\}\), \[\]\)/.exec(app)
  if (!m) throw new Error('railIcons useMemo not found in App.tsx')
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const e = /^\s*(\w+):\s*(<Icons\.\w+)/.exec(line)
    if (e) out[e[1]] = e[2]
  }
  return out
}

describe('data icons', () => {
  it('the rail uses the data glyphs', () => {
    const icons = railIcons()
    expect(icons.pointcloud).toBe('<Icons.PointCloud')
    expect(icons.mesh).toBe('<Icons.Mesh')
    expect(icons.layers).toBe('<Icons.DataLayers')
    expect(icons.video).toBe('<Icons.Video')
    expect(icons.devices).toBe('<Icons.Devices')
  })

  it('every rail entry has its own glyph', () => {
    const values = Object.values(railIcons())
    expect(new Set(values).size).toBe(values.length)
  })

  it('the toolbar and the phone nav draw no inline data SVGs', () => {
    for (const file of ['src/components/Toolbar.tsx', 'src/components/MobileBottomNav.tsx']) {
      const src = read(file)
      for (const name of ['PointCloudSVG', 'MeshSVG', 'TwinSVG', 'LayersSVG']) {
        expect(src.includes(name), `${file} still has ${name}`).toBe(false)
      }
    }
  })

  it('the add-data surfaces never borrow Film, Zap or Building', () => {
    const dir = join(ROOT, 'src/components/data')
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.tsx')) : []
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/Icons\.(Film|Zap|Building)\b/)
    }
  })
})
