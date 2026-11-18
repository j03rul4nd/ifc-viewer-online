// ─── useDetailResolver ────────────────────────────────────────────────────────
// A LoadError's `detailKey` is a key of ANOTHER namespace
// ('pointcloud:error.lazTooLarge', 'mesh:error.noEntryFile'): the runners speak
// their panels' language, and the adapters hand that key on unchanged
// (lib/loading/source-errors.ts). The loading namespace cannot resolve it, so
// the error block asks this resolver, which:
//
//   • subscribes to the namespaces the adapters use, so they are loaded and a
//     language switch re-renders the block when their bundles land (every
//     namespace is also in i18n init's `ns`, but a component that prints a key
//     should not rely on someone else having asked for it);
//   • accepts only namespaced keys — a bare 'error.parseFailed' would resolve
//     against whichever namespace this hook happens to list first, i.e. a
//     sentence about point clouds under a mesh;
//   • returns null for a key no bundle has (i18n.exists covers the fallback
//     language too), so the caller falls back to the generic sentence instead
//     of printing "error.somethingNew" in a red block.

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { DetailResolver } from './job-view'

/** The namespaces `SourceNamespace` (source-errors.ts) can name. */
const DETAIL_NAMESPACES = ['pointcloud', 'mesh'] as const

export function useDetailResolver(): DetailResolver {
  const { t, i18n } = useTranslation(DETAIL_NAMESPACES)
  return useCallback((key: string): string | null => {
    if (key.indexOf(':') <= 0) return null
    if (!i18n.exists(key)) return null
    const text = String(t(key as never))
    return text.trim().length > 0 && text !== key ? text : null
  }, [t, i18n])
}
