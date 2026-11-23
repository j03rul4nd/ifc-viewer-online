// Shared by the Thank you and Order status targets: the bought products' model files,
// "Open in 3D" and (if the merchant turns them on) add-ons.
import { useEffect, useState } from 'preact/hooks'
import { PRODUCTS_QUERY, idsFor, lineItems, modelCards, shopUrlOf } from '../../../ui-shared/ifcvo-files.js'
import { ModelCard } from '../../../ui-shared/ModelCard.jsx'

export function OrderFiles({ source }) {
  const api = shopify
  const items = lineItems(api.lines.value)
  const key = items.map((i) => i.variantId || i.productId).join(',')
  const [state, setState] = useState({ loading: true, cards: [], shopUrl: '' })

  useEffect(() => {
    let live = true
    const ids = idsFor(items)
    if (!ids.length) { setState({ loading: false, cards: [], shopUrl: '' }); return }
    api.query(PRODUCTS_QUERY, { variables: { ids } })
      .then((res) => {
        if (!live) return
        const data = res && res.data
        setState({ loading: false, cards: modelCards(items, data), shopUrl: shopUrlOf(data) || api.shop.storefrontUrl || '' })
      })
      .catch(() => { if (live) setState({ loading: false, cards: [], shopUrl: '' }) })
    return () => { live = false }
  }, [key])

  if (state.loading || !state.cards.length) return null
  const t = (k, v) => String(api.i18n.translate(k, v))
  const formatDate = (iso) => api.i18n.formatDate(new Date(iso + 'T12:00:00Z'), { dateStyle: 'medium' })
  const settings = api.settings.value || {}
  const showAddons = settings.show_addons !== false
  return (
    <s-section heading={t('title')}>
      <s-stack gap="base">
        <s-text color="subdued">{t('intro')}</s-text>
        {state.cards.map((c) => (
          <ModelCard key={c.productId + c.variantId} info={c} shopUrl={state.shopUrl} t={t} formatDate={formatDate} source={source} showAddons={showAddons} />
        ))}
      </s-stack>
    </s-section>
  )
}
