# Finance Check

Finance Check ist eine vollständig lokal laufende Webanwendung für Konten, Kredite, wiederkehrende Cashflows, Vermögensprognosen und mathematische Finanzierungsvergleiche. Es gibt keine Cloud-Anbindung, kein Tracking und keine Anmeldung.

## Technischer Aufbau

- **Client:** React 19, Vite, TypeScript, Recharts
- **Server:** Fastify, TypeScript, Zod
- **Datenbank:** SQLite über `better-sqlite3`
- **Struktur:** zwei getrennte npm-Workspaces in `client/` und `server/`

Fastify wurde bewusst statt NestJS gewählt. React ist mit beiden kompatibel; für diese lokale, kompakte API bietet Fastify jedoch weniger Framework-Ballast, einen einfachen Debug-Start und eine klar lesbare Serverstruktur. Sollte das Projekt später sehr viele Domänenmodule, Teams oder komplexe Dependency-Injection benötigen, kann NestJS wieder sinnvoll werden.

## Start

Voraussetzung ist Node.js 22 oder neuer.

```powershell
npm install
npm run dev
```

Danach läuft die Oberfläche unter `http://localhost:5173`; die API läuft ausschließlich lokal unter `http://127.0.0.1:3001`.

Alternativ in Visual Studio Code:

1. Ordner öffnen.
2. Einmal `npm install` ausführen oder den Task **Finance Check: dependencies installieren** starten.
3. In **Ausführen und Debuggen** die Konfiguration **Finance Check: Client + Server** wählen.
4. Breakpoints funktionieren in React-/TypeScript-Dateien und im Fastify-Server.

## Funktionen

- Giro-, Spar- und Investmentkonten mit Saldo, jährlichem Zinssatz mit bis zu vier Nachkommastellen, monatlicher Sparrate samt Quellkonto und Jahresprämie samt Auszahlungsmonat und Zielkonto
- Je Finanzkonto eine ausdrückliche Freigabe als Investitionsmittel und ein optionales Verfügbarkeitsdatum für Festgeld oder andere gebundene Guthaben
- Eigene prognostizierte Jahresrendite für Aktiendepots mit bis zu vier Nachkommastellen und monatlicher Verzinsung in der Vermögensprojektion
- Immobilien und Gesellschafteranteile als nicht liquide Vermögenswerte mit Gesamtbewertung, Eigentums- beziehungsweise Beteiligungsquote, automatisch berechnetem eigenem Anteilswert, Bewertungsdatum und prognostizierter Wertentwicklung
- Verknüpfung von Krediten mit Immobilien oder Beteiligungen einschließlich sichtbarer Restschuld und gebundenem Eigenkapital
- Kredite und Immobilienkredite mit Restschuld, effektivem Zinssatz, monatlicher Abzahlrate und zugehörigem Quellkonto
- Manuell gepflegte wiederkehrende Einnahmen und Ausgaben sowie automatisch abgeleitete, schreibgeschützte Spar-, Prämien- und Kreditraten in der Cashflow-Übersicht
- Monatsgenaue Vermögens-, Schulden- und Nettovermögensprojektion bis 30 Jahre in der Oberfläche
- Vollständige Kontenübersicht auf dem Dashboard und kontengenaue Prognosewerte im Diagramm-Cursor
- Break-even-Datum für positives Nettovermögen
- Konkreter Finanzierungsplan aus den tatsächlich freigegebenen Konten, priorisiert nach dem niedrigsten entgangenen Zins beziehungsweise der niedrigsten entgangenen Depot-Rendite
- Erwartete monatliche Kostenersparnis als Investitionsnutzen, einschließlich kumulierter Einsparung und monatlichem Saldo
- Getrennte Anzeige von Vermögens-Break-even und Amortisationszeit für jede Finanzierungsstrategie
- Investitionsszenarien dauerhaft in der lokalen SQLite-Datenbank speichern, laden, aktualisieren, als Variante kopieren und löschen
- Zwei gespeicherte Investitionen mit aktuellen Kontoständen und einem gemeinsamen, frei wählbaren Betrachtungszeitraum direkt vergleichen
- Pro Szenario festlegen, ob freigegebene Eigenmittel angerechnet werden dürfen oder alle Konten unangetastet bleiben sollen
- Automatisch berechneter Kreditrest, monatliche Annuitätenrate und Gesamtzins über die gewählte Laufzeit
- Referenzvergleich von Eigenkapital, Vollfinanzierung, 50/50-Finanzierung und Nicht-Investieren samt Break-even-Kurven
- Optionaler synthetischer Demo-Datensatz für eine leere Datenbank

## Lokale Daten und Datenschutz

Die Datenbank wird beim ersten Start automatisch unter `server/data/finance-check.db` angelegt. Der gesamte `server/data/`-Ordner sowie SQLite-WAL-/SHM-Dateien sind in `.gitignore` ausgeschlossen.

