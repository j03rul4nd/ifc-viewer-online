import { describe, it, expect } from 'vitest'
import {
  canExtendOverDrawer, laneBottomCss, drawerHeightCss, clampDrawerPx, ratioForPx,
  snapPx, nextDetent, parseDrawerRatio, RAIL_CLEARANCE_PX, LANE_RESERVE_EXTRA_PX,
} from './lane'

describe('lane geometry', () => {
  it('reserves the rail clearance plus a gap', () => {
    expect(RAIL_CLEARANCE_PX).toBe(60)
    expect(LANE_RESERVE_EXTRA_PX).toBe(68)
  })

  it('extends a panel only while 460px of drawer remain', () => {
    expect(canExtendOverDrawer(1120, 380)).toBe(true)
    expect(canExtendOverDrawer(908, 380)).toBe(true)
    expect(canExtendOverDrawer(907, 380)).toBe(false)
    expect(canExtendOverDrawer(820, 292)).toBe(true)
    expect(canExtendOverDrawer(819, 292)).toBe(false)
    expect(canExtendOverDrawer(0, 292)).toBe(false)
  })

  it('anchors the bottom to the column or the viewer', () => {
    expect(laneBottomCss(true)).toBe('calc(12px - var(--lane-drawer-h, 0px))')
    expect(laneBottomCss(false)).toBe('12px')
  })
})

describe('drawer height', () => {
  it('is a CSS clamp of the column', () => {
    expect(drawerHeightCss(0.4, 180)).toBe('clamp(180px, 40.00%, calc(100% - 240px))')
    expect(drawerHeightCss(NaN, 180)).toBe('clamp(180px, 40.00%, calc(100% - 240px))')
    expect(drawerHeightCss(1.7, 180)).toBe('clamp(180px, 90.00%, calc(100% - 240px))')
    expect(drawerHeightCss(0.05, 220)).toBe('clamp(220px, 10.00%, calc(100% - 240px))')
  })

  it('clamps pixels between the minimum and the scene floor', () => {
    expect(clampDrawerPx(5000, 856, 180)).toBe(616)
    expect(clampDrawerPx(10, 856, 180)).toBe(180)
    expect(clampDrawerPx(300, 346, 180)).toBe(180)
  })

  it('stores the ratio of the clamped size', () => {
    expect(ratioForPx(342, 856, 180)).toBeCloseTo(0.3995, 4)
    expect(ratioForPx(616, 856, 180)).toBeCloseTo(0.7196, 4)
    expect(ratioForPx(180, 856, 180)).toBeCloseTo(0.2103, 4)
    expect(ratioForPx(342, 0, 180)).toBe(0.4)
  })

  it('snaps within 16px of a detent', () => {
    expect(snapPx(350, 856)).toBe(342)
    expect(snapPx(370, 856)).toBe(370)
    expect(snapPx(500, 856)).toBe(514)
  })

  it('steps through the detents', () => {
    expect(nextDetent(0.4, 1)).toBe(0.6)
    expect(nextDetent(0.6, 1)).toBe(0.6)
    expect(nextDetent(0.6, 1, true)).toBe(0.25)
    expect(nextDetent(0.4, -1)).toBe(0.25)
    expect(nextDetent(0.25, -1)).toBe(0.25)
    expect(nextDetent(0.33, 1)).toBe(0.4)
    expect(nextDetent(0.2103, 1, true)).toBe(0.25)
  })

  it('parses the persisted value defensively', () => {
    for (const raw of [null, '{bad', '{"ratio":0}', '{"ratio":"0.5"}', '{"ratio":1.5}']) {
      expect(parseDrawerRatio(raw), String(raw)).toBe(0.4)
    }
    expect(parseDrawerRatio('{"ratio":0.55}')).toBe(0.55)
    expect(parseDrawerRatio('{"ratio":0.05}')).toBe(0.1)
  })
})
