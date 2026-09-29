// ─── Bimo component copy ─────────────────────────────────────────────────────
// Labels for the mascot blocks. Keyed by the ARTICLE's language (same rule as
// blog-editorial-copy.ts): a Spanish post says "Comprobar" even with an English
// UI. Unknown languages fall back to English.

export interface BimoCopy {
  says: string
  boop: string
  question: (n: number, total: number) => string
  correct: string
  notQuite: string
  next: string
  seeResult: string
  retry: string
  score: (right: number, total: number) => string
  verdict: { perfect: string; good: string; ok: string; low: string }
  done: (n: number, total: number) => string
  allDone: string
  reset: string
  savedLocally: string
  helpful: string
  yes: string
  meh: string
  no: string
  thanks: { yes: string; meh: string; no: string }
  undo: string
}

const en: BimoCopy = {
  says: "Bimo's tip",
  boop: 'Boop Bimo',
  question: (n, t) => `Question ${n} of ${t}`,
  correct: 'Correct!',
  notQuite: 'Not quite',
  next: 'Next',
  seeResult: 'See result',
  retry: 'Try again',
  score: (r, t) => `${r} of ${t} correct`,
  verdict: { perfect: 'Flawless. You could teach this.', good: 'Solid — just one or two gaps.', ok: 'Getting there. The sections above cover the misses.', low: 'Worth a second read — the answers are all in this article.' },
  done: (n, t) => `${n} of ${t} done`,
  allDone: 'All done — ready to ship.',
  reset: 'Reset',
  savedLocally: 'Progress is saved in this browser only.',
  helpful: 'Was this article useful?',
  yes: 'Yes',
  meh: 'Somewhat',
  no: 'No',
  thanks: { yes: 'Thanks! That made Bimo’s day.', meh: 'Thanks — noted. We keep improving these guides.', no: 'Sorry about that. Thanks for telling us.' },
  undo: 'Change answer',
}

const es: BimoCopy = {
  says: 'El consejo de Bimo',
  boop: 'Toca a Bimo',
  question: (n, t) => `Pregunta ${n} de ${t}`,
  correct: '¡Correcto!',
  notQuite: 'No exactamente',
  next: 'Siguiente',
  seeResult: 'Ver resultado',
  retry: 'Repetir',
  score: (r, t) => `${r} de ${t} aciertos`,
  verdict: { perfect: 'Impecable. Podrías enseñarlo tú.', good: 'Muy bien: solo una o dos lagunas.', ok: 'Vas bien. Las secciones de arriba cubren los fallos.', low: 'Merece una segunda lectura: todas las respuestas están en el artículo.' },
  done: (n, t) => `${n} de ${t} hechos`,
  allDone: 'Todo listo para entregar.',
  reset: 'Reiniciar',
  savedLocally: 'El progreso se guarda solo en este navegador.',
  helpful: '¿Te ha resultado útil este artículo?',
  yes: 'Sí',
  meh: 'Más o menos',
  no: 'No',
  thanks: { yes: '¡Gracias! Le has alegrado el día a Bimo.', meh: 'Gracias, lo tenemos en cuenta. Seguimos mejorando estas guías.', no: 'Lo sentimos. Gracias por decírnoslo.' },
  undo: 'Cambiar respuesta',
}

const ca: BimoCopy = {
  says: 'El consell de Bimo',
  boop: 'Toca en Bimo',
  question: (n, t) => `Pregunta ${n} de ${t}`,
  correct: 'Correcte!',
  notQuite: 'No del tot',
  next: 'Següent',
  seeResult: 'Veure resultat',
  retry: 'Repetir',
  score: (r, t) => `${r} de ${t} encerts`,
  verdict: { perfect: 'Impecable. Ho podries ensenyar tu.', good: 'Molt bé: només una o dues llacunes.', ok: 'Vas bé. Les seccions de dalt cobreixen els errors.', low: 'Val la pena rellegir-lo: totes les respostes són a l’article.' },
  done: (n, t) => `${n} de ${t} fets`,
  allDone: 'Tot llest per lliurar.',
  reset: 'Reiniciar',
  savedLocally: 'El progrés només es desa en aquest navegador.',
  helpful: 'T’ha estat útil aquest article?',
  yes: 'Sí',
  meh: 'Més o menys',
  no: 'No',
  thanks: { yes: 'Gràcies! Has alegrat el dia a en Bimo.', meh: 'Gràcies, ho tenim en compte.', no: 'Ho sentim. Gràcies per dir-nos-ho.' },
  undo: 'Canviar resposta',
}

