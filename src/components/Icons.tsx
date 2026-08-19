import React from 'react'

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

const Icon = ({ d, size = 16, strokeWidth = 1.5, fill = 'none', children, ...rest }: IconProps & { d?: string; strokeWidth?: string | number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
)

export const Logo = ({ size = 20, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" {...p}>
    <rect width="32" height="32" rx="7.5" fill="var(--accent)" />
    <path d="M7 23 L16 8 L25 23 Z" fill="none" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M11 23 L16 15 L21 23" fill="none" stroke="white" strokeWidth="1.6" strokeLinejoin="round" opacity="0.7" />
  </svg>
)

export const Upload = (p: IconProps) => <Icon {...p}><path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></Icon>
export const Reset = (p: IconProps) => <Icon {...p}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /></Icon>
export const Isolate = (p: IconProps) => <Icon {...p}><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /><circle cx="12" cy="12" r="3" /></Icon>
export const Eye = (p: IconProps) => <Icon {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>
export const EyeOff = (p: IconProps) => <Icon {...p}><path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 004.2 4.2" /><path d="M9.4 5.5A10 10 0 0112 5c6 0 10 7 10 7a18.5 18.5 0 01-3.2 4" /><path d="M6.6 6.6A18 18 0 002 12s4 7 10 7a10 10 0 005.4-1.6" /></Icon>
export const Share = (p: IconProps) => <Icon {...p}><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></Icon>
export const Link = (p: IconProps) => <Icon {...p}><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" /><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" /></Icon>
export const Copy = (p: IconProps) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></Icon>
export const Camera = (p: IconProps) => <Icon {...p}><path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="12" cy="13" r="3.5" /></Icon>
export const Palette = (p: IconProps) => <Icon {...p}><path d="M12 3a9 9 0 100 18 2 2 0 001.7-3.1 2 2 0 011.7-3.1H18a3 3 0 003-3A9 9 0 0012 3z" /><circle cx="7.5" cy="12" r="1" /><circle cx="10" cy="8" r="1" /><circle cx="15" cy="8.5" r="1" /></Icon>
export const Replay = (p: IconProps) => <Icon {...p}><path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" /><path d="M3 3v5h5" /><path d="M12 8v4.5l3 2" /></Icon>
export const Code = (p: IconProps) => <Icon {...p}><path d="M8 6l-6 6 6 6M16 6l6 6-6 6" /></Icon>
export const Check = (p: IconProps) => <Icon {...p} d="M5 13l4 4L19 7" />
export const X = (p: IconProps) => <Icon {...p} d="M6 6l12 12M6 18L18 6" />
export const Search = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5" /></Icon>
export const Info = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Icon>
export const Warn = (p: IconProps) => <Icon {...p}><path d="M12 3L2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></Icon>
export const ErrorIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></Icon>
export const OK = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></Icon>
export const Chevron = (p: IconProps) => <Icon {...p} d="M9 6l6 6-6 6" />
export const Download = (p: IconProps) => <Icon {...p}><path d="M12 4v12M12 16l-4-4M12 16l4-4" /><path d="M4 20h16" /></Icon>
export const Layers = (p: IconProps) => <Icon {...p}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></Icon>
export const Building = (p: IconProps) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 8h0M15 8h0M9 12h0M15 12h0M9 16h0M15 16h0" /></Icon>
export const Sparkles = (p: IconProps) => <Icon {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></Icon>
export const Ruler = (p: IconProps) => <Icon {...p}><path d="M3 17l14-14 4 4L7 21z" /><path d="M7.5 8.5l2 2M10.5 5.5l2 2M4.5 11.5l2 2" /></Icon>
export const ArrowRight = (p: IconProps) => <Icon {...p} d="M5 12h14M13 5l7 7-7 7" />
export const Menu = (p: IconProps) => <Icon {...p} d="M4 7h16M4 12h16M4 17h16" />
export const FileIfc = (p: IconProps) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /><polyline points="9 9 10 9 10 11" /></Icon>
export const Zap = (p: IconProps) => <Icon {...p} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
export const Lock = (p: IconProps) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></Icon>
export const Shield = (p: IconProps) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
export const Globe = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" /></Icon>
export const Comment = (p: IconProps) => <Icon {...p}><path d="M21 11.5a8.38 8.38 0 01-9 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.2A8.5 8.5 0 0112 3a8.38 8.38 0 019 8.5z" /></Icon>

// ── Video editor transport & tracks ────────────────────────────────────────────
export const Play = (p: IconProps) => <Icon {...p} fill="currentColor" strokeWidth={1}><path d="M7 4.5l12 7.5-12 7.5z" /></Icon>
export const Pause = (p: IconProps) => <Icon {...p} fill="currentColor" strokeWidth={1}><rect x="6.5" y="4.5" width="4" height="15" rx="1" /><rect x="13.5" y="4.5" width="4" height="15" rx="1" /></Icon>
export const SkipStart = (p: IconProps) => <Icon {...p} fill="currentColor" strokeWidth={1}><rect x="4" y="5" width="2.5" height="14" rx="1" /><path d="M20 5.5v13L9 12z" /></Icon>
export const SkipEnd = (p: IconProps) => <Icon {...p} fill="currentColor" strokeWidth={1}><rect x="17.5" y="5" width="2.5" height="14" rx="1" /><path d="M4 5.5v13L15 12z" /></Icon>
export const StepBack = (p: IconProps) => <Icon {...p} d="M15 5l-7 7 7 7" />
export const StepFwd = (p: IconProps) => <Icon {...p} d="M9 5l7 7-7 7" />
export const Loop = (p: IconProps) => <Icon {...p}><path d="M4 9a4 4 0 014-4h9l-2.5-2.5M20 15a4 4 0 01-4 4H7l2.5 2.5" /></Icon>
export const TypeTool = (p: IconProps) => <Icon {...p}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></Icon>
export const Music = (p: IconProps) => <Icon {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></Icon>
export const Film = (p: IconProps) => <Icon {...p}><rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="M7 4v16M17 4v16M2.5 12h19M2.5 8h4.5M2.5 16h4.5M17 8h4.5M17 16h4.5" /></Icon>
export const Trash = (p: IconProps) => <Icon {...p}><path d="M4 7h16M10 7V5a1 1 0 011-1h2a1 1 0 011 1v2" /><path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" /></Icon>
export const Plus = (p: IconProps) => <Icon {...p} d="M12 5v14M5 12h14" />
export const Transition = (p: IconProps) => <Icon {...p}><rect x="2.5" y="5" width="8" height="14" rx="1.5" /><rect x="13.5" y="5" width="8" height="14" rx="1.5" /><path d="M10.5 12h3" /></Icon>
export const Sliders = (p: IconProps) => <Icon {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h8M16 18h4" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="14" cy="18" r="2" /></Icon>
