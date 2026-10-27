// ─── Guided tours of the paid workspace ──────────────────────────────────────
// One short tour per screen: what each part is for and what to do with it,
// in the user's words, never a feature list. A step points at a `data-tour`
// anchor; steps whose anchor is not on screen (empty account, phone layout)
// are skipped instead of pointing at nothing. Tours never start on their own:
// first visit shows a one-line offer, and every tour can be replayed from the
// page, Help & support and the account menu. Pure data + helpers.

export interface TourStep {
  /** `data-tour` value; omitted = a centred card with no highlight. */
  target?: string
  title: string
  body: string
}

export interface Tour {
  id: string
  /** Section id (URL segment) the tour belongs to; sub-pages use `section/sub`. */
  section: string
  title: string
  /** One line for the offer and the tours list. */
  summary: string
  steps: TourStep[]
}

export const TOURS: Tour[] = [
  {
    id: 'overview', section: 'overview', title: 'Your workspace', summary: 'Where to look first each morning.',
    steps: [
      { target: 'setup', title: 'Start here', body: 'Five steps take a new account to its first certificate. The highlighted one is next; the rest can wait.' },
      { target: 'attention', title: 'Needs your attention', body: 'Only what changed for the worse: a delivery that scored lower, a job that failed, credits running out. Empty means nothing to do.' },
      { target: 'credits', title: 'Credits', body: 'Plan credits renew monthly and are spent first; pack credits last 12 months. Cloud jobs show their cost before they run.' },
      { target: 'running', title: 'Running jobs', body: 'Real progress of cloud jobs, step by step. You can close the tab: results wait for you in Cloud jobs.' },
      { target: 'projects', title: 'Projects at a glance', body: 'Latest Health Score per project and how it moved since the previous delivery. A drop shows in red.' },
      { target: 'usage', title: 'Where the credits went', body: 'This period, by tool. Refunds for jobs that failed on our side are already deducted.' },
      { target: 'page-action', title: 'Run a cloud job', body: 'Auto-fix, large-file validation, clash detection… pick one, see the cost, confirm.' },
    ],
  },
  {
    id: 'projects', section: 'projects', title: 'Projects', summary: 'Keep every delivery of a model and its score.',
    steps: [
      { target: 'page-action', title: 'One project per model', body: 'Create a project for each model you deliver. Every new version is scored against the same requirements, so the history is comparable.' },
      { target: 'project-search', title: 'Find and sort', body: 'Search by project or client. “Lowest score first” puts the projects that need work at the top.' },
      { target: 'project-list', title: 'Open a project', body: 'Click a name to see its deliveries, jobs, certificates and settings. Each project has its own link you can send to a colleague.' },
    ],
  },
  {
    id: 'project', section: 'projects/detail', title: 'A project', summary: 'Deliveries, comparisons and alerts for one model.',
    steps: [
      { target: 'kpis', title: 'The three numbers', body: 'Latest score, open issues and number of deliveries — what a client asks first.' },
      { target: 'score-history', title: 'Score per delivery', body: 'Each point is one version. The table below says what was new and what was fixed each time.' },
      { target: 'tabs', title: 'Everything about this model', body: 'Deliveries, the cloud jobs run on it, certificates issued and its settings, including which requirements it is checked against.' },
      { target: 'page-action', title: 'Add the next delivery', body: 'Upload the new version; it is compared with the previous one automatically.' },
    ],
  },
  {
    id: 'jobs', section: 'jobs', title: 'Cloud jobs', summary: 'What runs on our servers and what it cost.',
    steps: [
      { target: 'page-action', title: 'Start a job', body: 'For what a browser can’t do: a clean IFC back, files over 200 MB, clashes, deep geometry. The cost is shown before it runs.' },
      { target: 'job-list', title: 'Results and refunds', body: 'Done jobs keep their result; corrected files download for 7 days. A job that fails on our side gets its credits back — struck through here.' },
    ],
  },
  {
    id: 'certificates', section: 'certificates', title: 'Certificates', summary: 'Proof your client can check with one link.',
    steps: [
      { target: 'cert-list', title: 'What a certificate proves', body: 'This file, these checks, this date. The link shows the fingerprint and the result — never the model itself.' },
      { target: 'cert-list', title: 'Share or revoke', body: 'Copy the link or the badge for your report. Revoke a certificate if the model was superseded; the link then says so.' },
    ],
  },
  {
    id: 'scenes', section: 'scenes', title: 'Scenes', summary: 'Saved views with their live data.',
    steps: [
      { target: 'page-action', title: 'A scene keeps everything together', body: 'Camera, models, map and live data, ready to present, share or embed. New scenes start with your default data sources.' },
      { target: 'scene-list', title: 'What each scene reads', body: '“Live data” lists the sources switched on in that scene. Open one to change them for that scene only.' },
    ],
  },
  {
    id: 'scene', section: 'scenes/detail', title: 'Data in a scene', summary: 'Turn sources on, slow them down or filter them — here only.',
    steps: [
      { target: 'scene-sources', title: 'Inherited from your saved sources', body: 'Each row starts as you saved it under Data sources. “Default” means nothing was changed here.' },
      { target: 'scene-sources', title: 'Change it for this scene', body: 'Switch a source off, refresh it less often or show only some records (for example floor = 3). The row then says “Changed here”; Reset undoes it.' },
    ],
  },
  {
    id: 'data', section: 'data', title: 'Data sources', summary: 'Connect sensors, APIs and databases once.',
    steps: [
      { target: 'data-explainer', title: 'Save once, reuse everywhere', body: 'A connection keeps the address, the key, how to read the data and how often. You set it up once; scenes reuse it.' },
      { target: 'page-action', title: 'New connection', body: 'Six short steps; every field says what to put and has an example. You test it before anything is saved.' },
      { target: 'connection-list', title: 'Is it working?', body: 'Status, records in the last 24 hours, and whether new scenes get it. Open a failing one to see why in plain words.' },
      { target: 'tabs', title: 'Keys live in their own tabs', body: 'Credentials are the keys we use to read your systems. API keys are for your systems to call us. Activity is the log.' },
    ],
  },
  {
    id: 'credentials', section: 'data/credentials', title: 'Credentials', summary: 'The keys and passwords your connections use.',
    steps: [
      { target: 'vault-note', title: 'Stored once, encrypted', body: 'After saving we only ever show the last four characters. If your firewall needs it, allow-list the gateway addresses here.' },
      { target: 'credential-list', title: 'Rotate in one place', body: 'Password changed? Replace it here and every connection using it recovers. Expiry dates show in amber before they bite.' },
    ],
  },
  {
    id: 'api-keys', section: 'data/api-keys', title: 'API keys', summary: 'Let CI, Node-RED or your app call us.',
    steps: [
      { target: 'page-action', title: 'One key per system', body: 'Name it after what uses it and tick only what it needs. The key is shown once — copy it straight into your secrets.' },
      { target: 'apikey-list', title: 'Revoke without fear', body: 'Last-used tells you if a key is still in use. Revoking stops it at once; nothing else is affected.' },
    ],
  },
  {
    id: 'billing', section: 'billing', title: 'Credits & billing', summary: 'Plan, credits, packs and invoices.',
    steps: [
      { target: 'credits', title: 'Your balance', body: 'Plan credits (renew monthly, used first) plus pack credits (12 months).' },
      { target: 'plan', title: 'Plan and card', body: 'Switch to yearly, upgrade, or cancel — cancelling asks why and keeps your plan until the period ends.' },
      { target: 'packs', title: 'Top up when a delivery needs it', body: 'One-off packs, no subscription change. Price per 100 credits and what that buys are on each card.' },
      { target: 'ledger', title: 'Every credit accounted for', body: 'Each use, grant, refund and expiry, with invoices next to it.' },
      { target: 'billing-details', title: 'Invoices with your company details', body: 'Company, address and VAT ID printed on every invoice; add a second email for accounts.' },
    ],
  },
  {
    id: 'settings', section: 'settings', title: 'Settings', summary: 'Profile, sign-in, alerts and defaults.',
    steps: [
      { target: 'tabs', title: 'Four areas', body: 'Profile, sign-in and devices, email alerts, and the defaults new projects start from.' },
      { target: 'profile', title: 'Your details', body: 'Company and name appear on certificates and invoices. Save only enables when something changed.' },
      { target: 'leaving', title: 'Leaving, without hunting for it', body: 'Cancel the plan or delete the account — both explain exactly what happens first.' },
    ],
  },
  {
    id: 'privacy', section: 'privacy', title: 'Privacy & data', summary: 'Copy, correct or delete your data.',
    steps: [
      { target: 'rights', title: 'Your rights are buttons', body: 'Request a copy, delete stored files or correct your details — no email needed.' },
      { target: 'inventory', title: 'What we keep, where, how long', body: 'Every kind of data, its location and its retention. Files opened in the free viewer never reach us.' },
      { target: 'delete-account', title: 'Deleting your account', body: '14 days to change your mind; invoices stay 6 years by law and unrevoked certificates stay verifiable.' },
    ],
  },
  {
    id: 'support', section: 'support', title: 'Help & support', summary: 'Answers, status and your requests.',
    steps: [
      { target: 'help-search', title: 'Search first', body: 'Short answers to the usual questions, without leaving the page.' },
      { target: 'status', title: 'Is it us?', body: 'If cloud jobs, certificates or payments have a problem, it shows here before you ask.' },
      { target: 'page-action', title: 'Write to a person', body: '“Report a problem” attaches the technical details we need — you see them and can remove them before sending.' },
      { target: 'requests', title: 'Conversations stay here', body: 'Every request and reply, so you never dig through email. Amber means we’re waiting for you.' },
    ],
  },
]

