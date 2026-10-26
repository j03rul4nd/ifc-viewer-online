// Sample data for the Data sources and Scenes screens of the design preview.
// Shapes mirror what the backend would store: secrets never leave the vault,
// so the client only ever sees `preview` (last four characters).

import type { CredentialKind, ProtocolId, IngestMode } from '../../lib/connections/protocols'
import type { Schedule } from '../../lib/connections/schedule'
import type { FieldMapping } from '../../lib/connections/mapping'
import type { SceneOverride } from '../../lib/connections/scenes'

export interface SampleCredential {
  id: string
  name: string
  kind: CredentialKind
  preview: string
  createdAt: string
  lastUsed?: string
  expiresAt?: string
  usedBy: string[]
}

export type ConnectionHealth = 'ok' | 'warning' | 'failing' | 'paused' | 'waiting'

export interface SampleConnection {
  id: string
  name: string
  protocol: ProtocolId
  mode: IngestMode
  endpoint: string
  credentialId?: string
  schedule?: Schedule
  mapping: FieldMapping
  defaultInNewScenes: boolean
  health: ConnectionHealth
  lastEvent?: string
  /** Records in the last 24 h. */
  records24h: number
  note?: string
}

export interface SampleApiKey {
  id: string
  name: string
  prefix: string
  scopes: ApiScope[]
  createdAt: string
  lastUsed?: string
  expiresAt?: string
}

export type ApiScope = 'validate' | 'projects:read' | 'projects:write' | 'certificates' | 'ingest' | 'scenes:read'

export const API_SCOPES: { id: ApiScope; label: string; detail: string }[] = [
  { id: 'validate', label: 'Validate models', detail: 'POST an IFC, get the Health Score and issues. Uses credits for server runs.' },
  { id: 'projects:read', label: 'Read projects', detail: 'Deliveries, scores and history.' },
  { id: 'projects:write', label: 'Add deliveries', detail: 'Upload a new version to a project, e.g. from CI.' },
  { id: 'certificates', label: 'Issue certificates', detail: 'Uses credits. Keep this key on a server only.' },
  { id: 'ingest', label: 'Send data', detail: 'POST readings to any of your push connections.' },
  { id: 'scenes:read', label: 'Read scenes', detail: 'Embed private scenes in your own app.' },
]

export interface SampleScene {
  id: string
  name: string
  project?: string
  updatedAt: string
  overrides: SceneOverride[]
}

export interface IngestEvent {
  at: string
  connectionId: string
  level: 'ok' | 'warn' | 'error'
  message: string
}

export const SAMPLE_CREDENTIALS: SampleCredential[] = [
  { id: 'cr1', name: 'TMB developer key', kind: 'api_key_query', preview: '••••9f2a', createdAt: '2026-09-02', lastUsed: '2026-10-26 10:41', usedBy: ['cn3'] },
  { id: 'cr2', name: 'HiveMQ — sensor broker', kind: 'mqtt_user', preview: '••••ab71', createdAt: '2026-09-20', lastUsed: '2026-10-26 10:42', usedBy: ['cn1'] },
  { id: 'cr3', name: 'Facility DB (read-only)', kind: 'db_user', preview: '••••0c3e', createdAt: '2026-10-01', lastUsed: '2026-10-26 06:30', expiresAt: '2026-11-05', usedBy: ['cn4'] },
]

