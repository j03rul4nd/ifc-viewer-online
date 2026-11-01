# FIWARE context brokers as twin sources

The digital twin reads entities from any broker that speaks **NGSI-LD** or **NGSIv2**
(Orion, Orion-LD, Scorpio, Stellio). Their readings drive the same rules, alerts and
history as any other source.

## Connect one

Digital twin → API source → **FIWARE broker**:

| Field | Meaning |
| --- | --- |
| Context Broker URL | Broker root, e.g. `https://broker.example.com:1026` |
| API | NGSI-LD (`/ngsi-ld/v1/entities`) or NGSIv2 (`/v2/entities`) |
| Entity type | e.g. `AirQualityObserved`. NGSI-LD requires it |
| Tenant | Sent as `NGSILD-Tenant` or `Fiware-Service` |
| JSON-LD context | NGSI-LD only, sent as a `Link` header |
| Service path | NGSIv2 only, sent as `Fiware-ServicePath` |

A token goes in the source's advanced header fields and stays in this browser; it is
never written to an exported project.

## How an entity becomes a reading

- Device id: the entity `id`.
- Each `Property`, `Relationship` (its `object`) and NGSIv2 attribute becomes a metric
  under its short name; `unitCode` becomes `<attr>_unit`.
- A `GeoProperty` point becomes `lat` and `lon`.
- Reading time: the newest `observedAt`/`modifiedAt` (NGSIv2: `dateModified` or
  `TimeInstant` metadata), then `dateObserved` or `dateModified`, as Smart Data Models use.
- `keyValues` answers work as well, when ids are `urn:ngsi-ld:` URNs.

Up to 10 pages of 1,000 entities are read per poll.

## What the broker must allow

The browser talks to the broker directly; we run no server in between.

- **CORS** must allow this site, including the `Link`, `NGSILD-Tenant`, `Fiware-Service`
  and `Authorization` headers you use. Otherwise put a reverse proxy in front of it.
- **https** is required: a browser blocks `http://` from an https page, and many brokers
  listen on plain `:1026`.

## Live updates

Polling is the default. A browser cannot receive a broker's HTTP notifications, so for
push use a subscription with an MQTT endpoint: point an MQTT source (`wss://`) at the
same broker's WebSocket listener. A notification `{ subscriptionId, data: [...] }` is
read as entities.

Not supported: writing back to the broker, temporal queries, and creating subscriptions.

## Status

Tested against a local stand-in that follows the NGSI-LD response format, not yet against
a real Orion-LD or Scorpio. We state protocol compatibility only: FIWARE's name and logo
have their own rules (see its Brand Guide), and no certification has been requested.
