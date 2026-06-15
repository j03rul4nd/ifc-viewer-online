// ─── FounderAvatar ────────────────────────────────────────────────────────────
// The founder's real photo, shown across the invite surfaces. Circular, lazy,
// same-origin (public/founder.jpg → COEP-safe). Falls back to the initial on a
// load error so it never renders broken.

import React, { useState } from 'react'
import { FOUNDER_NAME, FOUNDER_AVATAR } from '../lib/invite-registry'

interface FounderAvatarProps {
  /** Rendered width/height in px. */
  size?: number
  className?: string
}

export default function FounderAvatar({ size = 32, className = '' }: FounderAvatarProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        aria-hidden
        className={`shrink-0 rounded-full bg-[var(--accent)] text-white grid place-items-center font-semibold select-none ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      >
        {FOUNDER_NAME.charAt(0)}
      </span>
    )
  }

  return (
    <img
      src={FOUNDER_AVATAR}
      alt={FOUNDER_NAME}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full object-cover select-none border border-[var(--border-strong)] ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
