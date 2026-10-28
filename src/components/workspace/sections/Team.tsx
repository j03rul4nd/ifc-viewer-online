import type { SectionProps } from '../registry'
import { Head, Primary, Empty } from '../ui'
import { useTx } from '../i18n'

/** Team plan screen. Pro accounts never reach it: the shell shows LockedSection instead. */
export default function Team({ data }: SectionProps) {
  const tx = useTx()
  return (
    <>
      <Head title={tx("Team")} sub={tx('{{org}} · 5 seats, shared credits', { org: data.account.org })} action={<Primary>{tx("Invite a colleague")}</Primary>} />
      <Empty title={tx("Only you so far")} body={tx("Invite colleagues to share projects, credits and certificates. Each seat gets its own login; billing stays with you.")} />
    </>
  )
}
