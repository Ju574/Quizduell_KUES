// Macht aus einer Karteikarten-HTML-Datei Quizfragen – Frage und richtige Antwort wörtlich.
//
//   node werkzeuge/karteikarten-zu-fragen.js <karteikarten.html> <zusatz.json> <Präfix> [fragen.json]
//   z. B. node werkzeuge/karteikarten-zu-fragen.js quellen/kapitel6_recht.html quellen/kapitel6_falsch.json Recht
//
// Unterstützte Formate in der HTML-Datei:
//   const CARDS = [{ c: 6, t: "I.1 · Thema", q, a }]   → ID k6-I.1, Kategorie aus dem Thema
//   const cards = [{ c: "Kategorie", p: "S. 1", q, a }] → ID <_id>-1, 2, …, Kategorie über _kategorien
//
// <zusatz.json> enthält je Karte (Schlüssel = Kartennummer) die falschen Antworten:
//   "I.1": ["…", "…", "…"]
//   oder "5": { "falsch": [...], "richtig": "…", "hinweis": "…" }   (richtig = Korrektur statt wörtlich)
// sowie optional "_id" (ID-Kürzel) und "_kategorien" ({ "Kartenkategorie": "Spielkategorie" }).
// Ohne vorhandene zusatz.json wird eine Vorlage mit allen Karten erzeugt.
// Die Fragen dieses Kapitels werden in fragen.json ersetzt, andere Kapitel bleiben unverändert.

'use strict';
const fs = require('fs');

const [html, zusatzDatei, praefix, zielDatei = 'fragen.json'] = process.argv.slice(2);
if (!html || !zusatzDatei || !praefix) {
  console.error('Aufruf: node werkzeuge/karteikarten-zu-fragen.js <karteikarten.html> <zusatz.json> <Präfix> [fragen.json]');
  process.exit(1);
}

const quelltext = fs.readFileSync(html, 'utf8');
const treffer = quelltext.match(/const (CARDS|cards)\s*=\s*(\[[\s\S]*?\n\]);/);
if (!treffer) {
  console.error('Kein „const CARDS = [...]“ bzw. „const cards = [...]“ in ' + html + ' gefunden.');
  process.exit(1);
}
const karten = new Function('return ' + treffer[2])();

const ENTITAETEN = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
// HTML → Text; Listen werden zu Zeilen mit „•“ bzw. „1.“, <br> zu Zeilenumbruch
const reinerText = (s) =>
  String(s)
    .replace(/<ol>([\s\S]*?)<\/ol>/gi, (_, inhalt) => {
      let n = 0;
      return inhalt.replace(/<li>/gi, () => `\n${++n}. `);
    })
    .replace(/<li>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITAETEN[e] ?? e)
    .split('\n')
    .map((zeile) => zeile.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

const zusatzVorhanden = fs.existsSync(zusatzDatei);
const zusatz = zusatzVorhanden ? JSON.parse(fs.readFileSync(zusatzDatei, 'utf8')) : {};

// Nummer, Thema und Seite je Karte bestimmen
const merkmale = (k, i) => {
  if (k.t) {
    const [nummer, thema] = k.t.split('·').map((x) => x.trim());
    return { nummer, thema, id: `k${k.c}-${nummer}` };
  }
  const nummer = String(i + 1);
  const kategorien = zusatz._kategorien || {};
  return { nummer, thema: kategorien[k.c] || k.c, id: `${zusatz._id || 'karte'}-${nummer}`, seite: k.p };
};

if (!zusatzVorhanden) {
  const vorlage = {};
  karten.forEach((k, i) => (vorlage[merkmale(k, i).nummer] = ['', '', '']));
  fs.writeFileSync(zusatzDatei, JSON.stringify(vorlage, null, 2) + '\n');
  console.log(`Vorlage mit ${karten.length} Karten angelegt: ${zusatzDatei}`);
  process.exit(0);
}

const fehler = [];
const korrigiert = [];
const neu = karten.map((k, i) => {
  const { nummer, thema, id, seite } = merkmale(k, i);
  const eintrag = Array.isArray(zusatz[nummer]) ? { falsch: zusatz[nummer] } : zusatz[nummer] || {};
  const wörtlich = reinerText(k.a);
  const richtig = eintrag.richtig ? eintrag.richtig.trim() : wörtlich;
  if (eintrag.richtig) korrigiert.push(nummer);
  const falsch = (eintrag.falsch || []).map((x) => x.trim()).filter(Boolean);
  if (falsch.length < 3) fehler.push(`${nummer}: nur ${falsch.length} falsche Antworten`);
  if (falsch.includes(richtig)) fehler.push(`${nummer}: falsche Antwort ist identisch mit der richtigen`);
  const erklaerung = [eintrag.hinweis, seite ? `Quelle: Skript ${seite}` : ''].filter(Boolean).join(' · ') || undefined;
  return { id, kategorie: `${praefix} · ${thema}`, frage: reinerText(k.q), richtig, falsch, ...(erklaerung ? { erklaerung } : {}) };
});

const ueberzaehlig = Object.keys(zusatz).filter((n) => !n.startsWith('_') && !karten.some((k, i) => merkmale(k, i).nummer === n));
if (ueberzaehlig.length) fehler.push('Einträge ohne passende Karte: ' + ueberzaehlig.join(', '));
if (fehler.length) {
  console.error('Fehler:\n  ' + fehler.join('\n  '));
  process.exit(1);
}

// Fragen dieses Kapitels ersetzen, alle anderen behalten
const idPraefix = neu[0].id.replace(/[^-]+$/, '');
const bisher = fs.existsSync(zielDatei) ? JSON.parse(fs.readFileSync(zielDatei, 'utf8')) : [];
const behalten = bisher.filter((f) => !f.id.startsWith(idPraefix));
fs.writeFileSync(zielDatei, JSON.stringify([...behalten, ...neu], null, 2) + '\n');

const proThema = {};
neu.forEach((f) => (proThema[f.kategorie] = (proThema[f.kategorie] || 0) + 1));
console.log(`${neu.length} Fragen aus ${html} → ${zielDatei} (${behalten.length} andere behalten)`);
if (korrigiert.length) console.log(`  Korrigiert statt wörtlich: Karte ${korrigiert.join(', ')}`);
for (const [k, n] of Object.entries(proThema)) console.log(`  ${k}: ${n}`);
