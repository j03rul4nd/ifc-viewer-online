// ─── Map data and permission ──────────────────────────────────────────────────
// What the map asks for, of whom, what that reveals — and the way back. The
// tile consent is given once (the dialog before the first request); this is
// where it is withdrawn, as easily as it was given: the map turns off, the
// stored choice is forgotten, and the dialog asks again next time.

import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../../../stores/geoStore'
import { useGeoCtl } from '../useGeoController'
import { Caption, Notice } from '../ui'

export function MapPrivacy() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const consentGiven = useGeoStore((s) => s.consentGiven)
  if (!consentGiven) return null
  return (
    <>
      <Caption>{t('privacy.title')}</Caption>
      <Notice action={{ label: t('privacy.revoke'), onClick: () => { void ctl.revokeConsent() } }}>
        {t('privacy.body')}
      </Notice>
    </>
  )
}
