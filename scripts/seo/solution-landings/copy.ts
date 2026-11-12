// Every language of the solution pages' copy, by language code.
import type { Lang, LangCopy } from './types'
import { copy as en } from './copy-en'
import { copy as es } from './copy-es'
import { copy as de } from './copy-de'
import { copy as fr } from './copy-fr'
import { copy as pt } from './copy-pt'
import { copy as it } from './copy-it'
import { copy as ca } from './copy-ca'
import { copy as zh } from './copy-zh'
import { copy as ja } from './copy-ja'
import { copy as th } from './copy-th'

export const COPY: Record<Lang, LangCopy> = { en, es, de, fr, pt, it, ca, zh, ja, th }
