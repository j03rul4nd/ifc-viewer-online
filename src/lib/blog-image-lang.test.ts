import { describe, expect, it } from 'vitest'
import { localizedSrc } from './blog-image-lang'

describe('localizedSrc', () => {
  it('names the language file next to the English one, 800 px cut included', () => {
    expect(localizedSrc('blog/images/urban-digital-twin-anatomy.png', true, 'es')).toBe('blog/images/urban-digital-twin-anatomy-es.png')
    expect(localizedSrc('blog/images/urban-digital-twin-anatomy-800.png', true, 'ja')).toBe('blog/images/urban-digital-twin-anatomy-ja-800.png')
  })

  it('keeps the English file for English, for unlocalized images and for languages without their own', () => {
    expect(localizedSrc('blog/images/a.png', true, 'en')).toBe('blog/images/a.png')
    expect(localizedSrc('blog/images/a.png', undefined, 'es')).toBe('blog/images/a.png')
    expect(localizedSrc('blog/images/a.jpg', ['es', 'de'], 'th')).toBe('blog/images/a.jpg')
    expect(localizedSrc('blog/images/a.jpg', ['es', 'de'], 'de')).toBe('blog/images/a-de.jpg')
  })
})
