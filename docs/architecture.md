# Architektur

```text
React/Vite Client (:5173)
        │  JSON /api/* (Vite-Proxy in Entwicklung)
        ▼
Fastify Server (:3001, nur 127.0.0.1)
        ├── Zod-Eingabevalidierung
        ├── Finanzprojektion / Szenariovergleich
        └── better-sqlite3
                ▼
        server/data/finance-check.db
```

## Datenmodell

`special_repayments_json` speichert die Sondertilgungsliste. Einträge enthalten ein optionales Datum, den Centbetrag und ein optionales Quellkonto. Die API validiert Daten und Kontoverknüpfungen; beim Aktualisieren bleibt eine ausgelassene Liste erhalten, eine ausdrücklich leere Liste entfernt die Zahlungen. Die additive Migration initialisiert bestehende Listen mit `[]`.

`projectPortfolio` berücksichtigt datierte Sondertilgungen einmal nach Zinsen und regulären Kreditraten. Undatierte Einträge bleiben vorgemerkt. Bei verschiedenen Stichtagen wird jede Transferseite unabhängig fortgeschrieben, damit vorhandene Bankstände nicht doppelt getilgt oder belastet werden. Mit bekanntem Quellsaldo begrenzen Liquidität und Restschuld die Zahlung. Ohne Quelle gilt die Tilgung als außerhalb der erfassten Konten bezahlt. Beim Löschen eines Quellkontos werden dessen Verknüpfungen in den Listen entfernt. Einmalige Zahlungen erscheinen in der Kreditliste und beeinflussen die Prognose; sie werden nicht als wiederkehrende monatliche Cashflows ausgegeben.

`accounts` enthält liquide Finanzkonten, Depots, Immobilien, Gesellschafteranteile und Verbindlichkeiten. Geldwerte einschließlich monatlicher Sparrate, Jahresprämie und monatlicher Kreditrate werden als ganzzahlige Centbeträge gespeichert, um Gleitkommafehler bei Salden zu vermeiden. Bei Immobilien und Beteiligungen speichert `total_valuation_cents` die Gesamtbewertung; `balance_cents` enthält den daraus mit `ownership_percent` berechneten eigenen Vermögenswert. Das Bewertungsdatum dokumentiert den Stand der Annahme. Sparrate und Kreditrate referenzieren jeweils ihr Finanz-Quellkonto, die Jahresprämie ihr Zielkonto und ein Kredit optional den zugehörigen nicht liquiden Vermögenswert. Zinssätze und prognostizierte Wertentwicklungen werden mit bis zu vier Nachkommastellen gespeichert. Die Migration erweitert die zulässigen Kontotypen durch einen transaktionalen Tabellenumbau und legt davor einmalig eine lokale SQLite-Sicherheitskopie an. Neue Annahmen beginnen bei 0 %, neue Verknüpfungen bleiben leer, weil finanzielle Werte und Zuordnungen nicht automatisch geraten werden dürfen.

`recurring_flows` enthält manuell gepflegte wiederkehrende Einnahmen und Ausgaben. Die optionale Fremdschlüsselverknüpfung zu `accounts` steuert, welches Konto in der Projektion verändert wird. Beim Löschen eines Kontos bleibt der Cashflow erhalten und die Zuordnung wird über `ON DELETE SET NULL` entfernt. Sparraten, Jahresprämien und Kreditraten werden nicht als zweite, veränderbare Datenkopie gespeichert: Die API leitet sie aus `accounts` ab und liefert sie der Cashflow-Ansicht mit stabilen synthetischen IDs sowie `readOnly: true` aus.

Die monatsgenaue Projektion behandelt Sparraten als interne Transfers, Jahresprämien als externen Zufluss und Kreditraten als Transfer vom Quellkonto in die Tilgung. Damit bleiben Cashflow-Anzeige, Kontenübersicht und Prognose auf derselben Datenquelle konsistent.

Die separate Cashflow-Analyse im Client normalisiert aktuell aktive wiederkehrende Zahlungen auf monatliche Centbeträge (wöchentlich × 52 / 12, quartalsweise ÷ 3, jährlich ÷ 12). Sparüberträge werden einmal vom freien Budget abgezogen und separat von Ausgaben gezeigt. Kontenprämien bleiben als zusätzliche Jahreszahlungen außerhalb des regelmäßigen Monatsbudgets sichtbar. Getilgte Kredite und nicht ausführbare Kontenraten ohne gültige Quelle/Ziel werden nicht summiert; fehlende Verknüpfungen werden ausdrücklich angezeigt. Die Analyse zeigt geplante Beträge, keine Bankumsätze oder liquiditätsbegrenzten tatsächlichen Abbuchungen. Einmalige Sondertilgungen und Kontozinsen gehören nicht zu dieser wiederkehrenden Budgetrechnung.

