// A small highlighter for the home page's integration snippets: HTML, a module
// script and a WordPress shortcode. It is not a general parser; it only has to
// colour the few lines we ship, so it stays a dozen lines instead of a library.
// Colours come from CSS tokens (see .tok-* in index.css), so both themes pass AA.

export type TokenKind = 'comment' | 'string' | 'tag' | 'keyword' | 'attr' | 'plain'
export interface Token { kind: TokenKind; text: string }

const RULES: [TokenKind, RegExp][] = [
  ['comment', /<!--[\s\S]*?-->/y],
  ['string', /"[^"\n]*"/y],
  ['comment', /\/\/[^\n]*/y],
  ['tag', /<\/?[A-Za-z][\w-]*|\/?>|\[\/?[a-z_]+|\]/y],
  ['keyword', /\b(?:import|from|const|let|await|new|return|async)\b/y],
  ['attr', /[A-Za-z_][\w-]*(?==)/y],
]

export function highlight(code: string): Token[] {
  const out: Token[] = []
  let i = 0
  const push = (kind: TokenKind, text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  outer: while (i < code.length) {
    for (const [kind, re] of RULES) {
      re.lastIndex = i
      const m = re.exec(code)
      if (m && m[0]) { push(kind, m[0]); i += m[0].length; continue outer }
    }
    // A whole word at a time, so "important" never splits into "import" + "ant".
    const word = /[A-Za-z_$][\w$]*/y
    word.lastIndex = i
    const w = word.exec(code)
    const text = w ? w[0] : code[i]
    push('plain', text)
    i += text.length
  }
  return out
}
