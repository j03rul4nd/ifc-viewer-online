// ─── mqtt-ws ──────────────────────────────────────────────────────────────────
// MQTT 3.1.1 over WebSocket, subscribe-only — enough for a page to listen to a
// broker that speaks MQTT on a WebSocket listener (HSL's vehicle positions at
// wss://mqtt.hsl.fi, public test brokers, most IoT platforms). A WebSocket is
// not subject to CORS, so this reaches brokers a fetch never could.
//
// What it does: CONNECT (clean session, anonymous), SUBSCRIBE at QoS 0,
// PINGREQ to keep the session alive, PUBLISH in (PUBACK when QoS 1 slipped
// through). What it does not: publish, QoS 2, retained-message handling,
// will messages, authentication — a password in a web page is a public one.
//
// The packet codec is pure and tested; `connectMqtt` is the thin socket part.

const enc = new TextEncoder()

function utf8(s: string): number[] {
  const b = enc.encode(s)
  return [b.length >> 8, b.length & 0xff, ...b]
}

function remainingLength(n: number): number[] {
  const out: number[] = []
  do {
    let d = n % 128
    n = Math.floor(n / 128)
    if (n > 0) d |= 0x80
    out.push(d)
  } while (n > 0)
  return out
}

const packet = (first: number, body: number[]): Uint8Array => new Uint8Array([first, ...remainingLength(body.length), ...body])

export function encodeConnect(clientId: string, keepAliveS = 60): Uint8Array {
  // Protocol "MQTT", level 4 (3.1.1), flags 0x02 = clean session.
  return packet(0x10, [...utf8('MQTT'), 4, 0x02, keepAliveS >> 8, keepAliveS & 0xff, ...utf8(clientId)])
}

export function encodeSubscribe(packetId: number, topics: string[]): Uint8Array {
  return packet(0x82, [packetId >> 8, packetId & 0xff, ...topics.flatMap((t) => [...utf8(t), 0])])
}

export const PINGREQ = new Uint8Array([0xc0, 0])
export const DISCONNECT = new Uint8Array([0xe0, 0])

export function encodePuback(packetId: number): Uint8Array {
  return new Uint8Array([0x40, 2, packetId >> 8, packetId & 0xff])
}

export interface MqttPacket { type: number; flags: number; body: Uint8Array }

/**
 * Whole packets out of a byte stream; `rest` is the tail of an incomplete one,
 * to prepend to the next chunk (a WebSocket frame may hold several packets,
 * or part of one).
 */
export function splitPackets(buf: Uint8Array): { packets: MqttPacket[]; rest: Uint8Array } {
  const packets: MqttPacket[] = []
  let i = 0
  while (i < buf.length) {
    let len = 0
    let mul = 1
    let j = i + 1
    let complete = false
    for (; j < buf.length && j < i + 5; j++) {
      len += (buf[j] & 0x7f) * mul
      mul *= 128
      if (!(buf[j] & 0x80)) { complete = true; j++; break }
    }
    if (!complete || j + len > buf.length) break
    packets.push({ type: buf[i] >> 4, flags: buf[i] & 0x0f, body: buf.subarray(j, j + len) })
    i = j + len
  }
  return { packets, rest: buf.subarray(i) }
}

const dec = new TextDecoder('utf-8')

export function readPublish(p: MqttPacket): { topic: string; payload: Uint8Array; packetId: number | null } {
  const tl = (p.body[0] << 8) | p.body[1]
  const topic = dec.decode(p.body.subarray(2, 2 + tl))
  const qos = (p.flags >> 1) & 3
  let at = 2 + tl
  let packetId: number | null = null
  if (qos > 0) { packetId = (p.body[at] << 8) | p.body[at + 1]; at += 2 }
  return { topic, payload: p.body.subarray(at), packetId }
}

/**
 * A message as the JSON a device mapping reads: the payload's JSON with the
 * topic alongside (`topic`), or `{ topic, value }` for a plain payload.
 */
export function messageBody(topic: string, payload: Uint8Array): Record<string, unknown> {
  const text = dec.decode(payload)
  try {
    const v = JSON.parse(text) as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return { topic, ...(v as Record<string, unknown>) }
    return { topic, value: v }
  } catch {
    return { topic, value: text }
  }
}

export interface MqttClient { close(): void }

export interface MqttOptions {
  topics: string[]
  keepAliveS?: number
  onMessage(topic: string, payload: Uint8Array): void
  /** CONNACK accepted and SUBSCRIBE sent. */
  onOpen?(): void
  /** The socket closed (or the broker refused); `refused` carries the CONNACK code. */
  onClose?(info: { refused?: number }): void
}

export function connectMqtt(url: string, opts: MqttOptions): MqttClient {
  const keepAlive = opts.keepAliveS ?? 60
  const ws = new WebSocket(url, 'mqtt')
  ws.binaryType = 'arraybuffer'
  let rest = new Uint8Array(0)
  let ping: ReturnType<typeof setInterval> | null = null
  let refused: number | undefined
  const clientId = `ifcviewer-${Math.random().toString(16).slice(2, 10)}`

  ws.onopen = () => ws.send(encodeConnect(clientId, keepAlive))
  ws.onmessage = (ev) => {
    if (!(ev.data instanceof ArrayBuffer)) return
    const chunk = new Uint8Array(ev.data)
    const buf = rest.length ? new Uint8Array([...rest, ...chunk]) : chunk
    const out = splitPackets(buf)
    rest = out.rest.slice()
    for (const p of out.packets) {
      if (p.type === 2) {
        // CONNACK: return code in the second byte, 0 = accepted.
        const code = p.body[1] ?? 0
        if (code !== 0) { refused = code; ws.close(); return }
        ws.send(encodeSubscribe(1, opts.topics))
        ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(PINGREQ) }, Math.max(5, keepAlive * 0.75) * 1000)
        opts.onOpen?.()
      } else if (p.type === 3) {
        const m = readPublish(p)
        if (m.packetId !== null) ws.send(encodePuback(m.packetId))
        opts.onMessage(m.topic, m.payload)
      }
      // SUBACK (9) and PINGRESP (13) need no answer.
    }
  }
  ws.onclose = () => {
    if (ping) clearInterval(ping)
    opts.onClose?.({ refused })
  }
  return {
    close: () => {
      if (ping) clearInterval(ping)
      try { if (ws.readyState === WebSocket.OPEN) ws.send(DISCONNECT) } catch { /* closing anyway */ }
      try { ws.close() } catch { /* already closed */ }
    },
  }
}
