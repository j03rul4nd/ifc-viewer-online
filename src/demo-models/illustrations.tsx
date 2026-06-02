// ─── Demo model illustrations ─────────────────────────────────────────────────
// Lightweight, hand-drawn SVG line-art per model so the gallery card instantly
// communicates *what kind* of building you're about to load — a house, a tower,
// a structural frame, a bridge, ducts, etc. Themed with the category accent.
//
// These are vector (a few hundred bytes each, no network) and scale crisply.
// Add a new model → add a case keyed by its id (falls back to a generic block).

import type { ReactNode } from 'react'

const SOFT = 'rgba(255,255,255,0.30)'

function Frame({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 160 96"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      stroke={accent}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type Illo = (accent: string) => ReactNode

const ILLUSTRATIONS: Record<string, Illo> = {
  // ── Residential ──────────────────────────────────────────────────────────
  'duplex-architecture': (a) => (
    <Frame accent={a}>
      {/* two adjacent units under twin pitched roofs (a duplex) */}
      <path d="M18 48 L45 30 L72 48" />
      <path d="M72 48 L99 30 L126 48" />
      <rect x="20" y="48" width="104" height="32" rx="1.5" fill={a} fillOpacity={0.1} />
      <line x1="72" y1="48" x2="72" y2="80" />
      <rect x="32" y="58" width="12" height="22" stroke={SOFT} />
      <rect x="100" y="58" width="12" height="22" stroke={SOFT} />
      <rect x="54" y="56" width="10" height="10" stroke={SOFT} />
      <rect x="82" y="56" width="10" height="10" stroke={SOFT} />
    </Frame>
  ),
  'sample-house': (a) => (
    <Frame accent={a}>
      <path d="M30 48 L80 24 L130 48" />
      <rect x="42" y="48" width="76" height="32" rx="1.5" fill={a} fillOpacity={0.1} />
      <rect x="72" y="60" width="16" height="20" stroke={SOFT} />
      <rect x="52" y="56" width="11" height="11" stroke={SOFT} />
      <rect x="97" y="56" width="11" height="11" stroke={SOFT} />
      <line x1="116" y1="30" x2="116" y2="40" stroke={SOFT} />
    </Frame>
  ),

  // ── Commercial ───────────────────────────────────────────────────────────
  'office-architecture': (a) => (
    <Frame accent={a}>
      <rect x="46" y="18" width="68" height="66" rx="1.5" fill={a} fillOpacity={0.08} />
      {[26, 40, 54, 68].map((y) =>
        [54, 72, 90].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="8" stroke={SOFT} />),
      )}
      <rect x="72" y="74" width="16" height="10" stroke={SOFT} />
    </Frame>
  ),
  'tall-building': (a) => (
    <Frame accent={a}>
      <rect x="62" y="10" width="36" height="76" rx="1.5" fill={a} fillOpacity={0.1} />
      <line x1="80" y1="10" x2="80" y2="86" stroke={SOFT} />
      {[20, 30, 40, 50, 60, 70].map((y) => (
        <line key={y} x1="62" y1={y} x2="98" y2={y} stroke={SOFT} />
      ))}
    </Frame>
  ),
  'large-building': (a) => (
    <Frame accent={a}>
      {/* multi-wing, stepped massing */}
      <rect x="16" y="46" width="42" height="38" rx="1.5" fill={a} fillOpacity={0.08} />
      <rect x="58" y="30" width="44" height="54" rx="1.5" fill={a} fillOpacity={0.1} />
      <rect x="102" y="50" width="42" height="34" rx="1.5" fill={a} fillOpacity={0.08} />
      {[40, 56, 72].map((y) => <line key={y} x1="62" y1={y} x2="98" y2={y} stroke={SOFT} />)}
      <line x1="20" y1="60" x2="54" y2="60" stroke={SOFT} />
      <line x1="106" y1="64" x2="140" y2="64" stroke={SOFT} />
    </Frame>
  ),

  // ── MEP ──────────────────────────────────────────────────────────────────
  'duplex-electrical': (a) => (
    <Frame accent={a}>
      <path d="M34 46 L80 24 L126 46" stroke={SOFT} />
      <rect x="44" y="46" width="72" height="34" rx="1.5" stroke={SOFT} />
      {/* lightning bolt */}
      <path d="M86 48 L72 66 L82 66 L74 82" strokeWidth={2.4} />
      <circle cx="58" cy="62" r="3" fill={a} />
      <circle cx="104" cy="64" r="3" fill={a} />
      <path d="M58 62 L72 66 M82 66 L104 64" />
    </Frame>
  ),
  'duplex-mechanical': (a) => (
    <Frame accent={a}>
      <path d="M34 44 L80 22 L126 44" stroke={SOFT} />
      <rect x="44" y="44" width="72" height="34" rx="1.5" stroke={SOFT} />
      {/* duct run + fan */}
      <rect x="50" y="58" width="38" height="11" rx="3" />
      <path d="M88 63 H100" />
      <circle cx="106" cy="63" r="9" />
      <path d="M106 63 L106 56 M106 63 L112 67 M106 63 L100 67" strokeWidth={1.6} />
    </Frame>
  ),
  'office-mep': (a) => (
    <Frame accent={a}>
      <rect x="46" y="18" width="68" height="66" rx="1.5" stroke={SOFT} fill={a} fillOpacity={0.05} />
      {/* pipework weaving through the building */}
      <path d="M58 78 V40 H86 V62 H102 V28" strokeWidth={2.4} />
      <circle cx="58" cy="40" r="3.2" fill={a} />
      <circle cx="86" cy="62" r="3.2" fill={a} />
      <circle cx="102" cy="28" r="3.2" fill={a} />
    </Frame>
  ),

  // ── Structural ───────────────────────────────────────────────────────────
  'office-structure': (a) => (
    <Frame accent={a}>
      {/* column / beam skeleton */}
      {[46, 80, 114].map((x) => <line key={x} x1={x} y1="20" x2={x} y2="84" />)}
      {[20, 42, 63, 84].map((y) => <line key={y} x1="46" y1={y} x2="114" y2={y} />)}
      <path d="M46 42 L80 63 M80 42 L114 63" stroke={SOFT} />
    </Frame>
  ),
  'school-structure': (a) => (
    <Frame accent={a}>
      {/* truss roof over a wide, low two-storey portal frame */}
      <path d="M22 38 L80 18 L138 38" />
      <path d="M28 38 L52 26 L76 38 L100 26 L124 38" stroke={SOFT} strokeWidth={1.6} />
      {[26, 62, 98, 134].map((x) => <line key={x} x1={x} y1="38" x2={x} y2="84" />)}
      {[38, 61, 84].map((y) => <line key={y} x1="26" y1={y} x2="134" y2={y} />)}
    </Frame>
  ),

  // ── Infrastructure ───────────────────────────────────────────────────────
  'infra-bridge': (a) => (
    <Frame accent={a}>
      {/* arch bridge: deck, piers, arches, waterline */}
      <line x1="12" y1="42" x2="148" y2="42" strokeWidth={2.4} />
      <line x1="12" y1="48" x2="148" y2="48" stroke={SOFT} />
      <path d="M14 76 Q47 44 80 76" />
      <path d="M80 76 Q113 44 146 76" />
      <line x1="14" y1="48" x2="14" y2="78" />
      <line x1="80" y1="48" x2="80" y2="78" />
      <line x1="146" y1="48" x2="146" y2="78" />
      <path d="M10 84 H150" stroke={SOFT} strokeDasharray="5 6" />
      {[34, 60, 100, 126].map((x) => <line key={x} x1={x} y1="42" x2={x} y2="48" stroke={SOFT} />)}
    </Frame>
  ),
}

/** Generic fallback for ids without a dedicated drawing. */
function GenericBuilding(accent: string): ReactNode {
  return (
    <Frame accent={accent}>
      <rect x="50" y="24" width="60" height="60" rx="2" fill={accent} fillOpacity={0.1} />
      {[34, 48, 62].map((y) =>
        [58, 76, 94].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="9" height="8" stroke={SOFT} />),
      )}
    </Frame>
  )
}

export function ModelIllustration({ id, accent }: { id: string; accent: string }): ReactNode {
  return (ILLUSTRATIONS[id] ?? GenericBuilding)(accent)
}
