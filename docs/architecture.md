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

`accounts` enthält liquide Finanzkonten, Depots, Immobilien, Gesellschafteranteile und Verbindlichkeiten. Geldwerte einschließlich monatlicher Sparrate, Jahresprämie und monatlicher Kreditrate werden als ganzzahlige Centbeträge gespeichert, um Gleitkommafehler bei Salden zu vermeiden. Bei Immobilien und Beteiligungen speichert `total_valuation_cents` die Gesamtbewertung; `balance_cents` enthält den daraus mit `ownership_percent` berechneten eigenen Vermögenswert. Das Bewertungsdatum dokumentiert den Stand der Annahme. Sparrate und Kreditrate referenzieren jeweils ihr Finanz-Quellkonto, die Jahresprämie ihr Zielkonto und ein Kredit optional den zugehörigen nicht liquiden Vermögenswert. Zinssätze und prognostizierte Wertentwicklungen werden mit bis zu vier Nachkommastellen gespeichert. Die Migration erweitert die zulässigen Kontotypen durch einen transaktionalen Tabellenumbau und legt davor einmalig eine lokale SQLite-Sicherheitskopie an. Neue Annahmen beginnen bei 0 %, neue Verknüpfungen bleiben leer, weil finanzielle Werte und Zuordnungen nicht automatisch geraten werden dürfen.

`recurring_flows` enthält manuell gepflegte wiederkehrende Einnahmen und Ausgaben. Die optionale Fremdschlüsselverknüpfung zu `accounts` steuert, welches Konto in der Projektion verändert wird. Beim Löschen eines Kontos bleibt der Cashflow erhalten und die Zuordnung wird über `ON DELETE SET NULL` entfernt. Sparraten, Jahresprämien und Kreditraten werden nicht als zweite, veränderbare Datenkopie gespeichert: Die API leitet sie aus `accounts` ab und liefert sie der Cashflow-Ansicht mit stabilen synthetischen IDs sowie `readOnly: true` aus.

Die monatsgenaue Projektion behandelt Sparraten als interne Transfers, Jahresprämien als externen Zufluss und Kreditraten als Transfer vom Quellkonto in die Tilgung. Damit bleiben Cashflow-Anzeige, Kontenübersicht und Prognose auf derselben Datenquelle konsistent.

Indizes existieren für die tatsächlichen Abfragepfade nach Konto sowie Aktivitätszeitraum. `PRAGMA optimize`, Foreign Keys, WAL-Modus und ein Busy Timeout werden beim Serverstart aktiviert.

## API

- `GET|POST /api/accounts`
- `PUT|DELETE /api/accounts/:id`
- `GET|POST /api/flows`
- `PUT|DELETE /api/flows/:id`
- `GET /api/dashboard?years=10`
- `POST /api/scenarios/compare`
- `POST /api/demo` (nur bei leerer Datenbank)
- `GET /api/health`
