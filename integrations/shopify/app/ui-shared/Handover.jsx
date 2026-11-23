// Handover pack of one bought product (customer account only): handover files,
// warranty end date and assembly steps that open the product-page viewer at each
// saved view. A file list, never a server-side ZIP.
import { useState } from 'preact/hooks'
import { stepUrl, warrantyUntil } from './ifcvo-files.js'

/**
 * @param {{ info: any, shopUrl: string, t: (key: string, values?: object) => string,
 *   formatDate?: (iso: string) => string, source: string }} props
 */
export function Handover({ info, shopUrl, t, formatDate, source }) {
  const steps = info.steps || []
  const files = info.handover || []
  const [i, setI] = useState(0)
  const until = warrantyUntil(info)
  if (!steps.length && !files.length && !until) return null
  const at = Math.min(i, Math.max(steps.length - 1, 0))
  const step = steps[at]
  const href = step ? stepUrl(info, shopUrl, step, source) : ''
  return (
    <s-stack gap="small-200">
      <s-text type="strong">{t('handoverTitle')}</s-text>
      {until ? <s-text>{t('warrantyUntil', { date: formatDate ? formatDate(until) : until })}</s-text> : null}
      {files.length ? (
        <s-stack gap="small-300">
          {files.map((f) => (
            <s-link key={f.url} href={f.url} target="_blank">
              {f.kind ? `${f.name} (${f.kind})` : f.name}
            </s-link>
          ))}
        </s-stack>
      ) : null}
      {step ? (
        <s-stack gap="small-200">
          <s-text color="subdued">{t('stepOf', { step: at + 1, total: steps.length })}</s-text>
          <s-text type="strong">{step.title}</s-text>
          {step.note ? <s-text>{step.note}</s-text> : null}
          <s-stack direction="inline" gap="base">
            <s-button variant="secondary" disabled={at === 0} onClick={() => setI(at - 1)}>{t('stepPrev')}</s-button>
            <s-button variant="secondary" disabled={at >= steps.length - 1} onClick={() => setI(at + 1)}>{t('stepNext')}</s-button>
            {href ? <s-button href={href} target="_blank">{t('stepOpen')}</s-button> : null}
          </s-stack>
        </s-stack>
      ) : null}
    </s-stack>
  )
}
