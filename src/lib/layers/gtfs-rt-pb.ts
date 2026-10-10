// ─── gtfs-rt-pb ───────────────────────────────────────────────────────────────
// GTFS-Realtime in its canonical encoding (protobuf), read in the browser.
// Many feeds publish nothing else — Toei buses (ODPT) among them — so the JSON
// twin some producers offer (Renfe) is not enough.
//
// Only what the viewer reads is decoded: the header's timestamp and each
// entity's VehiclePosition. Trip updates and alerts are skipped field by
// field, which protobuf allows without knowing their layout. The output has
// the shape of GTFS-Realtime's JSON mapping (camelCase), so the JSON path
// (feeds.gtfsRtToGeoJson, device bindings) reads both the same way.
//
// gtfs-realtime.proto, the fields used:
//   FeedMessage      1 header · 2 entity[]
//   FeedHeader       1 gtfs_realtime_version · 3 timestamp
//   FeedEntity       1 id · 2 is_deleted · 4 vehicle
//   VehiclePosition  1 trip · 8 vehicle · 2 position · 3 current_stop_sequence
//                    7 stop_id · 4 current_status · 5 timestamp · 9 occupancy_status
//   Position         1 latitude f32 · 2 longitude f32 · 3 bearing f32 · 5 speed f32
//   TripDescriptor   1 trip_id · 5 route_id · 6 direction_id · 2 start_time · 3 start_date
//   VehicleDescriptor 1 id · 2 label · 3 license_plate
//
// Pure. No dependency: a few hundred bytes of decoder instead of a protobuf
// runtime.

type Fields = Map<number, Array<number | Uint8Array>>

const utf8 = new TextDecoder('utf-8')

function varint(b: Uint8Array, at: number): [number, number] {
  let v = 0
  let mul = 1
  for (let i = at; i < b.length; i++) {
    const x = b[i]
    v += (x & 0x7f) * mul
    if (!(x & 0x80)) return [v, i + 1]
    mul *= 128
  }
  throw new Error('truncated varint')
}

/** One message's fields: varints as numbers, length-delimited as bytes, fixed as their 4/8 raw bytes. */
function fields(b: Uint8Array): Fields {
  const out: Fields = new Map()
  let i = 0
  while (i < b.length) {
    const [tag, a] = varint(b, i)
    i = a
    const no = Math.floor(tag / 8)
    const wire = tag & 7
    let value: number | Uint8Array
    if (wire === 0) [value, i] = varint(b, i)
    else if (wire === 1) { value = b.subarray(i, i + 8); i += 8 }
    else if (wire === 2) {
      const [len, s] = varint(b, i)
      value = b.subarray(s, s + len)
      i = s + len
    } else if (wire === 5) { value = b.subarray(i, i + 4); i += 4 }
    else throw new Error(`unsupported wire type ${wire}`)
    if (i > b.length) throw new Error('truncated field')
    const list = out.get(no)
    if (list) list.push(value)
    else out.set(no, [value])
  }
  return out
}

const first = (f: Fields, no: number): number | Uint8Array | undefined => f.get(no)?.[0]
const str = (f: Fields, no: number): string | undefined => {
  const v = first(f, no)
  return v instanceof Uint8Array ? utf8.decode(v) : undefined
}
const num = (f: Fields, no: number): number | undefined => {
  const v = first(f, no)
  return typeof v === 'number' ? v : undefined
}
const f32 = (f: Fields, no: number): number | undefined => {
  const v = first(f, no)
  return v instanceof Uint8Array && v.length === 4 ? new DataView(v.buffer, v.byteOffset, 4).getFloat32(0, true) : undefined
}
const sub = (f: Fields, no: number): Fields | null => {
  const v = first(f, no)
  return v instanceof Uint8Array ? fields(v) : null
}

const STATUS = ['INCOMING_AT', 'STOPPED_AT', 'IN_TRANSIT_TO']
const OCCUPANCY = ['EMPTY', 'MANY_SEATS_AVAILABLE', 'FEW_SEATS_AVAILABLE', 'STANDING_ROOM_ONLY', 'CRUSHED_STANDING_ROOM_ONLY', 'FULL', 'NOT_ACCEPTING_PASSENGERS', 'NO_DATA_AVAILABLE', 'NOT_BOARDABLE']

/** Drop the keys whose value is undefined: what JSON would not carry. */
function clean<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return o
}

export interface GtfsRtFeed {
  header: { gtfsRealtimeVersion?: string; timestamp?: number }
  entity: Array<{ id: string; isDeleted?: boolean; vehicle?: Record<string, unknown> }>
}

function vehiclePosition(v: Fields): Record<string, unknown> {
  const trip = sub(v, 1)
  const desc = sub(v, 8)
  const pos = sub(v, 2)
  const status = num(v, 4)
  const occ = num(v, 9)
  return clean({
    trip: trip ? clean({ tripId: str(trip, 1), routeId: str(trip, 5), directionId: num(trip, 6), startTime: str(trip, 2), startDate: str(trip, 3) }) : undefined,
    vehicle: desc ? clean({ id: str(desc, 1), label: str(desc, 2), licensePlate: str(desc, 3) }) : undefined,
    position: pos ? clean({ latitude: f32(pos, 1), longitude: f32(pos, 2), bearing: f32(pos, 3), speed: f32(pos, 5) }) : undefined,
    currentStopSequence: num(v, 3),
    stopId: str(v, 7),
    currentStatus: status !== undefined ? STATUS[status] ?? String(status) : undefined,
    timestamp: num(v, 5),
    occupancyStatus: occ !== undefined ? OCCUPANCY[occ] ?? String(occ) : undefined,
  })
}

/** A FeedMessage, or null when the bytes are not one (no header with a timestamp). */
export function decodeGtfsRt(bytes: Uint8Array): GtfsRtFeed | null {
  let msg: Fields
  try { msg = fields(bytes) } catch { return null }
  const head = sub(msg, 1)
  if (!head || num(head, 3) === undefined) return null
  const entity: GtfsRtFeed['entity'] = []
  for (const raw of msg.get(2) ?? []) {
    if (!(raw instanceof Uint8Array)) continue
    let e: Fields
    try { e = fields(raw) } catch { continue }
    const v = sub(e, 4)
    entity.push(clean({ id: str(e, 1) ?? '', isDeleted: num(e, 2) === 1 ? true : undefined, vehicle: v ? vehiclePosition(v) : undefined }))
  }
  return { header: clean({ gtfsRealtimeVersion: str(head, 1), timestamp: num(head, 3) }), entity }
}

