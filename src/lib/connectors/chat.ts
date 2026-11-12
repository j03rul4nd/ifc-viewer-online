// Notices to Microsoft Teams and Slack through their incoming webhooks: the
// company pastes a URL it created in its own workspace, no app to install.
//   Slack: Incoming Webhooks, Block Kit body.
//   Teams: Workflows "post to a channel when a webhook request is received"
//          (replaces the retired Office 365 connectors), Adaptive Card body.
import type { Fetch } from './types'

export type ChatTarget = 'slack' | 'teams'

export interface ChatNotice {
  title: string
  text: string
  /** Link to the exact view (model + camera + issue). */
  url: string
  linkLabel: string
  tone: 'ok' | 'warn' | 'fail'
}

const EMOJI = { ok: ':white_check_mark:', warn: ':warning:', fail: ':x:' } as const
const COLOR = { ok: 'Good', warn: 'Warning', fail: 'Attention' } as const

export function slackBody(n: ChatNotice) {
  return {
    text: `${n.title} — ${n.url}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `${EMOJI[n.tone]} *${n.title}*\n${n.text}` } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: n.linkLabel }, url: n.url }] },
    ],
  }
}

export function teamsBody(n: ChatNotice) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: n.title, weight: 'Bolder', size: 'Medium', color: COLOR[n.tone], wrap: true },
          { type: 'TextBlock', text: n.text, wrap: true },
        ],
        actions: [{ type: 'Action.OpenUrl', title: n.linkLabel, url: n.url }],
      },
    }],
  }
}

/** Only the providers' own webhook hosts: a pasted URL can never point elsewhere. */
export function chatTargetFor(url: string): ChatTarget | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    if (u.hostname === 'hooks.slack.com') return 'slack'
    if (/\.logic\.azure\.com$/.test(u.hostname) || /\.webhook\.office\.com$/.test(u.hostname) || /\.environment\.api\.powerplatform\.com$/.test(u.hostname)) return 'teams'
    return null
  } catch {
    return null
  }
}

export async function sendChatNotice(fetchFn: Fetch, url: string, n: ChatNotice): Promise<{ ok: boolean; status: number }> {
  const target = chatTargetFor(url)
  if (!target) throw new Error('Not a Slack or Teams incoming webhook URL')
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(target === 'slack' ? slackBody(n) : teamsBody(n)),
  })
  return { ok: res.ok, status: res.status }
}
