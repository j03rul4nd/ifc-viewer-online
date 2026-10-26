// ─── Saved connections: how data arrives ──────────────────────────────────────
// A paid account saves its data sources once — endpoint, credentials, how to
// read the payload, how often — and every scene starts from them. This file
// is the catalogue the connection wizard is generated from: each protocol
// declares its fields with the help text and an example, so the form explains
// itself and a guided tour only has to point at `data-tour` anchors.
//
// The three ways data can arrive are deliberately named by who acts:
//   pull    we ask the source on a schedule (REST, WFS, GTFS-RT, GBFS, CSV…)
//   push    the source sends to us (webhook)
//   stream  a connection stays open (WebSocket, MQTT)
// plus `database` (read-only SQL through the EU gateway) and `file` (SFTP / S3
// drop folders), which are pull under the hood but feel different to set up.
// Pure data — no React, no network.

export type IngestMode = 'pull' | 'push' | 'stream' | 'database' | 'file'

export type ProtocolId =
  | 'rest' | 'geojson' | 'wfs' | 'gtfs_rt' | 'gbfs' | 'csv'
  | 'webhook'
  | 'websocket' | 'mqtt'
  | 'postgres' | 'sqlserver'
  | 'sftp' | 's3'

export type CredentialKind = 'api_key_header' | 'api_key_query' | 'bearer' | 'basic' | 'oauth_client' | 'mqtt_user' | 'db_user' | 'ssh_key' | 'aws_keys'

export interface FieldDef {
  key: string
  label: string
  /** One sentence: what goes here and where to find it. */
  help: string
  example?: string
  type?: 'text' | 'url' | 'number' | 'select' | 'textarea'
  options?: { value: string; label: string }[]
  required?: boolean
  /** Shown only when another field has this value. */
  when?: { key: string; equals: string }
}

export interface ProtocolDef {
  id: ProtocolId
  mode: IngestMode
  name: string
  /** For the "Which one do I need?" picker, in the user's words. */
  pickWhen: string
  fields: FieldDef[]
  /** Credentials this protocol can use; empty = public or none. */
  auth: CredentialKind[]
  /** Payload formats it can return. */
  formats: PayloadFormat[]
  /** Lowest refresh interval allowed, seconds (pull only). */
  minIntervalS?: number
}

export type PayloadFormat = 'json' | 'geojson' | 'csv' | 'xml' | 'protobuf'

export const MODES: { id: IngestMode; title: string; body: string; examples: string }[] = [
  { id: 'pull', title: 'We fetch it on a schedule', body: 'The data sits at a URL. We read it every few seconds, minutes or hours.', examples: 'Open data portals, REST APIs, WFS, GTFS-RT, bike share, a CSV that updates' },
  { id: 'push', title: 'Your system sends it to us', body: 'You get a private URL; your platform, script or IoT hub POSTs to it whenever something changes.', examples: 'Building management systems, Zapier/Make, Azure IoT Hub routes, your own backend' },
  { id: 'stream', title: 'A live connection', body: 'We keep a connection open and update the scene the moment a message arrives.', examples: 'Sensors over MQTT, WebSocket feeds, Node-RED' },
  { id: 'database', title: 'Read from a database', body: 'We run a read-only query you write, on a schedule, through our EU gateway.', examples: 'PostgreSQL / PostGIS, SQL Server facility databases' },
  { id: 'file', title: 'Files dropped in a folder', body: 'Each new file in the folder is read once, in order.', examples: 'Nightly CSV exports, scanner output on SFTP, S3 buckets' },
]

const url = (example: string, help = 'The address that returns the data. Paste it from the provider\'s documentation.'): FieldDef =>
  ({ key: 'url', label: 'URL', type: 'url', required: true, help, example })

