// German copy of the two solution pages. Source: copy-en.ts.
// Rules for translators: scripts/seo/solution-landings/TRANSLATING.md.
import type { LangCopy } from './types'

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Quellen',
    readOn: 'gelesen am',
    preview: 'Vorschau',
    faqLabel: 'FAQ',
    faqTitle: 'Was Käufer fragen',
    related: 'Weiterlesen',
    pricing: 'Pläne und Preise',
    postReception: 'IFC-Modelle von Nachunternehmern prüfen',
    postClash: 'Kollisionsprüfung im Browser',
    postBatch: 'Viele IFC-Dateien auf einmal validieren',
  },
  pages: {
    contractors: {
      title: 'IFC-Modellannahme für Bauunternehmen und Projektentwickler',
      desc: 'Nachunternehmer prüfen ihr IFC kostenlos gegen Ihre Anforderungen, bevor sie es senden; Sie prüfen nur, was besteht. Reception-Plan in der Vorschau.',
      nav: 'Für Bauunternehmen',
      kicker: 'Für Bauunternehmen und Projektentwickler · Reception-Plan · Vorschau',
      h1: ['Nur IFC-Modelle erhalten, die bereits bestehen', 'für Bauunternehmen und Projektentwickler, die Modelle von Nachunternehmern erhalten'],
      lead: 'Veröffentlichen Sie Ihre Anforderungen als einen einzigen Link. Jeder Nachunternehmer prüft sein Modell kostenlos im Browser dagegen und korrigiert es vor dem Versand. Sie sehen, wer geliefert hat, was besteht und warum der Rest zurückgeht – mit einem fertigen Bericht für den Bauherrn.',
      cta: 'Sprechen Sie mit uns',
      cta2: 'So funktioniert die Prüfung',
      note: 'Vorschau: Der Reception-Plan ist entworfen und wird hier mit Beispieldaten gezeigt. Er ist noch nicht erhältlich, und nichts wird gespeichert. Die Prüfung eines Modells ist kostenlos und funktioniert schon heute.',
      hero: {
        alt: 'Reception-Übersicht eines Wohnbauprojekts mit Beispieldaten: heutige Aufgaben, geschätzte eingesparte Stunden und Euro sowie Lieferanten nach Meilenstein',
        cap: 'Die Baustelle auf einen Blick, mit Beispieldaten: was heute zu prüfen ist, geschätzte Einsparungen mit ihren Annahmen und jeder Lieferant nach Meilenstein. Oberfläche auf Spanisch.',
      },
      sections: [
        {
          kind: 'text', label: 'Das Problem', h2: 'Schlechte Modelle fallen erst beim Empfänger auf',
          ps: [
            'Nach ISO 19650-2 ist die Prüfung und Annahme des Informationsmodells Aufgabe des Auftraggebers: des Bauunternehmens oder Projektentwicklers, der es erhält. Der Leitfaden des UK BIM Framework beschreibt diese Prüfung als Teil des Workflows in der gemeinsamen Datenumgebung.',
            'Skanska UK sagt, seine Ziele hingen "critically" (entscheidend) davon ab, qualitativ gute Informationen aus der Lieferkette zu erhalten. BIM-Manager von Bauunternehmen beschreiben erhebliche Schwierigkeiten, Informationen per E-Mail und FTP die Kette hinunter und wieder hinauf zu bringen.',
            'In der Praxis öffnet ein Koordinator jede Lieferung, findet dieselben fehlenden Eigenschaften und falschen Namen, schreibt die Gründe von Hand und wartet auf die nächste Version. Der Nachunternehmer erfährt die Regeln erst, wenn er abgelehnt wird.',
          ],
          sources: ['ukbimPartC', 'skanska', 'cmTier2'],
        },
        {
          kind: 'flow', label: 'So funktioniert es', h2: 'Von Ihren Anforderungen zum Bericht für den Bauherrn',
          sub: 'Alle Aufnahmen unten zeigen den Reception-Entwurf mit Beispieldaten (Projekt "Mirador del Turia", zehn Lieferanten). Die Oberfläche ist auf Spanisch.',
          steps: [
            { h: 'Anforderungen als Link veröffentlichen', p: 'Regeln, IDS und Mindestscore je ISO-19650-Status. Nachunternehmer erhalten die freigegebene Version; ein älterer Link funktioniert weiter.', alt: 'Regelbibliothek mit einem Versionswechsel, seiner Wirkung auf dasselbe Modell und einer Schaltfläche, um den Link für Nachunternehmer zu erstellen', cap: 'Was sich zwischen Regelversionen ändert, und der Link, der an die Nachunternehmer geht.' },
            { h: 'Nachunternehmer prüfen kostenlos vor dem Versand', p: 'Ohne Konto. Sie sehen den Score, was fehlschlägt, die betroffenen Elemente und die [Korrekturanleitung](fix) zu jeder Regel, sodass die meisten Fehler behoben sind, bevor sie bei Ihnen ankommen.', alt: 'Lieferantenseite ohne Konto mit einem Score von 84, einem falschen Dateinamen und einer Liste der Korrekturen', cap: 'Die Seite, die ein Nachunternehmer sieht: was besteht, was fehlschlägt und wie die Datei umzubenennen ist.' },
            { h: 'Eine Warteschlange prüfen statt eines Posteingangs', p: 'Lieferungen kommen bereits geprüft an, mit dem nach ISO 19650 gelesenen Dateinamen und einem Vorher-Nachher-Vergleich zur vorigen Version. Tastenkürzel führen Sie durch die Warteschlange.', alt: 'Prüfdialog mit vier Versionen einer Lieferung, dem in Felder zerlegten ISO-19650-Dateinamen und dem Anforderungsscore', cap: 'Eine Lieferung: ihre Versionen, ihr Dateiname Feld für Feld und ihre Anforderungen.' },
            { h: 'Mit umsetzbaren Gründen zurückgeben', p: 'Jeder Grund verweist auf die Elemente in 3D und darauf, wie sie zu korrigieren sind. Alles wird mit verkettetem Hash protokolliert und als CSV exportiert.', alt: 'Entscheidung, eine Lieferung zurückzugeben, mit angehakten nicht erfüllten Gründen und aufgelisteten Elementen', cap: 'Ein Modell zurückgeben: die Gründe, die Elemente und eine Notiz für den Lieferanten.' },
            { h: 'Kollisionen zwischen Gewerken im Zeitverlauf sehen', p: 'Kollisionsläufe im Browser, nach geschätzten Kosten sortiert, mit dem Trend zwischen den Läufen.', alt: 'Kollisionspanel mit dem Trend zwischen Läufen und nach geschätzten Kosten sortierten Kollisionen', cap: 'Kollisionen mit Trend und geschätzten Kosten (föderiertes Beispielhotel).' },
            { h: 'Den Bauherrn informieren, ohne selbst zu schreiben', p: 'Eine Projektseite mit dem aktuellen Score, angenommenen Lieferungen, gelösten Kollisionen und dem nächsten Meilenstein. Der Versand ist in der Vorschau simuliert.', alt: 'Projektseite für den Bauherrn mit dem Health Score des Modells, gelösten Kollisionen und der Zeitleiste', cap: 'Was der Bauherr beim Öffnen des Update-Links sieht.' },
            { h: 'Den Wochenbericht an die Bauleitung senden', p: 'Erhalten, bestanden, fehlend und die geschätzte eingesparte Zeit, fertig formuliert zum Kopieren oder Herunterladen.', alt: 'Wöchentlicher Lieferbericht für die Bauleitung mit einer Zusammenfassung je Lieferant', cap: 'Der Wochenbericht, aus den Lieferungen erzeugt.' },
          ],
        },
        {
          kind: 'table', label: 'Geschätzte Einsparung', h2: 'Rund 22 Stunden eines Koordinators im Monat, nach unseren Annahmen',
          sub: 'Eine Schätzung, keine Messung. Setzen Sie Ihre eigenen Zahlen ein: In der Reception-Übersicht lässt sich jede Annahme bearbeiten.',
          head: ['Aufgabe', 'Annahme', 'Eingesparter Anteil (angenommen)', 'Minuten pro Monat'],
          rows: [
            ['Lieferungen von Hand prüfen', '40 Lieferungen × 25 min', '80 %', '800'],
            ['Kollisionsbesprechung vorbereiten', '4 Besprechungen × 90 min', '70 %', '252'],
            ['Bericht für den Bauherrn schreiben', '8 Berichte × 45 min', '80 %', '288'],
            ['Gesamt', '', '', '1.340 min ≈ 22 h'],
          ],
          after: [
            'Bei 45 € pro Stunde sind das rund 1.000 € im Monat. Der Reception-Plan ist ab 290 € pro Projekt und Monat geplant und würde sich nach diesen Annahmen etwa dreifach bezahlt machen. Vermiedene Nacharbeit und Vertragsstrafen sind nicht eingerechnet.',
          ],
        },
        {
          kind: 'table', label: 'Vergleich', h2: 'Neben einer gemeinsamen Datenumgebung',
          sub: 'Jede Anbieterspalte gibt nur wieder, was auf der Seite des Anbieters an dem Tag stand, an dem wir sie gelesen haben. Wo eine Seite nichts sagt, steht das in der Zelle.',
          head: ['', 'Catenda Hub', 'Dalux Box', 'Autodesk Construction Cloud', 'IFC Viewer Online Reception (Vorschau)'],
          rows: [
            ['Veröffentlichter Preis', 'Pro Projekt, nach Bauvolumen: rund 400 € im Monat für ein 10-Mio.-€-Projekt, rund 1.100 € für 50 Mio. €; Angebot auf Anfrage', 'Keiner auf der Produktseite; Kontaktformular', 'Keiner; Angebot pro Paket, mit Preisen nach Nutzern, Projekten und Konto', 'Geplant: ab 290 € pro Projekt und Monat mit 15 Lieferanten oder 790 € unbegrenzt. Noch nicht erhältlich'],
            ['Lieferanten brauchen eine Lizenz', 'Nein: "Your subs don\'t need a licence to log a defect" (Ihre Nachunternehmer brauchen keine Lizenz, um einen Mangel zu erfassen)', 'Auf der Seite nicht angegeben', 'Auf der Seite nicht angegeben', 'Kein Konto: Sie prüfen kostenlos im Browser'],
            ['Modellprüfung gegen Anforderungen', 'Auf der Preisseite nicht angegeben', 'Ja: Modelldaten und Geometrie gegen Projektanforderungen validieren', 'Das Paket Model Management nennt Modellaufbereitung, Koordination und Kollisionsprüfung', 'Regeln und IDS 1.0 mit Score je Lieferung. Die Prüfung ist heute kostenlos; der Eingang ist in der Vorschau'],
            ['Freigabe erhaltener Modelle', 'Auf der Preisseite nicht angegeben', 'Freigabe-Workflows und eine durchsetzbare Dateibenennungskonvention', 'Auf der Preisseite nicht angegeben', 'Annehmen oder mit Gründen und 3D-Elementen zurückgeben (Vorschau)'],
          ],
          after: [
            'Das ersetzt Ihre CDE nicht. Es sitzt davor: Welche CDE Sie auch nutzen, das Modell kommt bereits gegen Ihre Anforderungen geprüft an, und der Lieferant kannte sie vor dem Versand.',
          ],
          sources: ['catenda', 'dalux', 'acc'],
        },
        {
          kind: 'cols', label: 'Kostenlos und Vorschau', h2: 'Was heute funktioniert und was Vorschau ist',
          cols: [
            { h: 'Kostenlos, heute verfügbar', items: ['Jedes IFC im Browser öffnen und prüfen, ohne Upload', 'Ihre IDS-1.0-Dateien und 44 Regeln mit Health Score', 'BCF-Import und -Export, Versionsvergleich', 'Die [Korrekturanleitungen](fix) zu jeder Regel'] },
            { h: 'Reception-Plan, in der Vorschau', items: ['Anforderungslink mit Versionen je ISO-19650-Status', 'Lieferwarteschlange mit Annahme oder Rückgabe samt Gründen', 'Lieferantenakte und Protokoll mit verkettetem Hash', 'Bauherrenseite und Wochenbericht'] },
          ],
        },
      ],
      faq: [
        ['Kann ich Reception heute nutzen?', 'Noch nicht. Es ist entworfen und wird mit Beispieldaten gezeigt. Wenn Sie Modelle von Nachunternehmern erhalten, [sprechen Sie mit uns](pricing): Wir suchen einige Pilotprojekte. Ein Modell gegen Ihre Anforderungen zu prüfen ist kostenlos und funktioniert heute im [Viewer](viewer).'],
        ['Zahlen Nachunternehmer oder brauchen sie ein Konto?', 'Nein. Sie öffnen Ihren Link und prüfen ihr Modell kostenlos im Browser. Bezahlt wird von dem, der die Lieferungen erhält und verwaltet.'],
        ['Ersetzt es Catenda, Dalux oder Autodesk Construction Cloud?', 'Nein. Es prüft das Modell, bevor es Ihre CDE erreicht, und funktioniert mit jeder CDE. Jede CDE hat ihren eigenen Workflow; siehe den Vergleich oben mit dem Datum, an dem wir ihre Seiten gelesen haben.'],
        ['Wird das Modell zur Prüfung hochgeladen?', 'Bei der kostenlosen Prüfung nicht: Sie läuft im Browser des Nachunternehmers. In Reception wird die angenommene Lieferung für Sie in der EU gespeichert.'],
        ['Was wird es kosten?', 'Geplant sind ab 290 € pro Projekt und Monat mit 15 Lieferanten oder 790 € für unbegrenzte Projekte. Die Preise können sich bis zum Start ändern; siehe die [Pläne](pricing).'],
        ['Woher kommt die Einsparungszahl?', 'Aus den Annahmen in der Tabelle oben: Anzahl der Lieferungen, Minuten je Aufgabe und der eingesparte Anteil je Aufgabe. Es sind Annahmen, keine Messungen, und Sie können sie in der Übersicht ändern.'],
      ],
      faqSources: ['catenda', 'dalux', 'acc'],
      bottom: ['Sie erhalten Modelle von Nachunternehmern?', 'Sagen Sie uns, wie viele Projekte und Lieferanten Sie haben. Wir wählen einige Pilotprojekte für Reception aus.'],
    },
    engineering: {
      title: 'BIM-Koordination für Ingenieurbüros – Team-Plan',
      desc: 'Modelle, die der Bauherr beim ersten Mal annimmt: gemeinsame Regeln, Kollisionsläufe, Issues mit Lösungsvorschlag, Freigabesperre. Team-Plan als Vorschau.',
      nav: 'Für Ingenieurbüros',
      kicker: 'Für Ingenieurbüros und Planungsbüros · Team-Plan · Vorschau',
      h1: ['Modelle liefern, die der Bauherr beim ersten Mal annimmt', 'für Ingenieurbüros und Planungsbüros, die mehrere Gewerke koordinieren'],
      lead: 'Ein einheitliches Regelwerk für das Büro, Kollisionsläufe im Browser, Issues mit Kameraansicht und Lösungsvorschlag und eine Sperre, die verhindert, dass ein Modell unter Ihrem Mindestscore veröffentlicht wird. Der Bauherr sieht den Fortschritt, ohne dass Sie ihn aufschreiben.',
      cta: 'Auf die Team-Warteliste',
      cta2: 'Mehr zur Kollisionsprüfung im Browser',
      note: 'Vorschau: Der Team-Plan ist entworfen und wird hier mit Beispieldaten gezeigt. Er ist noch nicht erhältlich, und nichts wird gespeichert. Die Prüfung eines Modells mit Ihrer IDS ist kostenlos und funktioniert schon heute.',
      hero: {
        alt: 'Team-Dashboard mit Beispieldaten: Health Score je Projekt und sein Trend, offene Issues je Person und gefährdete Termine',
        cap: 'Das Team-Dashboard mit Beispieldaten: Zustand jedes Projekts, Auslastung je Person und gefährdete Termine. Oberfläche auf Spanisch.',
      },
      sections: [
        {
          kind: 'text', label: 'Das Problem', h2: 'Ablehnungen entstehen durch Details, die niemand geprüft hat',
          ps: [
            'Bauherren schicken heute ihre eigenen Informationsanforderungen, oft als IDS. Eine Lieferung, bei der ein Eigenschaftsname oder eine Klassifizierung fehlt, geht zurück, und die Korrektur kostet mehr, als die Prüfung gekostet hätte.',
            'Ein BIM-Berater beschreibt ein Problem bei der Validierung von IFC-Daten, das Wochen kostete, weil Eigenschaftsnamen nicht den Vorgaben entsprachen. ISO 19650-2 macht die Prüfung vor dem Teilen zu einem Schritt des Lieferteams, nicht des Bauherrn.',
            'In einem Büro leben die Regeln im Kopf oder in der Tabelle einer Person, Kollisionen werden in einer Besprechung durchgesehen, und die Issues landen in E-Mail-Verläufen ohne die Ansicht, die sie erklärt.',
          ],
          sources: ['bimCorner', 'ukbimPartC'],
        },
        {
          kind: 'flow', label: 'So funktioniert es', h2: 'Vom Büro-Regelwerk zum veröffentlichten Modell',
          sub: 'Alle Aufnahmen unten zeigen den Team-Entwurf mit Beispieldaten. Die Oberfläche ist auf Spanisch.',
          steps: [
            { h: 'Regeln einmal schreiben, als Sätze', p: 'Klasse, Bedingung, Anforderung und Schweregrad, einschließlich Geometrie (Freiraum vor Türen, lichte Höhe) und Beziehungen (Tür in einer Wand). Jede Regel ist IDS 1.0.', alt: 'Regeleditor mit Geometrie- und Beziehungsregeln, Ergebnissen am Beispielmodell und einem erstellten Issue mit Korrektur', cap: 'Geometrie- und Beziehungsregeln, an einem Beispielmodell geprüft.' },
            { h: 'Sie als Büro verwalten', p: 'Eine gemeinsame Bibliothek mit Versionen, Autor, Prüfung und Freigabe (der Autor gibt seine eigene Regel nicht frei), Kommentaren und Export nach IDS.', alt: 'Regelbibliothek des Büros mit einer Version in Prüfung, den Änderungen von v2 zu v3 und Kommentaren', cap: 'Ein Regelsatz in Prüfung: was sich geändert hat, wer ihn freigibt und die Historie.' },
            { h: 'Kollisionen im Browser prüfen', p: 'Harte Kollisionen und Abstandskollisionen zwischen Gewerken, gruppiert, mit Regeln zum Ausblenden des Akzeptierten und geschätzten Kosten für jede.', alt: 'Kollisionspanel an einem Hochhausmodell mit Ignorierregeln, die akzeptierte Kollisionen ausblenden', cap: 'Ignorierregeln an einem Hochhausmodell: 1.569 von 4.827 Ergebnissen ausgeblendet.' },
            { h: 'Aus jedem Fehler ein Issue mit Korrektur machen', p: 'Zugewiesen, mit Frist, gespeicherter Kamera und einem Korrekturvorschlag je Autorenwerkzeug aus unseren Korrekturanleitungen. Gäste kommentieren kostenlos; BCF rein und raus.', alt: 'Issue mit Korrekturvorschlag für mehrere Autorenwerkzeuge, Verantwortlichem, Frist und Kommentaren', cap: 'Ein Issue mit Korrekturvorschlag, Verantwortlichem und Frist.' },
            { h: 'Ein schwaches Modell vor der Veröffentlichung stoppen', p: 'Nichts erreicht den Status Veröffentlicht unter Ihrem Mindestscore, mit optionalem Prüfer und einer Historie, was bestanden hat und warum.', alt: 'Freigabesperre mit einem Mindestscore von 80 und der Historie veröffentlichter und zurückgehaltener Modelle', cap: 'Die Freigabesperre und ihre Historie.' },
            { h: 'Den Bauherrn informiert halten', p: 'Updates je Phase aus Live-Daten: Score, Lieferungen, Issues und Meilensteine. Der Versand ist in der Vorschau simuliert.', alt: 'Bildschirm für Bauherren-Updates mit Auswahl von Phase, Vorlage und Empfängern', cap: 'Ein Bauherren-Update je Projektphase.' },
          ],
        },
        {
          kind: 'table', label: 'Geschätzte Einsparung', h2: 'Rund 17 Stunden im Monat, nach unseren Annahmen',
          sub: 'Eine Schätzung für ein Team von drei Personen, keine Messung. Setzen Sie Ihre eigenen Zahlen ein.',
          head: ['Aufgabe', 'Annahme', 'Eingesparter Anteil (angenommen)', 'Minuten pro Monat'],
          rows: [
            ['Lieferungen vor dem Versand prüfen', '12 Lieferungen × 60 min', '60 %', '432'],
            ['Kollisionsbesprechung vorbereiten', '4 Besprechungen × 90 min', '70 %', '252'],
            ['Zurückgegebene Lieferungen nacharbeiten', '3 Rückgaben × 120 min', '50 %', '180'],
            ['Bauherren-Updates schreiben', '8 Updates × 30 min', '70 %', '168'],
            ['Gesamt', '', '', '1.032 min ≈ 17 h'],
          ],
          after: [
            'Bei 45 € pro Stunde sind das rund 775 € im Monat. Team ist mit 59 € pro Bearbeiter und Monat bei jährlicher Abrechnung geplant, mindestens drei Bearbeiter (177 € im Monat), und würde sich nach diesen Annahmen etwa vierfach bezahlt machen.',
          ],
        },
        {
          kind: 'table', label: 'Vergleich', h2: 'Neben den üblichen Koordinationswerkzeugen',
          sub: 'Jede Anbieterspalte gibt nur wieder, was auf der Seite des Anbieters an dem Tag stand, an dem wir sie gelesen haben.',
          head: ['', 'BIMcollab', 'Solibri', 'IFC Viewer Online Team (Vorschau)'],
          rows: [
            ['Veröffentlichter Preis', 'Basic 12,50 €, Advanced 18,75 €, Enterprise 25 € pro Nutzer und Monat bei jährlicher Abrechnung', 'Pro Lizenz und Jahr: Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €', 'Geplant: 59 € pro Bearbeiter und Monat bei jährlicher Abrechnung, mindestens drei Bearbeiter. Noch nicht erhältlich'],
            ['Issues', 'BCF-basiertes Issue-Management mit Plug-ins für BIM-Werkzeuge', 'BCF-Issue-Management ab Essential', 'Issues mit Kamera, Frist und Korrekturvorschlag; BCF rein und raus (Vorschau)'],
            ['Regeln', 'Kollisionsregeln und Smart Views, gemeinsam nutzbar in BIMcollab Zoom', 'Vordefinierte Regeln ab Essential; eigene Regeln ab Advanced; Regel-Governance in Premium', 'Regeln als Sätze, IDS 1.0, gemeinsame Bibliothek mit Freigabe (Vorschau)'],
            ['Gäste', 'Ein oder zwei Gastkonten je zahlendem Nutzer, je nach Plan', 'Auf der Preisseite nicht angegeben', 'Gäste kommentieren kostenlos'],
          ],
          after: [
            'Solibri ist die stärkere Wahl für tiefgehende regelbasierte Prüfung am Desktop, BIMcollab für einen großen werkzeugübergreifenden Issue-Workflow. Team ist für Büros, die Regeln, Kollisionen, Issues und das Bauherren-Update an einem Ort im Browser haben wollen.',
          ],
          sources: ['bimcollab', 'solibri'],
        },
        {
          kind: 'cols', label: 'Kostenlos und Vorschau', h2: 'Was heute funktioniert und was Vorschau ist',
          cols: [
            { h: 'Kostenlos, heute verfügbar', items: ['Mehrere IFC-Dateien im Browser öffnen und föderieren', 'Jedes Modell mit Ihrer IDS 1.0 und 44 Regeln prüfen', 'BCF-Import und -Export, Versionsvergleich', 'Die [Korrekturanleitungen](fix) zu jeder Regel'] },
            { h: 'Team-Plan, in der Vorschau', items: ['Regelbibliothek des Büros mit Freigabe', 'Kollisionsprüfung zwischen Gewerken', 'Gemeinsame Issues mit Korrekturvorschlag, Freigabesperre', 'Bauherren-Updates je Phase'] },
          ],
        },
      ],
      faq: [
        ['Kann ich Team heute nutzen?', 'Noch nicht. Es ist entworfen und wird mit Beispieldaten gezeigt. [Tragen Sie sich in die Warteliste ein](pricing), um zu erfahren, wann es startet. Ein Modell mit Ihrer IDS zu prüfen ist kostenlos und funktioniert heute im [Viewer](viewer).'],
        ['Ist die Kollisionsprüfung kostenlos?', 'Nein. Die Kollisionsprüfung zwischen Gewerken ist ein neues Werkzeug und wird kostenpflichtig. Öffnen, Föderieren und Prüfen jedes Modells bleiben kostenlos. Mehr im Beitrag zur [Kollisionsprüfung im Browser](postClash).'],
        ['Können wir die IDS unseres Bauherrn verwenden?', 'Ja, und dieser Teil ist heute kostenlos. In Team können Sie eine IDS außerdem in die Bibliothek des Büros importieren und ihre Versionen behalten.'],
        ['Ersetzt es BIMcollab oder Solibri?', 'Nicht für jedes Team. Siehe den Vergleich oben, mit den Preisen von ihren Seiten und dem Datum, an dem wir sie gelesen haben.'],
        ['Was wird es kosten?', 'Geplant sind 59 € pro Bearbeiter und Monat bei jährlicher Abrechnung, mindestens drei Bearbeiter; Gäste sind kostenlos. Die Preise können sich bis zum Start ändern; siehe die [Pläne](pricing).'],
        ['Können wir einen ganzen Ordner mit Modellen prüfen?', 'Auch das gehört zur kostenpflichtigen Vorschau: So funktioniert die [Stapelvalidierung](postBatch).'],
      ],
      faqSources: ['bimcollab', 'solibri'],
      bottom: ['Sie koordinieren mehrere Gewerke?', 'Tragen Sie sich in die Team-Warteliste ein und sagen Sie uns, wie viele Bearbeiter Sie haben. Wir melden uns, wenn es startet.'],
    },
  },
}
