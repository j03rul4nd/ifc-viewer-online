import type { LangCopy } from './types'

// German copy for the six landing families. Translated from copy-en.ts; see
// TRANSLATING.md. Vendor quotes stay in English inside „…“.

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Quellen',
    readOn: 'abgerufen am',
    faqLabel: 'FAQ',
    faqTitle: 'Fragen',
    related: 'Verwandte Seiten',
    fix: 'IFC-Fehler beheben',
    blogSolibri: 'Solibri oder ein Validator im Browser: der ausführliche Vergleich',
    pricing: 'Preise',
    embedCta: 'Validierung an einer Beispiel-IFC ausführen',
    embedSub: 'Lädt den Validator in diese Seite. Es wird nichts hochgeladen.',
  },
  pages: {
    // ─────────────────────────────────────────────────────────────────────────
    validator: {
      title: 'Online-IFC-Validierung — Gratis IFC Validator, 44 Regeln',
      desc: 'IFC-Datei im Browser prüfen: 44 Regeln, IDS 1.0 und Health Score von 0 bis 100. Kein Upload der Datei. Kostenlos, ohne Konto. IFC2x3, IFC4, IFC4x3.',
      nav: 'IFC-Validator',
      kicker: '44 Regeln · IDS 1.0 · Die Datei bleibt in Ihrem Browser · Kostenlos',
      h1: ['Online-IFC-Validierung', 'Was an der Datei nicht stimmt, und wo'],
      lead: 'Legen Sie eine IFC-Datei ab und Sie erhalten einen Health Score von 0 bis 100, die Liste der Probleme nach Regel gruppiert und die betroffenen Elemente im 3D-Modell hervorgehoben. Die Datei wird in Ihrem Browser-Tab gelesen und nicht hochgeladen.',
      cta: 'IFC-Datei validieren',
      cta2: 'oder das Beispielmodell öffnen',
      note: 'Ohne Konto. IFC2x3, IFC4, IFC4x1 und IFC4x3, bis 2 GB pro Datei.',
      shots: [
        { alt: 'IFC-Validierung eines zweigeschossigen Hauses im Browser: Health Score 77, ein Fehler und 161 Warnungen, die drei Korrekturen, die die meisten Punkte zurückbringen, und die 3D-Ansicht, die die 119 Elemente ohne Typ nacheinander anfährt', cap: 'Das öffentliche Duplex-Beispiel (2,3 MB, 7.181 Entitäten) erreicht 77 Punkte. „Show in 3D“ bei der ersten Korrektur zoomt auf die 119 Elemente ohne Typ; mit einem Zähler gehen Sie sie einzeln durch.' },
        { alt: 'Liste der Probleme einer IFC-Validierung, nach Regel gruppiert, mit der Anzahl der Elemente, die jede Regel verletzen, und der Erklärung, wie man sie behebt', cap: 'Jede Regel lässt sich aufklappen: zu ihren Elementen und zu den Schritten, mit denen man sie in Revit, Archicad oder Tekla behebt.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Umfang', h2: 'Was die Prüfung abdeckt, und was nicht',
          sub: 'Es gibt 44 Regeln in acht Gruppen. 25 laufen standardmäßig; die anderen 19 werden über ein Profil eingeschaltet, weil sie eine Entscheidung von Ihnen brauchen (eine LOD-Stufe, ein Namensschema, ein Klassifikationssystem).',
          cols: [
            { h: 'Geprüft wird', items: [
              'Kennungen: doppelte GlobalIds und GlobalIds, die keine gültigen IFC-GUIDs mit 22 Zeichen sind.',
              'Struktur: genau ein IfcProject, die Kette Projekt → Grundstück → Gebäude → Geschoss, Elemente ohne Geschoss, unterbrochene oder zirkuläre Aggregationen, Öffnungen ohne Trägerbauteil.',
              'Geschosse: fehlende, doppelte oder ungeordnete Höhenkoten.',
              'Daten: leere Namen, doppelte Namen, leere Eigenschaftswerte, Elemente ohne Typ oder Material, Räume ohne Grundfläche.',
              'Exportqualität: mehr als 5 % der Elemente als IfcBuildingElementProxy, ein Modell mehr als 10 km vom Ursprung entfernt, mehr als 500 KB pro Element, imperiale Längeneinheiten.',
              'Auf Wunsch: geforderte Property Sets pro Klasse, Namensschemata, Klassifikation, Eigenschaften und Mengen für LOD 100–400, Projekt- und Autorenfelder nach ISO 19650, TGA-Systeme.',
              'Ihre eigenen Anforderungen: eine IDS-1.0-Datei, eines von fünf mitgelieferten Profilen (Basislieferung, Qualitätsprüfung, BIM-Koordination, ISO 19650, LOD 300) oder ein Profil, das Sie selbst definieren.',
            ] },
            { h: 'Nicht geprüft wird', items: [
              'Kollisionen zwischen zwei Modellen. Die Kollisionsregeln vergleichen Bounding Boxes innerhalb eines Modells, mit 5 cm Überlappung, bis zu 800 Elementen und 100 Ergebnissen. Sie sind ein erster Filter, keine Koordination.',
              'Bauvorschriften: Barrierefreiheit, Brandschutz, Fluchtwege oder lichte Höhen. Keine Regel hier liest eine Vorschrift.',
              'Das gesamte IFC-Schema. Es ist kein EXPRESS-Konformitätstest: Es laufen diese 44 Regeln und Ihre IDS.',
              'ISO-19650-Codes. Die Dateinamen-Regel liest den Namen aus dem IFC-Header und zählt seine Felder; sie prüft nicht jeden einzelnen Code.',
              'Native Dateien. Gelesen wird IFC, keine Revit- oder Archicad-Dateien.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Grenzen', h2: 'Grenzen, in Zahlen',
          head: ['', 'Grenze'],
          rows: [
            ['Dateigröße', 'Ab 2 GB pro Datei wird die Datei abgelehnt. Ab 200 MB erscheint ein Hinweis, ab 1 GB eine Speicherwarnung. Auf Smartphones, Tablets und Rechnern mit 4 GB Arbeitsspeicher oder weniger beginnt die Warnung bei 80 MB.'],
            ['Formate', 'IFC2x3, IFC4, IFC4x1 und IFC4x3, als .ifc oder in .ifczip und .zip.'],
            ['Regeln', '44 insgesamt, 25 standardmäßig aktiv. Schweregrad und Schwellenwerte lassen sich pro Regel ändern.'],
            ['IDS', 'IDS 1.0 mit ihren sechs Facetten. Die Einschränkungen totalDigits, fractionDigits und whiteSpace werden nicht gelesen. Pro Spezifikation werden bis zu 200 fehlerhafte Elemente aufgelistet.'],
            ['Automatische Korrekturen', 'Ungültige und doppelte GlobalIds sowie leere oder doppelte Namen. Alles andere bearbeiten Sie von Hand oder beheben es in der Autorensoftware.'],
            ['Geschwindigkeit', 'Das Beispiel im Bild (2,3 MB, 7.181 Entitäten) wurde auf dem Rechner, mit dem diese Aufnahmen entstanden, in etwa 20 Sekunden validiert. Die Dauer wächst mit der Anzahl der Entitäten.'],
            ['Verbindung', 'Die Seite muss aus dem Internet geladen werden. Offline funktioniert sie nicht.'],
          ],
        },
        {
          kind: 'text', label: 'Ihre Datei', h2: 'Was mit der Datei geschieht',
          ps: [
            'Die IFC wird von Code geöffnet, der in Ihrem Browser-Tab läuft. Sie wird weder an uns noch an Dritte gesendet; es gibt also keinen Upload, auf den Sie warten müssen, und nichts, was danach zu löschen wäre.',
            'Damit sich ein Modell schneller wieder öffnen lässt, behält der Browser eine konvertierte Kopie der Geometrie in seinem eigenen privaten Speicher auf Ihrem Rechner (bis zu 4 GB, die ältesten Einträge werden zuerst entfernt). Wenn Sie die Websitedaten im Browser löschen, ist sie weg.',
            'Zwei Dinge verlassen den Browser doch, und beide haben Sie in der Hand. Eine Nutzungsstatistik ohne Cookies hält fest, dass eine Datei geöffnet wurde, ihre Größe und die Anzahl ihrer Elemente, nie den Inhalt; sie lässt sich abschalten und beachtet Do Not Track. Und wenn Sie auf Teilen klicken, enthält der Link selbst den Score, den Dateinamen und die ersten 50 Probleme mit den Namen der Elemente; wer den Link hat, kann das also lesen.',
          ],
        },
        { kind: 'shot', label: 'Das Ergebnis', h2: 'Vom Score zum Element', sub: 'Probieren Sie es hier am Beispielmodell aus und öffnen Sie dann Ihre eigene Datei.' },
        {
          kind: 'steps', label: 'Ablauf', h2: 'Von der Datei zur korrigierten IFC',
          steps: [
            ['Datei öffnen', 'Ziehen Sie die .ifc in die Seite. Es können mehrere Dateien gleichzeitig geöffnet sein; jede wird für sich validiert.'],
            ['Ergebnis lesen', 'Der Score, die Fehler und Warnungen und die drei Korrekturen, die die meisten Punkte zurückbringen. Ein Klick hebt die betroffenen Elemente hervor.'],
            ['Beheben, was sich hier beheben lässt', 'Ungültige GlobalIds neu erzeugen, in einem Zug umbenennen, Namen und Eigenschaftswerte bearbeiten. Jede Änderung lässt sich rückgängig machen.'],
            ['Exportieren', 'Die korrigierte IFC, vom Parser neu geschrieben, und die Ergebnisse als BCF 2.1, CSV, JSON, HTML-Lieferbericht oder COBie-Tabelle.'],
          ],
        },
        {
          kind: 'text', label: 'Preis', h2: 'Was es kostet',
          ps: [
            'Nichts. Der Viewer, die 44 Regeln, IDS, die Korrekturen und jeder Export auf dieser Seite sind kostenlos, ohne Konto, auch für kommerzielle Arbeit. Der Quellcode ist unter der MIT-Lizenz auf [GitHub](github) öffentlich.',
            'Bezahlte Pläne (Pro für 19 € im Monat, Team für 35 € pro Bearbeiter im Monat) sind für Dinge gedacht, die einen Server brauchen, etwa das Speichern von Modellen und gespeicherte Regelsätze. Sie sind noch nicht im Verkauf; auf der [Preisseite](pricing) steht, was jeder Plan enthalten wird.',
          ],
        },
      ],
      faq: [
        ['Wird die IFC-Datei auf einen Server hochgeladen?', 'Nein. Die Datei wird von Code gelesen, der in Ihrem Browser-Tab läuft. Den Browser verlassen nur eine anonyme Nutzungsstatistik (Dateigröße und Anzahl der Elemente, nie der Inhalt) und die Freigabelinks, die Sie selbst erstellen.'],
        ['Welche IFC-Versionen werden gelesen?', 'IFC2x3, IFC4, IFC4x1 und IFC4x3, als .ifc-Dateien oder in .ifczip- und .zip-Archiven. Dateien ab 2 GB werden abgelehnt.'],
        ['Ersetzt es ein Werkzeug für die Kollisionsprüfung?', 'Nein. Die Kollisionsregeln vergleichen Bounding Boxes innerhalb eines einzelnen Modells und sind standardmäßig aus. Sie finden offensichtliche Überlappungen, bevor Sie ein Modell weitergeben; die Koordination zwischen den Fachdisziplinen braucht ein Kollisionswerkzeug.'],
        ['Kann ich ein Modell gegen meine eigenen Anforderungen prüfen?', 'Ja. Laden Sie eine IDS-1.0-Datei oder beginnen Sie mit einem von sieben fertigen Anforderungssätzen (Lieferung nach ISO 19650, LOD 200 und LOD 400, COBie-Übergabe und weitere). Sie können auch ein Validierungsprofil mit eigenen Namensschemata und geforderten Property Sets anlegen.'],
        ['Kann ich die Fehler beheben und die IFC wieder exportieren?', 'GlobalIds und Namen lassen sich automatisch korrigieren; Namen, Beschreibungen und Eigenschaftswerte lassen sich von Hand bearbeiten, mit Rückgängig-Funktion. Der Export schreibt die IFC mit diesen Änderungen neu. Geometrie und Beziehungen lassen sich nicht bearbeiten.'],
        ['Funktioniert es ohne Internetverbindung?', 'Nein. Die Seite muss aus dem Internet geladen werden. Für Netze ohne Internetzugang gibt es eine [On-Premise-Installation](onprem).'],
      ],
      bottom: ['Jetzt eine Datei prüfen', 'Kostenlos, ohne Konto, und die Datei bleibt in Ihrem Browser.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    cloud: {
      title: 'Cloud-IFC-Validator — IFC online prüfen, ohne Upload',
      desc: 'IFC-Prüfung über eine Webseite, ohne das Modell hochzuladen: 44 Regeln, IDS 1.0 und Health Score, im Browser berechnet. Kostenlos, ohne Konto, bis 2 GB.',
      nav: 'Cloud-IFC-Validator',
      kicker: 'Online · Kein Upload · 44 Regeln · IDS 1.0 · Kostenlos',
      h1: ['Cloud IFC Validator', 'ohne den Upload'],
      lead: 'Ein Cloud-Werkzeug für die IFC-Prüfung bedeutet normalerweise, das Modell an einen fremden Server zu senden. Dieses hier ist eine Webseite, die die Arbeit in Ihrem eigenen Browser erledigt: genauso bequem, und die Datei verlässt Ihren Rechner nie.',
      cta: 'IFC-Datei validieren',
      cta2: 'oder das Beispielmodell öffnen',
      note: 'Ohne Konto. Läuft in Chrome, Edge, Firefox und Safari. Bis 2 GB pro Datei.',
      shots: [
        { alt: 'IDS-Prüfung eines IFC-Modells im Browser: Die Spezifikation „Walls declare a FireRating in Pset_WallCommon“ schlägt für die 57 Wände eines in 3D gezeigten zweigeschossigen Hauses fehl', cap: 'Eine IDS-1.0-Beispieldatei, gegen das Modell geprüft: Keine der 57 Wände gibt eine Feuerwiderstandsklasse an. Modell und IDS werden beide im Browser-Tab gelesen.' },
        { alt: 'Exportdialog einer IFC-Validierung mit den Formaten JSON, CSV, Zertifikat, BCF, Lieferbericht und COBie', cap: 'Die Ergebnisse verlassen die Seite als Dateien, die Sie herunterladen: BCF 2.1, CSV, JSON, HTML-Lieferbericht oder COBie-Tabelle.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Upload oder Browser', h2: 'Ein Prüfdienst, der hochlädt, und eine Seite, die es nicht tut',
          sub: 'Solibri WebChecker ist das am klarsten dokumentierte Beispiel für einen Cloud-Prüfdienst, deshalb dient er hier als Vergleich. Seine Spalte gibt wieder, was auf Solibris eigener Seite steht.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Wohin das Modell geht', 'Es wird zum Dienst hochgeladen. Die Daten werden in der EU oder in den USA gespeichert; das wird beim Einrichten des Projekts gewählt', 'Nirgendwohin. Es wird in Ihrem Browser-Tab gelesen'],
            ['Wie lange Ergebnisse aufbewahrt werden', '30 Tage, dann werden sie entfernt', 'Bis Sie den Tab schließen. Was Sie exportieren, behalten Sie'],
            ['Dateigröße', 'Bis 5 GB pro IFC-Datei', 'Unter 2 GB pro Datei, und weniger auf einem Rechner mit wenig Arbeitsspeicher'],
            ['Konto', 'Eine Solibri ID und ein Plan Solibri Advanced oder Premium', 'Keines'],
            ['Kosten einer Prüfung', '50 Token. Advanced enthält 1.750 Token pro Jahr, Premium 17.500; ein Paket mit 5.000 Token kostet 250 €', 'Kostenlos'],
            ['Prüfungen', 'Solibris Model-Health-Prüfung oder ein eigener Regelsatz (.cset), der in der Solibri-Desktopanwendung vorbereitet wird', '44 feste Regeln und Ihre IDS-1.0-Dateien'],
            ['Ergebnisse', 'PDF und BCF; SMC-Dateien mit Premium', 'BCF 2.1, CSV, JSON, HTML-Bericht, COBie-Tabelle. Keine PDF-Datei: Der HTML-Bericht lässt sich aus dem Browser drucken'],
          ],
          after: [
            'Ein Server ist dann gerechtfertigt, wenn Dateien größer sind, als ein Browser fassen kann, wenn Ergebnisse einem ganzen Projektteam zur Verfügung stehen müssen oder wenn Prüfungen unbeaufsichtigt laufen sollen. Nichts davon geschieht hier: Diese Seite prüft die Datei einer Person auf dem Rechner dieser Person.',
            'Der Browser ist im Vorteil, wenn das Modell das Haus nicht verlassen darf, wenn diese Woche niemand einen neuen Lieferanten freigibt oder wenn Sie einfach eine Antwort zu einer Datei brauchen.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Umfang', h2: 'Was geprüft wird, und was nicht',
          cols: [
            { h: 'Geprüft wird', items: [
              '44 Regeln in acht Gruppen: Kennungen, räumliche Struktur, Geschosse, Namen, Eigenschaftswerte, Typen, Materialien, Exportqualität. 25 laufen standardmäßig.',
              'IDS-1.0-Dateien mit den sechs Facetten: Entity, Attribute, Property, Classification, Material und PartOf.',
              'Fünf mitgelieferte Validierungsprofile (Basislieferung, Qualitätsprüfung, BIM-Koordination, ISO 19650, LOD 300) oder Ihr eigenes.',
            ] },
            { h: 'Nicht geprüft wird', items: [
              'Kollisionen zwischen Modellen. Nur Bounding Boxes innerhalb eines Modells, standardmäßig aus.',
              'Bauvorschriften oder Planungsregeln, die für Ihr Projekt geschrieben wurden. Es gibt keinen Regeleditor; Anforderungen kommen als IDS hinein.',
              'Stapelverarbeitung. Jede Datei wird von einer Person geöffnet; nichts läuft nach Zeitplan.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Grenzen', h2: 'Grenzen, in Zahlen',
          head: ['', 'Grenze'],
          rows: [
            ['Dateigröße', 'Ab 2 GB pro Datei wird die Datei abgelehnt. Ab 200 MB erscheint ein Hinweis, ab 1 GB eine Speicherwarnung; auf Smartphones, Tablets und Rechnern mit 4 GB Arbeitsspeicher oder weniger beginnt sie bei 80 MB.'],
            ['Formate', 'IFC2x3, IFC4, IFC4x1 und IFC4x3, als .ifc oder in .ifczip und .zip.'],
            ['IDS', 'IDS 1.0. Die Einschränkungen totalDigits, fractionDigits und whiteSpace werden nicht gelesen. Pro Spezifikation werden bis zu 200 fehlerhafte Elemente aufgelistet.'],
            ['Teilen', 'Ein Freigabelink trägt den Score und die ersten 50 Probleme in der URL, bis zu 8.000 Zeichen. Das Modell ist nicht darin enthalten.'],
            ['Verbindung', 'Die Seite muss aus dem Internet geladen werden. Offline funktioniert sie nicht.'],
          ],
        },
        {
          kind: 'text', label: 'Ihre Datei', h2: 'Was mit der Datei geschieht',
          ps: [
            'Die IFC wird von Code geöffnet, der in Ihrem Browser-Tab läuft, und nirgendwohin gesendet. Sie können das selbst nachprüfen: Öffnen Sie die Entwicklertools des Browsers, beobachten Sie den Tab Netzwerk und legen Sie eine Datei ab.',
            'Der Browser behält eine konvertierte Kopie der Geometrie in seinem privaten Speicher auf Ihrem Rechner (bis zu 4 GB), um das Modell schneller wieder zu öffnen. Wenn Sie die Websitedaten löschen, ist sie weg.',
            'Eine Nutzungsstatistik ohne Cookies hält die Dateigröße und die Anzahl der Elemente fest, nie den Inhalt, und lässt sich abschalten. Ein Freigabelink, falls Sie einen erstellen, enthält den Score, den Dateinamen und bis zu 50 Probleme mit Elementnamen.',
          ],
        },
        { kind: 'shot', label: 'Das Ergebnis', h2: 'An einem Beispielmodell ausprobieren', sub: 'Die Demo unten läuft in dieser Seite. Öffnen Sie danach Ihre eigene Datei.' },
        {
          kind: 'text', label: 'Preis', h2: 'Was es kostet',
          ps: [
            'Nichts: Der Viewer, die Regeln, IDS und die Exporte sind kostenlos und brauchen kein Konto. Der Code ist unter der MIT-Lizenz auf [GitHub](github) öffentlich.',
            'Bezahlte Pläne, die einen Server ergänzen (gespeicherte Modelle, gespeicherte Regelsätze, Teamarbeit), sind auf der [Preisseite](pricing) beschrieben und noch nicht im Verkauf.',
          ],
        },
      ],
      faq: [
        ['Ist das ein Cloud-Dienst?', 'Er wird wie einer über das Web ausgeliefert, aber die Prüfung erledigt Ihr Browser. Es gibt keinen Upload, keine Warteschlange und keine gespeicherte Kopie des Modells auf unserer Seite.'],
        ['Wie kann ich nachprüfen, dass nichts hochgeladen wird?', 'Öffnen Sie die Entwicklertools Ihres Browsers, wechseln Sie zum Tab Netzwerk und legen Sie eine IFC-Datei ab. Sie sehen, wie die eigenen Dateien der Seite geladen werden, und keine Anfrage, die das Modell überträgt.'],
        ['Wie groß darf eine Datei sein?', 'Dateien ab 2 GB werden abgelehnt, und die praktische Grenze hängt vom Arbeitsspeicher des Rechners ab: Eine Warnung erscheint ab 1 GB, oder ab 80 MB auf Smartphones und Geräten mit 4 GB Arbeitsspeicher oder weniger. Solibri WebChecker nimmt bis zu 5 GB pro Datei an (solibri.com/solutions/webchecker, abgerufen am 2026-11-10).'],
        ['Kann ich es automatisieren?', 'Nicht von dieser Seite aus: Jede Datei wird von einer Person geöffnet. Es gibt einen MCP-Server (ifc-viewer-mcp), der dieselbe Validierung auf Ihrem eigenen Rechner aus einem Assistenten oder einem Skript heraus ausführt; siehe den [Quellcode auf GitHub](github).'],
        ['Ist es für vertrauliche Modelle zulässig?', 'Das Modell bleibt auf Ihrem Rechner, und das ist in der Regel, was eine Vertraulichkeitsvereinbarung (NDA) verlangt. Prüfen Sie zwei Dinge gegen Ihre eigenen Richtlinien: die anonyme Nutzungsstatistik (sie lässt sich abschalten) und die Freigabelinks (sie enthalten Datei- und Elementnamen).'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Eine Datei prüfen, ohne sie hochzuladen', 'Kostenlos, ohne Konto. Das Modell bleibt auf Ihrem Rechner.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    onprem: {
      title: 'On-Premise-IFC-Validator — BIM-Prüfung ohne Internet',
      desc: 'IFC-Viewer, Validator mit 44 Regeln und IDS-Prüfungen aus Ihrem eigenen Netz, ohne Internetverbindung. Container-Image, Einrichtung, Schulung und Support.',
      nav: 'On-Premise-IFC-Validierung',
      kicker: 'On-Premise · Keine Internetverbindung · Ihr Server',
      h1: ['On-Premise-IFC-Validator', 'für Netze, die geschlossen bleiben'],
      lead: 'Die öffentliche App liest IFC-Dateien bereits im Browser, aber die Seite selbst wird aus dem Internet geladen. Wo das nicht erlaubt ist, werden derselbe Viewer, derselbe Validator und dieselben IDS-Prüfungen aus einem Container auf Ihrem eigenen Server ausgeliefert.',
      cta: 'Pilotprojekt anfragen',
      cta2: '',
      note: 'Ein Standort, fester Umfang: Installation, Konfiguration mit Ihren Anforderungen, eine Schulung und ein Supportzeitraum.',
      shots: [
        { alt: 'IFC-Validator mit geöffneter Liste der mitgelieferten Validierungsprofile: Basislieferung, Qualitätsprüfung, BIM-Koordination, ISO-19650-Konformität und LOD-300-Entwurf', cap: 'Die mitgelieferten Profile. Im Pilotprojekt werden Ihre eigenen Profile und IDS-Dateien geladen und an Ihren Modellen getestet.' },
        { alt: 'Ergebnis einer IDS-Prüfung im IFC-Validator: eine Spezifikation nicht erfüllt, 0 von 57 Wänden mit der Eigenschaft FireRating, mit Schaltflächen zum Hervorheben, Isolieren und Exportieren', cap: 'Ein Modell, gegen eine IDS-Datei geprüft: Die 57 Wände erfüllen die Anforderung an die Feuerwiderstandsklasse nicht. On-Premise bleiben Modell und Anforderungen in Ihrem Netz.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Für wen', h2: 'Wenn „es wird nichts hochgeladen“ nicht genügt',
          cols: [
            { h: 'Es passt, wenn', items: [
              'Arbeitsplätze keinen Internetzugang haben oder keine Software von dort laden dürfen.',
              'Sie eine einzige geprüfte Version brauchen, die sich nicht ändert, bis Sie es entscheiden.',
              'Modelle von Auftragnehmern gegen Ihre IDS oder AIA geprüft werden müssen, ohne über einen Dritten zu laufen.',
              'Sie jemanden anrufen wollen, wenn es nicht funktioniert.',
            ] },
            { h: 'Sie brauchen es nicht, wenn', items: [
              'Ihre Richtlinie nur das Hochladen von Modellen verbietet. Der [öffentliche Validator](validator) lädt sie nicht hoch.',
              'Sie das Personal haben, um es selbst zu betreiben. Der Code steht unter der MIT-Lizenz und enthält ein Dockerfile: Image bauen und ausliefern. Das Pilotprojekt ergänzt Konfiguration, Schulung und Support, kein anderes Produkt.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Was Sie erhalten', h2: 'Was installiert wird, und was nicht',
          head: ['', 'Detail'],
          rows: [
            ['Software', 'Der Viewer, die 44 Regeln mit dem Health Score, IDS 1.0, BCF 2.1 und 3.0, mehrere Modelle gleichzeitig, Messen und Schnitte. Eine statische Webanwendung, von nginx aus einem Container ausgeliefert; die Prüfung läuft im Browser jedes Nutzers.'],
            ['Server', 'Jede Maschine, auf der ein Container läuft. Sie liefert nur Dateien aus und braucht deshalb wenig: Die Arbeit erledigen die Arbeitsplätze.'],
            ['Verbindungen', 'Keine ausgehende Verbindung und keine Nutzungsstatistik in diesem Build.'],
            ['Offline nicht verfügbar', 'Der 3D-Kartenkontext (Gelände, OpenStreetMap-Gebäude) und die Online-Beispielmodelle, weil sie aus dem Internet heruntergeladen werden.'],
            ['Ihre Anforderungen', 'Ihre IDS-Dateien, Validierungsprofile und Namensschemata, geladen und an Ihren eigenen Modellen getestet.'],
            ['Updates', 'Eine neue Image-Datei, geliefert über den Kanal, den Sie wählen. Nichts aktualisiert sich von selbst.'],
            ['Hardware', 'Ihr eigener Server oder Ihre eigene virtuelle Maschine. Auf Wunsch kann ein vorkonfiguriertes Gateway geliefert werden.'],
          ],
        },
        {
          kind: 'table', label: 'Alternativen', h2: 'Die andere Option für abgeschottete Netze, die wir kennen',
          sub: 'Falls Sie vergleichen: Das veröffentlicht Solibri über seinen Offline-Plan.',
          head: ['', 'Solibri Security+', 'IFC Viewer Online On-Premise'],
          rows: [
            ['Beschrieben als', '„Fully offline operation (no telemetry)“, „Air-gapped by design“, „Controlled update cycles“', 'Ein Container auf Ihrem Server; keine ausgehende Verbindung'],
            ['Preis', 'Nicht veröffentlicht; „Talk with an expert“', 'Angebot pro Pilotprojekt nach einem Klärungsgespräch'],
            ['Prüfungen', 'Solibris regelbasierte Validierung', '44 feste Regeln und IDS 1.0; Kollisionen nur per Bounding Box'],
          ],
          after: [
            'Solibri ist die stärkere Wahl, wenn Sie Kollisionsprüfung zwischen Fachdisziplinen brauchen oder Regeln, die für Ihre Organisation geschrieben wurden. Diese Installation ist die kleinere Lösung: eine Lieferung öffnen, sie gegen Ihre Anforderungen prüfen und die Ergebnisse zurückgeben.',
          ],
          sources: ['solibriPricing'],
        },
        {
          kind: 'steps', label: 'Pilotprojekt', h2: 'Wie ein Pilotprojekt abläuft',
          steps: [
            ['Klärungsgespräch', 'Ihre Netzwerkregeln, die Größe Ihrer Modelle, Ihre Anforderungen und wer es nutzen wird.'],
            ['Installation', 'Auf Ihrem Server, mit Ihren IDS-Dateien und Profilen geladen.'],
            ['Schulung', 'Ein Termin mit Ihren BIM-Koordinatoren, an Ihren eigenen Modellen.'],
            ['Entscheidung', 'Nach dem Supportzeitraum entscheiden Sie, ob Sie es auf weitere Standorte ausweiten.'],
          ],
        },
        {
          kind: 'form', label: 'Pilotprojekt anfragen', h2: 'Beschreiben Sie uns Ihre Umgebung',
          sub: 'Das Formular öffnet eine Nachricht in Ihrem eigenen E-Mail-Programm. An unsere Server wird nichts gesendet.',
          org: 'Organisation', sector: 'Branche',
          sectors: ['Verteidigung / Sicherheit', 'Energie / Versorgung', 'Verkehr / Infrastruktur', 'Öffentliche Verwaltung', 'Industrie / Fertigung', 'Planungs- oder Bauunternehmen', 'Sonstige'],
          deploy: 'Netz', deploys: ['Gar kein Internetzugang', 'Privates Netz, Internet eingeschränkt', 'Private Cloud in unserer Region', 'Noch nicht sicher'],
          hw: 'Hardware', hws: ['Unser eigener Server oder unsere eigene virtuelle Maschine', 'Ein vorkonfiguriertes Gateway', 'Noch nicht sicher'],
          need: 'Was müssen Sie prüfen, und wie groß sind die Modelle ungefähr?',
          submit: 'E-Mail öffnen', direct: 'Oder schreiben Sie an', subject: 'Pilotprojekt On-Premise-IFC-Validierung',
        },
      ],
      faq: [
        ['Verlässt irgendetwas unser Netz?', 'Nein. Der Container liefert die Anwendung an Ihre Browser aus und baut keine ausgehende Verbindung auf; dieser Build enthält keine Nutzungsstatistik. Modelle werden im Browser jedes Nutzers gelesen und nicht auf dem Server gespeichert.'],
        ['Was ist anders als bei der öffentlichen App?', 'Das Programm ist dasselbe. Es ändert sich, von wo es ausgeliefert wird, dass es eine feste Version ist und dass die Funktionen, die das Internet brauchen (der Kartenkontext und die Online-Beispielmodelle), nicht verfügbar sind.'],
        ['Können wir es ohne Sie selbst betreiben?', 'Ja. Der Quellcode ist unter der MIT-Lizenz öffentlich und enthält ein Dockerfile und eine nginx-Konfiguration. Das Pilotprojekt ist für Teams, die es konfiguriert, erklärt und betreut haben wollen.'],
        ['Wie groß dürfen die Modelle sein?', 'Wie in der öffentlichen App: unter 2 GB pro Datei, in der Praxis begrenzt durch den Arbeitsspeicher jedes Arbeitsplatzes, weil die Prüfung im Browser läuft.'],
        ['Was kostet es?', 'Ein Pilotprojekt wird nach dem Klärungsgespräch angeboten, weil der Preis von der Zahl der Standorte und dem Support abhängt, den Sie brauchen. Eine öffentliche Preisliste gibt es dafür noch nicht.'],
      ],
      bottom: ['Ist Ihr Netz mit dem Internet verbunden? Dann ist es bereits kostenlos', 'Der öffentliche Validator liest die Datei in Ihrem Browser und lädt nichts hoch.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    solibri: {
      title: 'Kostenlose Solibri-Alternative — IFC im Browser validieren',
      desc: 'Wann ein kostenloser Browser-Validator reicht und wann Sie Solibri brauchen: Preise, Kollisionen, Regeln und IDS laut Solibris Seiten, abgerufen am 2026-11-10.',
      nav: 'Solibri-Alternative',
      kicker: 'Kostenlos · Im Browser · Verglichen mit Solibris veröffentlichten Plänen',
      h1: ['Kostenlose Solibri-Alternative', 'um eine IFC vor der Lieferung zu prüfen'],
      lead: 'Solibri ist eine regelbasierte Prüfplattform, die in Plänen von 99 € bis 2.772 € pro Lizenz und Jahr verkauft wird. IFC Viewer Online ist eine kostenlose Webseite, die eine IFC öffnet, 44 feste Regeln und Ihre IDS ausführt und zeigt, was durchfällt. Für manche Aufgaben ersetzt sie Solibri, für andere nicht; diese Seite sagt, für welche.',
      cta: 'IFC-Datei validieren',
      cta2: 'oder das Beispielmodell öffnen',
      note: 'Ohne Konto, ohne Installation, und die Datei wird nicht hochgeladen.',
      heroSources: ['solibriPricing'],
      shots: [
        { alt: 'IFC-Modell, im Browser mit eingeschalteter Kollisionsregel geprüft: Health Score 70, 36 Elementkollisionen an erster Stelle der Korrekturliste und die beteiligten Elemente in der 3D-Ansicht hervorgehoben', cap: 'Das Beispielmodell mit eingeschalteter Kollisionsregel: 36 Überlappungen zwischen Bounding Boxes, und der Score fällt von 77 auf 70. Das ist ein erster Filter innerhalb eines Modells, nicht die Kollisionsprüfung, die Solibri verkauft.' },
        { alt: 'IDS-Prüfung im Browser: eine IDS-Spezifikation, die eine Feuerwiderstandsklasse für Wände verlangt und von den 57 Wänden des in 3D gezeigten IFC-Modells nicht erfüllt wird', cap: 'Eine IDS-1.0-Datei, gegen das Modell geprüft, kostenlos und ohne Konto: 57 Wänden fehlt die Feuerwiderstandsklasse, die die Spezifikation verlangt.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Vergleich', h2: 'Solibri und IFC Viewer Online im direkten Vergleich',
          sub: 'Die Solibri-Spalte sagt nur, was Solibri veröffentlicht. Wo seine Seiten etwas nicht angeben (Betriebssysteme, Grenzen der Dateigröße), gibt es keine Zeile.',
          head: ['', 'Solibri', 'IFC Viewer Online'],
          rows: [
            ['Preis', 'Starter 99 €, Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €: Einstiegspreise pro Lizenz und Jahr. Security+ auf Anfrage', 'Kostenlos. Bezahlte Pläne für Serverfunktionen sind noch nicht im Verkauf'],
            ['Modellprüfung', 'Ab Essential. Starter dient dazu, Modelle anzusehen und Ergebnisse durchzugehen: „Model checking is performed in Solibri Essential, Advanced, or Premium“', 'Enthalten: 44 feste Regeln, 25 standardmäßig aktiv'],
            ['Kollisionsprüfung', 'Essential: regelbasierte Kollisionsprüfung, harte und weiche Kollisionen. Advanced: eine Kollisionsmatrix zwischen Fachdisziplinen mit Toleranzen', 'Nur Bounding Boxes, innerhalb eines Modells, 5 cm Überlappung, bis zu 800 Elemente und 100 Ergebnisse. Standardmäßig aus'],
            ['Eigene Regeln', 'Advanced und Premium: „Custom rule creation and modification“', 'Kein Regeleditor. Sie können Regeln ein- und ausschalten, ihren Schweregrad ändern sowie Namensschemata und geforderte Property Sets festlegen; alles andere kommt als IDS hinein'],
            ['IDS', 'Essential prüft geforderte Eigenschaften gegen IDS-Definitionen. Advanced ergänzt IDS-Workflows, einen IDS-Editor und einen IDS-Validator', 'IDS 1.0 mit ihren sechs Facetten. Drei Einschränkungen (totalDigits, fractionDigits, whiteSpace) werden nicht gelesen'],
            ['BCF', 'Ab Essential: „BCF issue management and CDE integrations“', 'Liest und schreibt BCF-Dateien 2.1 und 3.0. Keine Verbindung zu einem BCF-Server oder einer CDE'],
            ['Native Revit-Modelle', 'Ab Essential: „IFC and native Revit model federation“', 'Nur IFC'],
            ['Mengenermittlung', 'Advanced: „Quantity / Information Takeoff (QTO / ITO)“', 'Summiert die Mengen, die bereits in der IFC stehen. Keine Regeln zur Mengenermittlung'],
            ['Ohne Internet', 'Security+: „Fully offline operation (no telemetry)“', 'Die Seite wird aus dem Internet geladen; die Datei wird nicht hochgeladen. Es gibt eine [On-Premise-Installation](onprem)'],
          ],
          after: [
            'Wählen Sie Solibri, wenn Sie mehrere Fachdisziplinen koordinieren und eine echte Kollisionsprüfung brauchen, wenn Ihre Organisation eigene Regeln schreibt oder wenn die Prüfung über viele Projekte hinweg gesteuert werden muss. Nichts auf dieser Seite leistet das.',
            'Wählen Sie IFC Viewer Online, wenn Sie heute wissen wollen, ob eine IFC versandfertig ist: Kennungen, Struktur, Namen, Eigenschaften, Ihre IDS. Es ist auch das Werkzeug für die Personen rund um ein Solibri-Team, die keine Lizenz haben: die Architektin, die das Modell exportiert, der Auftraggeber, der es erhält.',
            'Viele Teams werden beides nutzen: eine schnelle Prüfung im Browser vor dem Export und Solibri für die Koordination.',
          ],
          sources: ['solibriPricing', 'solibriStarter', 'solibriEssential', 'solibriAdvanced'],
        },
        {
          kind: 'text', label: 'Solibri heute', h2: 'Wenn Sie Solibri Office oder Solibri Anywhere suchen',
          ps: [
            'Solibris Website führt Solibri Office, CheckPoint, Anywhere und Site als Legacy-Produkte, die „no longer available for new customers“ sind. Die aktuellen Pläne sind Starter, Essential, Advanced, Premium und Security+.',
            'Die kostenlose Version von Solibri Anywhere läuft weiter für alle, die sie bereits haben, in Versionen vor 26.4.0; Solibri gibt an, dass die kostenlose Berechtigung in neueren Releases nicht verfügbar ist. Wenn Sie Anywhere genutzt haben, um IFC-Dateien zu öffnen und anzusehen: Das leistet der [Viewer](viewer) kostenlos, im Browser, auf jedem Betriebssystem.',
          ],
          sources: ['solibriLegacy', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Umfang', h2: 'Was Sie hier bekommen, und was nicht',
          cols: [
            { h: 'Sie bekommen', items: [
              'Einen Health Score von 0 bis 100 und die Korrekturen, die die meisten Punkte zurückbringen.',
              'Die betroffenen Elemente im 3D-Modell hervorgehoben und nach Regel, Geschoss oder Klasse aufgelistet.',
              'IDS-1.0-Prüfungen und fünf mitgelieferte Validierungsprofile, von der Basislieferung bis ISO 19650 und LOD 300.',
              'Automatische Korrekturen für GlobalIds und Namen, manuelles Bearbeiten von Namen und Eigenschaftswerten und die korrigierte IFC.',
              'Ergebnisse als BCF 2.1, CSV, JSON, HTML-Bericht oder COBie-Tabelle.',
            ] },
            { h: 'Sie bekommen nicht', items: [
              'Kollisionsprüfung zwischen Modellen oder auf Ebene der tatsächlichen Geometrie.',
              'Einen Regeleditor, Prüfung gegen Bauvorschriften (Barrierefreiheit, Brandschutz, Fluchtwege) oder Raumanalyse.',
              'Issue-Verfolgung mit Zuweisungen auf einem Server. BCF-Dateien werden von Hand ausgetauscht.',
              'Dateien ab 2 GB. Die Grenze hängt vom Arbeitsspeicher Ihres Rechners ab.',
            ] },
          ],
        },
        { kind: 'shot', label: 'Ausprobieren', h2: 'An einem Beispielmodell ausführen', sub: 'Die Demo unten lädt den Validator in diese Seite.' },
        {
          kind: 'text', label: 'Preis', h2: 'Was es kostet',
          ps: [
            'Der Viewer, die Regeln, IDS, die Korrekturen und die Exporte sind kostenlos, ohne Konto, auch für kommerzielle Projekte. Der Quellcode ist unter der MIT-Lizenz auf [GitHub](github) öffentlich.',
            'Bezahlte Pläne (Pro für 19 € im Monat, Team für 35 € pro Bearbeiter im Monat) werden Dinge ergänzen, die einen Server brauchen; sie sind noch nicht im Verkauf. Siehe die [Preisseite](pricing).',
          ],
        },
      ],
      faq: [
        ['Ist IFC Viewer Online ein Ersatz für Solibri?', 'Für die Prüfung einer IFC vor der Lieferung (Kennungen, räumliche Struktur, Namen, Eigenschaften, IDS): ja. Für Kollisionsprüfung zwischen Fachdisziplinen, eigene Regeln und projektübergreifende Steuerung: nein. Dafür sind Solibri Essential und Advanced da.'],
        ['Was kostet Solibri?', 'Solibri veröffentlicht Einstiegspreise pro Lizenz und Jahr: Starter 99 €, Essential 1.428 €, Advanced 2.109 € und Premium 2.772 €. Security+ gibt es auf Anfrage (solibri.com/pricing, abgerufen am 2026-11-10).'],
        ['Gibt es eine kostenlose Version von Solibri?', 'Solibri Anywhere, von dem es eine kostenlose Version gab, ist jetzt ein Legacy-Produkt und für Neukunden nicht verfügbar; bestehende kostenlose Nutzer können Versionen vor 26.4.0 behalten (solibri.com/products/legacy-products, abgerufen am 2026-11-10). Der günstigste aktuelle Plan ist Starter für 99 € im Jahr.'],
        ['Prüft der Starter-Plan für 99 € Modelle?', 'Laut Solibri ist Starter für die visuelle Kontrolle und für das Durchgehen von Ergebnissen gedacht, die andere erstellt haben: „Model checking is performed in Solibri Essential, Advanced, or Premium“ (solibri.com/products/starter, abgerufen am 2026-11-10).'],
        ['Was kann Solibri, was dieses Werkzeug nicht kann?', 'Kollisionsprüfung an der tatsächlichen Geometrie und zwischen Modellen, Regeln, die für Ihre Organisation geschrieben wurden, Regeln zur Mengenermittlung, native Revit-Modelle, BCF-Server und CDE-Anbindungen sowie einen vollständig offline nutzbaren Plan. Siehe die Tabelle oben.'],
        ['Kann ich beides nutzen?', 'Ja, und diese Aufteilung ist üblich: Modellautoren und Auftraggeber prüfen eine Datei im Browser, bevor sie verschickt wird, und das Koordinationsteam lässt Solibri auf dem föderierten Modell laufen.'],
      ],
      faqSources: ['solibriPricing', 'solibriLegacy', 'solibriStarter'],
      bottom: ['Prüfen Sie eine Datei, bevor Sie entscheiden', 'Es dauert eine Minute, kostet nichts, und das Modell bleibt auf Ihrem Rechner.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    webchecker: {
      title: 'Solibri WebChecker Alternative — Kostenloser IFC-Web-Checker',
      desc: 'Solibri WebChecker braucht den Plan Advanced oder Premium und lädt die IFC hoch. Diese kostenlose Alternative prüft im Browser. Was beide leisten, mit Quellen.',
      nav: 'Solibri-WebChecker-Alternative',
      kicker: 'Kostenlos · Kein Solibri-Plan · Die Datei wird nicht hochgeladen',
      h1: ['Solibri-WebChecker-Alternative', 'die die IFC in Ihrem eigenen Browser prüft'],
      lead: 'Solibri WebChecker (Beta) führt Solibris Prüf-Engine online aus: Sie laden eine IFC hoch, sie wird auf Solibris Dienst geprüft, und Sie laden ein PDF oder BCF herunter. Er gehört zu den Plänen Advanced und Premium. Wenn Sie eine Webprüfung ohne Plan brauchen oder ohne das Modell hochzuladen, erledigt diese Seite das in Ihrem Browser, mit weniger Prüfungen.',
      cta: 'IFC-Datei validieren',
      cta2: 'oder das Beispielmodell öffnen',
      note: 'Ohne Konto und ohne Token. Bis 2 GB pro Datei.',
      heroSources: ['solibriWebchecker'],
      shots: [
        { alt: 'Webbasierte IFC-Prüfung: die Liste der Probleme, nach Regel gruppiert, mit der Anzahl der betroffenen Elemente, im Validierungspanel des Browser-Viewers', cap: 'Die Ergebnisse einer Prüfung, nach Regel gruppiert. Dafür wurde nichts hochgeladen.' },
        { alt: 'Export einer IFC-Prüfung aus dem Browser mit den Formaten BCF, CSV, JSON, Lieferbericht und COBie', cap: 'Die Ergebnisse verlassen die Seite als BCF 2.1, CSV, JSON, HTML-Bericht oder COBie-Tabelle. Eine PDF-Datei gibt es nicht; der HTML-Bericht lässt sich aus dem Browser drucken.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Vergleich', h2: 'Solibri WebChecker und IFC Viewer Online',
          sub: 'Die WebChecker-Spalte stammt von Solibris eigener Seite.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Zugang', 'In Solibri Advanced (ab 2.109 € im Jahr) und Premium (ab 2.772 €) enthalten. Nicht in Starter, Essential oder Security+, und „not a standalone product“. Erfordert eine Solibri ID', 'Seite öffnen. Kein Konto'],
            ['Kosten pro Prüfung', '50 Token. Advanced enthält 1.750 Token pro Jahr (etwa 35 Prüfungen), Premium 17.500 (etwa 350). Zusätzliche Token: 5.000 für 250 €, 10.000 für 450 €, 25.000 für 750 €', 'Kostenlos, beliebig viele Prüfungen'],
            ['Wohin das Modell geht', 'Es wird hochgeladen. Datenspeicherort in der EU oder in den USA, beim Einrichten des Projekts gewählt', 'Es bleibt in Ihrem Browser-Tab'],
            ['Aufbewahrung der Ergebnisse', '30 Tage', 'Bis Sie den Tab schließen; exportieren Sie, was Sie brauchen'],
            ['Dateigröße', 'Bis 5 GB pro IFC-Datei', 'Unter 2 GB, und weniger auf einem Rechner mit wenig Arbeitsspeicher'],
            ['Prüfungen', 'Model-Health-Prüfung (Struktur und Klassifikation, Benennung und Kennungen, zentrale Eigenschaften über IDS-basierte Prüfungen, harte geometrische Kollisionen zwischen Fachdisziplinen) oder ein eigener .cset-Regelsatz, der in der Desktopanwendung erstellt wird', '44 feste Regeln und IDS-1.0-Dateien. Kollisionen nur per Bounding Box innerhalb eines Modells'],
            ['Ergebnisse', 'PDF und BCF (1.0, 2.0, 2.1 oder 3.0); SMC-Dateien für Premium-Nutzer', 'BCF 2.1, CSV, JSON, HTML-Bericht, COBie-Tabelle'],
          ],
          after: [
            'WebChecker ist das bessere Werkzeug, wenn Ihr BIM-Team bereits Solibri-Regelsätze pflegt und die Projektbeteiligten genau diese ausführen sollen, wenn Dateien größer als 2 GB sind oder wenn Sie harte Kollisionen zwischen Fachdisziplinen im Bericht brauchen.',
            'Diese Seite ist das bessere Werkzeug, wenn Sie keinen Plan Advanced oder Premium haben, wenn das Modell nicht hochgeladen werden darf oder wenn Sie oft prüfen und keine Token zählen wollen.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Umfang', h2: 'Was diese Prüfung abdeckt, und was nicht',
          cols: [
            { h: 'Geprüft wird', items: [
              'Kennungen, räumliche Struktur, Geschosse, Namen, Eigenschaftswerte, Typen und Materialien: 44 Regeln, 25 standardmäßig aktiv.',
              'IDS-1.0-Dateien mit ihren sechs Facetten.',
              'Fünf mitgelieferte Validierungsprofile oder Ihre eigenen Namensschemata und geforderten Property Sets.',
            ] },
            { h: 'Nicht geprüft wird', items: [
              'Solibri-Regelsätze. Eine .cset-Datei lässt sich hier nicht laden.',
              'Harte Kollisionen zwischen Fachdisziplinen, Regeln zur Barrierefreiheit oder Raumanalyse.',
              'Dateien ab 2 GB.',
            ] },
          ],
          sources: ['solibriWebchecker'],
        },
        {
          kind: 'text', label: 'Ihre Datei', h2: 'Was mit der Datei geschieht',
          ps: [
            'Die IFC wird von Code gelesen, der in Ihrem Browser-Tab läuft, und nicht hochgeladen. Der Browser behält eine konvertierte Kopie der Geometrie in seinem privaten Speicher auf Ihrem Rechner (bis zu 4 GB), um sie schneller wieder zu öffnen; wenn Sie die Websitedaten löschen, ist sie weg.',
            'Eine Nutzungsstatistik ohne Cookies hält die Dateigröße und die Anzahl der Elemente fest, nie den Inhalt, und lässt sich abschalten. Ein Freigabelink, falls Sie einen erstellen, trägt den Score, den Dateinamen und bis zu 50 Probleme in der URL.',
          ],
        },
        { kind: 'shot', label: 'Ausprobieren', h2: 'Eine Prüfung an einem Beispielmodell ausführen', sub: 'Die Demo unten lädt den Validator in diese Seite.' },
        {
          kind: 'text', label: 'Preis', h2: 'Was es kostet',
          ps: [
            'Nichts, und es gibt keine Token. Der Viewer, die Regeln, IDS und die Exporte sind kostenlos und ohne Konto nutzbar. Der Code ist unter der MIT-Lizenz auf [GitHub](github) öffentlich.',
            'Bezahlte Pläne, die einen Server ergänzen, sind auf der [Preisseite](pricing) beschrieben und noch nicht im Verkauf. Die übrigen Pläne und Preise werden auf [einer eigenen Seite](solibri) verglichen.',
          ],
        },
      ],
      faq: [
        ['Was ist Solibri WebChecker?', 'In Solibris Worten „a browser-based model validation service that runs Solibri\'s rules-based checking engine online“. Nutzer laden IFC-Modelle hoch, führen die Model-Health-Prüfung oder einen eigenen Regelsatz aus und exportieren PDF oder BCF (solibri.com/solutions/webchecker, abgerufen am 2026-11-10).'],
        ['Ist Solibri WebChecker kostenlos?', 'Nein. Er ist in Solibri Advanced und Premium enthalten und wird nicht einzeln verkauft. Jede Prüfung verbraucht 50 Token aus dem Jahreskontingent des Plans oder aus Token-Paketen, die bei 250 € für 5.000 Token beginnen (solibri.com/solutions/webchecker, abgerufen am 2026-11-10).'],
        ['Lädt WebChecker mein Modell hoch?', 'Ja: Solibri beschreibt ihn als Dienst, bei dem Nutzer IFC-Modelle hochladen; die Daten werden in der EU oder in den USA gespeichert und die Ergebnisse 30 Tage aufbewahrt (solibri.com/solutions/webchecker, abgerufen am 2026-11-10). IFC Viewer Online liest die Datei stattdessen in Ihrem Browser.'],
        ['Kann ich meine Solibri-Regelsätze hier ausführen?', 'Nein. Solibri-Regelsätze (.cset) laufen nur in Solibri. Anforderungen, die sich als IDS 1.0 schreiben lassen, können hier geprüft werden.'],
        ['Welches Werkzeug findet mehr Probleme?', 'Sie suchen nach unterschiedlichen Dingen. Die Model-Health-Prüfung von WebChecker umfasst harte Kollisionen zwischen Fachdisziplinen; das leistet diese Seite nicht. Diese Seite liefert einen Score und automatische Korrekturen für Kennungen und Namen. Für die Koordination nehmen Sie Solibri.'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Jetzt eine Webprüfung ausführen', 'Kein Plan, keine Token, kein Upload.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    mac: {
      title: 'IFC Viewer für Mac — gratis, ohne Installation, in Safari',
      desc: 'IFC-Dateien auf dem Mac in Safari, Chrome oder Firefox öffnen: 3D-Ansicht, Eigenschaften, Schnitte, Messen und Validierung. Ohne Installation und Konto, gratis.',
      nav: 'IFC Viewer für Mac',
      kicker: 'macOS · Safari, Chrome, Firefox, Edge · Ohne Installation · Kostenlos',
      h1: ['IFC Viewer für Mac', 'der in dem Browser läuft, den Sie schon haben'],
      lead: 'Es gibt keine App zum Herunterladen: Der Viewer ist eine Webseite. Öffnen Sie sie in Safari oder Chrome unter macOS, legen Sie eine IFC-Datei ab, und Sie erhalten das 3D-Modell, den Strukturbaum, die Eigenschaften jedes Elements, Schnitte, Messungen und einen Validierungsbericht. Die Datei wird nicht hochgeladen.',
      cta: 'Viewer öffnen',
      cta2: 'oder das Beispielmodell öffnen',
      note: 'Ohne Konto. IFC2x3, IFC4, IFC4x1 und IFC4x3, bis 2 GB pro Datei.',
      shots: [
        { alt: 'IFC-Viewer in einem Browserfenster von 1440 × 900, der Größe eines MacBook-Bildschirms: ein zweigeschossiges Haus in 3D, links der Strukturbaum und rechts die IFC-Attribute und Property Sets einer ausgewählten Wand', cap: 'Der Viewer in einem Fenster von 1440 × 900, der Standardgröße eines MacBook-Air-Bildschirms (aufgenommen in Chrome). Rechts die Attribute und Property Sets der ausgewählten Wand.' },
        { alt: 'Schnittebene durch ein IFC-Modell eines Hauses im Browser-Viewer, mit sichtbarer Möblierung im Inneren, in einem Fenster von 1440 × 900', cap: 'Eine Schnittebene durch dasselbe Modell, verschoben mit dem Schieberegler oder durch Ziehen in der Ansicht. Ein Plug-in ist nicht beteiligt.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Auf dem Mac', h2: 'Was unter macOS funktioniert, und was Sie erwarten können',
          cols: [
            { h: 'Es funktioniert', items: [
              'In Safari, Chrome, Firefox und Edge unter macOS. Die Seite braucht WebGL und WebAssembly; beides bringen diese Browser mit.',
              'Das Öffnen von .ifc-Dateien und von .ifczip- oder .zip-Archiven, per Ziehen in das Fenster oder über die Schaltfläche Open.',
              'Mehrere Modelle gleichzeitig, jedes mit eigenem Baum und eigenen Eigenschaften.',
              'Auch auf iPad oder iPhone, mit kleineren Dateien.',
            ] },
            { h: 'Zu beachten', items: [
              'Es ist keine macOS-Anwendung: kein Symbol im Dock, keine Vorschau in Quick Look, und .ifc-Dateien öffnen sich nicht per Doppelklick.',
              'Die Seite muss aus dem Internet geladen werden. Offline funktioniert sie nicht.',
              'Die Grenze der Dateigröße liegt bei 2 GB, in der Praxis beim Arbeitsspeicher des Mac: Eine Warnung erscheint ab 1 GB, oder ab 80 MB auf Geräten mit 4 GB Arbeitsspeicher oder weniger sowie auf iPad und iPhone.',
              'Die Aufnahmen auf dieser Seite wurden in Chrome gemacht. Wenn in Safari etwas falsch aussieht, versuchen Sie es in Chrome.',
            ] },
          ],
        },
        {
          kind: 'cols', label: 'Werkzeuge', h2: 'Was Sie mit einem Modell tun können',
          cols: [
            { h: 'Ansehen', items: [
              'Drehen, Verschieben und Zoomen; Elemente ausblenden und isolieren; den Strukturbaum durchgehen.',
              'Schnittebenen und 2D-Grundrisse, aus dem Modell geschnitten und als DXF, SVG oder PDF exportiert.',
              'Abstände, Flächen, Winkel und lichte Maße messen.',
              'Jedes Property Set und die Mengen lesen, die in der Datei stehen.',
            ] },
            { h: 'Prüfen und korrigieren', items: [
              'Eine Validierung mit 44 Regeln und einem Health Score von 0 bis 100; siehe den [IFC-Validator](validator).',
              'IDS-1.0-Prüfungen gegen Ihre eigenen Anforderungen.',
              'Namen und Eigenschaftswerte bearbeiten, GlobalIds korrigieren und die korrigierte IFC oder ein GLB exportieren.',
              'BCF-Dateien 2.1 und 3.0 öffnen und schreiben.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Vergleich', h2: 'Andere Wege, eine IFC auf dem Mac zu öffnen',
          sub: 'Flinker ist der andere kostenlose Browser-Viewer, nach dem wir gefragt werden. Seine Spalte sagt, was Flinker veröffentlicht.',
          head: ['', 'Flinker', 'IFC Viewer Online'],
          rows: [
            ['Was es ist', '„The IFC viewer for Microsoft“: SharePoint, Teams, Excel, Power BI, Windows und der Browser', 'Viewer, Validator und Editor in einer Webseite'],
            ['Auf dem Mac', 'Der Browser-Viewer. Die Desktop-App ist für Windows; die Website erwähnt macOS nicht', 'Jeder aktuelle Browser unter macOS'],
            ['Zum Start', '„Open a model without creating an account“', 'Kein Konto'],
            ['Formate', 'IFC 2x3, 4 und 4x3; BCF 2.1 und 3.0; IDS 1.0; DXF; PDF-Overlay', 'IFC2x3, IFC4, IFC4x1 und IFC4x3; BCF 2.1 und 3.0; IDS 1.0'],
            ['Die Datei', 'Wird im Browser geparst; bleibt auf dem Gerät oder in dem Microsoft-Speicher, den Sie wählen', 'Wird im Browser gelesen; nicht hochgeladen'],
            ['Prüfung', 'IDS-Anforderungsprüfungen mit Hervorhebung von bestanden und nicht bestanden', '44 Regeln mit Health Score, dazu IDS'],
            ['Preis', 'Community: kostenlos. Enterprise: Preis je Bereitstellung', 'Kostenlos'],
          ],
          after: [
            'Wählen Sie Flinker, wenn Ihre Projekte bereits in SharePoint und Teams liegen: Das Modell neben den Dokumenten zu öffnen, ist das, wofür es gebaut ist, und dieser Viewer hat keine Anbindung an Microsoft 365.',
            'Wählen Sie IFC Viewer Online, wenn Sie auch wissen wollen, ob das Modell in Ordnung ist: Die Validierung, der Score und die Korrekturen sind der Unterschied.',
            'Zu Solibri: Die Produktseiten, die wir am selben Tag gelesen haben, geben nicht an, auf welchen Betriebssystemen seine Pläne laufen, also sagen wir es nicht. Prüfen Sie Solibris Systemanforderungen, bevor Sie für einen Mac kaufen.',
          ],
          sources: ['flinkerViewer', 'solibriPricing'],
        },
        { kind: 'shot', label: 'Ausprobieren', h2: 'Das Beispielmodell öffnen', sub: 'Die Demo unten läuft in dieser Seite, in dem Browser, den Sie gerade verwenden.' },
        {
          kind: 'text', label: 'Preis', h2: 'Was es kostet',
          ps: [
            'Nichts. Es gibt keine Lizenz, keinen Testzeitraum und kein Konto. Der Code ist unter der MIT-Lizenz auf [GitHub](github) öffentlich. Bezahlte Pläne, die einen Server ergänzen, stehen auf der [Preisseite](pricing) und sind noch nicht im Verkauf.',
          ],
        },
      ],
      faq: [
        ['Gibt es einen IFC Viewer für Mac, der keine Installation braucht?', 'Ja: Dieser hier ist eine Webseite. Öffnen Sie sie in Safari, Chrome, Firefox oder Edge unter macOS und legen Sie die Datei ab. Es gibt nichts herunterzuladen oder zu installieren.'],
        ['Funktioniert er in Safari?', 'Ja. Er braucht WebGL und WebAssembly; beides ist in aktuellen Safari-Versionen enthalten. Die Aufnahmen auf dieser Seite wurden in Chrome gemacht; versuchen Sie es also in Chrome, wenn ein Modell nicht richtig dargestellt wird.'],
        ['Wird die IFC hochgeladen, wenn ich sie öffne?', 'Nein. Die Datei wird von Code gelesen, der im Browser-Tab läuft. Den Browser verlässt nur eine anonyme Nutzungsstatistik (Dateigröße und Anzahl der Elemente), und sie lässt sich abschalten.'],
        ['Kann ich Revit- oder Archicad-Dateien öffnen?', 'Nein, nur IFC. Exportieren Sie zuerst eine IFC aus der Autorensoftware.'],
        ['Funktioniert er auf dem Mac offline?', 'Nein. Die Seite muss jedes Mal aus dem Internet geladen werden; das Modell selbst wird aber nie gesendet.'],
        ['Gibt es Flinker für den Mac?', 'Der Viewer von Flinker läuft im Browser und lässt sich so auch auf einem Mac nutzen; die Desktop-App wird für Windows angeboten, und die Website erwähnt macOS nicht (flinker.app/products/ifc-viewer, abgerufen am 2026-11-10).'],
      ],
      faqSources: ['flinkerViewer'],
      bottom: ['Eine IFC auf Ihrem Mac öffnen', 'Im Browser, kostenlos, ohne Installation.'],
    },
  },
}
