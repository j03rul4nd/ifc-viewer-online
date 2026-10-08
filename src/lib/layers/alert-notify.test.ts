import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyAlert, setNotifySettings, getNotifySettings, _unseenCount } from './alert-notify'

const hide = (hidden: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })

describe('alert-notify', () => {
  beforeEach(() => { hide(false); document.dispatchEvent(new Event('visibilitychange')); document.title = 'Viewer' })

  it('is off by default and persists what the user sets', () => {
    expect(getNotifySettings()).toEqual({ system: false, sound: false })
    setNotifySettings({ sound: true })
    expect(JSON.parse(localStorage.getItem('ifc-alert-notify:v1')!)).toEqual({ system: false, sound: true })
    setNotifySettings({ sound: false })
  })

  it('counts unseen alerts in the tab title only while hidden, and clears on return', () => {
    notifyAlert({ title: 'Empty', body: 'x', tag: 'a' })
    expect(document.title).toBe('Viewer')
    hide(true)
    notifyAlert({ title: 'Empty', body: 'x', tag: 'a' })
    notifyAlert({ title: 'Empty', body: 'x', tag: 'a' })
    expect(document.title).toBe('(2) Viewer')
    hide(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.title).toBe('Viewer')
    expect(_unseenCount()).toBe(0)
  })

  it('shows a system notification only with permission, while hidden', () => {
    const made: string[] = []
    class N { onclick: (() => void) | null = null; static permission = 'granted'; constructor(t: string) { made.push(t) } close() {} }
    vi.stubGlobal('Notification', N)
    setNotifySettings({ system: true })
    notifyAlert({ title: 'Visible', body: '', tag: 'a' })
    hide(true)
    notifyAlert({ title: 'Hidden', body: '', tag: 'a' })
    expect(made).toEqual(['Hidden'])
    N.permission = 'denied'
    notifyAlert({ title: 'Denied', body: '', tag: 'a' })
    expect(made).toEqual(['Hidden'])
    setNotifySettings({ system: false })
    vi.unstubAllGlobals()
  })
})
