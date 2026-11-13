import type { HelpCopy } from './types'

export const de: HelpCopy = {
  ui: {
    hub: 'Hilfe: IFC-Lieferungen empfangen',
    hubIntro: 'Kurze Anleitungen für den kostenpflichtigen Arbeitsbereich: ein Projekt einrichten, Lieferanten vorbereiten, ein Prüfergebnis lesen, Ihre Werkzeuge anbinden und wie Ihre Daten aufbewahrt werden.',
    preview: 'Vorschau: Für diese Funktionen ist noch keine Registrierung möglich. Die Anleitungen beschreiben, wie sie heute funktionieren.',
    all: 'Alle Anleitungen',
    home: 'IFC Viewer Online',
    pricing: 'Tarife',
  },
  topics: {
    setup: {
      title: 'Ein Projekt einrichten',
      desc: 'Vom leeren Arbeitsbereich zur ersten geprüften Lieferung in fünf Schritten.',
      sections: [
        ['1. Das Projekt anlegen', 'Ein Projekt ist eine Baustelle oder ein Vertrag. Geben Sie ihm einen Namen, ein Kurzkürzel (2 bis 6 Großbuchstaben, am Anfang jedes Dateinamens verwendet) und die Mindestpunktzahl, die eine Lieferung erreichen muss. Sie können alles später ändern.'],
        ['2. Die Anforderungen festlegen', 'Wählen Sie eine Vorlage (ein EIR-Profil) oder laden Sie Ihre eigene IDS hoch. Lieferanten werden vor dem Senden daran geprüft und beim Eingang der Datei erneut auf dem Server.'],
        ['3. Die Lieferanten einladen', 'Jeder Lieferant erhält einen eigenen Upload-Link; ein Konto ist nicht nötig. Der Link wird nur einmal angezeigt: Kopieren Sie die vorbereitete Nachricht und senden Sie sie aus Ihrem eigenen E-Mail-Konto.'],
        ['4. Einen Ordner oder einen Webhook anbinden', 'Lieferungen können auch aus einem überwachten SharePoint- oder Drive-Ordner eingehen, und jedes Prüfergebnis kann per Webhook an Ihre Werkzeuge gesendet werden. Beides ist optional.'],
        ['5. Eine Testlieferung senden', 'Die Einstiegsliste schickt eine kleine öffentliche IFC durch dieselben Prüfungen wie die Datei eines Lieferanten, sodass Sie ein Prüfergebnis im Posteingang sehen, bevor jemand liefert.'],
      ],
    },
    suppliers: {
      title: 'Ihre Lieferanten vorbereiten',
      desc: 'Was ein Lieferant sieht, was er richtig machen muss und was jeder Fehler bedeutet.',
      sections: [
        ['Ihr Link', 'Der Link öffnet eine Seite mit den Anforderungen des Projekts, der Regel für Dateinamen und dem nächsten Fälligkeitsdatum. Jeder mit dem Link kann im Namen dieses Lieferanten liefern, daher sollte er nicht weitergegeben werden. Gelangt er nach außen, erstellen Sie auf der Karte des Lieferanten einen neuen: Der alte funktioniert sofort nicht mehr.'],
        ['Die kostenlose Prüfung', 'Wenn ein Lieferant eine Datei auswählt, wird sie in seinem eigenen Browser geprüft: ob es eine vollständige IFC ist, die Namensregel und die Punktzahl. Er sieht, was zu korrigieren ist, mit einer kostenlosen Anleitung für jede Regel, bevor etwas gesendet wird.'],
        ['Der Dateiname', 'Namen folgen ISO 19650: Projektkürzel, eigenes Kürzel des Lieferanten, Bereich, Geschoss, Typ, Rolle, Nummer, Status (S0 bis S4) und Revision, zum Beispiel `TNO-ESTRUC-ZZ-02-M3-S-0001-S2-P01.ifc`. Ein Name, der gegen die Regel verstößt, wird auch vom Server abgelehnt.'],
        ['Wenn etwas fehlschlägt', 'Zu groß: ohne ungenutzte Elemente exportieren oder das Modell aufteilen. Keine IFC: erneut als IFC exportieren, eine umbenannte native Datei funktioniert nicht. Beschädigt: Die Datei wurde beim Export oder Download abgeschnitten, also erneut exportieren. Zu viele Versuche: eine Minute warten; nichts geht verloren.'],
      ],
    },
    verdict: {
      title: 'Ein Prüfergebnis lesen',
      desc: 'Der Zustand der Datei, das automatische Prüfergebnis und Ihre Prüfung sind drei verschiedene Dinge.',
      sections: [
        ['Die Datei', 'Jede Lieferung erhält zuerst einen Dateizustand: ok, beschädigt (abgeschnitten oder nicht abgeschlossen, nie bewertet), keine IFC oder nicht die angegebene Datei (ihr SHA-256 weicht ab).'],
        ['Das automatische Prüfergebnis', 'Eine Datei, die sich öffnen lässt, wird gegen Ihre Anforderungen mit 0 bis 100 bewertet. Bei oder über dem Mindestwert des Projekts wird sie automatisch angenommen; darunter mit Begründung abgelehnt. Dieses Prüfergebnis stammt vom Server und bleibt erhalten.'],
        ['Ihre Prüfung', 'Eine Person kann jede Lieferung mit Begründung annehmen oder zurückweisen, und diese Entscheidung wird mit dem Fingerabdruck der Datei im Register versiegelt. Eine Lieferung kann nicht angenommen werden, bevor sie validiert wurde; eine frühe Zurückweisung bleibt möglich.'],
        ['Das Register', 'Jeder Eingang und jede Entscheidung wird der Reihe nach festgehalten, mit wer und wann. Exportieren Sie es jederzeit aus dem Projekt-Tab als ZIP (JSON und CSV) oder JSON.'],
      ],
    },
    api: {
      title: 'API und Webhooks',
      desc: 'Lieferungen, Prüfergebnisse und Ereignisse für Ihre eigenen Werkzeuge.',
      sections: [
        ['Lieferungen', 'Die Liste der Lieferungen gibt für jede den Dateizustand, das automatische Prüfergebnis (`auto`) und die Prüfung durch eine Person (`review`) als getrennte Felder zurück. `verdict` bleibt für ältere Integrationen der maßgebliche Wert. Der vollständige Vertrag ist in OpenAPI beschrieben.'],
        ['Webhooks', 'Wählen Sie die Ereignisse (eingegangen, validiert, angenommen, zurückgewiesen) und eine https-Adresse. Jeder Aufruf wird mit HMAC-SHA256 über Zeitstempel und Inhalt signiert; das Geheimnis wird nur einmal angezeigt. Adressen in privaten Netzen werden abgelehnt.'],
        ['Überwachte Ordner', 'Ein SharePoint- oder Drive-Ordner kann im Namen eines Lieferanten liefern. Mehrere Dateien werden gleichzeitig verarbeitet, und der Bericht wird neben jedes Modell geschrieben. Eine Datei, die im Netzwerk fehlgeschlagen ist, wird bei der nächsten Prüfung erneut versucht.'],
        ['Grenzen', 'Öffentliche Seiten erlauben 60 Anfragen pro Minute und Adresse, die angemeldete API 600 pro Minute und Benutzer. Darüber lautet die Antwort 429 mit `Retry-After: 60`.'],
      ],
    },
    security: {
      title: 'Sicherheit und Ihre Daten',
      desc: 'Wie die Daten eines Unternehmens getrennt gehalten werden und wie Sie alle exportieren.',
      sections: [
        ['Jedes Unternehmen getrennt', 'Jede Abfrage wird nach Unternehmen gefiltert, und die Datenbank selbst setzt das zusätzlich durch (Row-Level Security): Ein Unternehmen liest oder ändert nie die Daten eines anderen, auch nicht durch Anfrage einer bekannten ID.'],
        ['Rollen', 'Eigentümer und Administratoren verwalten Personen, Links der Lieferanten, Webhooks und das Löschen von Projekten. Bearbeiter prüfen Lieferungen, Prüfer kommentieren und Betrachter lesen. Ein Lieferant sieht immer nur seine eigenen Lieferungen.'],
        ['Protokoll', 'Das Einladen oder Widerrufen eines Lieferanten, Entscheidungen, Kunden-Links, Webhooks, Automatisierungen, Rollen, das Logo, Exporte und Löschungen hinterlassen jeweils eine Zeile mit wer und wann.'],
        ['Daten mitnehmen', 'Exportieren Sie im Projekt-Tab alles (Lieferungen mit beiden Prüfergebnissen, das Register und die Mängel) oder löschen Sie das Projekt. Zum Löschen muss der Projektname eingegeben werden; es entfernt auch die Dateien und hinterlässt nur eine Zeile im Protokoll.'],
      ],
    },
  },
}
