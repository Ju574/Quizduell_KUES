# 🔧 Prüfi-Duell

Quizduell für die Kfz-Prüfingenieur-Ausbildung, mit Rundenduell, Live-Battle, Lernmodus, Statistik und Rangliste.
Die Seite läuft auf GitHub Pages, die Daten liegen in einer kostenlosen Supabase-Datenbank.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css`, `app.js` | Die Webseite selbst |
| `db.js` | Datenbankzugriff (Supabase oder Demo-Modus) |
| `config.js` | **Hier kommen deine Supabase-Zugangsdaten rein** |
| `fragen.js` | **Der Fragenkatalog** |
| `supabase.sql` | Einmalig in Supabase ausführen, legt die Tabellen an |

Ohne Eintrag in `config.js` läuft die Seite im **Demo-Modus**: Alles funktioniert, wird aber nur im eigenen Browser gespeichert.

## 1. Datenbank einrichten (Supabase, ca. 5 Minuten)

1. Auf [supabase.com](https://supabase.com) ein kostenloses Konto anlegen → **New project** (Region: z. B. Frankfurt).
2. Links **SQL Editor** → **New query** → den kompletten Inhalt von `supabase.sql` einfügen → **Run**.
3. **Project Settings → API** (bzw. **API Keys**): die **Project URL** und den **anon / publishable key** kopieren.
4. Beides in `config.js` eintragen:
   ```js
   window.PRUEFI_CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_KEY: 'eyJhbGciOi…',
   };
   ```
   Der anon/publishable Key darf öffentlich sein. Den **service_role / secret key** dagegen **niemals** eintragen.

## 2. Auf GitHub veröffentlichen

1. Auf [github.com](https://github.com) → **New repository** → Name z. B. `pruefi-duell`, **Public** → Create.
2. **Add file → Upload files** → alle Dateien oben hineinziehen → **Commit changes**.
3. **Settings → Pages** → Source: **Deploy from a branch** → Branch **main**, Ordner **/ (root)** → Save.
4. Nach ca. 1 Minute ist die Seite erreichbar unter `https://<dein-github-name>.github.io/pruefi-duell/`.
   Diesen Link an die Mitstudenten schicken. Auf dem Handy lässt er sich über „Zum Startbildschirm hinzufügen“ wie eine App ablegen.

## Fragen hinzufügen

In `fragen.js` (auf GitHub direkt über das Stift-Symbol bearbeitbar):

```js
{
  id: 'br-006',                       // eindeutig, NIE nachträglich ändern
  kategorie: 'Bremsen',
  frage: 'Wie heißt …?',
  richtig: 'Die richtige Antwort',
  falsch: ['Falsch 1', 'Falsch 2', 'Falsch 3'],
  erklaerung: 'Optional: wird nach dem Beantworten angezeigt.',
},
```

- Lernstand und laufende Duelle hängen an der `id`. Den Text einer Frage darfst du korrigieren, die `id` bleibt aber gleich.
- Für ein Rundenduell braucht eine Kategorie mindestens 3 Fragen.
- Fehler in `fragen.js` (z. B. ein fehlendes Komma) werden auf der Startseite als Warnung angezeigt.

## Spielmodi

- **🔁 Rundenduell**: 6 Runden à 3 Fragen, 20 Sekunden pro Frage. Ihr wählt abwechselnd die Kategorie und spielt, wann ihr Zeit habt.
- **⚡ Live-Battle**: 7 Fragen gleichzeitig, 15 Sekunden pro Frage. Eine richtige Antwort gibt 10 Punkte plus bis zu 10 Bonuspunkte für Tempo. Beide müssen online sein.
- **📚 Lernen**: Schwächen üben, neue Fragen oder zufällige Fragen, optional mit Zeitlimit.
- **📊 Statistik**: Lernstand pro Kategorie. „Sicher“ heißt 3× hintereinander richtig.
- **🏆 Rangliste**: Sieg = 3 Punkte, Unentschieden = 1 Punkt.

Rundenzahl, Zeitlimits usw. lassen sich oben in `app.js` im Block `E = { … }` ändern.

## Gut zu wissen

- **Anmeldung nur per Name:** Wer deinen Namen kennt, kann theoretisch als du spielen. Das ist bewusst so einfach gehalten, für eine Lerngruppe reicht das.
- **Supabase Free-Tarif:** Wird ein Projekt 7 Tage lang nicht genutzt, pausiert Supabase es. Im Supabase-Dashboard lässt es sich mit einem Klick wieder starten.
- **Lokal testen:** Im Ordner `python -m http.server 8765` ausführen und `http://localhost:8765` öffnen. Mit zwei Browser-Tabs kann man im Demo-Modus gegen sich selbst spielen.