/** Steps of the connection wizard, keyed by the wizard step index. */
export const WIZARD_TOURS: Record<number, TourStep[]> = {
  0: [
    { target: 'arrival', title: 'How does the data arrive?', body: 'Pick who acts: we fetch it on a schedule, your system sends it, a live connection, a database or files in a folder. Not sure? The “?” says what to ask whoever runs the system.' },
    { target: 'protocol', title: 'Which kind', body: 'The protocol your source speaks. Each option says when it fits.' },
  ],
  1: [
    { target: 'field-url', title: 'Where it is', body: 'Paste the address from the provider’s docs, or use the example to see how it works.' },
    { target: 'field-broker', title: 'Broker', body: 'Host and port of your MQTT broker; mqtts:// for TLS.' },
    { target: 'field-topic', title: 'Topic', body: '+ matches one level, # the rest: building/hq/+/temperature reads every sensor of every room.' },
    { target: 'field-host', title: 'Host', body: 'Where the database or SFTP server listens, with its port.' },
    { target: 'field-query', title: 'Query', body: 'A read-only SELECT. {{since}} becomes the time of the last successful read, so you only fetch what changed.' },
    { target: 'webhook-intro', title: 'A private URL', body: 'We create it in the next step; your system POSTs to it.' },
    { target: 'credential', title: 'Credentials', body: 'Pick a saved key or add one. It is stored encrypted and reused by any connection that needs it.' },
  ],
  2: [
    { target: 'test', title: 'Test before saving', body: 'One request, the real response. If it fails we say why — wrong key, not reachable, blocked by a firewall.' },
    { target: 'webhook', title: 'Connect your system', body: 'Copy the URL and the signing secret into your system, or send the example request. This step completes when the first message arrives.' },
  ],
  3: [
    { target: 'mapping', title: 'We read it for you', body: 'From the test response we guessed the list of records, the id, where each record is and its time. Check the preview at the bottom and change any guess that’s wrong.' },
  ],
  4: [
    { target: 'schedule', title: 'How often', body: 'Every few seconds, once a day, or a cron line. It is repeated back in words with the next runs, so a typo shows before you save.' },
  ],
  5: [
    { target: 'save', title: 'Name it and decide for new scenes', body: 'On: every new scene starts with this source. Each scene can still change it without touching the saved connection.' },
  ],
}

