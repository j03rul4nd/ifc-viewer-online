import { describe, it, expect, beforeEach } from 'vitest'
import {
  pushModal, popModal, isTopModal, modalZIndex, modalStack, anyModalOpen,
  resetModalStack, MODAL_BASE_Z,
} from './modal-stack'

beforeEach(resetModalStack)

describe('the order is the order things were opened', () => {
  it('stacks by opening, not by a hard-coded number', () => {
    // Ten dialogs used to pick their own z-index — 70, 72, 80, 85, 100, 200 —
    // so two that could be open together stacked in whatever order those
    // numbers happened to fall.
    pushModal('a')
    pushModal('b')
    expect(modalStack()).toEqual(['a', 'b'])
    expect(modalZIndex('b')).toBeGreaterThan(modalZIndex('a'))
  })

  it('leaves room between layers for a backdrop and its card', () => {
    pushModal('a')
    pushModal('b')
    expect(modalZIndex('b') - modalZIndex('a')).toBeGreaterThanOrEqual(2)
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

  it('hands the top back when the one above closes', () => {
    // A dialog opened from a dialog — the account modal over the upsell that
    // offered it — must give Escape back when it goes.
    pushModal('upsell')
    pushModal('account')
    popModal('account')
    expect(isTopModal('upsell')).toBe(true)
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
