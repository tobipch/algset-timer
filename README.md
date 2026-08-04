# Kolibri Timer

Persönliches Tool zum Timen von 3x3-Blindfolded-Algsets (3-Style-Commutators) mit dem
Smartcube — um herauszufinden, welche Cases die schnellsten sind und wohin sich
Buffer-Breaks lohnen.

Das UI ist Kolibri-getauft: Cases sind Blüten, Versuche sind Anflüge, Zeiten werden
in Flügelschläge (~50/s) umgerechnet, und ein schwirrender SVG-Kolibri begleitet den
Timer. Ein Klick auf den Vogel in der Navbar zwitschert einen Kolibri-Fakt.
Funktional ändert das nichts — Timing, Regrips, Übersicht und XLSX-Export bleiben
exakt wie gehabt.

Timer- und Smartcube-Integration orientieren sich an
[Algfolded](https://github.com/tobipch/algfolded).

## Was es macht

- **Algset hochladen** (beliebiger Edge- oder Corner-Buffer, z.B. UF, UFR, UBL):
  - **Text-Format**: ein Case pro Zeile — `BA: [R2 U': [R2, S]]` oder
    `[R2 U': [R2, S]] (BA)` (so wie die Zellen im BLD-Sheet; auch mit angehängten
    Zeit/Regrip-Spalten aus einem Copy-Paste)
  - **Algfolded-JSON**: `edge_comms.json` / `corner_comms.json` — die Cases des
    gewählten Buffers werden extrahiert (erster Alg pro Case), Buchstaben nach Speffz
- **Timing-Session**: geht Case für Case durch, misst pro Case x Versuche
  (Standard 12) und fragt danach die Anzahl Regrips ab.
  - Mit Smartcube (GAN, MoYu, QiYi): kein Scramble nötig — der virtuelle Cube wird
    auf den „Vor-Alg-Zustand“ gesetzt, der erste Move startet den Timer, das
    Erreichen des Zielzustands stoppt ihn. Der nächste Versuch startet direkt vom
    aktuellen Zustand (nach 3 Wiederholungen ist der Cube wieder im Ausgangszustand).
  - Cube-Geste: D- oder U-Layer 360° drehen = aktuellen Versuch zurücksetzen.
  - Ohne Cube: Leertaste startet/stoppt jeden Versuch.
  - Regrip-Abfrage: Tasten 0–9 speichern direkt und springen zum nächsten Case.
- **Übersicht**: Tabelle pro Algset, sortierbar nach Case, Zeit, Regrips und Datum.
- **XLSX-Export**: gleiches Layout und gleiche Formatierung wie das Sheet „UF Times“
  (Grid Spalte=1. Buchstabe / Zeile=2. Buchstabe, Average-Zeile, Best cycle breaks,
  Slowest comms, Total Regrips).

## Setup

### 1. Datenbank (Neon)

Im Vercel-Dashboard unter **Storage → Create Database → Neon** eine (kostenlose)
Postgres-DB anlegen und mit dem Projekt verknüpfen — das setzt `DATABASE_URL`
automatisch. Das Schema legt die API beim ersten Request selbst an
(idempotente `CREATE TABLE IF NOT EXISTS`); es ist kein manueller Schritt nötig.

Optional lässt sich das Schema auch von Hand anlegen:

```bash
cp .env.example .env       # DATABASE_URL eintragen (aus Vercel/Neon kopieren)
npm install
npm run setup-db
```

### 2. Passwortschutz (optional, empfohlen)

In Vercel die Env-Variable `APP_PASSWORD` setzen. Ohne sie ist die App offen.
Das Login setzt ein Cookie für 180 Tage.

### 3. Deployment

Das Repo als Projekt in Vercel importieren — Vite-Frontend und die Functions unter
`api/` werden automatisch erkannt. Fertig.

### Lokale Entwicklung

```bash
npm run dev        # Vite auf :5173
vercel dev         # API auf :3000 (das Vite-Dev-Server-Proxy zeigt auf /api)
```

Ohne echten Cube: in der Bluetooth-Auswahl den **Keyboard-Simulator** verbinden
(`r/l/u/d/f/b` = im Uhrzeigersinn, Shift = invers, Ctrl = Doppelzug) oder in der
Konsole `btSim.move("R")`.

```bash
npm test           # Unit-Tests (Parser, Letter-Schema, XLSX-Export)
npm run typecheck  # API-Typecheck
```

## Notizen

- Buchstaben-Schema: Speffz (UB=A, UR=B, … DL=X; Ecken UBL=A … DBL=X).
- Die Zeiten werden in ms gespeichert; der Export schreibt Sekunden mit 2
  Nachkommastellen, wie im Sheet.
- Pro Case wird das jeweils letzte Messergebnis angezeigt; erneutes Messen
  überschreibt nicht, sondern legt ein neues Ergebnis an (das neueste zählt).
- `cubeOrientation` in den Session-Einstellungen (z.B. `z2`) remappt die
  Cube-Moves, falls der Cube anders gehalten wird als Weiss oben / Grün vorne.
