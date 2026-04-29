import { create } from 'zustand'

interface UIStore {
  validationPanelOpen: boolean
  validationPanelFloating: boolean
  treeWidth: number
  treeVisible: boolean
  /** Per-element visibility overrides (expressId → hidden) */
  hiddenElements: Set<number>

  toggleValidationPanel: () => void
  setValidationPanelOpen: (open: boolean) => void
  setValidationPanelFloating: (floating: boolean) => void
  setTreeWidth: (width: number) => void
  setTreeVisible: (visible: boolean) => void
  setElementsVisible: (ids: number[], visible: boolean) => void
  clearHiddenElements: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  validationPanelOpen: false,
  validationPanelFloating: false,
  treeWidth: 300,
  treeVisible: true,
  hiddenElements: new Set<number>(),

  toggleValidationPanel: () =>
    set((s) => ({ validationPanelOpen: !s.validationPanelOpen })),
  setValidationPanelOpen: (open) => set({ validationPanelOpen: open }),
  setValidationPanelFloating: (floating) => set({ validationPanelFloating: floating }),
  setTreeWidth: (width) => set({ treeWidth: Math.max(220, Math.min(600, width)) }),
  setTreeVisible: (visible) => set({ treeVisible: visible }),
  setElementsVisible: (ids, visible) =>
    set((s) => {
      const next = new Set(s.hiddenElements)
      for (const id of ids) visible ? next.delete(id) : next.add(id)
      return { hiddenElements: next }
    }),
  clearHiddenElements: () => set({ hiddenElements: new Set<number>() }),
}))
