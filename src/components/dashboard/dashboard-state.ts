// Which variant of /dashboard a user sees. Kept apart from the view so it can
// be tested without React.

export type DashboardState = 'anonymous' | 'free_empty' | 'free_active' | 'pro' | 'team' | 'past_due'

export function pageState(
  status: string,
  plan: 'free' | 'pro' | 'org',
  planStatus: string,
  certCount: number,
): DashboardState {
  if (status !== 'signed-in') return 'anonymous'
  if (planStatus === 'past_due') return 'past_due'
  if (plan === 'org') return 'team'
  if (plan === 'pro') return 'pro'
  return certCount > 0 ? 'free_active' : 'free_empty'
}
