// "Publish new version" (product page action in the Shopify admin). Saves the new
// version, the release day and the release notes as ifcvo metafields on the product.
// Buyers then see a "New version" badge and the notes in "My models & files".
import '@shopify/ui-extensions/preact'
import { render } from 'preact'
import { useState } from 'preact/hooks'
import { RELEASE_MUTATION, localDay, releaseInputs } from '../../../ui-shared/ifcvo-files.js'

const ADMIN_API = 'shopify:admin/api/graphql.json'

export default async () => {
  render(<PublishRelease />, document.body)
}

async function publish(ownerId, release) {
  const res = await fetch(ADMIN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: RELEASE_MUTATION, variables: { m: releaseInputs(ownerId, release) } }),
  })
  if (!res.ok) throw new Error('save')
  const json = await res.json()
  const errors = (json.errors || []).concat((json.data && json.data.metafieldsSet && json.data.metafieldsSet.userErrors) || [])
  if (errors.length) throw new Error('save')
}

function PublishRelease() {
  const t = (k, v) => String(shopify.i18n.translate(k, v))
  const ownerId = shopify.data && shopify.data.selected && shopify.data.selected[0] ? shopify.data.selected[0].id : ''
  const [version, setVersion] = useState('')
  const [date, setDate] = useState(localDay())
  const [notes, setNotes] = useState('')
  const [state, setState] = useState({ status: 'idle', error: '' })
  const val = (e) => String((e && e.currentTarget && e.currentTarget.value) || '')

  const onSave = () => {
    try { releaseInputs(ownerId, { version, date, notes }) } catch (e) {
      setState({ status: 'idle', error: e.message })
      return
    }
    setState({ status: 'saving', error: '' })
    publish(ownerId, { version, date, notes })
      .then(() => setState({ status: 'done', error: '' }))
      .catch(() => setState({ status: 'idle', error: 'save' }))
  }

  return (
    <s-admin-action heading={t('heading')}>
      <s-stack gap="base">
        {state.status === 'done' ? <s-banner tone="success">{t('done')}</s-banner> : null}
        {state.error ? <s-banner tone="critical">{t('error.' + state.error)}</s-banner> : null}
        <s-text color="subdued">{t('intro')}</s-text>
        <s-text-field label={t('version')} value={version} onInput={(e) => setVersion(val(e))} />
        <s-text-field label={t('date')} details={t('dateHelp')} value={date} onInput={(e) => setDate(val(e))} />
        <s-text-area label={t('notes')} details={t('notesHelp')} rows={5} value={notes} onInput={(e) => setNotes(val(e))} />
      </s-stack>
      <s-button slot="primary-action" variant="primary" loading={state.status === 'saving'} disabled={state.status === 'saving'} onClick={onSave}>
        {t('publish')}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => shopify.close()}>{t('close')}</s-button>
    </s-admin-action>
  )
}
