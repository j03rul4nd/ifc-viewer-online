// Order status block: when this order has an IFC product, link to "My models & files".
import '@shopify/ui-extensions/preact'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { PRODUCTS_QUERY, idsFor, lineItems, modelCards } from '../../../ui-shared/ifcvo-files.js'

export default async () => {
  render(<OrderStatusLink />, document.body)
}

function OrderStatusLink() {
  const items = lineItems(shopify.lines.value)
  const key = items.map((i) => i.variantId || i.productId).join(',')
  const [count, setCount] = useState(0)
  useEffect(() => {
    let live = true
    const ids = idsFor(items)
    if (!ids.length) return
    shopify.query(PRODUCTS_QUERY, { variables: { ids } })
      .then((res) => { if (live) setCount(modelCards(items, res && res.data).length) })
      .catch(() => {})
    return () => { live = false }
  }, [key])
  if (!count) return null
  const t = (k, v) => String(shopify.i18n.translate(k, v))
  return (
    <s-section heading={t('title')}>
      <s-stack gap="small-200">
        <s-text color="subdued">{t('linkIntro', { count })}</s-text>
        <s-link href="extension:/">{t('linkCta')}</s-link>
      </s-stack>
    </s-section>
  )
}
