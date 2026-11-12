// Integrations: connectors to the company's storage, signed webhooks, chat
// notices and BI export. Built dark (doc 32 «Integraciones»).
export * from './types'
export { authorizeUrl, exchangeCode, refreshIfNeeded, pkceChallenge, randomVerifier } from './oauth'
export { microsoftGraphConnector } from './microsoft-graph'
export { googleDriveConnector } from './google-drive'
export { pollFolder, MAX_FAILURES, MAX_IFC_BYTES, type ValidationOutcome, type FileResult } from './watch'
export { deliver, signatureHeader, verifySignature, RETRY_SCHEDULE_S, type DeliveryRecord, type WebhookPayload } from './webhooks'
export { sendChatNotice, slackBody, teamsBody, chatTargetFor, type ChatNotice } from './chat'
export { toCsv, toODataFeed, odataMetadata, VALIDATION_COLUMNS, type ValidationRow } from './powerbi'

import type { Connector, ConnectorId, Fetch } from './types'
import { microsoftGraphConnector } from './microsoft-graph'
import { googleDriveConnector } from './google-drive'

export function connectorFor(id: ConnectorId, fetchFn: Fetch): Connector {
  return id === 'sharepoint' ? microsoftGraphConnector(fetchFn) : googleDriveConnector(fetchFn)
}
