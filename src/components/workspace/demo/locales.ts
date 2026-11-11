// Demo guide translations, one object per language; demo.test.ts keeps them complete.
import es from './locales/es.json'
import ca from './locales/ca.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import it from './locales/it.json'
import pt from './locales/pt.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'
import th from './locales/th.json'

export const DEMO_LOCALES: Record<string, Record<string, string>> = { es, ca, fr, de, it, pt, ja, zh, th }
