# 🔧 Prüfi-Duell

Quizduell für die Kfz-Prüfingenieur-Ausbildung, mit Rundenduell, Live-Battle, Lernmodus, Statistik und Rangliste.
Die Seite läuft auf GitHub Pages, die Daten liegen in Supabase.

**Die Fragen stehen nicht in diesem Repository.** Sie liegen geschützt in der Datenbank und sind nur mit dem Gruppen-Passwort abrufbar. Die richtige Antwort wird erst nach dem Antworten geladen.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css`, `app.js` | Die Webseite |
| `db.js` | Datenbankzugriff (Supabase oder Demo-Modus) |
| `config.js` | Supabase-Adresse und öffentlicher Schlüssel |
| `supabase.sql` | Legt Tabellen und Schutzfunktionen an (mehrfach ausführbar) |
| `gruppen-passwort.sql` | Setzt oder ändert das Gruppen-Passwort |
| `admin-passwort.sql` | Setzt oder ändert das Admin-Passwort |
| `werkzeuge/karteikarten-zu-fragen.js` | Holt Fragen wörtlich aus einer Karteikarten-HTML-Datei in `fragen.json` |
| `werkzeuge/fragen-uebernehmen.js` | Übernimmt selbst erstellte Fragen (z. B. aus Zusammenfassungen) in `fragen.json` |
| `werkzeuge/fragen-importieren.js` | Lädt `fragen.json` direkt in Supabase |
| `werkzeuge/fragen-zu-sql.js` | Macht aus `fragen.json` ein Import-Skript für den SQL Editor |

`quellen/` (Unterlagen), `fragen.json` und `fragen-import.sql` sind über `.gitignore` ausgeschlossen und kommen nie ins Repository.

## Einrichtung (einmalig)

Im Supabase-Dashboard unter **SQL Editor → New query** nacheinander ausführen:
1. `supabase.sql`
2. `gruppen-passwort.sql` und `admin-passwort.sql` (vorher jeweils das Passwort eintragen)
3. `fragen-import.sql`

In `config.js` stehen die **Project URL** und der **publishable/anon key**. Der darf öffentlich sein. Der **secret/service_role key** gehört niemals hierher.

## Neues Kapitel aus Karteikarten

1. Karteikarten-HTML nach `quellen/` legen.
2. `node werkzeuge/karteikarten-zu-fragen.js quellen/<datei>.html quellen/<datei>_falsch.json <Präfix>`. Ohne vorhandene `_falsch.json` wird erst eine Vorlage angelegt, in die je Karte 3 falsche Antworten kommen.
3. Erneut ausführen. Frage und richtige Antwort werden wörtlich übernommen.
4. Weiter mit „Fragen ergänzen oder korrigieren“ ab Schritt 2.

## Fragen ergänzen oder korrigieren

1. Fragen in `fragen.json` bearbeiten (Format siehe unten).
2. `node werkzeuge/fragen-importieren.js` ausführen (optional nur bestimmte Kürzel, z. B. `mk- mz-`). Das lädt die Fragen direkt in Supabase. Voraussetzung ist der lokale Import-Schlüssel in `.import-schluessel`; in der Datenbank liegt davon nur ein Hash.
   Alternativ: `node werkzeuge/fragen-zu-sql.js` erzeugt `fragen-import.sql` für den Supabase SQL Editor.

```json
{
  "id": "r1-01",
  "kategorie": "Recht · Rechtsvorschriften",
  "frage": "Wie heißt …?",
  "richtig": "Die richtige Antwort",
  "falsch": ["Falsch 1", "Falsch 2", "Falsch 3"],
  "erklaerung": "Optional: wird nach dem Beantworten angezeigt."
}
```

- Die `id` darf sich **nie** ändern, denn Lernstand und Duelle hängen daran. Texte darf man korrigieren.
- Fragen, die aus `fragen.json` entfernt werden, werden beim nächsten Import deaktiviert, aber nicht gelöscht.
- Eine Kategorie braucht mindestens 3 Fragen, um im Rundenduell zu erscheinen.
- **Eintipp-Fragen:** `"typ": "eingabe"` plus `"alternativen": [ … ]` (weitere erlaubte Antworten); `falsch` entfällt. Groß-/Kleinschreibung, Satzzeichen, ä/ae, ß/ss und Füllwörter wie „ca.“ zählen nicht, kleine Tippfehler sind erlaubt, Zahlen müssen exakt stimmen.
- **Skizzen:** `"bild": "datei.png"` erscheint über der Frage, `"bild_nach": "datei.png"` erst in der Auflösung. Die Dateien liegen lokal in `quellen/bilder/` und werden von `fragen-importieren.js` geschützt in die Datenbank geladen (nur mit Gruppen- oder Admin-Passwort abrufbar).
- **Skizze beschriften:** `"typ": "beschriften"` mit nummerierter Skizze in `bild`. In `richtig` steht je Zeile `Nr: Begriff` (z. B. `"1: Heizelement\n2: Isolierteil"`). Die App zeigt die Begriffe gemischt, zu jedem tippt man die passende Nummer an; die Frage zählt als richtig, wenn alle Begriffe stimmen. Pro weiterem Begriff gibt es 5 s mehr Zeit.

## Spielmodi

Duelle sind mit 2 oder 3 Spielern möglich. Beim Erstellen wählt man die Runden- bzw. Fragenzahl und die Zeit pro Frage (20 s, 45 s, 90 s oder unbegrenzt).

- **🔁 Rundenduell**: 3, 6 oder 9 Runden à 3 Fragen. Wer eine Runde als Letzter abschließt, wählt die nächste Kategorie.
- **⚡ Live-Battle**: 5, 7 oder 10 Fragen gleichzeitig; startet, sobald alle angenommen haben. Eine richtige Antwort gibt 10 Punkte plus bis zu 10 Tempo-Bonuspunkte (ohne Zeitlimit: 10 Punkte).
- **📚 Lernen**: Schwächen üben, neue Fragen oder zufällige Fragen.
- **📊 Statistik**: Lernstand pro Kategorie. „Sicher“ heißt 3× hintereinander richtig.
- **🏆 Rangliste**: Sieg = 3 Punkte, Unentschieden bzw. geteilter Sieg = 1 Punkt.
- **🟢 Online-Punkt**: zeigt, wer gerade die Seite geöffnet hat.
- **Admin** (Link unten auf der Startseite): Spieler und Duelle löschen, Lernstand zurücksetzen – nur mit Admin-Passwort.

Die Auswahlmöglichkeiten lassen sich oben in `app.js` im Block `E = { … }` ändern. Nach jeder Änderung an CSS/JS die Versionsnummer `?v=…` in `index.html` erhöhen.

## Gut zu wissen

- Spieler melden sich nur mit Namen an. Für den Zugang zu den Fragen braucht man das Gruppen-Passwort.
- Wer das Gruppen-Passwort hat, könnte mit Technikwissen nach und nach alle Fragen samt Lösungen abrufen.
- Supabase Free pausiert ein Projekt nach 7 Tagen ohne Nutzung. Im Dashboard lässt es sich mit einem Klick fortsetzen.
- Lokal testen: `python -m http.server 8765` ausführen und `http://localhost:8765/?demo` öffnen. Mit `?demo` läuft ein Demo-Modus im Browser mit der lokalen `fragen.json` (Gruppen-Passwort `demo`, Admin-Passwort `admin`) – die echte Datenbank bleibt unberührt.
