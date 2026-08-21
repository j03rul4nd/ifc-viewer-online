/** True when the build enables 3D video resources (`VITE_FEATURE_VIDEO=true|1`). */
export function isVideoEnabled(): boolean {
  const value = import.meta.env.VITE_FEATURE_VIDEO as string | undefined
  return value === 'true' || value === '1'
}