const de: BimoCopy = {
  says: 'Bimos Tipp',
  boop: 'Bimo anstupsen',
  question: (n, t) => `Frage ${n} von ${t}`,
  correct: 'Richtig!',
  notQuite: 'Nicht ganz',
  next: 'Weiter',
  seeResult: 'Ergebnis ansehen',
  retry: 'Nochmal',
  score: (r, t) => `${r} von ${t} richtig`,
  verdict: { perfect: 'Makellos. Das könntest du unterrichten.', good: 'Stark — nur ein, zwei Lücken.', ok: 'Auf gutem Weg. Die Abschnitte oben klären die Fehler.', low: 'Lohnt eine zweite Lektüre — alle Antworten stehen im Artikel.' },
  done: (n, t) => `${n} von ${t} erledigt`,
  allDone: 'Alles erledigt — bereit zur Übergabe.',
  reset: 'Zurücksetzen',
  savedLocally: 'Der Fortschritt wird nur in diesem Browser gespeichert.',
  helpful: 'War dieser Artikel hilfreich?',
  yes: 'Ja',
  meh: 'Teilweise',
  no: 'Nein',
  thanks: { yes: 'Danke! Bimo freut sich.', meh: 'Danke — notiert. Wir verbessern diese Guides laufend.', no: 'Das tut uns leid. Danke für die Rückmeldung.' },
  undo: 'Antwort ändern',
}

const fr: BimoCopy = {
  says: 'Le conseil de Bimo',
  boop: 'Toucher Bimo',
  question: (n, t) => `Question ${n} sur ${t}`,
  correct: 'Correct !',
  notQuite: 'Pas tout à fait',
  next: 'Suivant',
  seeResult: 'Voir le résultat',
  retry: 'Recommencer',
  score: (r, t) => `${r} sur ${t} bonnes réponses`,
  verdict: { perfect: 'Parfait. Vous pourriez l’enseigner.', good: 'Solide — une ou deux lacunes.', ok: 'Vous y êtes presque. Les sections ci-dessus couvrent les erreurs.', low: 'Une relecture s’impose — toutes les réponses sont dans l’article.' },
  done: (n, t) => `${n} sur ${t} faits`,
  allDone: 'Tout est prêt à livrer.',
  reset: 'Réinitialiser',
  savedLocally: 'La progression est enregistrée uniquement dans ce navigateur.',
  helpful: 'Cet article vous a-t-il été utile ?',
  yes: 'Oui',
  meh: 'En partie',
  no: 'Non',
  thanks: { yes: 'Merci ! Bimo est ravi.', meh: 'Merci — c’est noté.', no: 'Désolé. Merci de nous l’avoir dit.' },
  undo: 'Changer de réponse',
}

const pt: BimoCopy = {
  says: 'A dica do Bimo',
  boop: 'Tocar no Bimo',
  question: (n, t) => `Pergunta ${n} de ${t}`,
  correct: 'Correto!',
  notQuite: 'Não exatamente',
  next: 'Seguinte',
  seeResult: 'Ver resultado',
  retry: 'Repetir',
  score: (r, t) => `${r} de ${t} certas`,
  verdict: { perfect: 'Impecável. Poderia ensinar isto.', good: 'Muito bem — só uma ou duas lacunas.', ok: 'Está no caminho. As secções acima cobrem os erros.', low: 'Vale uma segunda leitura — as respostas estão todas no artigo.' },
  done: (n, t) => `${n} de ${t} feitos`,
  allDone: 'Tudo pronto para entregar.',
  reset: 'Reiniciar',
  savedLocally: 'O progresso fica guardado apenas neste navegador.',
  helpful: 'Este artigo foi útil?',
  yes: 'Sim',
  meh: 'Mais ou menos',
  no: 'Não',
  thanks: { yes: 'Obrigado! O Bimo ficou feliz.', meh: 'Obrigado — registado.', no: 'Lamentamos. Obrigado por nos dizer.' },
  undo: 'Mudar resposta',
}

const it: BimoCopy = {
  says: 'Il consiglio di Bimo',
  boop: 'Tocca Bimo',
  question: (n, t) => `Domanda ${n} di ${t}`,
  correct: 'Esatto!',
  notQuite: 'Non proprio',
  next: 'Avanti',
  seeResult: 'Vedi risultato',
  retry: 'Riprova',
  score: (r, t) => `${r} su ${t} corrette`,
  verdict: { perfect: 'Impeccabile. Potresti insegnarlo.', good: 'Ottimo — solo una o due lacune.', ok: 'Ci sei quasi. Le sezioni sopra coprono gli errori.', low: 'Vale una seconda lettura — le risposte sono tutte nell’articolo.' },
  done: (n, t) => `${n} su ${t} fatti`,
  allDone: 'Tutto pronto per la consegna.',
  reset: 'Azzera',
  savedLocally: 'I progressi sono salvati solo in questo browser.',
  helpful: 'Questo articolo ti è stato utile?',
  yes: 'Sì',
  meh: 'In parte',
  no: 'No',
  thanks: { yes: 'Grazie! Bimo è felicissimo.', meh: 'Grazie — ne teniamo conto.', no: 'Ci dispiace. Grazie per avercelo detto.' },
  undo: 'Cambia risposta',
}

