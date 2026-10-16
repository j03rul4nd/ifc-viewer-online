// @vitest-environment jsdom
// Several components mount useEditorHistory at once, each with its own window
// keydown listener. One Ctrl+Z must still be ONE undo step. Mounted with
// createElement (the repo runs no .test.tsx).

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useEditorHistory } from './useEditorHistory'
import { useEditorStore } from '../stores/editorStore'
import type { EditorCommand } from '../types'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

function Probe(): null {
  useEditorHistory()
  return null
}

const command = (id: string): EditorCommand => ({
  id, timestamp: 0, description: id,
  diffs: [{ type: 'RENAME', expressId: 1, field: 'Name', oldValue: '', newValue: id }],
})

const press = (init: KeyboardEventInit): void => {
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })) })
}

let root: Root
let host: HTMLDivElement

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

beforeEach(() => {
  useEditorStore.getState().clearHistory()
  for (const id of ['one', 'two', 'three', 'four']) useEditorStore.getState().addCommand(command(id))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  // Three copies, like App, Toolbar and the validation panel.
  act(() => root.render(createElement(Fragment, null,
    createElement(Probe), createElement(Probe), createElement(Probe))))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('useEditorHistory keyboard shortcuts', () => {
  it('one Ctrl+Z undoes exactly one step, however many copies are mounted', () => {
    press({ key: 'z', ctrlKey: true })
    expect(useEditorStore.getState().historyIndex).toBe(2)
  })

  it('one Ctrl+Shift+Z / Ctrl+Y redoes exactly one step', () => {
    press({ key: 'z', ctrlKey: true })
    press({ key: 'z', ctrlKey: true })
    expect(useEditorStore.getState().historyIndex).toBe(1)
    press({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(useEditorStore.getState().historyIndex).toBe(2)
    press({ key: 'y', ctrlKey: true })
    expect(useEditorStore.getState().historyIndex).toBe(3)
  })

  it('leaves typing in a field alone', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })) })
    expect(useEditorStore.getState().historyIndex).toBe(3)
    input.remove()
  })
})
