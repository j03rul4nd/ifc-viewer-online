// ─── cloudAccountStore ────────────────────────────────────────────────────────
// Eager, tiny, and CLERK-FREE by design (I-1): this store is the only thing the
// anonymous bundle knows about accounts. The lazy ClerkSessionBridge (inside
// the vendor-auth chunk, mounted by main.tsx only when a publishable key
// exists) is the single writer of the session fields.
//
// Components never import @clerk/* — they read this store (or the
// useEntitlement() hook built on it) and call the injected callbacks.

import { create } from 'zustand'

export type CloudAccountStatus =
  | 'disabled' // no VITE_CLERK_PUBLISHABLE_KEY — accounts do not exist
  | 'loading' // key present, Clerk chunk still initialising
  | 'anonymous' // Clerk ready, no session
  | 'signed-in'

export interface PlanCache {
  plan: 'free' | 'pro' | 'org'
  planStatus: 'active' | 'past_due' | 'canceled'
}

interface CloudAccountState {
  status: CloudAccountStatus
  userId: string | null
  /** Display-only (shown to the signed-in user themself; never sent anywhere). */
  email: string | null
  /** Clerk publicMetadata cache — instant, no network (PATTERNS §1.1). */
  planCache: PlanCache | null
  /** Session JWT getter, injected by the bridge. */
  getToken: (() => Promise<string | null>) | null
  /** Injected by the bridge. */
  signOut: (() => Promise<void>) | null

  // ── Writers (bridge only) ────────────────────────────────────────────────
  setSession: (s: Pick<CloudAccountState, 'status' | 'userId' | 'email' | 'planCache' | 'getToken' | 'signOut'>) => void
  /** refresh() result lands here so every consumer re-renders. */
  setPlanCache: (p: PlanCache | null) => void
}

export const isAccountEnabled = (): boolean =>
  Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

export const useCloudAccountStore = create<CloudAccountState>()((set) => ({
  status: isAccountEnabled() ? 'loading' : 'disabled',
  userId: null,
  email: null,
  planCache: null,
  getToken: null,
  signOut: null,

  setSession: (s) => set(s),
  setPlanCache: (planCache) => set({ planCache }),
}))
