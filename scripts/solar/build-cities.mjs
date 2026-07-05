// ─── build-cities.mjs ─────────────────────────────────────────────────────────
// Compacts the GeoNames "cities15000" gazetteer into the offline city-search
// dataset bundled with the Sun & Moon study (src/lib/solar/cities.json).
//
// Why GeoNames: the canonical FREE community gazetteer, CC BY 4.0 — the only
// obligation is attribution (shown in the SolarPanel location form). Bundling
// the data keeps city search 100 % offline: no geocoding API ever sees the
// project's location (the product's privacy invariant).
//
// Usage (manual, run when refreshing the dataset — the output is COMMITTED so
// builds stay deterministic and network-free):
//   1. Download https://download.geonames.org/export/dump/cities15000.zip
//   2. Extract cities15000.txt
//   3. node scripts/solar/build-cities.mjs <path-to-cities15000.txt> [--top N]
//
// Output format (size-optimized): { _license, _source, generated, cities }
// where cities = [[name, countryCode, lat, lon], …] sorted by population DESC
// (index = rank, so the search can prefer big cities without storing the
// population). Coordinates keep 2 decimals (~1.1 km) — plenty for solar
// position and timezone lookup.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTPUT = resolve(HERE, '../../src/lib/solar/cities.json')

const [inputPath, ...rest] = process.argv.slice(2)
if (!inputPath) {
  console.error('Usage: node scripts/solar/build-cities.mjs <cities15000.txt> [--top N]')
  process.exit(1)
}
const topIdx = rest.indexOf('--top')
const top = topIdx !== -1 ? parseInt(rest[topIdx + 1], 10) : Infinity

// GeoNames dump columns (tab-separated):
// 0 geonameid · 1 name · 2 asciiname · 3 alternatenames · 4 lat · 5 lon ·
// 6 featureClass · 7 featureCode · 8 countryCode · … · 14 population · 17 tz
const rows = []
for (const line of readFileSync(inputPath, 'utf8').split('\n')) {
  if (!line) continue
  const f = line.split('\t')
  if (f.length < 15 || f[6] !== 'P') continue
  const lat = Number.parseFloat(f[4])
  const lon = Number.parseFloat(f[5])
  const population = Number.parseInt(f[14], 10) || 0
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
  rows.push({ name: f[1], country: f[8], lat, lon, population })
}

rows.sort((a, b) => b.population - a.population)
const kept = rows.slice(0, Math.min(rows.length, top))

const payload = {
  _source: 'GeoNames cities15000 (https://download.geonames.org/export/dump/)',
  _license: 'CC BY 4.0 — attribution required (shown in the app UI)',
  generated: new Date().toISOString().slice(0, 10),
  cities: kept.map((c) => [c.name, c.country, Math.round(c.lat * 100) / 100, Math.round(c.lon * 100) / 100]),
}

mkdirSync(dirname(OUTPUT), { recursive: true })
const json = JSON.stringify(payload)
writeFileSync(OUTPUT, json)
console.log(`✓ ${kept.length} cities (of ${rows.length}) → ${OUTPUT} (${(json.length / 1024).toFixed(0)} KB raw)`)