const zh: BimoCopy = {
  says: 'Bimo 小贴士',
  boop: '戳一下 Bimo',
  question: (n, t) => `第 ${n} 题，共 ${t} 题`,
  correct: '答对了！',
  notQuite: '不太对',
  next: '下一题',
  seeResult: '查看结果',
  retry: '再试一次',
  score: (r, t) => `答对 ${r} / ${t}`,
  verdict: { perfect: '满分！你完全可以教别人了。', good: '很好——只差一两处。', ok: '快了。上面的章节解释了答错的部分。', low: '值得再读一遍——答案都在本文中。' },
  done: (n, t) => `已完成 ${n} / ${t}`,
  allDone: '全部完成，可以交付了。',
  reset: '重置',
  savedLocally: '进度仅保存在此浏览器中。',
  helpful: '这篇文章对你有帮助吗？',
  yes: '有',
  meh: '一般',
  no: '没有',
  thanks: { yes: '谢谢！Bimo 很开心。', meh: '谢谢，已记录。', no: '抱歉。感谢你的反馈。' },
  undo: '修改答案',
}

const ja: BimoCopy = {
  says: 'Bimo のヒント',
  boop: 'Bimo をつつく',
  question: (n, t) => `問題 ${n} / ${t}`,
  correct: '正解！',
  notQuite: 'おしい',
  next: '次へ',
  seeResult: '結果を見る',
  retry: 'もう一度',
  score: (r, t) => `${t} 問中 ${r} 問正解`,
  verdict: { perfect: '完璧です。人に教えられるレベル。', good: 'お見事——あと一歩。', ok: 'いい調子。上のセクションで復習できます。', low: 'もう一度読んでみましょう——答えはすべて本文にあります。' },
  done: (n, t) => `${t} 件中 ${n} 件完了`,
  allDone: 'すべて完了——納品できます。',
  reset: 'リセット',
  savedLocally: '進捗はこのブラウザにのみ保存されます。',
  helpful: 'この記事は役に立ちましたか？',
  yes: 'はい',
  meh: 'まあまあ',
  no: 'いいえ',
  thanks: { yes: 'ありがとう！Bimo も喜んでいます。', meh: 'ありがとうございます。改善に活かします。', no: '申し訳ありません。ご意見ありがとうございます。' },
  undo: '回答を変更',
}

const th: BimoCopy = {
  says: 'เคล็ดลับจาก Bimo',
  boop: 'จิ้ม Bimo',
  question: (n, t) => `คำถาม ${n} จาก ${t}`,
  correct: 'ถูกต้อง!',
  notQuite: 'ยังไม่ใช่',
  next: 'ถัดไป',
  seeResult: 'ดูผลลัพธ์',
  retry: 'ลองอีกครั้ง',
  score: (r, t) => `ถูก ${r} จาก ${t} ข้อ`,
  verdict: { perfect: 'สมบูรณ์แบบ สอนคนอื่นได้เลย', good: 'เยี่ยม — เหลืออีกนิดเดียว', ok: 'ใกล้แล้ว ส่วนด้านบนอธิบายข้อที่พลาด', low: 'ลองอ่านอีกรอบ — คำตอบอยู่ในบทความทั้งหมด' },
  done: (n, t) => `เสร็จ ${n} จาก ${t}`,
  allDone: 'เสร็จครบ พร้อมส่งมอบ',
  reset: 'รีเซ็ต',
  savedLocally: 'ความคืบหน้าบันทึกไว้ในเบราว์เซอร์นี้เท่านั้น',
  helpful: 'บทความนี้มีประโยชน์ไหม?',
  yes: 'มี',
  meh: 'พอใช้',
  no: 'ไม่มี',
  thanks: { yes: 'ขอบคุณ! Bimo ดีใจมาก', meh: 'ขอบคุณ รับทราบแล้ว', no: 'ขออภัย ขอบคุณที่บอกเรา' },
  undo: 'เปลี่ยนคำตอบ',
}

const COPY: Record<string, BimoCopy> = { en, es, ca, de, fr, pt, it, zh, ja, th }

export function bimoCopy(lang: string): BimoCopy {
  return COPY[lang] ?? COPY[lang.slice(0, 2)] ?? en
}

export const BIMO_COPY_LANGS = Object.keys(COPY)
