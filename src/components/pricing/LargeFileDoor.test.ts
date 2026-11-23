import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const subscribeEmail = vi.fn()
const trackInterest = vi.fn()
vi.mock('../../lib/subscribe', () => ({ subscribeEmail: (...a: unknown[]) => subscribeEmail(...a) }))
vi.mock('../../lib/analytics', () => ({
  trackServerProcessingInterest: (...a: unknown[]) => trackInterest(...a),
  trackEmailCaptured: vi.fn(),
}))

import LargeFileDoor from './LargeFileDoor'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  subscribeEmail.mockReset(); trackInterest.mockReset()
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = '' })

const input = () => document.querySelector('input[type="email"]') as HTMLInputElement
const form = () => document.querySelector('form') as HTMLFormElement

describe('LargeFileDoor', () => {
  it('submits with source large_file:<MB>, shows success, tracks email_left with size only', async () => {
    subscribeEmail.mockResolvedValue({ ok: true })
    act(() => root.render(h(LargeFileDoor, { sizeMb: 420, onClose: () => {} })))
    const el = input()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { setter.call(el, 'a@b.co'); el.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(subscribeEmail).toHaveBeenCalled()
    expect(subscribeEmail.mock.calls[0].slice(0, 2)).toEqual(['a@b.co', 'large_file:420'])
    expect(document.querySelector('[role="status"]')).not.toBeNull()
    expect(trackInterest).toHaveBeenCalledWith({ file_size_mb: 420, step: 'email_left' })
  })

  it('prefills the signed-in email', () => {
    useCloudAccountStore.setState({ status: 'signed-in', email: 'me@x.io' } as never)
    act(() => root.render(h(LargeFileDoor, { sizeMb: 150, onClose: () => {} })))
    expect(input().value).toBe('me@x.io')
    useCloudAccountStore.setState({ status: 'signed-out', email: null } as never)
  })

  it('is dismissable', () => {
    const onClose = vi.fn()
    act(() => root.render(h(LargeFileDoor, { sizeMb: 150, onClose })))
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.type === 'button' && b.textContent && !b.getAttribute('aria-label'))
    act(() => btn!.click())
    expect(onClose).toHaveBeenCalled()
  })
})
