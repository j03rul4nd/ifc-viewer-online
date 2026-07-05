// tz-lookup (photostructure fork, v6) ships no TypeScript types.
// CJS default export: coordinates → IANA timezone string. Throws on invalid
// coordinates. Delete when upstream publishes types.
declare module 'tz-lookup' {
  /** IANA timezone for the coordinates, e.g. "Europe/Madrid". */
  export default function tzlookup(lat: number, lon: number): string
}
