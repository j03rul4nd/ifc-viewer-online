import type { SectionProps } from '../registry'
import { Head, Primary, Empty } from '../ui'

/** Team plan screen. Pro accounts never reach it: the shell shows LockedSection instead. */
export default function Team({ data }: SectionProps) {
  return (
    <>
      <Head title="Team" sub={`${data.account.org} · 5 seats, shared credits`} action={<Primary>Invite a colleague</Primary>} />
      <Empty title="Only you so far" body="Invite colleagues to share projects, credits and certificates. Each seat gets its own login; billing stays with you." />
    </>
  )
}
