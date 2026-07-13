// ─── AuroraBackdrop ───────────────────────────────────────────────────────────
// Shared decorative background: a WebGL aurora shader (SoftAurora, lazy) under a
// static accent glow and a legibility scrim. Theme-aware and reduced-motion
// aware (swaps the animated canvas for a static gradient). Used by the account
// surfaces (welcome, /sign-in|/sign-up|/account, account modal) so they share
// one visual language. Purely decorative → aria-hidden, pointer-events-none.

import React, { Suspense } from 'react'
import { useReducedMotion } from 'framer-motion'

const SoftAurora = React.lazy(() => import('./reactbits/SoftAurora'))

interface AuroraBackdropProps {
  light?: boolean
  /** 0–1 multiplier on the shader brightness + glow (dial it down inside modals). */
  intensity?: number
}

export default function AuroraBackdrop({ light = false, intensity = 1 }: AuroraBackdropProps) {
  const reduce = useReducedMotion()

  const glow = `radial-gradient(46% 34% at 50% 20%, rgba(94,106,210,${(light ? 0.16 : 0.28) * intensity}), transparent 70%)`
  const scrim = light
    ? 'radial-gradient(130% 100% at 50% 22%, rgba(245,246,250,0) 0%, rgba(245,246,250,0.30) 62%, var(--bg) 100%)'
    : 'radial-gradient(130% 100% at 50% 22%, rgba(10,10,12,0) 0%, rgba(10,10,12,0.35) 62%, var(--bg) 100%)'

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {reduce ? (
        <div className="absolute inset-0" style={{ background: glow }} />
      ) : (
        <>
          <Suspense fallback={null}>
            <div className="absolute inset-0">
              <SoftAurora
                speed={0.45}
                brightness={(light ? 1.0 : 1.35) * intensity}
                color1="#5E6AD2"
                color2="#8B5CF6"
                bandHeight={0.62}
                bandSpread={1.15}
              />
            </div>
          </Suspense>
          <div className="absolute inset-0" style={{ background: glow }} />
        </>
      )}
      <div className="absolute inset-0" style={{ background: scrim }} />
    </div>
  )
}
