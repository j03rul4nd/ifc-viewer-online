// Small shared pieces of the Reception screens: dates, verdict chips, naming issue text.

import type { NamingIssue } from '../../../../lib/requirements/iso-naming'
import { Dot } from '../../ui'
import type { Rx } from './strings'
import type { Verdict } from './sample'

export const fmtDate = (iso: string, lang: string, withTime = true) =>
  new Intl.DateTimeFormat(lang, withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' } : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(iso))

export const short = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-4)}`

const VERDICT: Record<Verdict, [string, string]> = {
  pending: ['To review', 'var(--warn)'],
  accepted: ['Accepted', 'var(--ok)'],
  returned: ['Returned', 'var(--danger)'],
}

export function VerdictChip({ verdict, rx }: { verdict: Verdict; rx: Rx }) {
  const [label, color] = VERDICT[verdict]
  return <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={color} />{rx(label)}</span>
}

/** The English labels above, for the strings test. */
export const VERDICT_LABELS = Object.values(VERDICT).map((v) => v[0])

export function namingIssueText(i: NamingIssue, rx: Rx): string {
  switch (i.code) {
    case 'fieldCount': return rx('{{got}} fields instead of {{expected}}', { got: i.got, expected: i.expected })
    case 'empty': return rx('{{field}} is empty', { field: rx(i.field) })
    case 'chars': return rx('{{field}} “{{value}}” has characters that are not letters or digits', { field: rx(i.field), value: i.value })
    case 'value': return rx('{{field}} “{{value}}” is not an agreed code', { field: rx(i.field), value: i.value })
    case 'case': return rx('{{field}} “{{value}}” should be “{{expected}}”', { field: rx(i.field), value: i.value, expected: i.expected })
    case 'length': return rx('{{field}} “{{value}}” should have {{min}}–{{max}} characters', { field: rx(i.field), value: i.value, min: i.min ?? 1, max: i.max ?? '…' })
    case 'digits': return rx('{{field}} “{{value}}” should be digits only', { field: rx(i.field), value: i.value })
    case 'statusMissing': return rx('No status code (S0–S4)')
    case 'status': return rx('Status {{value}} is not one of {{allowed}}', { value: i.value, allowed: i.allowed.join(', ') })
    case 'revisionMissing': return rx('No revision (P01, C01…)')
    case 'revisionStatus': return rx('Revision {{revision}} does not go with status {{status}}', { revision: i.revision, status: i.status })
    default: return rx('IfcProject does not carry the same status and revision')
  }
}

/** Field labels of the naming rule, shown translated. */
export const FIELD_LABELS = ['Project', 'Originator', 'Volume', 'Level', 'Type', 'Role', 'Number']
