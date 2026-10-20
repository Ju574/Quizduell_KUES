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
| `werkzeuge/fragen-zu-sql.js` | Macht aus `fragen.json` ein Import-Skript für Supabase |

`fragen.json` und `fragen-import.sql` sind über `.gitignore` ausgeschlossen und kommen nie ins Repository.

## Einrichtung (einmalig)

Im Supabase-Dashboard unter **SQL Editor → New query** nacheinander ausführen:
1. `supabase.sql`
2. `gruppen-passwort.sql` (vorher das Passwort eintragen)
3. `fragen-import.sql`

In `config.js` stehen die **Project URL** und der **publishable/anon key**. Der darf öffentlich sein. Der **secret/service_role key** gehört niemals hierher.

## Fragen ergänzen oder korrigieren

1. Fragen in `fragen.json` bearbeiten (Format siehe unten).
2. `node werkzeuge/fragen-zu-sql.js` ausführen. Das prüft die Datei und erzeugt `fragen-import.sql`.
3. `fragen-import.sql` im Supabase SQL Editor ausführen.

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

## Spielmodi

- **🔁 Rundenduell**: 6 Runden à 3 Fragen, 20 Sekunden pro Frage. Ihr wählt abwechselnd die Kategorie.
- **⚡ Live-Battle**: 7 Fragen gleichzeitig, 15 Sekunden pro Frage. Eine richtige Antwort gibt 10 Punkte plus bis zu 10 Tempo-Bonuspunkte.
- **📚 Lernen**: Schwächen üben, neue Fragen oder zufällige Fragen.
- **📊 Statistik**: Lernstand pro Kategorie. „Sicher“ heißt 3× hintereinander richtig.
- **🏆 Rangliste**: Sieg = 3 Punkte, Unentschieden = 1 Punkt.

Rundenzahl, Zeitlimits usw. lassen sich oben in `app.js` im Block `E = { … }` ändern.

## Gut zu wissen

- Spieler melden sich nur mit Namen an. Für den Zugang zu den Fragen braucht man das Gruppen-Passwort.
- Wer das Gruppen-Passwort hat, könnte mit Technikwissen nach und nach alle Fragen samt Lösungen abrufen.
- Supabase Free pausiert ein Projekt nach 7 Tagen ohne Nutzung. Im Dashboard lässt es sich mit einem Klick fortsetzen.
- Lokal testen: `python -m http.server 8765` ausführen und `http://localhost:8765` öffnen. Ohne Einträge in `config.js` läuft ein Demo-Modus mit der lokalen `fragen.json` (Passwort `demo`).
