import { describe, expect, it } from 'vitest'
import { quoteUrl } from './ShareKit'

describe('quoteUrl', () => {
  it('links a short quote whole', () => {
    expect(quoteUrl('https://x.eu/blog/a/#old', 'Never hand-edit the IFC.'))
      .toBe('https://x.eu/blog/a/#:~:text=Never%20hand%2Dedit%20the%20IFC.')
  })
  it('uses a start,end range for long quotes', () => {
    const q = 'one two three four five six seven eight nine ten eleven twelve'
    expect(quoteUrl('https://x.eu/p/', q)).toBe('https://x.eu/p/#:~:text=one%20two%20three%20four%20five,eight%20nine%20ten%20eleven%20twelve')
  })
})
