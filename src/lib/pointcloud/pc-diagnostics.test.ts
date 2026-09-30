import { describe, it, expect } from 'vitest'
import {
  diagnoseCloud, bestColorMode, colorModeAvailable, boxGap, matchPreset,
  APPEARANCE_PRESETS, HEAVY_POINTS, type DiagnoseInput, type BoxCS,
} from './pc-diagnostics'
import { DEFAULT_DISPLAY, NO_OFFSET, type PointCloudAlignment } from './pc-types'

const box = (cx: number, size: number): BoxCS =>
  ({ center: { x: cx, y: 0, z: 0 }, size: { x: size, y: size, z: size } })

const alignment = (patch: Partial<PointCloudAlignment> = {}): PointCloudAlignment => ({
  rung: 'shared-crs', confidence: 'exact', origin: { x: 0, y: 0, z: 0 }, yawRad: 0, scale: 1,
  upAxis: 'z', reasons: [], offset: { ...NO_OFFSET }, ...patch,
})

function input(patch: Omit<Partial<DiagnoseInput>, 'cloud'> & { cloud?: Partial<DiagnoseInput['cloud']> } = {}): DiagnoseInput {
  return {
    display: { colorMode: 'rgb', opacity: 1 },
    cloudBox: box(0, 20),
    modelBox: box(0, 20),
    totalPoints: 1_000_000,
    density: 1,
    ...patch,
    cloud: {
      status: 'ready', streamErrorKey: null, truncated: false, visible: true,
      attributes: { color: true, intensity: true, classification: false, confidence: false },
      frame: { upAxisSource: 'declared' } as never,
      alignment: alignment(),
      sourceKind: 'file',
      ...patch.cloud,
    },
  }
}

const ids = (i: DiagnoseInput): string[] => diagnoseCloud(i).map((x) => x.id)

describe('diagnoseCloud', () => {
  it('a healthy, aligned scan has nothing to fix', () => {
    expect(diagnoseCloud(input())).toEqual([])
  })

  it('a failed load only offers removal', () => {
    expect(diagnoseCloud(input({ cloud: { status: 'error' } }))).toEqual([
      { id: 'failed', severity: 'error', fixes: ['remove'] },
    ])
  })

  it('says nothing while the scan is still parsing', () => {
    expect(ids(input({ cloud: { status: 'parsing', visible: false } }))).toEqual([])
  })

  it('flags a colour mode the file has no data for', () => {
    const issues = diagnoseCloud(input({
      cloud: { attributes: { color: false, intensity: false, classification: false, confidence: false } },
    }))
    expect(issues[0]).toMatchObject({ id: 'colorUnavailable', fixes: ['bestColor'] })
  })

  it('offers the up-axis flip only when the axis was guessed', () => {
    expect(ids(input({ cloud: { frame: { upAxisSource: 'assumed' } as never } }))).toContain('upAxisGuessed')
    expect(ids(input({ cloud: { frame: { upAxisSource: 'user' } as never } }))).not.toContain('upAxisGuessed')
  })

  it('reads a millimetre file against the model and offers unit fixes', () => {
    const issues = diagnoseCloud(input({ cloudBox: box(0, 20_000), modelBox: box(0, 20) }))
    expect(issues.find((i) => i.id === 'tooLarge')?.fixes).toEqual(['unitMm', 'unitCm', 'unitFt'])
  })

  it('does not re-flag a size the aligner or the user already corrected', () => {
    const big = { cloudBox: box(0, 20_000), modelBox: box(0, 20) }
    expect(ids(input({ ...big, cloud: { alignment: alignment({ reasons: ['align.reason.unitMillimetres'] }) } })))
      .not.toContain('tooLarge')
    expect(ids(input({ ...big, cloud: { alignment: alignment({ offset: { ...NO_OFFSET, scaleMul: 0.001 } }) } })))
      .not.toContain('tooLarge')
  })

  it('flags a scan far from the model and folds the manual hint into it', () => {
    const got = ids(input({ cloudBox: box(5_000, 20), cloud: { alignment: alignment({ rung: 'manual' }) } }))
    expect(got).toContain('farFromModel')
    expect(got).not.toContain('manualPlacement')
  })

  it('hidden and faint are distinct, and hidden wins', () => {
    expect(ids(input({ cloud: { visible: false }, display: { colorMode: 'rgb', opacity: 0.1 } }))).toEqual(['hidden'])
    expect(ids(input({ display: { colorMode: 'rgb', opacity: 0.1 } }))).toEqual(['faint'])
  })

  it('suggests the lighter preset only at full detail on a heavy scene', () => {
    expect(ids(input({ totalPoints: HEAVY_POINTS + 1 }))).toContain('heavy')
    expect(ids(input({ totalPoints: HEAVY_POINTS + 1, density: 0.5 }))).not.toContain('heavy')
  })

  it('skips placement rules for a temporal replay', () => {
    const got = ids(input({
      cloudBox: box(5_000, 20_000),
      cloud: { sourceKind: 'temporal-replay', frame: { upAxisSource: 'assumed' } as never, alignment: alignment({ rung: 'manual' }) },
    }))
    expect(got).toEqual([])
  })

  it('orders issues by severity', () => {
    const issues = diagnoseCloud(input({
      cloud: { streamErrorKey: 'error.copcDecode', truncated: true, frame: { upAxisSource: 'assumed' } as never },
    }))
    expect(issues.map((i) => i.severity)).toEqual(['warn', 'info', 'info'])
  })
})

describe('colour helpers', () => {
  it('prefers real colour, then classes, then intensity, then height', () => {
    expect(bestColorMode({ color: true, intensity: true, classification: true, confidence: false })).toBe('rgb')
    expect(bestColorMode({ color: false, intensity: true, classification: true, confidence: false })).toBe('classification')
    expect(bestColorMode({ color: false, intensity: true, classification: false, confidence: false })).toBe('intensity')
    expect(bestColorMode(undefined)).toBe('elevation')
  })

  it('height and single colour always work', () => {
    expect(colorModeAvailable('elevation', undefined)).toBe(true)
    expect(colorModeAvailable('flat', undefined)).toBe(true)
    expect(colorModeAvailable('rgb', undefined)).toBe(false)
  })
})

describe('boxGap / presets', () => {
  it('is zero for overlapping boxes', () => {
    expect(boxGap(box(0, 10), box(4, 10))).toBe(0)
    expect(boxGap(box(0, 10), box(30, 10))).toBe(20)
  })

  it('recognises every preset it defines, and a tuned setting as none', () => {
    for (const [id, preset] of Object.entries(APPEARANCE_PRESETS)) {
      expect(matchPreset({ ...DEFAULT_DISPLAY, ...preset.display }, preset.renderBudget)).toBe(id)
    }
    expect(matchPreset({ ...DEFAULT_DISPLAY, pointSize: 7 }, 4_000_000)).toBeNull()
  })
})
