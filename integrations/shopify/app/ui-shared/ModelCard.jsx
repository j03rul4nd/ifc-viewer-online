// One bought IFC product: title, version / updated date, model + files, "Open in 3D",
// optional add-ons. Polaris web components only (works in checkout and customer account).
import { addonCartUrl, open3dUrl } from './ifcvo-files.js'

/**
 * @param {{ info: any, shopUrl: string, t: (key: string, values?: object) => string,
 *   formatDate?: (iso: string) => string, source: string, showAddons?: boolean, showOrder?: boolean }} props
 */
export function ModelCard({ info, shopUrl, t, formatDate, source, showAddons, showOrder }) {
  const open = open3dUrl(info, shopUrl, source)
  const date = (iso) => (iso && formatDate ? formatDate(iso) : iso)
  const files = info.model ? [info.model, ...info.files] : info.files
  const meta = [
    info.version ? t('version', { version: info.version }) : '',
    info.updated ? t('updated', { date: date(info.updated) }) : '',
    showOrder && info.orderName ? t('order', { order: info.orderName }) : '',
  ].filter(Boolean)
  const addons = showAddons ? info.addons.filter((a) => a.available) : []
  return (
    <s-stack gap="small-200">
      <s-stack direction="inline" gap="base" alignItems="center">
        {info.image ? <s-product-thumbnail src={info.image} size="small" /> : null}
        <s-stack gap="none">
          <s-text type="strong">{info.title}</s-text>
          {info.variantTitle ? <s-text color="subdued">{info.variantTitle}</s-text> : null}
          {meta.length ? <s-text color="subdued">{meta.join(' · ')}</s-text> : null}
        </s-stack>
        {info.updatedSincePurchase ? <s-badge>{t('newVersion')}</s-badge> : null}
      </s-stack>
      {info.updatedSincePurchase && info.releaseNotes ? (
        <s-stack gap="none">
          <s-text type="strong">{t('whatChanged')}</s-text>
          <s-text>{info.releaseNotes}</s-text>
        </s-stack>
      ) : null}
      {files.length ? (
        <s-stack gap="small-300">
          {files.map((f) => (
            <s-link key={f.url} href={f.url} target="_blank">
              {f.kind ? `${f.name} (${f.kind})` : f.name}
            </s-link>
          ))}
        </s-stack>
      ) : null}
      {open ? (
        <s-stack direction="inline">
          <s-button href={open} target="_blank" variant="secondary">{t('open3d')}</s-button>
        </s-stack>
      ) : null}
      {addons.length ? (
        <s-stack gap="small-200">
          <s-text type="strong">{t('addonsTitle')}</s-text>
          {addons.map((a) => {
            const href = addonCartUrl(shopUrl, a.variantId, source + '_addon')
            return href ? (
              <s-stack key={a.variantId} direction="inline" gap="base" alignItems="center">
                {a.image ? <s-product-thumbnail src={a.image} size="small-100" /> : null}
                <s-text>{a.title}</s-text>
                <s-link href={href} target="_blank">{t('addToCart')}</s-link>
              </s-stack>
            ) : null
          })}
        </s-stack>
      ) : null}
    </s-stack>
  )
}
