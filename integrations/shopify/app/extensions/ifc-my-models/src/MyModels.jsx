// "My models & files": every product the signed-in buyer bought that has an IFC model
// or files (ifcvo / custom metafields), with version, updated date and "Open in 3D".
// Orders come from the Customer Account API; product data from the Storefront API.
import '@shopify/ui-extensions/preact'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ORDERS_QUERY, PRODUCTS_QUERY, idsFor, modelCards, purchasedItems, shopUrlOf } from '../../../ui-shared/ifcvo-files.js'
import { ModelCard } from '../../../ui-shared/ModelCard.jsx'

const CUSTOMER_API = 'shopify://customer-account/api/2026-10/graphql.json'

export default async () => {
  render(<MyModels />, document.body)
}

async function load() {
  const res = await fetch(CUSTOMER_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: ORDERS_QUERY }) })
  if (!res.ok) throw new Error('orders ' + res.status)
  const items = purchasedItems((await res.json()).data)
  const ids = idsFor(items)
  if (!ids.length) return { cards: [], shopUrl: '' }
  const data = (await shopify.query(PRODUCTS_QUERY, { variables: { ids } })).data
  return { cards: modelCards(items, data), shopUrl: shopUrlOf(data) }
}

function MyModels() {
  const [state, setState] = useState({ status: 'loading', cards: [], shopUrl: '' })
  useEffect(() => {
    let live = true
    load()
      .then((r) => { if (live) setState({ status: 'ready', ...r }) })
      .catch(() => { if (live) setState({ status: 'error', cards: [], shopUrl: '' }) })
    return () => { live = false }
  }, [])

  const t = (k, v) => String(shopify.i18n.translate(k, v))
  const formatDate = (iso) => shopify.i18n.formatDate(new Date(iso + 'T12:00:00Z'), { dateStyle: 'medium' })
  return (
    <s-page heading={t('title')}>
      <s-section>
        {state.status === 'loading' ? (
          <s-spinner accessibilityLabel={t('loading')} />
        ) : state.status === 'error' ? (
          <s-banner tone="critical">{t('error')}</s-banner>
        ) : !state.cards.length ? (
          <s-text color="subdued">{t('empty')}</s-text>
        ) : (
          <s-stack gap="large">
            <s-text color="subdued">{t('intro')}</s-text>
            {state.cards.map((c, i) => (
              <s-stack key={c.productId + c.variantId} gap="large">
                {i ? <s-divider /> : null}
                <ModelCard info={c} shopUrl={state.shopUrl} t={t} formatDate={formatDate} source="ifc_account" showOrder />
              </s-stack>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  )
}
