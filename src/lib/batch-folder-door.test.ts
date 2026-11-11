import { beforeEach, describe, expect, it } from 'vitest'
import { batchCountBucket, resetBatchFolderDoor, shouldOfferBatchFolder } from './batch-folder-door'
import en from '../locales/en/pro.json'

const full = { interactive: true, embedded: false }
const LANGS = ['en', 'es', 'ca', 'de', 'fr', 'it', 'pt', 'ja', 'zh', 'th'] as const

beforeEach(() => resetBatchFolderDoor())

describe('batch folder fake door', () => {
  it('appears when more than one IFC is dropped', () => {
    expect(shouldOfferBatchFolder(1, full)).toBe(false)
    expect(shouldOfferBatchFolder(2, full)).toBe(true)
  })

  it('appears once per page load', () => {
    expect(shouldOfferBatchFolder(3, full)).toBe(true)
    expect(shouldOfferBatchFolder(3, full)).toBe(false)
  })

  it('never in an embed or a reduced viewer', () => {
    expect(shouldOfferBatchFolder(5, { interactive: true, embedded: true })).toBe(false)
    expect(shouldOfferBatchFolder(5, { interactive: false, embedded: false })).toBe(false)
    // Not spent by a refusal.
    expect(shouldOfferBatchFolder(5, full)).toBe(true)
  })

  it('buckets the file count', () => {
    expect([1, 10, 11, 50, 51, 500].map(batchCountBucket)).toEqual([1, 10, 50, 50, 100, 100])
  })

  it('says it is not available yet, in every language', async () => {
    expect(en.batchFolder.action).toBe('Validate folder (Pro)')
    expect(en.batchFolder.soon).toMatch(/coming soon/i)
    expect(en.batchFolder.body).toMatch(/not available yet/i)
    for (const l of LANGS) {
      const pack = (await import(`../locales/${l}/pro.json`)).default as typeof en
      for (const k of Object.keys(en.batchFolder) as (keyof typeof en.batchFolder)[]) {
        expect(pack.batchFolder[k], `${l}.${k}`).toBeTruthy()
      }
      expect(pack.batchFolder.offer, l).toContain('{{count}}')
      expect(pack.batchFolder.action, l).toContain('Pro')
    }
  })
})
