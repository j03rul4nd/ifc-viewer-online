import { describe, it, expect } from 'vitest'
import { era5Key, loadHourly, saveHourly } from './weather-store'
import { HOURS_PER_YEAR, type HourlyWeather } from './weather'

describe('weather store', () => {
  it('keys a place by the request\'s own rounding', () => {
    expect(era5Key(43.8712, -79.4401)).toBe('era5:43.87,-79.44')
    expect(era5Key(41.385, 2.1734)).toBe(`era5:${(41.385).toFixed(2)},2.17`)
  })

  it('degrades to "nothing stored" without IndexedDB', async () => {
    // The test DOM has no IndexedDB, like a locked-down private window.
    expect(typeof indexedDB).toBe('undefined')
    const a = () => new Float32Array(HOURS_PER_YEAR)
    const w: HourlyWeather = {
      kind: 'era5', label: 'ERA5 2025', lat: 1, lon: 2, elevationM: 0, years: { from: 2025, to: 2025 }, layers: 1,
      ghi: a(), dni: a(), dhi: a(), temp: a(), sun: a(),
    }
    await expect(saveHourly(era5Key(1, 2), w)).resolves.toBeUndefined()
    await expect(loadHourly(era5Key(1, 2))).resolves.toBeNull()
  })
})
