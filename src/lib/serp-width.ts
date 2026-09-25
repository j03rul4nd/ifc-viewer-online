// ─── How wide a string is in a search listing ────────────────────────────────
// Google cuts a title at a PIXEL width, roughly 60 Latin characters, and a
// description at roughly 160. Character counts are the usual proxy, and a
// fine one for Latin scripts — but a Chinese or Japanese character is drawn
// about twice as wide as a Latin one, so a 45-character Japanese title that
// "fits in 60" is chopped at 30. Thai is the other way round: its vowel and
// tone marks sit above or below a consonant and take no width at all.
//
// So budgets are counted in Latin-character widths: CJK and full-width
// characters count 2, combining marks count 0, everything else counts 1.
// For Latin text this equals `.length`, so nothing measured before changes.

const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u
const ZERO = /\p{M}/u

export function serpWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    if (ZERO.test(ch)) continue
    width += WIDE.test(ch) || ch.codePointAt(0)! > 0x1ffff ? 2 : 1
  }
  return width
}