`recurring_flows.expense_group` speichert `auto`, `fixed`, `variable`, `optional` oder `unassigned`. Eine additive Migration belegt bestehende Cashflows mit `auto`. Die Analyse schlägt anhand von Name und Kategorie eine Gruppe vor, lässt unbekannte Posten offen und behandelt abgeleitete Kreditraten als Pflichtausgaben. Manuelle Überschreibungen werden über die Cashflow-API gespeichert; Updates älterer Clients ohne dieses Feld erhalten die bisherige Zuordnung. Kategorie-Vorschläge sind frei ergänzbar. Gruppierung beeinflusst die Budgetdarstellung, aber keine Vermögensprojektion.

`balance_date` ist der optionale Stichtag für gespeicherte Kontosalden und Restschulden; für Sachwerte wird `valuation_date` verwendet. Die einmalige additive Migration sichert vorhandene Daten und belegt Finanzkonten und Kredite mit dem aktuellen Datum vor. Ein danach geleertes Datum bleibt `NULL` und bedeutet bei jeder Berechnung heute. `projectPortfolio` rechnet vom frühesten Stichtagsmonat bis zum aktuellen Monat vor und liefert erst ab dort Prognosepunkte. Zinsen, Cashflows und jede Seite eines Transfers wirken nur nach dem jeweiligen Stichtagsmonat. Ein neuerer Snapshot enthält bereits die historischen Bewegungen auf seiner Seite; seine noch unbekannte frühere Liquidität begrenzt ältere Zielsalden nicht. `GET /api/accounts` liefert neben dem unveränderten `balanceCents` einen berechneten `currentBalanceCents`. Dashboard und Finanzierungsplan nutzen dieselbe Fortschreibung einschließlich manueller Cashflows. Das Bearbeitungsformular verwendet weiterhin den gespeicherten Betrag, alle Bestandsanzeigen und Szenarien verwenden den fortgeschriebenen Betrag.

Indizes existieren für die tatsächlichen Abfragepfade nach Konto sowie Aktivitätszeitraum. `PRAGMA optimize`, Foreign Keys, WAL-Modus und ein Busy Timeout werden beim Serverstart aktiviert.

## API

`interest_only_months` speichert bei Verbindlichkeiten 0 bis 600 Monate einer Zinsphase nach dem Stichtagsmonat (Migration: 0). `loanPaymentForMonth` berechnet während dieser Phase ausschließlich den gerundeten Zinsbetrag auf die Restschuld vor dem monatlichen Zinslauf. Ab Monat `interest_only_months + 1` gilt `monthly_payment_cents`. Dieselbe Phasenlogik wird bei historischen und zukünftigen Prognosemonaten, Dashboard-Kreditraten und automatisch abgeleiteten Cashflows verwendet. Die Konten-API liefert zusätzlich den berechneten `currentMonthlyPaymentCents`; das Formular bearbeitet weiterhin die vertragliche Rate nach der Phase. Bei einem späteren Snapshot sind verbleibende Zinsmonate zu erfassen.

- `GET|POST /api/accounts`
- `PUT|DELETE /api/accounts/:id`
- `GET|POST /api/flows`
- `PUT|DELETE /api/flows/:id`
- `GET /api/dashboard?years=10`
- `POST /api/scenarios/compare`
- `POST /api/demo` (nur bei leerer Datenbank)
- `GET /api/health`


Kredite können über `monthly_payment_day` (nullable, 1–31) eine taggenaue 30/360-Rechnung aktivieren. Die additive Migration lässt bestehende Konten bei `NULL` in der Monatsrechnung. Omission auf PUT erhält die Einstellung; explizites `null` deaktiviert sie. `loan-dates.ts` trennt gebuchte Restschuld und ungerundete laufende Zinsabgrenzung, verarbeitet Ratentermine und Sondertilgungen nach Datum und rundet Zinsen erst am Ratentag. Der 31. und der letzte Februartag werden als 30. Zinstag behandelt; kürzere Monate begrenzen den Ratentag auf ihr Kalenderende. Der exakte Snapshot enthält alle Buchungen bis einschließlich dieses Tages und setzt die Zinsabgrenzung auf null. Jede Transferseite wird anhand ihres eigenen exakten Stichtags aktiviert. Historische Zielbewegungen mit noch unbekanntem Quellsaldo gelten weiterhin als bezahlt. Aktuelle Punkte enden heute, zukünftige Punkte am selben Kalendertag im jeweiligen Monat. `accountAccruedInterests` / `currentAccruedInterestCents` zeigen die noch nicht gebuchten Zinsen separat; Bestandskennzahlen und Planer verwenden die gebuchte Restschuld. Geldkonten und wiederkehrende manuelle Cashflows bleiben monatsweise modelliert.