export const SAMPLE_CONNECTIONS: SampleConnection[] = [
  {
    id: 'cn1', name: 'HQ sensors — temperature & CO₂', protocol: 'mqtt', mode: 'stream', endpoint: 'mqtts://broker.hivemq.cloud:8883 · building/hq/+/env',
    credentialId: 'cr2', defaultInNewScenes: true, health: 'ok', lastEvent: '2026-10-26 10:42', records24h: 41280,
    mapping: { recordsPath: '', id: 'sensor', place: { kind: 'ifc', field: 'space', matchBy: 'GlobalId' }, time: 'ts', values: ['temp', 'co2'] },
  },
  {
    id: 'cn2', name: 'BMS alarms (webhook)', protocol: 'webhook', mode: 'push', endpoint: 'https://in.ifcvieweronline.eu/h/9c1f…e7',
    defaultInNewScenes: true, health: 'waiting', records24h: 0, note: 'No request received yet',
    mapping: { recordsPath: 'alarms', id: 'alarm_id', place: { kind: 'ifc', field: 'asset_tag', matchBy: 'Tag' }, time: 'raised_at', values: ['severity'] },
  },
  {
    id: 'cn3', name: 'TMB buses (Barcelona)', protocol: 'rest', mode: 'pull', endpoint: 'https://api.tmb.cat/v1/ibus/stops', credentialId: 'cr1',
    schedule: { kind: 'interval', seconds: 30 }, defaultInNewScenes: false, health: 'warning', lastEvent: '2026-10-26 10:41', records24h: 2880, note: '3 timeouts in the last hour',
    mapping: { recordsPath: 'data.ibus', id: 'line', place: { kind: 'latlon', lat: 'lat', lon: 'lon' }, time: 'ts', values: ['t-in-min'] },
  },
  {
    id: 'cn4', name: 'Maintenance status (SQL)', protocol: 'postgres', mode: 'database', endpoint: 'db.estudionorte.example:5432 / facilities', credentialId: 'cr3',
    schedule: { kind: 'cron', expr: '30 6 * * 1-5' }, defaultInNewScenes: false, health: 'failing', lastEvent: '2026-10-24 06:30', records24h: 0, note: 'Password rejected since Friday',
    mapping: { recordsPath: '', id: 'asset_id', place: { kind: 'ifc', field: 'guid', matchBy: 'GlobalId' }, time: 'updated_at', values: ['status', 'days_to_service'] },
  },
]

export const SAMPLE_API_KEYS: SampleApiKey[] = [
  { id: 'k1', name: 'GitHub Actions — validate on push', prefix: 'ivo_live_3fA9', scopes: ['validate', 'projects:write'], createdAt: '2026-09-10', lastUsed: '2026-10-25 18:02' },
  { id: 'k2', name: 'Node-RED gateway', prefix: 'ivo_live_c71D', scopes: ['ingest'], createdAt: '2026-10-01', lastUsed: '2026-10-26 10:40', expiresAt: '2027-10-01' },
]

export const SAMPLE_SCENES: SampleScene[] = [
  { id: 'sc1', name: 'HQ — operations dashboard', project: 'Hospital Comarcal — Ampliación', updatedAt: '2026-10-25', overrides: [{ connectionId: 'cn4', enabled: true, filter: 'days_to_service < 30' }] },
  { id: 'sc2', name: 'Client presentation — level 3', project: 'Hospital Comarcal — Ampliación', updatedAt: '2026-10-20', overrides: [{ connectionId: 'cn2', enabled: false }, { connectionId: 'cn1', filter: 'floor = 3' }] },
  { id: 'sc3', name: 'Barcelona mobility', updatedAt: '2026-10-11', overrides: [{ connectionId: 'cn3', enabled: true }, { connectionId: 'cn1', enabled: false }, { connectionId: 'cn2', enabled: false }] },
]

export const SAMPLE_INGEST_LOG: IngestEvent[] = [
  { at: '2026-10-26 10:42', connectionId: 'cn1', level: 'ok', message: '1 724 messages in the last hour' },
  { at: '2026-10-26 10:41', connectionId: 'cn3', level: 'warn', message: 'Request timed out after 10 s — retried, succeeded' },
  { at: '2026-10-26 09:58', connectionId: 'cn3', level: 'warn', message: '18 records had no position and were skipped' },
  { at: '2026-10-24 06:30', connectionId: 'cn4', level: 'error', message: 'password authentication failed for user "viewer_ro"' },
  { at: '2026-10-23 06:30', connectionId: 'cn4', level: 'ok', message: '212 rows read · 3 matched no IFC element' },
]

/** A realistic first response, used by the wizard's "Test connection" step. */
export const SAMPLE_TEST_PAYLOAD = {
  meta: { generated: '2026-10-26T10:42:00Z', count: 3 },
  data: {
    readings: [
      { sensor: 'HQ-L3-021', space: '2O2Fr$t4X7Zf8NOew3FLOH', ts: '2026-10-26T10:41:52Z', temp: 22.4, co2: 640, battery: 88 },
      { sensor: 'HQ-L3-022', space: '1hOSvn6df7F8_7GcBWlRGQ', ts: '2026-10-26T10:41:55Z', temp: 24.9, co2: 1120, battery: 71 },
      { sensor: 'HQ-L2-007', space: '0BTBFw6f90Nfh9rP1dlXrb', ts: '2026-10-26T10:41:57Z', temp: 21.1, co2: 510, battery: 93 },
    ],
  },
}