export const tourForPath = (section: string, sub?: string): Tour | undefined =>
  TOURS.find((t) => t.section === (sub ? `${section}/${sub}` : section)) ?? (sub ? undefined : TOURS.find((t) => t.section === section))

// ── Placement ─────────────────────────────────────────────────────────────────

export interface Rect { top: number; left: number; width: number; height: number }

export type Placement = { mode: 'docked' } | { mode: 'float'; top: number; left: number; side: 'below' | 'above' | 'center' }

/**
 * Where the step card goes. On a phone it docks to the bottom edge (thumb
 * reach, never covers the highlighted thing's top). Elsewhere it sits below
 * the target if it fits, above if not, centred when there is no target —
 * always clamped inside the viewport with a margin.
 */
export function placeCard(target: Rect | null, card: { width: number; height: number }, view: { width: number; height: number }, gap = 12, margin = 16): Placement {
  if (view.width < 640) return { mode: 'docked' }
  const clampX = (x: number) => Math.max(margin, Math.min(x, view.width - card.width - margin))
  const clampY = (y: number) => Math.max(margin, Math.min(y, view.height - card.height - margin))
  if (!target) return { mode: 'float', top: clampY((view.height - card.height) / 2), left: clampX((view.width - card.width) / 2), side: 'center' }
  const left = clampX(target.left + target.width / 2 - card.width / 2)
  const below = target.top + target.height + gap
  if (below + card.height <= view.height - margin) return { mode: 'float', top: below, left, side: 'below' }
  const above = target.top - gap - card.height
  if (above >= margin) return { mode: 'float', top: above, left, side: 'above' }
  // Tall target: overlay the card on its lower part, still inside the view.
  return { mode: 'float', top: clampY(view.height - card.height - margin), left, side: 'below' }
}

// ── Seen tours (per browser) ──────────────────────────────────────────────────

const KEY = 'ws-tours-seen'

export function seenTours(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Set<string> {
  try { return new Set(JSON.parse(storage?.getItem(KEY) ?? '[]') as string[]) } catch { return new Set() }
}

export function markSeen(id: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeStorage()): void {
  try { const s = seenTours(storage); s.add(id); storage?.setItem(KEY, JSON.stringify([...s])) } catch { /* private mode: offers just show again */ }
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage !== 'undefined' ? localStorage : undefined } catch { return undefined }
}
