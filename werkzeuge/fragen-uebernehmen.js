// Übernimmt selbst erstellte Fragen (z. B. aus einer Zusammenfassung) in fragen.json.
//
//   node werkzeuge/fragen-uebernehmen.js <fragen-datei.json> [fragen.json]
//
// Die Datei enthält Fragen im normalen Format ({ id, kategorie, frage, richtig, falsch, erklaerung }).
// Skizzen („bild“, „bild_nach“) sind Dateinamen in quellen/bilder/.
// Alle bisherigen Fragen mit demselben ID-Kürzel (z. B. „mz-“) werden ersetzt, alles andere bleibt.

'use strict';
const fs = require('fs');

const [quelle, zielDatei = 'fragen.json'] = process.argv.slice(2);
if (!quelle) {
  console.error('Aufruf: node werkzeuge/fragen-uebernehmen.js <fragen-datei.json> [fragen.json]');
  process.exit(1);
}

const neu = JSON.parse(fs.readFileSync(quelle, 'utf8'));
const fehler = [];
const ids = new Set();
neu.forEach((f, i) => {
  const wo = `Nr. ${i + 1}${f.id ? ` (${f.id})` : ''}`;
  for (const feld of ['id', 'kategorie', 'frage', 'richtig']) if (!f[feld]) fehler.push(`${wo}: „${feld}“ fehlt`);
  if (f.typ === 'eingabe' || f.typ === 'beschriften') {
    if (f.alternativen && !Array.isArray(f.alternativen)) fehler.push(`${wo}: „alternativen“ muss eine Liste sein`);
    if (f.typ === 'beschriften' && !String(f.richtig).split('\n').every((z) => /^[^:]+:\s*\S/.test(z)))
      fehler.push(`${wo}: „richtig“ braucht je Zeile „Nr: Begriff“`);
  } else if (!Array.isArray(f.falsch) || f.falsch.length < 3) fehler.push(`${wo}: weniger als 3 falsche Antworten`);
  else if (f.falsch.includes(f.richtig)) fehler.push(`${wo}: richtige Antwort steht auch bei „falsch“`);
  for (const feld of ['bild', 'bild_nach']) {
    if (f[feld] && !fs.existsSync(`quellen/bilder/${f[feld]}`)) fehler.push(`${wo}: quellen/bilder/${f[feld]} fehlt`);
  }
  if (ids.has(f.id)) fehler.push(`${wo}: id doppelt`);
  ids.add(f.id);
});
if (fehler.length) {
  console.error('Fehler in ' + quelle + ':\n  ' + fehler.join('\n  '));
  process.exit(1);
}

const kuerzel = neu[0].id.replace(/[^-]+$/, '');
const bisher = fs.existsSync(zielDatei) ? JSON.parse(fs.readFileSync(zielDatei, 'utf8')) : [];
const behalten = bisher.filter((f) => !f.id.startsWith(kuerzel));
fs.writeFileSync(zielDatei, JSON.stringify([...behalten, ...neu], null, 2) + '\n');

const proThema = {};
neu.forEach((f) => (proThema[f.kategorie] = (proThema[f.kategorie] || 0) + 1));
console.log(`${neu.length} Fragen aus ${quelle} → ${zielDatei} (${behalten.length} andere behalten)`);
for (const [k, n] of Object.entries(proThema)) console.log(`  ${k}: ${n}`);