export const PROTOCOLS: ProtocolDef[] = [
  {
    id: 'rest', mode: 'pull', name: 'REST / JSON API', pickWhen: 'You have an API URL that answers with JSON.',
    auth: ['api_key_header', 'api_key_query', 'bearer', 'basic', 'oauth_client'], formats: ['json', 'geojson', 'csv', 'xml'], minIntervalS: 10,
    fields: [
      url('https://api.example.com/v1/sensors?site=hq'),
      { key: 'method', label: 'Method', type: 'select', options: [{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }], help: 'GET for almost every API. POST only if the docs say to send a body.' },
      { key: 'body', label: 'Request body', type: 'textarea', help: 'JSON sent with each request. {{since}} is replaced by the time of the last successful read.', example: '{ "from": "{{since}}" }', when: { key: 'method', equals: 'POST' } },
      { key: 'headers', label: 'Extra headers', type: 'textarea', help: 'One per line. Leave the key out — add it under Credentials so it is stored encrypted.', example: 'Accept: application/json' },
    ],
  },
  {
    id: 'geojson', mode: 'pull', name: 'GeoJSON URL', pickWhen: 'A URL returns a FeatureCollection with coordinates.',
    auth: ['api_key_query', 'bearer'], formats: ['geojson'], minIntervalS: 10,
    fields: [url('https://opendata.example.org/stations.geojson')],
  },
  {
    id: 'wfs', mode: 'pull', name: 'OGC WFS', pickWhen: 'A GIS server (GeoServer, ArcGIS, QGIS Server) publishes layers.',
    auth: ['basic', 'api_key_query'], formats: ['geojson', 'xml'], minIntervalS: 60,
    fields: [
      url('https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx', 'The service address, without ?service=WFS — we add the request ourselves.'),
      { key: 'typeName', label: 'Layer (typeName)', required: true, help: 'The layer to read. Use "Test" and we list the layers the server offers.', example: 'CP:CadastralParcel' },
      { key: 'bbox', label: 'Limit to the scene area', type: 'select', options: [{ value: 'scene', label: 'Yes — only what is around the scene' }, { value: 'all', label: 'No — the whole layer' }], help: 'Reading only the scene area is faster and avoids server limits.' },
    ],
  },
  {
    id: 'gtfs_rt', mode: 'pull', name: 'GTFS-Realtime', pickWhen: 'Public transport positions or delays.',
    auth: ['api_key_header', 'api_key_query'], formats: ['protobuf', 'json'], minIntervalS: 15,
    fields: [url('https://gtfsrt.renfe.com/vehicle_positions.pb'), { key: 'staticGtfs', label: 'Static GTFS (zip)', type: 'url', help: 'Optional: stop and route names come from here.', example: 'https://example.org/gtfs.zip' }],
  },
  {
    id: 'gbfs', mode: 'pull', name: 'GBFS (bike & scooter share)', pickWhen: 'Bike or scooter share stations.',
    auth: [], formats: ['json'], minIntervalS: 30,
    fields: [url('https://barcelona.publicbikesystem.net/customer/gbfs/v2/gbfs.json', 'The gbfs.json discovery file; we find station information and status from it.')],
  },
  {
    id: 'csv', mode: 'pull', name: 'CSV / spreadsheet URL', pickWhen: 'A CSV, or a Google Sheet published as CSV.',
    auth: ['api_key_query', 'basic'], formats: ['csv'], minIntervalS: 60,
    fields: [url('https://docs.google.com/spreadsheets/d/…/export?format=csv'), { key: 'delimiter', label: 'Separator', type: 'select', options: [{ value: 'auto', label: 'Detect' }, { value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: '\t', label: 'Tab' }], help: 'Leave on Detect unless the preview looks wrong.' }],
  },
  {
    id: 'webhook', mode: 'push', name: 'Webhook (HTTPS POST)', pickWhen: 'Your system can call a URL when something changes.',
    auth: [], formats: ['json', 'geojson', 'csv'],
    fields: [
      { key: 'signature', label: 'Verify requests with', type: 'select', options: [{ value: 'hmac', label: 'HMAC-SHA256 signature (recommended)' }, { value: 'token', label: 'Secret token in a header' }, { value: 'none', label: 'Nothing (testing only)' }], help: 'How we know a request really comes from your system. We generate the secret.' },
      { key: 'dedupe', label: 'Ignore repeats by', help: 'A field that is unique per message, so retries are not counted twice. Optional.', example: 'event_id' },
    ],
  },
  {
    id: 'websocket', mode: 'stream', name: 'WebSocket', pickWhen: 'A wss:// address that streams messages.',
    auth: ['bearer', 'api_key_query'], formats: ['json'],
    fields: [
      url('wss://stream.example.com/live', 'The wss:// address. Plain ws:// is refused: browsers block it on https pages.'),
      { key: 'subscribe', label: 'Message to send on connect', type: 'textarea', help: 'Some servers need a subscribe message first. Leave empty if not.', example: '{ "type": "subscribe", "channel": "sensors" }' },
    ],
  },
  {
    id: 'mqtt', mode: 'stream', name: 'MQTT', pickWhen: 'IoT sensors publishing to a broker (Mosquitto, HiveMQ, AWS IoT…).',
    auth: ['mqtt_user'], formats: ['json'],
    fields: [
      { key: 'broker', label: 'Broker', type: 'url', required: true, help: 'Host and port. mqtts:// for TLS (port 8883) or wss:// for MQTT over WebSocket.', example: 'mqtts://broker.hivemq.cloud:8883' },
      { key: 'topic', label: 'Topic', required: true, help: '+ matches one level, # matches the rest. One topic per line for several.', example: 'building/hq/+/temperature' },
      { key: 'qos', label: 'Delivery guarantee', type: 'select', options: [{ value: '0', label: 'At most once (QoS 0)' }, { value: '1', label: 'At least once (QoS 1)' }], help: 'QoS 1 if every reading matters; 0 for fast sensors where the next value replaces the last.' },
    ],
  },
  {
    id: 'postgres', mode: 'database', name: 'PostgreSQL / PostGIS', pickWhen: 'Your data lives in Postgres.',
    auth: ['db_user'], formats: ['json'], minIntervalS: 60,
    fields: [
      { key: 'host', label: 'Host', required: true, help: 'Reachable from the internet, or allow our gateway IPs (listed under Credentials).', example: 'db.example.com:5432' },
      { key: 'database', label: 'Database', required: true, help: 'The database name.', example: 'facilities' },
      { key: 'query', label: 'Query', type: 'textarea', required: true, help: 'Read-only SELECT. {{since}} is the last successful run. Return an id and either coordinates or an IFC GlobalId.', example: 'SELECT id, ST_AsGeoJSON(geom) AS geom, value, updated_at\nFROM readings WHERE updated_at > {{since}}' },
    ],
  },
  {
    id: 'sqlserver', mode: 'database', name: 'SQL Server', pickWhen: 'A facility management or BMS database on SQL Server.',
    auth: ['db_user'], formats: ['json'], minIntervalS: 60,
    fields: [
      { key: 'host', label: 'Host', required: true, help: 'Host and port.', example: 'fm-sql.example.local:1433' },
      { key: 'database', label: 'Database', required: true, help: 'The database name.', example: 'FM' },
      { key: 'query', label: 'Query', type: 'textarea', required: true, help: 'Read-only SELECT. {{since}} is the last successful run.', example: 'SELECT AssetTag, Status, LastService FROM Assets WHERE Modified > {{since}}' },
    ],
  },
  {
    id: 'sftp', mode: 'file', name: 'SFTP folder', pickWhen: 'Files exported every night to an SFTP server.',
    auth: ['ssh_key', 'basic'], formats: ['csv', 'json', 'geojson'], minIntervalS: 300,
    fields: [
      { key: 'host', label: 'Host', required: true, help: 'Host and port.', example: 'sftp.example.com:22' },
      { key: 'path', label: 'Folder', required: true, help: 'We read new files here. * matches any name.', example: '/exports/sensors/*.csv' },
      { key: 'after', label: 'After reading', type: 'select', options: [{ value: 'keep', label: 'Leave the file' }, { value: 'move', label: 'Move to /processed' }, { value: 'delete', label: 'Delete it' }], help: 'Leave it if another system also reads the folder.' },
    ],
  },
  {
    id: 's3', mode: 'file', name: 'S3 bucket', pickWhen: 'Files in Amazon S3 or an S3-compatible store (MinIO, R2).',
    auth: ['aws_keys'], formats: ['csv', 'json', 'geojson'], minIntervalS: 300,
    fields: [
      { key: 'bucket', label: 'Bucket and prefix', required: true, help: 'Bucket name, then the folder.', example: 's3://acme-iot/exports/' },
      { key: 'endpoint', label: 'Endpoint', type: 'url', help: 'Only for non-AWS stores.', example: 'https://<account>.r2.cloudflarestorage.com' },
    ],
  },
]

