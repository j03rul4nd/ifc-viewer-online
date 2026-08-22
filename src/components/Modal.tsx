// ─── Modal ────────────────────────────────────────────────────────────────────
// The one dialog. See docs/MODAL_DESIGN.md for the study this came out of.
//
// Ten dialogs each built their own portal, backdrop, escape listener, z-index
// and card. Nine of them hand-rolled it; ONE reached for Radix and got focus
// trapping, escape, outside-click dismissal, dialog semantics and a scroll lock
// correct without writing any of it. That one was the argument for this file.
//
// So this is Radix underneath, and everything the app has to decide on top:
//
//   • STACKING by opening order, from modal-stack, rather than the seven
//     hand-picked z-index bands the ten dialogs used between them
//   • ONE APPEARANCE — the same backdrop, card, header, footer and entrance
//   • FOUR SIZES, measured off the dialogs this replaces
//   • RESPONSIVE by construction: the card is bounded by the viewport, the body
//     is the only thing that scrolls, and long words wrap rather than forcing
//     the card wider than the screen
//
// Radix owns focus, escape and aria. Re-implementing those by hand is how you
// get a focus trap that works until someone puts a select in a portal inside it.

import React, { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useModalLayer } from '../hooks/useModalLayer'

export type ModalSize = 'sm' | 'md' | 'lg' | 'full'

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** Accessible name and header text. Required: a dialog without one is a box. */
  title: string
  /** Optional line under the title. */
  description?: string
  size?: ModalSize
  /** Action row, pinned below the scrolling body. */
  footer?: React.ReactNode
  /**
   * Escape and outside-click dismissal. Turn off only for a dialog in the
   * middle of work that must not be abandoned half-done — the header close stays
   * either way, because a dialog with no way out is a trap.
   */
  dismissible?: boolean
  /** Hide the header — for media that supplies its own chrome. */
  bare?: boolean
  /** Extra classes on the card, for the rare dialog with real layout needs. */
  className?: string
  children: React.ReactNode
}

/**
 * Widths measured off the ten dialogs this replaces; there were four clusters.
 *
 * Every one is bounded by the viewport as well as by its own width, so a card
 * never runs off a narrow screen — which is the whole of "responsive" for a
 * centred dialog, the rest being what the body does with the height.
 */
const SIZE_CLASS: Record<ModalSize, string> = {
  sm:   'w-[380px] max-w-[calc(100vw-24px)]',
  md:   'w-[560px] max-w-[calc(100vw-24px)]',
  lg:   'w-[860px] max-w-[calc(100vw-24px)]',
  full: 'w-[calc(100vw-24px)] h-[calc(100dvh-24px)]',
}

export function Modal({
  open, onClose, title, description, size = 'md',
  footer, dismissible = true, bare = false, className, children,
}: ModalProps) {
  const [id] = useState(() => `modal-${Math.random().toString(36).slice(2)}`)
  // Membership in the stack, and the layer that follows from it. The ordering
  // rules are pure and live in lib/ui/modal-stack.
  const { z, isTop } = useModalLayer(id, open, onClose)

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 bg-black/55 backdrop-blur-sm data-[state=open]:animate-[fadeIn_140ms_ease]"
          style={{ zIndex: z }}
        />
        <Dialog.Content
          // Set explicitly rather than assumed: measured on the built page,
          // Radix leaves this off and relies on focus guards plus aria-hidden on
          // the siblings. That is valid, but the attribute is what the panel
          // registry and older assistive tech look for.
          aria-modal="true"
          style={{ zIndex: z + 1 }}
          className={[
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none',
            'flex flex-col overflow-hidden rounded-2xl',
            'bg-[rgba(14,14,18,0.98)] border border-[var(--border-strong)]',
            'shadow-[0_24px_64px_rgba(0,0,0,0.6)]',
            // The card never exceeds the viewport; the BODY scrolls, so the
            // header and the actions stay reachable however long the content is.
            size === 'full' ? '' : 'max-h-[calc(100dvh-24px)]',
            SIZE_CLASS[size],
            className ?? '',
          ].join(' ')}
          onEscapeKeyDown={(e) => {
            // Only the top dialog reacts, and it stops the key there: otherwise
            // one press closes the whole stack AND the panel behind it, which is
            // what ten independent listeners used to do.
            if (!dismissible || !isTop()) { e.preventDefault(); return }
            e.stopPropagation()
          }}
          onPointerDownOutside={(e) => { if (!dismissible) e.preventDefault() }}
          onInteractOutside={(e) => { if (!dismissible) e.preventDefault() }}
        >
          {bare ? (
            // Radix requires a title for the accessible name even when nothing
            // is drawn; hiding it visually is the documented way to satisfy that
            // without imposing chrome on a dialog that supplies its own.
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          ) : (
            <div className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
              <div className="flex-1 min-w-0">
                {/* `break-words`: a file name or a rule id with no spaces would
                    otherwise push the card wider than the screen it is on. */}
                <Dialog.Title className="text-[14px] font-semibold text-[var(--text)] break-words">
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-0.5 text-[11px] text-[var(--text-muted)] leading-snug break-words">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close
                aria-label={`${title} — close`}
                className="shrink-0 w-7 h-7 -mr-1 rounded-lg flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </Dialog.Close>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)] shrink-0">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
