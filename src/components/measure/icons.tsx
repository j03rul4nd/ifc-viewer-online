// ─── Measurement & section icons ──────────────────────────────────────────────
// 16px line icons drawn for these tools. Stroke = currentColor.

import React from 'react'

type IconProps = { size?: number; className?: string }

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  )
}

export const DistanceIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 11.5l11-7" /><path d="M2 9.2l1.4 2.3M12.6 3.9l1.4 2.3" /><circle cx="2.5" cy="11.5" r="1" fill="currentColor" /><circle cx="13.5" cy="4.5" r="1" fill="currentColor" /></Svg>
)
export const PathIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 12.5L6 6l4 5 4-7.5" /><circle cx="2" cy="12.5" r="1" fill="currentColor" /><circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="10" cy="11" r="1" fill="currentColor" /><circle cx="14" cy="3.5" r="1" fill="currentColor" /></Svg>
)
export const AreaIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 4.5l7-2 4 6-5 5.5-6-3z" fill="currentColor" fillOpacity="0.18" /></Svg>
)
export const AngleIcon = (p: IconProps) => (
  <Svg {...p}><path d="M13.5 13H2.5L10 2.5" /><path d="M6.8 13a4.4 4.4 0 0 0-1.9-3.4" /></Svg>
)
export const PointIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="2" fill="currentColor" /><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" /></Svg>
)
export const PerpendicularIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 13.5h12M8 13.5V2.5" /><path d="M8 10.5h3v3" /></Svg>
)
export const FaceIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 5l5.5-3 5.5 3v6L8 14l-5.5-3z" /><path d="M2.5 5L8 8l5.5-3M8 8v6" fill="none" /><path d="M8 8l5.5-3v6L8 14z" fill="currentColor" fillOpacity="0.25" stroke="none" /></Svg>
)
export const PointsIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 12l3-7 5 2 2 6z" /><circle cx="3" cy="12" r="1" fill="currentColor" /><circle cx="6" cy="5" r="1" fill="currentColor" /><circle cx="11" cy="7" r="1" fill="currentColor" /><circle cx="13" cy="13" r="1" fill="currentColor" /></Svg>
)
export const EyeIcon = ({ off, ...p }: IconProps & { off?: boolean }) => (
  <Svg {...p}>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
    {off && <path d="M2.5 13.5l11-11" />}
  </Svg>
)
export const TargetIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" /><circle cx="8" cy="8" r="1.6" /></Svg>
)
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" /></Svg>
)
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" /></Svg>
)
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></Svg>
)
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 8.5l3 3 7-7" /></Svg>
)
export const UndoIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5.5 3L2.5 6l3 3" /><path d="M2.5 6h7a4 4 0 0 1 0 8h-3" /></Svg>
)
export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </Svg>
)
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 2v8.5M4.5 7L8 10.5 11.5 7M2.5 13.5h11" /></Svg>
)
export const FlipIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 1.5v13" strokeDasharray="1.5 1.5" /><path d="M6 4.5L2 8l4 3.5z" /><path d="M10 4.5L14 8l-4 3.5" /></Svg>
)
export const PlanCutIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 6.5L8 3.5l6 3-6 3z" fill="currentColor" fillOpacity="0.2" /><path d="M2 6.5v4l6 3 6-3v-4" strokeOpacity="0.55" /></Svg>
)
export const ElevationCutIcon = ({ axis, ...p }: IconProps & { axis: 'x' | 'y' }) => (
  <Svg {...p}>
    <path d="M3 13.5V5l5-3 5 3v8.5z" strokeOpacity="0.55" />
    {axis === 'x'
      ? <path d="M8 1.5v12.5" strokeWidth="2" />
      : <path d="M2 9h12" strokeWidth="2" />}
  </Svg>
)
export const BoxIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 5L8 2l5.5 3v6L8 14l-5.5-3z" /><path d="M2.5 5L8 8l5.5-3M8 8v6" /><circle cx="8" cy="2" r="1" fill="currentColor" /><circle cx="13.5" cy="11" r="1" fill="currentColor" /></Svg>
)
export const ChevronIcon = ({ open, ...p }: IconProps & { open?: boolean }) => (
  <Svg {...p}><path d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} /></Svg>
)
