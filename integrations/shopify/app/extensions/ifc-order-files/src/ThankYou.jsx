import '@shopify/ui-extensions/preact'
import { render } from 'preact'
import { OrderFiles } from './OrderFiles.jsx'

export default async () => {
  render(<OrderFiles source="ifc_thankyou" />, document.body)
}
