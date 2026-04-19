import { create } from 'zustand'

interface UIStore {
  validationPanelOpen: boolean
  validationPanelFloating: boolean
  treeWidth: number
  treeVisible: boolean

  toggleValidationPanel: () => void
  setValidationPanelOpen: (open: boolean) => void
  setValidationPanelFloating: (floating: boolean) => void
  setTreeWidth: (width: number) => void
  setTreeVisible: (visible: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  validationPanelOpen: false,
  validationPanelFloating: false,
  treeWidth: 300,
  treeVisible: true,

  toggleValidationPanel: () =>
    set((s) => ({ validationPanelOpen: !s.validationPanelOpen })),
  setValidationPanelOpen: (open) => set({ validationPanelOpen: open }),
  setValidationPanelFloating: (floating) => set({ validationPanelFloating: floating }),
  setTreeWidth: (width) => set({ treeWidth: Math.max(220, Math.min(600, width)) }),
  setTreeVisible: (visible) => set({ treeVisible: visible }),
}))
