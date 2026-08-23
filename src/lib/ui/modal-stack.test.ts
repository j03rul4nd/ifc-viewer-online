import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  pushModal, popModal, isTopModal, modalZIndex, modalStack, anyModalOpen,
  resetModalStack, addPanelCloser, resetPanelClosers, MODAL_BASE_Z,
} from './modal-stack'

beforeEach(resetModalStack)

describe('the order is the order things were opened', () => {
  it('lets one modal in at a time, and closes the one it takes over from', () => {
    // Ten dialogs used to pick their own z-index — 70, 72, 80, 85, 100, 200 —
    // and two of them could end up on screen together, stacked in whatever
    // order those numbers happened to fall. A dialog is a question; the app has
    // no reason to ask two at once.
    const closeA = vi.fn()
    pushModal('a', closeA)
    pushModal('b')
    expect(modalStack()).toEqual(['b'])
    expect(closeA).toHaveBeenCalledTimes(1)
  })

  it('closes the floating panels too', () => {
    // The reported bug: the selected element's properties sitting beside a
    // dialog, two windows both claiming to be what you are working on.
    resetPanelClosers()
    const closePanels = vi.fn()
    const closeProperties = vi.fn()
    addPanelCloser(closePanels)
    // The properties column is not in the panel registry — panels step it
    // aside rather than closing it — so it hands in a closer of its own.
    addPanelCloser(closeProperties)
    pushModal('export')
    expect(closePanels).toHaveBeenCalledTimes(1)
    expect(closeProperties).toHaveBeenCalledTimes(1)
    resetPanelClosers()
  })

  it('starts above the floating panels', () => {
    pushModal('a')
    expect(modalZIndex('a')).toBeGreaterThanOrEqual(MODAL_BASE_Z)
  })
})

describe('only the top one is the top one', () => {
  it('names the most recently opened', () => {
    pushModal('a')
    expect(isTopModal('a')).toBe(true)
    pushModal('b')
    expect(isTopModal('a')).toBe(false)
    expect(isTopModal('b')).toBe(true)
  })

  it('leaves nothing on top once the only modal closes', () => {
    // There is no "the one underneath" any more: opening a modal closed it.
    pushModal('upsell')
    pushModal('account')
    popModal('account')
    expect(isTopModal('upsell')).toBe(false)
    expect(anyModalOpen()).toBe(false)
  })

  it('says nothing is on top when nothing is open', () => {
    expect(isTopModal('a')).toBe(false)
    expect(anyModalOpen()).toBe(false)
  })
})

describe('re-registering', () => {
  it('does not duplicate a modal that is already open', () => {
    // A re-render must not deepen the stack, or the z-index would climb on
    // every keystroke typed into the dialog.
    pushModal('a')
    pushModal('a')
    pushModal('a')
    expect(modalStack()).toEqual(['a'])
  })

  it('moves a re-pushed modal to the top', () => {
    pushModal('a')
    pushModal('b')
    pushModal('a')
    expect(isTopModal('a')).toBe(true)
  })

  it('popping something that was never open changes nothing', () => {
    pushModal('a')
    popModal('ghost')
    expect(modalStack()).toEqual(['a'])
  })
})

describe('anyModalOpen', () => {
  it('is what tells the panels to yield Escape', () => {
    // panel-registry asked the DOM for [role="dialog"], and six of the
    // ten dialogs did not set it — so Escape over those closed the panel behind
    // them as well. This is the answer that does not depend on remembering an
    // attribute.
    expect(anyModalOpen()).toBe(false)
    pushModal('a')
    expect(anyModalOpen()).toBe(true)
    popModal('a')
    expect(anyModalOpen()).toBe(false)
  })
})
