// Erzeugt aus fragen.json ein SQL-Skript für den Import in Supabase.
//
//   node werkzeuge/fragen-zu-sql.js [fragen.json] [fragen-import.sql]
//
// Das Ergebnis in Supabase → SQL Editor einfügen und ausführen.
// Bestehende Fragen werden aktualisiert; Fragen, die nicht mehr in der Datei stehen,
// werden deaktiviert (nicht gelöscht – Lernstand und alte Duelle bleiben gültig).
// fragen.json und fragen-import.sql gehören NICHT ins Repository (siehe .gitignore).

'use strict';
const fs = require('fs');

const quelle = process.argv[2] || 'fragen.json';
const ziel = process.argv[3] || 'fragen-import.sql';

const fragen = JSON.parse(fs.readFileSync(quelle, 'utf8'));
const fehler = [];
const ids = new Set();

fragen.forEach((f, i) => {
  const wo = `Frage Nr. ${i + 1}${f && f.id ? ` (${f.id})` : ''}`;
  if (!f || typeof f !== 'object') return fehler.push(`${wo}: kein Objekt`);
  for (const feld of ['id', 'kategorie', 'frage', 'richtig']) {
    if (typeof f[feld] !== 'string' || !f[feld].trim()) fehler.push(`${wo}: „${feld}“ fehlt`);
  }
  if (!Array.isArray(f.falsch) || !f.falsch.length || f.falsch.some((x) => typeof x !== 'string' || !x.trim())) {
    fehler.push(`${wo}: „falsch“ muss eine Liste mit mindestens einer Antwort sein`);
  } else if (f.falsch.includes(f.richtig)) {
    fehler.push(`${wo}: die richtige Antwort steht auch bei „falsch“`);
  }
  if (f.id && ids.has(f.id)) fehler.push(`${wo}: id doppelt`);
  ids.add(f.id);
});

if (fehler.length) {
  console.error('Fehler in ' + quelle + ':\n  ' + fehler.join('\n  '));
  process.exit(1);
}

const text = (s) => (s == null || s === '' ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const liste = (a) => `array[${a.map(text).join(', ')}]::text[]`;

const zeilen = fragen.map(
  (f) => `  (${text(f.id)}, ${text(f.kategorie)}, ${text(f.frage)}, ${text(f.richtig)}, ${liste(f.falsch)}, ${text(f.erklaerung)})`
);

const sql = `-- Automatisch erzeugt aus ${quelle} am ${new Date().toISOString().slice(0, 16).replace('T', ' ')}
-- ${fragen.length} Fragen. In Supabase → SQL Editor einfügen und ausführen.

insert into public.fragen (id, kategorie, frage, richtig, falsch, erklaerung) values
${zeilen.join(',\n')}
on conflict (id) do update set
  kategorie = excluded.kategorie,
  frage = excluded.frage,
  richtig = excluded.richtig,
  falsch = excluded.falsch,
  erklaerung = excluded.erklaerung,
  aktiv = true,
  geaendert = now();

update public.fragen set aktiv = false, geaendert = now()
where aktiv and id <> all (${liste(fragen.map((f) => f.id))});
`;

fs.writeFileSync(ziel, sql);
const kategorien = {};
fragen.forEach((f) => (kategorien[f.kategorie] = (kategorien[f.kategorie] || 0) + 1));
console.log(`${fragen.length} Fragen → ${ziel}`);
for (const [k, n] of Object.entries(kategorien)) console.log(`  ${k}: ${n}${n < 3 ? '  ⚠ weniger als 3 – erscheint nicht im Rundenduell' : ''}`);