Wichtig: `.gitignore` verhindert nur neue Commits. Die Datenbank sollte niemals mit `git add -f` erzwungen werden. Für Backups den Server zuerst beenden und anschließend die Datei in einen verschlüsselten, privaten Speicher kopieren. Die Anwendung bindet den Server standardmäßig nur an `127.0.0.1`.

Optionale lokale Einstellungen können über eine nicht committete `server/.env` gesetzt werden; die verfügbaren Schlüssel stehen in `server/.env.example`.

## Modellannahmen

Die Prognose rechnet monatlich. Guthabenzinsen werden zuerst auf den jeweiligen Saldo angewendet. Bei Depots, Immobilien und Gesellschafteranteilen wird zusätzlich die hinterlegte prognostizierte Wertentwicklung monatlich fortgeschrieben. Für Immobilien und Beteiligungen werden Gesamtbewertung und eigene Quote erfasst; Finance Check berechnet daraus einmalig den anrechenbaren eigenen Vermögenswert. Eine Sparrate überträgt anschließend Geld vom ausgewählten Quellkonto auf das Spar- oder Investmentkonto; dadurch steigt das Nettovermögen nicht künstlich doppelt. In der Cashflow-Kennzahl wird sie dennoch als monatlich gebundener Betrag vom frei verfügbaren Geld abgezogen. Eine Jahresprämie ist eine zusätzliche externe Auszahlung: Sie wird einmal pro Kalenderjahr im gewählten Monat dem ausgewählten Zielkonto gutgeschrieben und niemals vom monatlich freien Betrag abgezogen. Bei Verbindlichkeiten werden zuerst die Monatszinsen auf die offene Restschuld berechnet und danach die hinterlegte Abzahlrate vom ausgewählten Quellkonto abgebucht und getilgt. Transfers und Tilgungen sind auf den verfügbaren Quellsaldo begrenzt. Fehlt bei älteren Datensätzen eine notwendige Quelle, wird die Rate nicht ausgeführt und in der Oberfläche ausdrücklich als unvollständig markiert. Zusätzliche, dem Kredit zugeordnete Ausgaben-Cashflows wirken als Sondertilgungen. Nicht zugeordnete manuelle Cashflows werden in der monatlichen Übersicht berücksichtigt, verändern aber kein Kontosaldo in der Projektion.

Der Entscheidungsplaner ist eine deterministische Modellrechnung. Als Eigenmittel berücksichtigt er ausschließlich positiv geführte Giro-, Spar- und Investmentkonten, die ausdrücklich für Investitionen freigegeben und zum Berechnungsdatum verfügbar sind. Konten mit einem zukünftigen Verfügbarkeitsdatum bleiben gesperrt. Unter den verfügbaren Konten werden zuerst Guthaben mit dem niedrigsten entgangenen Jahresertrag verwendet; liegt der erwartete Kontoertrag über dem Kreditzins, bleibt das Guthaben unangetastet. Ist „Eigenmittel anrechnen“ im Szenario deaktiviert, werden sämtliche Kontoguthaben ausgeschlossen und die Investition vollständig finanziert. Den verbleibenden Betrag modelliert der Planer als Annuitätendarlehen mit konstanter Monatsrate über die eingegebene Laufzeit. Die erwartete Kostenersparnis wird ab dem ersten Monat ohne eigene Verzinsung linear summiert und nur den tatsächlich investierenden Strategien zugerechnet; „Nicht investieren“ erhält sie nicht. Der Vermögens-Break-even bezeichnet den ersten Monat mit positivem Vermögensvorteil einschließlich des fortgeschriebenen Investitionswerts. Die Amortisationszeit bezeichnet den Zeitpunkt, an dem die kumulierten Einsparungen sämtliche eingesetzten Eigenmittel und planmäßigen Kreditrückzahlungen einschließlich Zinsen decken; eine mögliche Veräußerung des Investitionswerts wird dabei nicht angerechnet. Finanzierungskosten umfassen nur die bis zum Ende des Betrachtungszeitraums tatsächlich angefallenen Zinsen. Gespeicherte Szenarien enthalten die Annahmen und die Eigenmittel-Einstellung, aber keine eingefrorenen Kontostände; Laden und Direktvergleich verwenden den jeweils aktuellen Kontenbestand. Der Direktvergleich überschreibt ausschließlich für die Vergleichsrechnung die individuellen Betrachtungszeiträume mit einem gemeinsamen Zeitraum, standardmäßig dem längeren der beiden gespeicherten Werte. Steuern, Inflation, Gebühren, Kreditnebenkosten, variable Zinsen, Risiko, Liquiditätsreserven und vorzeitige Tilgung sind nicht enthalten. Das Ergebnis ist keine Finanzberatung.

## Qualität prüfen

```powershell
npm run check
```

Der Befehl führt TypeScript-Prüfungen, Client-/Finanzlogik-Tests und beide Produktions-Builds aus.
