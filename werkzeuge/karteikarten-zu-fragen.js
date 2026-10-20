// Macht aus einer Karteikarten-HTML-Datei Quizfragen – Frage und richtige Antwort wörtlich.
//
//   node werkzeuge/karteikarten-zu-fragen.js <karteikarten.html> <falsch.json> <Präfix> [fragen.json]
//   z. B. node werkzeuge/karteikarten-zu-fragen.js quellen/kapitel6_recht.html quellen/kapitel6_falsch.json Recht
//
// <falsch.json> enthält die falschen Antworten je Karte: { "I.1": ["…", "…", "…"], … }
// Ohne vorhandene falsch.json wird eine Vorlage mit allen Karten erzeugt.
// Die Fragen des Kapitels werden in fragen.json ersetzt, andere Kapitel bleiben unverändert.

'use strict';
const fs = require('fs');

const [html, falschDatei, praefix, zielDatei = 'fragen.json'] = process.argv.slice(2);
if (!html || !falschDatei || !praefix) {
  console.error('Aufruf: node werkzeuge/karteikarten-zu-fragen.js <karteikarten.html> <falsch.json> <Präfix> [fragen.json]');
  process.exit(1);
}

// Das CARDS-Array steht als JavaScript in der HTML-Datei
const quelltext = fs.readFileSync(html, 'utf8');
const treffer = quelltext.match(/const CARDS\s*=\s*(\[[\s\S]*?\n\]);/);
if (!treffer) {
  console.error('Kein „const CARDS = [...]“ in ' + html + ' gefunden.');
  process.exit(1);
}
const karten = new Function('return ' + treffer[1])();

const ENTITAETEN = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const reinerText = (s) =>
  String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITAETEN[e] ?? e)
    .replace(/\s+/g, ' ')
    .trim();

// "I.1 · Rechtsvorschriften" → Nummer "I.1", Thema "Rechtsvorschriften"
const zerlegen = (t) => {
  const [nummer, thema] = t.split('·').map((x) => x.trim());
  return { nummer, thema };
};

if (!fs.existsSync(falschDatei)) {
  const vorlage = {};
  for (const k of karten) vorlage[zerlegen(k.t).nummer] = ['', '', ''];
  fs.writeFileSync(falschDatei, JSON.stringify(vorlage, null, 2) + '\n');
  console.log(`Vorlage mit ${karten.length} Karten angelegt: ${falschDatei}`);
  process.exit(0);
}

const falsch = JSON.parse(fs.readFileSync(falschDatei, 'utf8'));
const fehler = [];
const neu = karten.map((k) => {
  const { nummer, thema } = zerlegen(k.t);
  const id = `k${k.c}-${nummer}`;
  const richtig = reinerText(k.a);
  const f = (falsch[nummer] || []).map((x) => x.trim()).filter(Boolean);
  if (f.length < 3) fehler.push(`${nummer}: nur ${f.length} falsche Antworten`);
  if (f.includes(richtig)) fehler.push(`${nummer}: falsche Antwort ist identisch mit der richtigen`);
  return { id, kategorie: `${praefix} · ${thema}`, frage: reinerText(k.q), richtig, falsch: f };
});

const ueberzaehlig = Object.keys(falsch).filter((n) => !karten.some((k) => zerlegen(k.t).nummer === n));
if (ueberzaehlig.length) fehler.push('falsche Antworten ohne passende Karte: ' + ueberzaehlig.join(', '));
if (fehler.length) {
  console.error('Fehler:\n  ' + fehler.join('\n  '));
  process.exit(1);
}

// Fragen dieses Kapitels ersetzen, alle anderen behalten
const kapitelPraefix = `k${karten[0].c}-`;
const bisher = fs.existsSync(zielDatei) ? JSON.parse(fs.readFileSync(zielDatei, 'utf8')) : [];
const behalten = bisher.filter((f) => !f.id.startsWith(kapitelPraefix) && !f.kategorie.startsWith(praefix + ' · '));
fs.writeFileSync(zielDatei, JSON.stringify([...behalten, ...neu], null, 2) + '\n');

const proThema = {};
neu.forEach((f) => (proThema[f.kategorie] = (proThema[f.kategorie] || 0) + 1));
console.log(`${neu.length} Fragen aus ${html} → ${zielDatei} (${behalten.length} andere behalten)`);
for (const [k, n] of Object.entries(proThema)) console.log(`  ${k}: ${n}`);
