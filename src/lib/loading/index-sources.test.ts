// The loading system's app wiring for point clouds and meshes: the words a
// failed scan / mesh reaches the user and an SDK host with, and the runner's
// own key the mesh wire contract carries.
import { describe, it, expect, beforeAll } from 'vitest'
import i18n from '../../i18n/config'
import { describeSourceError, sourceErrorKey } from './index'
import type { LoadError } from './types'

function err(patch: Partial<LoadError>): LoadError {
  return { code: 'parse', message: 'x', phase: null, autoRetryable: false, userRetryable: true, attempt: 1, ...patch }
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
  await i18n.loadNamespaces(['loading', 'pointcloud', 'mesh'])
})

describe('describeSourceError', () => {
  it("prefers the runner's own reason, loading its namespace first", async () => {
    const text = await describeSourceError(err({ code: 'unsupported', detailKey: 'pointcloud:error.lazTooLarge' }), 'pointcloud')
    expect(text).toBe(i18n.t('pointcloud:error.lazTooLarge'))
    expect(text).not.toMatch(/error\./)
  })

  it('fills the HTTP status of a failed download instead of printing {{status}}', async () => {
    const text = await describeSourceError(err({ code: 'http', httpStatus: 404 }), 'pointcloud')
    expect(text).toContain('404')
    expect(text).not.toContain('{{')
  })

  it('a scan / mesh failure without a runner reason gets the kind-neutral sentence, never the IFC one', async () => {
    const scan = await describeSourceError(err({ code: 'invalid-file' }), 'pointcloud')
    expect(scan).toBe(i18n.t('loading:errorGeneric.invalid-file'))
    expect(scan).not.toMatch(/IFC/)
    const ifc = await describeSourceError(err({ code: 'invalid-file' }), 'ifc')
    expect(ifc).toBe(i18n.t('loading:error.invalid-file'))
  })

  it('an unknown runner key falls back to the generic sentence, not the raw key', async () => {
    const text = await describeSourceError(err({ code: 'parse', detailKey: 'mesh:error.somethingNew' }), 'mesh')
    expect(text).not.toContain('somethingNew')
    expect(text).toBe(i18n.t('loading:errorGeneric.parse'))
  })
})

describe('sourceErrorKey', () => {
  it('is the runner key without its namespace (the mesh wire contract), or null', () => {
    expect(sourceErrorKey(err({ detailKey: 'mesh:error.noEntryFile' }))).toBe('error.noEntryFile')
    expect(sourceErrorKey(err({}))).toBeNull()
  })
})
