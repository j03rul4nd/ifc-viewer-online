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
  /** Whether the account modal is open — any component can request it (I-1: no
   *  Clerk import needed to trigger the lazy modal). */
  accountModalOpen: boolean
  /** Whether the "what would help you most" form is open. Anonymous users can
   *  fill it too; sending asks them to sign in and keeps their answer. */
  featureRequestOpen: boolean
  /** Where the form was opened from ("account", "large_file:320"…): context for the answer. */
  featureRequestSource: string
  /** What the form starts on: a chosen feature, words already written, or the user's list. */
  featureRequestPreset: FeatureRequestPreset

  // ── Writers (bridge only) ────────────────────────────────────────────────
  setSession: (s: Pick<CloudAccountState, 'status' | 'userId' | 'email' | 'planCache' | 'getToken' | 'signOut'>) => void
  /** refresh() result lands here so every consumer re-renders. */
  setPlanCache: (p: PlanCache | null) => void
  setAccountModalOpen: (open: boolean) => void
  setFeatureRequestOpen: (open: boolean) => void
}

/** Open the account modal from anywhere (upsell CTAs, ruleset picker). */
export const openAccountModal = (): void =>
  useCloudAccountStore.getState().setAccountModalOpen(true)

export interface FeatureRequestPreset {
  feature?: string
  need?: string
  view?: 'form' | 'mine'
  /** The answer came back after signing in: say so and make sending one tap. */
  resumed?: boolean
  /** The optional answers to restore with it (validated by the form). */
  detail?: Record<string, unknown>
}

/** Open "what would help you most". Works signed in or not: anonymous users
 *  choose first and sign in only to send. `source` says where it was opened
 *  from; `preset` lets that place start the form on the right answer. */
export const openFeatureRequest = (source = 'unknown', preset: FeatureRequestPreset = {}): void => {
  useCloudAccountStore.setState({ featureRequestSource: source, featureRequestPreset: preset, featureRequestOpen: true })
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
  accountModalOpen: false,
  featureRequestOpen: false,
  featureRequestSource: 'unknown',
  featureRequestPreset: {},

  setSession: (s) => set(s),
  setPlanCache: (planCache) => set({ planCache }),
  setAccountModalOpen: (accountModalOpen) => set({ accountModalOpen }),
  setFeatureRequestOpen: (featureRequestOpen) => set({ featureRequestOpen }),
}))
