// The studio brand (logo as a data URL + name) shared by the Pro screens:
// certificates, folder reports and the client view. In memory only (preview).

import { useSyncExternalStore } from 'react'
import { SAMPLE_BRAND } from './pro-sample'
import type { Brand } from './pro-reports'

let brand: Brand = { studio: SAMPLE_BRAND.studio, logo: null }
const subs = new Set<() => void>()

export function setBrand(patch: Partial<Brand>) {
  brand = { ...brand, ...patch }
  subs.forEach((f) => f())
}

export function useBrand(): Brand {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => brand, () => brand)
}

/** Reads an image file as a data URL so printed reports in a new tab can show it. */
export function readAsDataUrl(f: Blob): Promise<string> {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(r.error); r.readAsDataURL(f) })
}