export const CREDENTIAL_KINDS: Record<CredentialKind, { label: string; fields: { key: string; label: string; secret?: boolean; help: string; example?: string }[] }> = {
  api_key_header: { label: 'API key in a header', fields: [{ key: 'header', label: 'Header name', help: 'As the provider names it.', example: 'X-API-Key' }, { key: 'value', label: 'Key', secret: true, help: 'From the provider\'s developer portal.' }] },
  api_key_query: { label: 'API key in the URL', fields: [{ key: 'param', label: 'Parameter name', help: 'As the provider names it.', example: 'app_key' }, { key: 'value', label: 'Key', secret: true, help: 'From the provider\'s developer portal.' }] },
  bearer: { label: 'Bearer token', fields: [{ key: 'value', label: 'Token', secret: true, help: 'Sent as "Authorization: Bearer …".' }] },
  basic: { label: 'Username and password', fields: [{ key: 'user', label: 'Username', help: 'A service account, not a person\'s login, if you can.' }, { key: 'value', label: 'Password', secret: true, help: '' }] },
  oauth_client: { label: 'OAuth client credentials', fields: [{ key: 'tokenUrl', label: 'Token URL', help: 'Where we exchange the client id and secret for a token; we renew it before it expires.', example: 'https://login.example.com/oauth2/token' }, { key: 'clientId', label: 'Client id', help: '' }, { key: 'value', label: 'Client secret', secret: true, help: '' }, { key: 'scope', label: 'Scope', help: 'Optional.', example: 'read:sensors' }] },
  mqtt_user: { label: 'MQTT username and password', fields: [{ key: 'user', label: 'Username', help: '' }, { key: 'value', label: 'Password', secret: true, help: '' }, { key: 'clientId', label: 'Client id', help: 'Optional; we generate one if empty.' }] },
  db_user: { label: 'Database user', fields: [{ key: 'user', label: 'User', help: 'Give it SELECT rights only — we refuse anything else anyway.' }, { key: 'value', label: 'Password', secret: true, help: '' }] },
  ssh_key: { label: 'SSH key', fields: [{ key: 'user', label: 'User', help: '' }, { key: 'value', label: 'Private key', secret: true, help: 'Paste the key, or generate one here and add our public key to the server.' }] },
  aws_keys: { label: 'Access key', fields: [{ key: 'user', label: 'Access key id', help: 'An IAM user with read access to that bucket only.' }, { key: 'value', label: 'Secret access key', secret: true, help: '' }] },
}

export const protocolById = (id: ProtocolId) => PROTOCOLS.find((p) => p.id === id)!
export const protocolsFor = (mode: IngestMode) => PROTOCOLS.filter((p) => p.mode === mode)

/** Required fields still empty, for the wizard's Next button and its message. */
export function missingFields(p: ProtocolDef, values: Record<string, string>): FieldDef[] {
  return p.fields.filter((f) => f.required && !(values[f.key] ?? '').trim() && (!f.when || values[f.when.key] === f.when.equals))
}

/** Show the secret's last four characters only, as every vault does. */
export function maskSecret(secret: string): string {
  return secret.length <= 4 ? '••••' : `••••${secret.slice(-4)}`
}
