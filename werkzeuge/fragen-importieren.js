// Lädt Fragen aus fragen.json direkt in die Supabase-Datenbank – ohne SQL Editor.
//
//   node werkzeuge/fragen-importieren.js            alle Fragen
//   node werkzeuge/fragen-importieren.js mk- mz-    nur Fragen mit diesen ID-Kürzeln
//
// Braucht den lokalen Import-Schlüssel in .import-schluessel (wird nie hochgeladen).
// Fragen eines Kürzels, die nicht mehr in fragen.json stehen, werden deaktiviert (nicht gelöscht).

'use strict';
const fs = require('fs');

const kuerzel = process.argv.slice(2);
const config = fs.readFileSync('config.js', 'utf8');
const url = (config.match(/SUPABASE_URL:\s*'([^']+)'/) || [])[1];
const key = (config.match(/SUPABASE_KEY:\s*'([^']+)'/) || [])[1];
if (!url || !key) throw new Error('Supabase-Zugangsdaten in config.js fehlen.');
if (!fs.existsSync('.import-schluessel')) throw new Error('.import-schluessel fehlt.');
const schluessel = fs.readFileSync('.import-schluessel', 'utf8').trim();

const alle = JSON.parse(fs.readFileSync('fragen.json', 'utf8'));
const fragen = kuerzel.length ? alle.filter((f) => kuerzel.some((k) => f.id.startsWith(k))) : alle;
if (!fragen.length) throw new Error('Keine passenden Fragen gefunden.');

async function rpc(name, body) {
  const antwort = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await antwort.text();
  if (!antwort.ok) throw new Error(`${name}: ${antwort.status} ${text}`);
  return JSON.parse(text);
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

(async () => {
  // Zuerst die Skizzen (aus quellen/bilder/), damit keine Frage auf ein fehlendes Bild zeigt
  const bilder = [...new Set(fragen.flatMap((f) => [f.bild, f.bild_nach]).filter(Boolean))];
  for (const bild of bilder) {
    const mime = MIME[bild.split('.').pop().toLowerCase()];
    if (!mime) throw new Error(`Unbekanntes Bildformat: ${bild}`);
    const daten = fs.readFileSync(`quellen/bilder/${bild}`).toString('base64');
    await rpc('bilder_importieren', { p_schluessel: schluessel, p_bilder: [{ id: bild, mime, daten }] });
  }
  if (bilder.length) console.log(`${bilder.length} Skizzen hochgeladen.`);

  let importiert = 0;
  for (let i = 0; i < fragen.length; i += 50) {
    const paket = fragen.slice(i, i + 50).map(({ id, kategorie, frage, richtig, falsch, erklaerung, typ, alternativen, bild, bild_nach }) => ({
      id, kategorie, frage, richtig, falsch: falsch || [], erklaerung: erklaerung || null, typ: typ || 'auswahl', alternativen: alternativen || [],
      bild: bild || null, bild_nach: bild_nach || null,
    }));
    importiert += await rpc('fragen_importieren', { p_schluessel: schluessel, p_fragen: paket });
  }
  console.log(`${importiert} Fragen importiert bzw. aktualisiert.`);

  // Entfernte Fragen deaktivieren – je ID-Kürzel (z. B. „mk-“)
  const gruppen = kuerzel.length ? kuerzel : [...new Set(alle.map((f) => f.id.replace(/[^-]+$/, '')))];
  for (const k of gruppen) {
    const behalten = alle.filter((f) => f.id.startsWith(k)).map((f) => f.id);
    const n = await rpc('fragen_deaktivieren', { p_schluessel: schluessel, p_kuerzel: k, p_behalten: behalten });
    if (n) console.log(`${n} nicht mehr vorhandene Fragen mit „${k}“ deaktiviert.`);
  }
})().catch((e) => {
  console.error('Fehler: ' + e.message);
  process.exit(1);
});
