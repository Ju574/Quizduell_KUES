'use strict';

// ===== Einstellungen =====
const E = {
  RUNDEN_AUSWAHL: [3, 6, 9],         // wählbare Rundenzahl im Rundenduell
  RUNDEN_STANDARD: 6,
  FRAGEN_PRO_RUNDE: 3,
  LIVE_FRAGEN_AUSWAHL: [5, 7, 10],   // wählbare Fragenzahl im Live-Battle
  LIVE_FRAGEN_STANDARD: 7,
  TIMER_AUSWAHL: [20, 45, 90, null], // Sekunden pro Frage, null = unbegrenzt
  TIMER_STANDARD: 45,
  MAX_GEGNER: 2,                     // also bis zu 3 Spieler pro Duell
  KATEGORIEN_ZUR_AUSWAHL: 3,         // so viele Kategorien stehen pro Runde zur Wahl
  LIVE_PAUSE_MS: 7000,               // Auflösung + Countdown zwischen zwei Live-Fragen
  LIVE_EINLADUNG_MINUTEN: 10,        // danach verfällt eine Live-Einladung
  LERNEN_FRAGEN: 10,                 // Fragen pro Lernrunde
  LERNEN_SEKUNDEN: 45,
  SICHER_AB_SERIE: 3,                // so oft in Folge richtig = "sicher"
};
// Zeitlimit für Duelle, die vor der Timer-Einstellung angelegt wurden
const ALT_SEKUNDEN = { runden: 20, live: 15 };

const app = document.getElementById('app');
let ich = null;                  // { id, name } des angemeldeten Spielers
let passwort = '';               // Gruppen-Passwort für den Zugriff auf die Fragen
let ansicht = '';                // Name der gerade angezeigten Ansicht
let frageTimer = null;
let lernstand = new Map();       // frage_id → { richtig, falsch, serie }
let spielerAbo = null;
let onlineAbo = null;
let online = new Set();          // IDs der Spieler, die gerade die Seite offen haben
const namen = new Map();         // spieler-id → Anzeigename
const aufraeumer = [];

// ===== Fragen =====
// Die Fragen liegen geschützt in der Datenbank. Geladen wird zuerst nur der Katalog (IDs + Kategorien),
// Texte erst wenn eine Frage drankommt und die Lösung erst nach dem Antworten.
let FRAGEN_LISTE = [];           // [{ id, kategorie }]
let KATEGORIEN = [];
const FRAGEN_TEXT = new Map();   // id → { id, kategorie, frage, antworten }
const LOESUNGEN = new Map();     // id → { richtig, erklaerung }
const MAX_PRO_ABRUF = 20;

async function katalogLaden() {
  FRAGEN_LISTE = await DB.fragenKatalog(passwort);
  KATEGORIEN = [...new Set(FRAGEN_LISTE.map((f) => f.kategorie))];
}

async function nachladen(ids, cache, abruf) {
  const fehlend = [...new Set(ids)].filter((id) => !cache.has(id));
  for (let i = 0; i < fehlend.length; i += MAX_PRO_ABRUF) {
    const teil = await abruf(passwort, fehlend.slice(i, i + MAX_PRO_ABRUF));
    teil.forEach((x) => cache.set(x.id, x));
  }
  return ids.map((id) => cache.get(id));
}
const loesungenLaden = (ids) => nachladen(ids, LOESUNGEN, DB.loesungenHolen);

// Skizzen zu Fragen werden mit den Fragetexten vorab geladen, damit sie nicht von der Zeit abgehen
async function fragenLaden(ids) {
  const fragen = await nachladen(ids, FRAGEN_TEXT, DB.fragenHolen);
  await Promise.all(fragen.filter((f) => f && f.bild).map((f) => bildLaden(f.bild).catch(fehler)));
  return fragen;
}

const BILDER = new Map();        // bild-id → Promise der Bildadresse
function bildLaden(bildId, pw = passwort) {
  if (!BILDER.has(bildId)) {
    BILDER.set(bildId, DB.bildHolen(pw, bildId).catch((e) => {
      BILDER.delete(bildId);
      throw e;
    }));
  }
  return BILDER.get(bildId);
}

const bildPlatz = (bildId) => (bildId ? `<div class="skizze" data-bild="${esc(bildId)}"><span class="gedaempft klein">Skizze lädt …</span></div>` : '');

// Füllt alle Bild-Platzhalter unterhalb von wurzel
function bilderEinsetzen(wurzel = app, pw = passwort) {
  wurzel.querySelectorAll('.skizze[data-bild]').forEach(async (platz) => {
    const bildId = platz.dataset.bild;
    platz.removeAttribute('data-bild');
    try {
      const img = new Image();
      img.alt = 'Skizze';
      img.src = await bildLaden(bildId, pw);
      platz.replaceChildren(img);
    } catch (e) {
      platz.innerHTML = '<span class="nok klein">Skizze konnte nicht geladen werden.</span>';
      console.error(e);
    }
  });
}

// Antippen vergrößert eine Skizze
document.addEventListener('click', (e) => {
  const img = e.target.closest('.skizze img');
  if (!img) return;
  const gross = document.createElement('div');
  gross.className = 'dialog-hintergrund skizze-gross';
  gross.innerHTML = `<img src="${esc(img.src)}" alt="Skizze">`;
  gross.onclick = () => gross.remove();
  document.body.appendChild(gross);
});

// ===== Hilfsfunktionen =====
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const summe = (liste) => (liste || []).reduce((a, x) => a + (x || 0), 0);
const nameVon = (id) => (ich && id === ich.id ? ich.name : namen.get(id) || id);
const timerText = (s) => (s ? `${s} s` : 'unbegrenzt');

function shuffle(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function show(html) {
  clearInterval(frageTimer);
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

function on(selektor, handler, ereignis = 'click') {
  const el = app.querySelector(selektor);
  if (el) el.addEventListener(ereignis, handler);
  return el;
}

function beimVerlassen(fn) {
  aufraeumer.push(fn);
}

function aufraeumen() {
  while (aufraeumer.length) aufraeumer.pop()();
  clearInterval(frageTimer);
}

function toast(text, aktion, beiKlick) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(text)}</span>${aktion ? `<button class="btn klein primaer">${esc(aktion)}</button>` : ''}`;
  el.hidden = false;
  if (aktion) el.querySelector('button').onclick = () => { el.hidden = true; beiKlick(); };
  clearTimeout(el._timer);
  el._timer = setTimeout(() => (el.hidden = true), aktion ? 15000 : 4000);
}

function fehler(e) {
  console.error(e);
  toast('Fehler: ' + (e && e.message ? e.message : e));
}
window.addEventListener('unhandledrejection', (e) => fehler(e.reason));

// ===== Duell-Grundlagen (2 oder 3 Spieler) =====
const teilnehmer = (duell) => [duell.spieler1, duell.spieler2, duell.spieler3].filter(Boolean);
const gegnerVon = (duell) => teilnehmer(duell).filter((s) => s !== ich.id);
const gegnerNamen = (duell) => gegnerVon(duell).map(nameVon).join(' & ');
const reihenfolge = (duell) => [ich.id, ...gegnerVon(duell)];

// Grüner Punkt für Spieler, die gerade online sind – wird live aktualisiert
const onlinePunkt = (id) => `<span class="online-punkt ${online.has(id) ? 'an' : ''}" data-online="${esc(id)}" title="online"></span>`;
const gegnerMitPunkt = (duell) => gegnerVon(duell).map((g) => onlinePunkt(g) + esc(nameVon(g))).join(' & ');
function onlineAktualisieren() {
  app.querySelectorAll('[data-online]').forEach((el) => el.classList.toggle('an', online.has(el.dataset.online)));
}
const sekundenVon = (duell) => (duell.daten.sekunden === undefined ? ALT_SEKUNDEN[duell.modus] : duell.daten.sekunden);

async function ladeSpieler() {
  const liste = await DB.spielerListe();
  liste.forEach((s) => namen.set(s.id, s.name));
  return liste;
}

// Liest das Duell frisch, wendet die Änderung an und speichert – bei gleichzeitiger Änderung wird wiederholt.
async function duellAktualisieren(id, aendern) {
  for (let versuch = 0; versuch < 6; versuch++) {
    const duell = await DB.duellLaden(id);
    const neu = aendern(JSON.parse(JSON.stringify(duell)));
    if (!neu) return duell;
    const gespeichert = await DB.duellAendern(id, duell.version, { status: neu.status, daten: neu.daten });
    if (gespeichert) return gespeichert;
  }
  throw new Error('Speichern fehlgeschlagen – bitte nochmal versuchen.');
}

function lernstandBuchen(frageId, richtig) {
  const e = lernstand.get(frageId) || { richtig: 0, falsch: 0, serie: 0 };
  lernstand.set(frageId, {
    richtig: e.richtig + (richtig ? 1 : 0),
    falsch: e.falsch + (richtig ? 0 : 1),
    serie: richtig ? e.serie + 1 : 0,
  });
  DB.lernstandBuchen(ich.id, frageId, richtig).catch(fehler);
}

// Punkte, Ergebnis (s = Sieg, u = geteilter Sieg/Unentschieden, n = Niederlage) und Platz je Spieler
function duellErgebnis(duell) {
  const spieler = teilnehmer(duell);
  const punkte = {};
  for (const s of spieler) {
    punkte[s] =
      duell.modus === 'live'
        ? (duell.daten.antworten[s] || []).reduce((a, x) => a + (x ? x.p : 0), 0)
        : duell.daten.runden.reduce((a, r) => a + summe(r.antworten[s]), 0);
  }
  const aktiv = spieler.filter((s) => s !== duell.daten.aufgegeben);
  const bester = Math.max(...aktiv.map((s) => punkte[s]));
  const oben = aktiv.filter((s) => punkte[s] === bester);
  const ergebnis = {};
  const platz = {};
  for (const s of spieler) {
    ergebnis[s] = !oben.includes(s) ? 'n' : oben.length === 1 ? 's' : 'u';
    platz[s] = s === duell.daten.aufgegeben ? spieler.length : 1 + aktiv.filter((x) => punkte[x] > punkte[s]).length;
  }
  return { punkte, ergebnis, platz };
}

function ergebnisSatz(duell) {
  const { punkte, ergebnis, platz } = duellErgebnis(duell);
  const anzahl = teilnehmer(duell).length;
  const stand = reihenfolge(duell).map((s) => punkte[s]).join(' : ');
  const a = duell.daten.aufgegeben;
  const zusatz = a ? (a === ich.id ? ' (aufgegeben)' : ` (${nameVon(a)} hat aufgegeben)`) : '';
  if (ergebnis[ich.id] === 's') return { text: `🏆 Gewonnen ${stand}${zusatz}`, klasse: 'ok' };
  if (ergebnis[ich.id] === 'u') return { text: `${anzahl > 2 ? 'Geteilter Sieg' : 'Unentschieden'} ${stand}${zusatz}`, klasse: '' };
  return { text: `${anzahl > 2 ? `Platz ${platz[ich.id]} von ${anzahl}` : 'Verloren'} ${stand}${zusatz}`, klasse: 'nok' };
}

function antwortKnoepfe(optionen) {
  return `<div class="antworten">${optionen
    .map((text, i) => `<button class="antwort" data-i="${i}">${esc(text)}</button>`)
    .join('')}</div>`;
}

// Färbt die Antworten ein: richtige grün, gewählte falsche rot
function markieren(optionen, gewaehlt, richtigText) {
  app.querySelectorAll('.antwort').forEach((knopf, i) => {
    knopf.disabled = true;
    knopf.classList.remove('gewaehlt');
    if (optionen[i] === richtigText) knopf.classList.add('richtig');
    else if (i === gewaehlt) knopf.classList.add('falsch');
  });
}

function sperren(gewaehlt) {
  app.querySelectorAll('.antwort').forEach((knopf, i) => {
    knopf.disabled = true;
    if (i === gewaehlt) knopf.classList.add('gewaehlt');
  });
  app.querySelectorAll('#eingabe-form input, #eingabe-form button').forEach((el) => (el.disabled = true));
}

// ===== Eingabe-Fragen (Antwort eintippen) =====
// Tolerant: Groß-/Kleinschreibung, Leer- und Satzzeichen, ä/ae, ß/ss und Füllwörter wie „ca.“ zählen nicht;
// kleine Tippfehler sind erlaubt (je nach Länge 0–2 Buchstaben). Zahlen müssen aber exakt stimmen.
const eingabeFeld = () => `
  <form id="eingabe-form" class="eingabe">
    <input id="eingabe" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Antwort eintippen …">
    <button class="btn primaer">Prüfen</button>
  </form>`;

const FUELLWORT = /^(ca\.?|circa|etwa|ungefaehr|bis zu|ueber|mehr als|der|die|das|ein|eine|einen)\s+/;

function vorbereiten(text) {
  let t = String(text || '')
    .toLowerCase()
    .trim()
    .replace(/^[-−–]\s*(?=\d)/, 'minus ')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  for (let vorher = ''; vorher !== t; ) {
    vorher = t;
    t = t.replace(FUELLWORT, '');
  }
  const zahlen = (t.match(/\d+(?:[.,]\d+)?/g) || []).map((z) => z.replace(',', '.'));
  return { kompakt: t.replace(/[^a-z0-9]/g, ''), zahlen: zahlen.join('|') };
}

function abstand(a, b) {
  let vorige = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const zeile = [i];
    for (let j = 1; j <= b.length; j++) {
      zeile[j] = Math.min(vorige[j] + 1, zeile[j - 1] + 1, vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    vorige = zeile;
  }
  return vorige[b.length];
}

// → { richtig, exakt } – exakt = ohne Tippfehler-Toleranz getroffen
function eingabePruefen(eingabe, loesung) {
  const e = vorbereiten(eingabe);
  if (!e.kompakt || !loesung) return { richtig: false };
  let tippfehler = false;
  for (const kandidat of [loesung.richtig, ...(loesung.alternativen || [])]) {
    const z = vorbereiten(kandidat);
    if (e.kompakt === z.kompakt) return { richtig: true, exakt: true };
    const erlaubt = z.kompakt.length <= 4 ? 0 : z.kompakt.length <= 8 ? 1 : 2;
    if (e.zahlen === z.zahlen && abstand(e.kompakt, z.kompakt) <= erlaubt) tippfehler = true;
  }
  return { richtig: tippfehler, exakt: false };
}

// ===== Beschriften-Fragen (nummerierte Skizze, je Nummer ein Eingabefeld) =====
// Lösung: je Zeile „Nr: Begriff“, Alternativen ebenfalls als „Nr: Begriff“. Jedes Feld wird wie eine
// Eingabe-Frage geprüft; die Frage zählt als richtig, wenn alle Felder stimmen.
const beschriftenFeld = (nummern) => `
  <form id="eingabe-form" class="beschriften">
    ${nummern.map((nr, k) => `
      <label class="beschriften-zeile">
        <span class="nr">${esc(nr)}</span>
        <input data-k="${k}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="…">
        <span class="soll ok klein"></span>
      </label>`).join('')}
    <button class="btn primaer">Prüfen</button>
  </form>`;

// Enter springt ins nächste Feld, im letzten Feld wird abgeschickt → beiAbsenden([texte])
function beschriftenAktivieren(beiAbsenden) {
  const felder = [...app.querySelectorAll('.beschriften input')];
  felder[0].focus();
  felder.forEach((feld, k) =>
    feld.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && k < felder.length - 1) {
        e.preventDefault();
        felder[k + 1].focus();
      }
    })
  );
  on('#eingabe-form', (e) => {
    e.preventDefault();
    const texte = felder.map((f) => f.value.trim());
    if (texte.some(Boolean)) beiAbsenden(texte);
    else felder[0].focus();
  }, 'submit');
}

function beschriftungAusLoesung(loesung) {
  const teilen = (z) => [z.slice(0, z.indexOf(':')).trim(), z.slice(z.indexOf(':') + 1).trim()];
  const alternativen = (loesung.alternativen || []).filter((a) => a.includes(':')).map(teilen);
  return String(loesung.richtig || '')
    .split('\n')
    .filter((z) => z.includes(':'))
    .map(teilen)
    .map(([nr, richtig]) => ({ nr, richtig, alternativen: alternativen.filter((a) => a[0] === nr).map((a) => a[1]) }));
}

// → { richtig, exakt, felder: [{ nr, richtig: Lösungstext, ok, exakt }] }
function beschriftenPruefen(texte, loesung) {
  const felder = beschriftungAusLoesung(loesung).map((f, k) => {
    const p = eingabePruefen((texte || [])[k], f);
    return { nr: f.nr, richtig: f.richtig, ok: !!p.richtig, exakt: !!p.exakt };
  });
  return { felder, richtig: felder.length > 0 && felder.every((f) => f.ok), exakt: felder.every((f) => f.exakt) };
}

// Färbt die Felder ein und schreibt die Lösung dazu, wo nicht exakt getroffen
function beschriftenMarkieren(pruefung) {
  const zeilen = app.querySelectorAll('.beschriften-zeile');
  pruefung.felder.forEach((f, k) => {
    const zeile = zeilen[k];
    if (!zeile) return;
    zeile.querySelector('input').classList.add(f.ok ? 'richtig' : 'falsch');
    if (!f.exakt) zeile.querySelector('.soll').textContent = '✓ ' + f.richtig;
  });
}

// Beschriften-Fragen bekommen pro weiterem Feld 10 s mehr Zeit
const zeitFuer = (sekunden, frage) =>
  sekunden && frage && frage.typ === 'beschriften' ? sekunden + 10 * Math.max(0, frage.antworten.length - 1) : sekunden;

const typHinweis = (frage) => (!frage ? '' : frage.typ === 'eingabe' ? ' · ✎ eintippen' : frage.typ === 'beschriften' ? ' · ✎ beschriften' : '');

function timerStarten(balken, dauerMs, beiAblauf, start = Date.now()) {
  clearInterval(frageTimer);
  const tick = () => {
    const rest = Math.max(0, 1 - (Date.now() - start) / dauerMs);
    balken.style.width = rest * 100 + '%';
    balken.classList.toggle('knapp', rest < 0.25);
    if (rest <= 0) {
      clearInterval(frageTimer);
      beiAblauf();
    }
  };
  tick();
  frageTimer = setInterval(tick, 100);
}

// Zeigt eine Frage mit optionalem Zeitlimit. Die Lösung wird erst nach dem Antworten geladen.
// beiAntwort(richtig) wird sofort aufgerufen (kann ein Promise liefern), weiter() nach Klick auf „Weiter“.
// serieVorher: richtige Antworten in Folge vor dieser Frage (für die Serien-Flamme)
function frageZeigen({ frage, titel, info, sekunden, beiAntwort, weiter, serieVorher = 0 }) {
  ansicht = 'frage';
  const eingabe = frage.typ === 'eingabe';
  const beschriften = frage.typ === 'beschriften';
  const optionen = eingabe || beschriften ? [] : shuffle(frage.antworten);
  sekunden = zeitFuer(sekunden, frage);
  show(`
    <div class="frage-kopf"><span>${esc(titel)}</span><span>${esc(info)}${typHinweis(frage)}</span></div>
    ${sekunden ? '<div class="timer"><div class="timer-balken"></div></div>' : ''}
    <div class="karte frage">${esc(frage.frage)}</div>
    ${bildPlatz(frage.bild)}
    ${beschriften ? beschriftenFeld(frage.antworten) : eingabe ? eingabeFeld() : antwortKnoepfe(optionen)}
    <div id="aufloesung" class="aufloesung"></div>`);
  bilderEinsetzen();

  let erledigt = false;
  // gewaehlt: Index der gewählten Antwort, eingetippter Text bzw. Liste der Texte; null = Zeit abgelaufen
  const aufloesen = async (gewaehlt) => {
    if (erledigt) return;
    erledigt = true;
    clearInterval(frageTimer);
    sperren(gewaehlt);
    const box = app.querySelector('#aufloesung');
    box.innerHTML = '<p class="meldung gedaempft">…</p>';

    let loesung;
    try {
      [loesung] = await loesungenLaden([frage.id]);
    } catch (e) {
      fehler(e);
      box.innerHTML = '<p class="meldung nok">Verbindung unterbrochen.</p><button class="btn primaer" id="nochmal">Nochmal versuchen</button>';
      box.querySelector('#nochmal').onclick = () => {
        erledigt = false;
        aufloesen(gewaehlt);
      };
      return;
    }

    const pruefung = !loesung ? null
      : beschriften ? beschriftenPruefen(gewaehlt, loesung)
      : eingabe && gewaehlt != null ? eingabePruefen(gewaehlt, loesung) : null;
    const richtig = eingabe || beschriften
      ? gewaehlt != null && !!(pruefung && pruefung.richtig)
      : !!loesung && gewaehlt != null && optionen[gewaehlt] === loesung.richtig;
    if (beschriften) pruefung && beschriftenMarkieren(pruefung);
    else if (eingabe) app.querySelector('#eingabe').classList.add(richtig ? 'richtig' : 'falsch');
    else markieren(optionen, gewaehlt, loesung && loesung.richtig);
    const gespeichert = Promise.resolve(beiAntwort(richtig));
    const treffer = beschriften && pruefung ? pruefung.felder.filter((f) => f.ok).length : 0;
    const text = gewaehlt == null ? '⏱ Zeit abgelaufen'
      : richtig ? (pruefung && !pruefung.exakt ? '✓ Richtig! (kleine Tippfehler toleriert)' : '✓ Richtig!')
      : beschriften && pruefung ? `✗ ${treffer} von ${pruefung.felder.length} Feldern richtig` : '✗ Leider falsch';
    box.innerHTML = `
      <p class="meldung ${richtig ? 'ok' : 'nok'}">${text}</p>
      ${richtig ? `<p class="mitte">${serieText(serieVorher + 1)}</p>` : ''}
      ${eingabe && loesung && !(pruefung && pruefung.exakt) ? `<p class="karte ok mehrzeilig">Richtige Antwort: ${esc(loesung.richtig)}</p>` : ''}
      ${loesung ? bildPlatz(loesung.bild_nach) : ''}
      ${loesung && loesung.erklaerung ? `<p class="erklaerung">${esc(loesung.erklaerung)}</p>` : ''}
      <button class="btn primaer" id="weiter">Weiter</button>
      <p class="mitte">${meldenKnopf(frage.id)}</p>`;
    bilderEinsetzen(box);
    const knopf = box.querySelector('#weiter');
    knopf.addEventListener('click', async () => {
      knopf.disabled = true;
      try {
        await gespeichert;
        weiter();
      } catch (e) {
        knopf.disabled = false;
        fehler(e);
      }
    });
    knopf.focus({ preventScroll: true });
  };
  app.querySelectorAll('.antwort').forEach((k, i) => k.addEventListener('click', () => aufloesen(i)));
  if (eingabe) eingabeAktivieren(aufloesen);
  if (beschriften) beschriftenAktivieren(aufloesen);
  if (sekunden) timerStarten(app.querySelector('.timer-balken'), sekunden * 1000, () => aufloesen(null));
}

// Absenden des Eingabefelds (Enter oder „Prüfen“) → beiAbsenden(text)
function eingabeAktivieren(beiAbsenden) {
  const feld = app.querySelector('#eingabe');
  feld.focus();
  on('#eingabe-form', (e) => {
    e.preventDefault();
    const text = feld.value.trim();
    if (text) beiAbsenden(text);
    else feld.focus();
  }, 'submit');
}

// ===== Frage melden =====
// Knopf erscheint erst nach dem Antworten, damit er nichts über die Lösung verrät
const MELDE_GRUENDE = ['Antwort ist falsch', 'Mehrere Antworten richtig', 'Frage unklar', 'Tippfehler', 'Sonstiges'];
const meldenKnopf = (frageId) => `<button class="link klein melden" data-melden="${esc(frageId)}">⚑ Frage melden</button>`;

document.addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-melden]');
  if (knopf) meldenDialog(knopf.dataset.melden);
});

function meldenDialog(frageId) {
  const frage = FRAGEN_TEXT.get(frageId);
  const dialog = document.createElement('div');
  dialog.className = 'dialog-hintergrund';
  dialog.innerHTML = `
    <form class="dialog karte stapel">
      <h3>Frage melden</h3>
      ${frage ? `<p class="klein gedaempft">${esc(frage.frage)}</p>` : ''}
      <div class="stapel" id="gruende">
        ${MELDE_GRUENDE.map((g, i) => `<label class="check"><input type="radio" name="grund" value="${esc(g)}" ${i === 0 ? 'checked' : ''}> ${esc(g)}</label>`).join('')}
      </div>
      <textarea id="kommentar" maxlength="500" rows="3" placeholder="Was stimmt nicht? (optional)"></textarea>
      <button class="btn primaer">Melden</button>
      <button type="button" class="btn" id="abbrechen">Abbrechen</button>
    </form>`;
  document.body.appendChild(dialog);
  const schliessen = () => dialog.remove();
  dialog.querySelector('#abbrechen').onclick = schliessen;
  dialog.addEventListener('click', (e) => e.target === dialog && schliessen());
  dialog.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const senden = dialog.querySelector('.btn.primaer');
    senden.disabled = true;
    try {
      const grund = dialog.querySelector('input[name="grund"]:checked').value;
      await DB.frageMelden(passwort, frageId, ich.id, grund, dialog.querySelector('#kommentar').value);
      schliessen();
      document.querySelectorAll(`[data-melden="${CSS.escape(frageId)}"]`).forEach((b) => {
        b.replaceWith(Object.assign(document.createElement('span'), { className: 'klein gedaempft', textContent: '✓ Gemeldet – danke!' }));
      });
    } catch (err) {
      senden.disabled = false;
      fehler(err);
    }
  });
}

// ===== Effekte: VS-Intro, Konfetti, Serien-Flamme =====
const wenigBewegung = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// true nur beim ersten Aufruf je Schlüssel (pro Gerät) – damit Effekte nicht bei jedem Öffnen kommen
function erstesMal(schluessel) {
  try {
    if (localStorage.getItem(schluessel)) return false;
    localStorage.setItem(schluessel, '1');
  } catch {}
  return true;
}

// „Anna VS Ben (VS Carla)“ – blendet sich nach ca. 2,4 s aus, Antippen überspringt
function vsIntro(duell) {
  if (!erstesMal('pruefi-intro-' + duell.id)) return Promise.resolve();
  const namen = teilnehmer(duell).map((s) => `<div class="vs-name">${esc(nameVon(s))}</div>`);
  const info = duell.modus === 'live' ? `⚡ Live-Battle · ${duell.daten.fragen.length} Fragen` : `🔁 Rundenduell · ${duell.daten.anzahl} Runden`;
  const el = document.createElement('div');
  el.className = 'vs-intro' + (wenigBewegung() ? ' ruhig' : '');
  el.innerHTML = `<div class="vs-buehne">${namen.join('<div class="vs-wort">VS</div>')}<div class="vs-info">${info}</div></div>`;
  document.body.appendChild(el);
  return new Promise((fertig) => {
    let weg = false;
    const schliessen = () => {
      if (weg) return;
      weg = true;
      el.classList.add('aus');
      setTimeout(() => {
        el.remove();
        fertig();
      }, 300);
    };
    el.addEventListener('click', schliessen);
    setTimeout(schliessen, 2400);
  });
}

function konfetti(dauer = 2500, anzahl = 160) {
  if (wenigBewegung()) return;
  const leinwand = document.createElement('canvas');
  leinwand.className = 'konfetti';
  document.body.appendChild(leinwand);
  const ctx = leinwand.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  leinwand.width = innerWidth * dpr;
  leinwand.height = innerHeight * dpr;
  const farben = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#eab308'];
  const teile = Array.from({ length: anzahl }, () => ({
    x: Math.random() * leinwand.width,
    y: -Math.random() * leinwand.height * 0.6,
    vx: (Math.random() - 0.5) * 4 * dpr,
    vy: (2 + Math.random() * 4) * dpr,
    w: (6 + Math.random() * 6) * dpr,
    h: (8 + Math.random() * 8) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    f: farben[Math.floor(Math.random() * farben.length)],
  }));
  const start = performance.now();
  const schritt = (t) => {
    const alter = t - start;
    ctx.clearRect(0, 0, leinwand.width, leinwand.height);
    ctx.globalAlpha = alter > dauer ? Math.max(0, 1 - (alter - dauer) / 600) : 1;
    for (const p of teile) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05 * dpr;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.f;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alter < dauer + 600) requestAnimationFrame(schritt);
    else leinwand.remove();
  };
  requestAnimationFrame(schritt);
}

// Sieg: Konfetti + Jubel · Unentschieden: etwas Konfetti · Niederlage: Wackeln – einmal pro Duell
function ergebnisEffekt(duell, element) {
  if (!element || !erstesMal('pruefi-jubel-' + duell.id)) return;
  const e = duellErgebnis(duell).ergebnis[ich.id];
  if (e === 's') {
    konfetti();
    element.classList.add('jubel');
  } else if (e === 'u') {
    konfetti(1500, 60);
    element.classList.add('jubel');
  } else {
    element.classList.add('wackeln');
  }
}

// Anzahl richtiger Antworten in Folge am Ende einer Antwortliste (1/0 bzw. { r })
const serieAusAntworten = (liste) => {
  let n = 0;
  for (let i = liste.length - 1; i >= 0 && liste[i] && (liste[i] === 1 || liste[i].r === 1); i--) n++;
  return n;
};
const serieImRundenduell = (duell) => serieAusAntworten(duell.daten.runden.flatMap((r) => r.antworten[ich.id] || []));
const serieText = (n) => (n >= 2 ? `<span class="serie ${n >= 5 ? 'gross' : ''}">🔥 ${n}er-Serie!</span>` : '');

// ===== Routing =====
const ROUTEN = [
  [/^#\/duell\/([\w-]+)$/, (id) => duellAnzeigen(id)],
  [/^#\/neu$/, () => neuesDuell()],
  [/^#\/lernen$/, () => lernenAuswahl()],
  [/^#\/statistik$/, () => statistik()],
  [/^#\/rangliste$/, () => rangliste()],
  [/^#\/admin$/, () => adminAnsicht()],
  [/^#\/admin\/fragen$/, () => adminFragen()],
];

async function route() {
  aufraeumen();
  if (!ich) return login();
  try {
    for (const [muster, ansichtFn] of ROUTEN) {
      const treffer = location.hash.match(muster);
      if (treffer) return await ansichtFn(...treffer.slice(1));
    }
    await startseite();
  } catch (e) {
    fehler(e);
    show(`<div class="karte"><p>Das hat nicht geklappt: ${esc(e.message)}</p><a class="btn" href="#/">Zur Startseite</a></div>`);
  }
}

function gehe(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// ===== Anmeldung =====
const NAME_MUSTER = /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,19}$/u;
const idAusName = (name) => name.trim().toLowerCase().replace(/\s+/g, '-');

function speichern(schluessel, wert) {
  try {
    if (wert == null) {
      localStorage.removeItem(schluessel);
      sessionStorage.removeItem(schluessel);
    } else {
      localStorage.setItem(schluessel, wert);
      sessionStorage.setItem(schluessel, wert);
    }
  } catch {}
}

function gespeichert(schluessel) {
  try {
    return sessionStorage.getItem(schluessel) || localStorage.getItem(schluessel);
  } catch {
    return null;
  }
}

function login(hinweis) {
  ansicht = 'login';
  topbarAktualisieren();
  show(`
    <div class="hero">
      <div class="hero-logo">🔧</div>
      <h1>Prüfi-Duell</h1>
      <p>Quizduell für die Kfz-Prüfingenieur-Ausbildung</p>
    </div>
    ${hinweis ? `<p class="warnung mitte">${esc(hinweis)}</p>` : ''}
    <form id="login" class="karte stapel">
      <label>Dein Name
        <input id="name" maxlength="20" autocomplete="nickname" autocapitalize="words" required>
      </label>
      <label ${passwort ? 'hidden' : ''}>Gruppen-Passwort
        <input id="passwort" type="password" autocomplete="current-password" ${passwort ? '' : 'required'}>
      </label>
      <button class="btn primaer">Weiter</button>
      <p class="klein gedaempft">Das Gruppen-Passwort bekommst du von deiner Lerngruppe. Für dich selbst brauchst du kein Passwort – merk dir einfach deinen Namen.</p>
    </form>
    <div id="neu-bestaetigen"></div>`);

  app.querySelector('#name').focus();
  on('#login', async (e) => {
    e.preventDefault();
    const name = app.querySelector('#name').value.trim().replace(/\s+/g, ' ');
    if (!NAME_MUSTER.test(name)) return toast('Bitte 2–20 Zeichen: Buchstaben, Zahlen, Leerzeichen, - oder _.');
    try {
      if (!passwort) {
        const pw = app.querySelector('#passwort').value;
        if (!(await DB.passwortPruefen(pw))) return toast('Das Gruppen-Passwort stimmt nicht.');
        passwort = pw;
        speichern('pruefi-pw', pw);
      }
      const id = idAusName(name);
      const vorhanden = await DB.spielerHolen(id);
      if (vorhanden) return anmelden(vorhanden);
      const box = app.querySelector('#neu-bestaetigen');
      box.innerHTML = `
        <div class="karte stapel">
          <p>Es gibt noch keinen Spieler <b>${esc(name)}</b>. Neu anlegen?</p>
          <button class="btn primaer" id="anlegen">Ja, „${esc(name)}“ anlegen</button>
        </div>`;
      box.querySelector('#anlegen').onclick = async () => {
        try {
          anmelden(await DB.spielerAnlegen(id, name));
        } catch (err) {
          fehler(err);
        }
      };
    } catch (err) {
      fehler(err);
    }
  }, 'submit');
}

async function anmelden(spieler) {
  try {
    await katalogLaden();
  } catch (e) {
    // Gruppen-Passwort wurde geändert oder ist falsch
    passwort = '';
    speichern('pruefi-pw', null);
    return login('Bitte gib das (neue) Gruppen-Passwort ein.');
  }
  ich = { id: spieler.id, name: spieler.name };
  speichern('pruefi-ich', JSON.stringify(ich));
  const [, zeilen] = await Promise.all([ladeSpieler(), DB.lernstandVon(ich.id)]);
  lernstand = new Map(zeilen.map((z) => [z.frage_id, z]));
  if (spielerAbo) spielerAbo();
  spielerAbo = DB.abonniereSpieler(ich.id, aufDuellAenderung);
  if (onlineAbo) onlineAbo();
  onlineAbo = DB.anwesenheit(ich.id, (ids) => {
    online = ids;
    onlineAktualisieren();
  });
  topbarAktualisieren();
  route();
}

function abmelden() {
  speichern('pruefi-ich', null);
  if (spielerAbo) spielerAbo();
  if (onlineAbo) onlineAbo();
  onlineAbo = null;
  online = new Set();
  ich = null;
  location.hash = '#/';
  route();
}

function topbarAktualisieren() {
  const el = document.getElementById('topbar-rechts');
  el.innerHTML = ich ? `<span class="topbar-name">${esc(ich.name)}</span><button class="link" id="abmelden">Abmelden</button>` : '';
  if (ich) el.querySelector('#abmelden').onclick = abmelden;
}

// ===== Live-Einladungen =====
const angenommenVon = (duell) => duell.daten.angenommen || [duell.spieler1];
const liveEinladungGueltig = (duell) => Date.now() - new Date(duell.erstellt).getTime() < E.LIVE_EINLADUNG_MINUTEN * 60000;
const istOffeneEinladungFuerMich = (duell) =>
  duell.modus === 'live' && duell.status === 'offen' && !angenommenVon(duell).includes(ich.id) && liveEinladungGueltig(duell);

// Wird bei jeder Änderung an einem meiner Duelle aufgerufen (Echtzeit)
async function aufDuellAenderung(duell) {
  if (teilnehmer(duell).some((s) => !namen.has(s))) await ladeSpieler().catch(() => {});
  const schonDort = location.hash === '#/duell/' + duell.id;
  if (istOffeneEinladungFuerMich(duell) && !schonDort && ansicht !== 'frage') {
    toast(`⚡ ${nameVon(duell.spieler1)} fordert dich zum Live-Battle heraus!`, 'Ansehen', () => gehe('#/duell/' + duell.id));
  }
  if (ansicht === 'start') startseite().catch(fehler);
}

// ===== Startseite =====
async function startseite() {
  const [duelle] = await Promise.all([DB.duelleVon(ich.id), ladeSpieler()]);
  ansicht = 'start';

  const liveOffen = (d) => d.modus === 'live' && d.status === 'offen' && liveEinladungGueltig(d);
  const einladungen = duelle.filter(istOffeneEinladungFuerMich);
  const liveLaufend = duelle.filter((d) => d.modus === 'live' && d.status === 'laeuft');
  const amZug = duelle.filter((d) => d.modus === 'runden' && d.status === 'laeuft' && d.daten.amZug === ich.id);
  const warten = duelle.filter(
    (d) =>
      (d.modus === 'runden' && d.status === 'laeuft' && d.daten.amZug !== ich.id) ||
      (liveOffen(d) && angenommenVon(d).includes(ich.id))
  );
  const beendet = duelle.filter((d) => d.status === 'beendet').slice(0, 10);

  const zeile = (d, rechts, hervorheben) => `
    <a class="duell-zeile ${hervorheben ? 'hervorheben' : ''}" href="#/duell/${d.id}">
      <span class="duell-modus">${d.modus === 'live' ? '⚡' : '🔁'}</span>
      <span class="duell-gegner">${gegnerMitPunkt(d)}</span>
      <span class="duell-status">${rechts}</span>
    </a>`;
  const abschnitt = (titel, liste, fn) =>
    liste.length ? `<section><h3>${titel}</h3><div class="liste">${liste.map(fn).join('')}</div></section>` : '';
  const rundeInfo = (d) => `Runde ${Math.max(1, d.daten.runden.length)}/${d.daten.anzahl}`;
  const wartenInfo = (d) => (d.modus === 'live' ? 'Einladung offen' : `${rundeInfo(d)} · ${esc(nameVon(d.daten.amZug))} ist dran`);

  const imKatalog = new Set(FRAGEN_LISTE.map((f) => f.id));
  const sicher = [...lernstand.entries()].filter(([id, l]) => imKatalog.has(id) && l.serie >= E.SICHER_AB_SERIE).length;

  show(`
    <h2 class="begruessung">Hallo ${esc(ich.name)} 👋</h2>
    <div class="kacheln">
      <a class="kachel primaer" href="#/neu"><span>⚔️</span>Neues Duell</a>
      <a class="kachel" href="#/lernen"><span>📚</span>Lernen</a>
      <a class="kachel" href="#/statistik"><span>📊</span>Statistik</a>
      <a class="kachel" href="#/rangliste"><span>🏆</span>Rangliste</a>
    </div>
    <p class="klein gedaempft mitte">${sicher} von ${FRAGEN_LISTE.length} Fragen sicher · ${KATEGORIEN.length} Kategorien</p>
    ${!FRAGEN_LISTE.length ? '<p class="warnung mitte">Es sind noch keine Fragen in der Datenbank.</p>' : ''}
    ${abschnitt('⚡ Live-Herausforderungen', einladungen, (d) => zeile(d, 'Annehmen?', true))}
    ${abschnitt('Live-Battle läuft', liveLaufend, (d) => zeile(d, 'Weiterspielen', true))}
    ${abschnitt('Du bist dran', amZug, (d) => zeile(d, rundeInfo(d), true))}
    ${abschnitt('Warten auf Gegner', warten, (d) => zeile(d, wartenInfo(d)))}
    ${abschnitt('Beendet', beendet, (d) => {
      const e = ergebnisSatz(d);
      return zeile(d, `<span class="${e.klasse}">${esc(e.text)}</span>`);
    })}
    ${!duelle.length ? '<p class="leer">Noch keine Duelle. Fordere jemanden heraus!</p>' : ''}
    <p class="mitte fusszeile"><a class="link gedaempft klein" href="#/admin">Admin</a></p>`);
}

// ===== Themen-Auswahl (Kategorien und Rechenaufgaben ausschließen) =====
// themen = { ohne: [Kategorien], ohneRechnung } – wird im Duell gespeichert und auf diesem Gerät gemerkt
const THEMEN_SCHLUESSEL = 'pruefi-themen';
const themaVon = (kategorie) => kategorie.split(' · ')[0];
const THEMEN = () => [...new Set(KATEGORIEN.map(themaVon))];

function gemerkteThemen() {
  try {
    const t = JSON.parse(localStorage.getItem(THEMEN_SCHLUESSEL)) || {};
    return { ohne: (t.ohne || []).filter((k) => KATEGORIEN.includes(k)), ohneRechnung: !!t.ohneRechnung };
  } catch {
    return { ohne: [], ohneRechnung: false };
  }
}

// Filter für FRAGEN_LISTE; ohne Angabe (ältere Duelle) passt alles
const imThema = (themen) => (f) =>
  !themen || !((themen.ohne || []).includes(f.kategorie) || (themen.ohneRechnung && f.rechnung));

// „Alle Themen“, „Abgas, Fahrwerk“, „Fahrwerk · Reifen“ oder „5 von 34 Kategorien“ (+ „ohne Rechnungen“)
function themenText(themen) {
  const ohne = themen.ohne || [];
  const drin = KATEGORIEN.filter((k) => !ohne.includes(k));
  let text;
  if (!ohne.length) text = 'Alle Themen';
  else if (drin.length === 1) text = drin[0];
  else {
    const gruppen = [...new Set(drin.map(themaVon))];
    const ganz = gruppen.every((g) => KATEGORIEN.filter((k) => themaVon(k) === g).every((k) => drin.includes(k)));
    text = ganz ? gruppen.join(', ') : `${drin.length} von ${KATEGORIEN.length} Kategorien`;
  }
  return themen.ohneRechnung ? `${text} · ohne Rechnungen` : text;
}

const themenFeld = () => `
  <details class="themen" id="themen">
    <summary><span class="feld-titel">Themen</span><span id="themen-info" class="klein gedaempft"></span></summary>
    <label class="check rechnung"><input type="checkbox" id="ohne-rechnung"> 🧮 Rechenaufgaben ausschließen</label>
    ${THEMEN().map((g) => `
      <div class="themen-gruppe">
        <label class="check gruppe"><input type="checkbox" data-gruppe="${esc(g)}"> ${esc(g)}</label>
        <div class="themen-unter">${KATEGORIEN.filter((k) => themaVon(k) === g)
          .map((k) => `<label class="check"><input type="checkbox" data-kat="${esc(k)}"> ${esc(k.split(' · ').slice(1).join(' · ') || k)}</label>`)
          .join('')}</div>
      </div>`).join('')}
  </details>`;

// Häkchen = Thema ist dabei. Ändert themen direkt und merkt sich die Auswahl auf diesem Gerät.
function themenAktivieren(themen) {
  const box = app.querySelector('#themen');
  const zeichnen = () => {
    box.querySelectorAll('[data-kat]').forEach((c) => (c.checked = !themen.ohne.includes(c.dataset.kat)));
    box.querySelectorAll('[data-gruppe]').forEach((c) => {
      const kategorien = KATEGORIEN.filter((k) => themaVon(k) === c.dataset.gruppe);
      const aus = kategorien.filter((k) => themen.ohne.includes(k)).length;
      c.checked = aus === 0;
      c.indeterminate = aus > 0 && aus < kategorien.length;
    });
    box.querySelector('#ohne-rechnung').checked = themen.ohneRechnung;
    const anzahl = FRAGEN_LISTE.filter(imThema(themen)).length;
    box.querySelector('#themen-info').textContent = `${themenText(themen)} · ${anzahl} Fragen`;
  };
  box.addEventListener('change', (e) => {
    const c = e.target;
    const setzen = (kategorien, dabei) => {
      themen.ohne = dabei ? themen.ohne.filter((k) => !kategorien.includes(k)) : [...new Set([...themen.ohne, ...kategorien])];
    };
    if (c.dataset.kat) setzen([c.dataset.kat], c.checked);
    else if (c.dataset.gruppe) setzen(KATEGORIEN.filter((k) => themaVon(k) === c.dataset.gruppe), c.checked);
    else if (c.id === 'ohne-rechnung') themen.ohneRechnung = c.checked;
    try { localStorage.setItem(THEMEN_SCHLUESSEL, JSON.stringify(themen)); } catch {}
    zeichnen();
  });
  zeichnen();
}

// ===== Neues Duell =====
async function neuesDuell() {
  const spieler = (await ladeSpieler()).filter((s) => s.id !== ich.id);
  ansicht = 'neu';
  const wahl = {
    modus: 'runden',
    gegner: [],
    runden: E.RUNDEN_STANDARD,
    liveFragen: E.LIVE_FRAGEN_STANDARD,
    sekunden: E.TIMER_STANDARD,
    themen: gemerkteThemen(),
  };

  show(`
    <h2>Neues Duell</h2>
    <div class="karte stapel">
      <div class="segment" id="modus">
        <button data-wert="runden">🔁 Rundenduell</button>
        <button data-wert="live">⚡ Live-Battle</button>
      </div>
      <p class="klein gedaempft" id="modus-info"></p>
      <div class="einstellung">
        <span class="feld-titel" id="anzahl-titel"></span>
        <div class="segment" id="anzahl"></div>
      </div>
      <div class="einstellung">
        <span class="feld-titel">Zeit pro Frage</span>
        <div class="segment" id="timer">${E.TIMER_AUSWAHL.map((s) => `<button data-wert="${s ?? ''}">${timerText(s)}</button>`).join('')}</div>
      </div>
      ${themenFeld()}
    </div>
    <h3>Gegner wählen <span class="klein">(1 oder ${E.MAX_GEGNER})</span></h3>
    <input id="suche" placeholder="Name suchen …" autocomplete="off">
    <div class="liste" id="gegner-liste"></div>
    <div class="start-leiste"><button class="btn primaer" id="starten" disabled>Gegner wählen</button></div>`);

  const segmentAktiv = (sel, wert) =>
    app.querySelectorAll(`${sel} button`).forEach((b) => b.classList.toggle('aktiv', b.dataset.wert === String(wert ?? '')));
  const zeichnenEinstellungen = () => {
    segmentAktiv('#modus', wahl.modus);
    const live = wahl.modus === 'live';
    app.querySelector('#modus-info').textContent = live
      ? 'Alle spielen gleichzeitig dieselben Fragen. Schnelle richtige Antworten geben Bonuspunkte. Deine Gegner müssen online sein.'
      : `Ihr wählt reihum die Kategorie (je ${E.FRAGEN_PRO_RUNDE} Fragen) und spielt, wann ihr Zeit habt.`;
    app.querySelector('#anzahl-titel').textContent = live ? 'Anzahl Fragen' : 'Anzahl Runden';
    const optionen = live ? E.LIVE_FRAGEN_AUSWAHL : E.RUNDEN_AUSWAHL;
    const aktuell = live ? wahl.liveFragen : wahl.runden;
    const anzahl = app.querySelector('#anzahl');
    anzahl.innerHTML = optionen.map((n) => `<button data-wert="${n}">${n}</button>`).join('');
    anzahl.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        if (live) wahl.liveFragen = Number(b.dataset.wert);
        else wahl.runden = Number(b.dataset.wert);
        segmentAktiv('#anzahl', b.dataset.wert);
      };
    });
    segmentAktiv('#anzahl', aktuell);
    segmentAktiv('#timer', wahl.sekunden);
  };
  app.querySelectorAll('#modus button').forEach((b) => (b.onclick = () => { wahl.modus = b.dataset.wert; zeichnenEinstellungen(); }));
  app.querySelectorAll('#timer button').forEach((b) => (b.onclick = () => {
    wahl.sekunden = b.dataset.wert ? Number(b.dataset.wert) : null;
    segmentAktiv('#timer', b.dataset.wert);
  }));
  themenAktivieren(wahl.themen);
  zeichnenEinstellungen();

  const startKnopf = app.querySelector('#starten');
  const liste = app.querySelector('#gegner-liste');
  const zeichnenGegner = () => {
    const filter = app.querySelector('#suche').value.trim().toLowerCase();
    const treffer = spieler
      .filter((s) => s.name.toLowerCase().includes(filter) || wahl.gegner.includes(s.id))
      .sort((a, b) => online.has(b.id) - online.has(a.id)); // wer online ist, steht oben
    const voll = wahl.gegner.length >= E.MAX_GEGNER;
    liste.innerHTML = treffer.length
      ? treffer
          .map((s) => {
            const gewaehlt = wahl.gegner.includes(s.id);
            return `<button class="duell-zeile ${gewaehlt ? 'hervorheben' : ''}" data-id="${esc(s.id)}" ${!gewaehlt && voll ? 'disabled' : ''}>
              <span class="haken">${gewaehlt ? '✓' : ''}</span>
              <span class="duell-gegner">${onlinePunkt(s.id)}${esc(s.name)}</span>
            </button>`;
          })
          .join('')
      : `<p class="leer">${spieler.length ? 'Niemand gefunden.' : 'Noch keine anderen Spieler. Schick deinen Mitstudenten den Link zur Seite!'}</p>`;
    liste.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id;
        wahl.gegner = wahl.gegner.includes(id) ? wahl.gegner.filter((x) => x !== id) : [...wahl.gegner, id];
        zeichnenGegner();
      };
    });
    startKnopf.disabled = !wahl.gegner.length;
    startKnopf.textContent = wahl.gegner.length ? `Duell starten gegen ${wahl.gegner.map(nameVon).join(' & ')}` : 'Gegner wählen';
  };
  on('#suche', zeichnenGegner, 'input');
  zeichnenGegner();

  startKnopf.onclick = async () => {
    startKnopf.disabled = true;
    try {
      await duellStarten(wahl);
    } catch (e) {
      startKnopf.disabled = false;
      fehler(e);
    }
  };
}

// wahl: { modus, gegner: [ids], runden, liveFragen, sekunden, themen: { ohne, ohneRechnung } }
async function duellStarten(wahl) {
  if (!FRAGEN_LISTE.length) return toast('Es sind noch keine Fragen in der Datenbank.');
  const themen = { ohne: wahl.themen.ohne.filter((k) => KATEGORIEN.includes(k)), ohneRechnung: !!wahl.themen.ohneRechnung };
  const pool = FRAGEN_LISTE.filter(imThema(themen));
  if (pool.length < (wahl.modus === 'runden' ? E.FRAGEN_PRO_RUNDE : 1)) return toast('Zu wenige Fragen in dieser Themen-Auswahl.');
  const [g1, g2] = wahl.gegner;
  const basis = { modus: wahl.modus, spieler1: ich.id, spieler2: g1, ...(g2 ? { spieler3: g2 } : {}) };
  const alle = [ich.id, ...wahl.gegner];
  let duell;
  if (wahl.modus === 'runden') {
    duell = await DB.duellAnlegen({
      ...basis,
      status: 'laeuft',
      daten: { anzahl: wahl.runden, sekunden: wahl.sekunden, amZug: ich.id, runden: [], ...themen },
    });
  } else {
    duell = await DB.duellAnlegen({
      ...basis,
      status: 'offen',
      daten: {
        kategorie: themenText(themen),
        ...themen,
        fragen: shuffle(pool).slice(0, wahl.liveFragen).map((f) => f.id),
        sekunden: wahl.sekunden,
        index: 0,
        start: 0,
        angenommen: [ich.id],
        antworten: Object.fromEntries(alle.map((s) => [s, []])),
      },
    });
  }
  gehe('#/duell/' + duell.id);
}

// Revanche mit denselben Gegnern und Einstellungen
function revanche(duell) {
  const d = duell.daten;
  // Ältere Live-Duelle hatten statt der Themen-Auswahl eine einzelne Kategorie
  const alteKategorie = !d.ohne && KATEGORIEN.includes(d.kategorie) ? d.kategorie : null;
  return duellStarten({
    modus: duell.modus,
    gegner: gegnerVon(duell),
    runden: d.anzahl || E.RUNDEN_STANDARD,
    liveFragen: d.fragen ? d.fragen.length : E.LIVE_FRAGEN_STANDARD,
    sekunden: sekundenVon(duell),
    themen: {
      ohne: alteKategorie ? KATEGORIEN.filter((k) => k !== alteKategorie) : d.ohne || [],
      ohneRechnung: !!d.ohneRechnung,
    },
  });
}

async function duellAnzeigen(id) {
  const duell = await DB.duellLaden(id);
  if (!teilnehmer(duell).includes(ich.id)) throw new Error('Dieses Duell gehört nicht dir.');
  if (teilnehmer(duell).some((s) => !namen.has(s))) await ladeSpieler();
  if (duell.modus === 'live') return liveAnzeigen(duell);
  beimVerlassen(
    DB.abonniereDuell(id, (neu) => {
      if (ansicht === 'runden-uebersicht') rundenUebersicht(neu);
    })
  );
  rundenUebersicht(duell);
}

async function aufgeben(duell) {
  const text = teilnehmer(duell).length > 2 ? 'Wirklich aufgeben? Das Duell endet dann für alle und zählt für dich als Niederlage.' : 'Wirklich aufgeben? Das zählt als Niederlage.';
  if (!confirm(text)) return;
  await duellAktualisieren(duell.id, (d) => {
    if (d.status !== 'laeuft') return null;
    d.status = 'beendet';
    d.daten.aufgegeben = ich.id;
    return d;
  });
  route();
}

// ===== Rundenduell =====
const rundeFertig = (runde, spieler) => (runde.antworten[spieler] || []).length >= runde.fragen.length;
const rundeKomplett = (runde, duell) => teilnehmer(duell).every((s) => rundeFertig(runde, s));
const naechsterSpieler = (duell, s) => {
  const t = teilnehmer(duell);
  return t[(t.indexOf(s) + 1) % t.length];
};

function punkteReihe(runde, spieler, sichtbar) {
  const n = runde ? runde.fragen.length : E.FRAGEN_PRO_RUNDE;
  const antworten = (runde && runde.antworten[spieler]) || [];
  let html = '';
  for (let j = 0; j < n; j++) {
    const a = antworten[j];
    const klasse = a == null ? '' : !sichtbar ? 'verdeckt' : a ? 'ok' : 'nok';
    html += `<span class="punkt ${klasse}"></span>`;
  }
  return `<div class="punkte">${html}</div>`;
}

function rundenSpielstand(duell) {
  const d = duell.daten;
  const spieler = reihenfolge(duell);
  const beendet = duell.status === 'beendet';
  // Antworten der anderen sieht man erst, wenn man die Runde selbst gespielt hat
  const sichtbar = (r) => beendet || (r && rundeFertig(r, ich.id));
  const punkteVon = (s) => d.runden.reduce((a, r) => a + (s === ich.id || sichtbar(r) ? summe(r.antworten[s]) : 0), 0);
  const zeile = (inhalt, klasse = '') => `<div class="runde-zeile ${klasse}" style="--n:${spieler.length}">${inhalt}</div>`;

  let html = zeile(`<div></div>${spieler.map((s) => `<div class="spalten-name">${esc(nameVon(s))}</div>`).join('')}`, 'kopf');
  html += zeile(`<div class="runde-name">Punkte</div>${spieler.map((s) => `<div class="stand">${punkteVon(s)}</div>`).join('')}`, 'summe');
  for (let i = 0; i < d.anzahl; i++) {
    const r = d.runden[i];
    html += zeile(
      `<div class="runde-name">${r ? esc(r.kategorie) : `Runde ${i + 1}`}</div>${spieler
        .map((s) => punkteReihe(r, s, s === ich.id || sichtbar(r)))
        .join('')}`
    );
  }
  return `<div class="karte spielstand">${html}</div>`;
}

function rundenUebersicht(duell) {
  ansicht = 'runden-uebersicht';
  const d = duell.daten;
  const dran = duell.status === 'laeuft' && d.amZug === ich.id;
  let aktion;
  if (duell.status === 'beendet') {
    const e = ergebnisSatz(duell);
    aktion = `<p class="meldung gross ${e.klasse}">${esc(e.text)}</p>
      <button class="btn primaer" id="revanche">Revanche</button>`;
  } else if (dran) {
    aktion = `<button class="btn primaer" id="spielen">Spielen</button>`;
  } else {
    aktion = `<p class="hinweis">Warte auf ${esc(nameVon(d.amZug))} …</p>`;
  }
  show(`
    <div class="frage-kopf"><span>🔁 Rundenduell · ${d.anzahl} Runden · ${timerText(sekundenVon(duell))}</span><span>gegen ${esc(gegnerNamen(duell))}</span></div>
    ${d.ohne && (d.ohne.length || d.ohneRechnung) ? `<p class="klein gedaempft mitte">Themen: ${esc(themenText(d))}</p>` : ''}
    ${rundenSpielstand(duell)}
    <div class="stapel">
      ${aktion}
      <a class="btn" href="#/">Zur Startseite</a>
      ${duell.status === 'laeuft' ? '<button class="link gedaempft" id="aufgeben">Aufgeben</button>' : ''}
    </div>`);
  if (duell.status === 'beendet') ergebnisEffekt(duell, app.querySelector('.meldung.gross'));
  on('#spielen', () => rundenZug(duell.id).catch(fehler));
  on('#revanche', () => revanche(duell).catch(fehler));
  on('#aufgeben', () => aufgeben(duell).catch(fehler));
}

// Spielt alles, was in diesem Zug zu tun ist: offene Runde nachspielen, ggf. neue Kategorie wählen.
// Reihum: Wer eine Runde als Letzter abschließt, wählt die Kategorie der nächsten.
async function rundenZug(id) {
  const duell = await DB.duellLaden(id);
  const d = duell.daten;
  if (duell.status !== 'laeuft' || d.amZug !== ich.id) return rundenUebersicht(duell);
  if (!d.runden.some((r) => (r.antworten[ich.id] || []).length)) await vsIntro(duell);
  const offen = d.runden.findIndex((r) => !rundeFertig(r, ich.id));
  if (offen >= 0) return rundeSpielen(duell, offen);
  const letzte = d.runden[d.runden.length - 1];
  if (d.runden.length < d.anzahl && (!letzte || rundeKomplett(letzte, duell))) return kategorieWaehlen(duell);
  return zugBeenden(duell.id);
}

async function zugBeenden(id) {
  const duell = await duellAktualisieren(id, (d) => {
    if (d.status !== 'laeuft' || d.daten.amZug !== ich.id) return null;
    const komplett = d.daten.runden.length >= d.daten.anzahl && d.daten.runden.every((r) => rundeKomplett(r, d));
    if (komplett) d.status = 'beendet';
    else d.daten.amZug = naechsterSpieler(d, ich.id);
    return d;
  });
  rundenUebersicht(duell);
}

async function kategorieWaehlen(duell) {
  const d = duell.daten;
  const benutzt = new Set(d.runden.flatMap((r) => r.fragen));
  const frei = FRAGEN_LISTE.filter((f) => !benutzt.has(f.id) && imThema(d)(f));
  const n = E.FRAGEN_PRO_RUNDE;
  let auswahl = shuffle(KATEGORIEN.filter((k) => frei.filter((f) => f.kategorie === k).length >= n)).slice(0, E.KATEGORIEN_ZUR_AUSWAHL);
  if (!auswahl.length) {
    if (frei.length < n) {
      // Nicht genug Fragen für eine weitere Runde – das Duell wird verkürzt
      await duellAktualisieren(duell.id, (x) => {
        x.daten.anzahl = x.daten.runden.length;
        return x;
      });
      return zugBeenden(duell.id);
    }
    auswahl = ['Gemischt'];
  }

  ansicht = 'kategorie';
  show(`
    <div class="frage-kopf"><span>Runde ${d.runden.length + 1} von ${d.anzahl}</span><span>gegen ${esc(gegnerNamen(duell))}</span></div>
    <h2 class="mitte">Wähle eine Kategorie</h2>
    <div class="stapel">${auswahl.map((k, i) => `<button class="btn kategorie" data-i="${i}">${esc(k)}</button>`).join('')}</div>`);

  app.querySelectorAll('.kategorie').forEach((b) => {
    b.onclick = async () => {
      app.querySelectorAll('.kategorie').forEach((x) => (x.disabled = true));
      const k = auswahl[b.dataset.i];
      const pool = k === 'Gemischt' ? frei : frei.filter((f) => f.kategorie === k);
      const fragen = shuffle(pool).slice(0, n).map((f) => f.id);
      try {
        await duellAktualisieren(duell.id, (x) => {
          if (x.daten.runden.length !== d.runden.length || x.daten.amZug !== ich.id) return null;
          x.daten.runden.push({ kategorie: k, fragen, antworten: {} });
          return x;
        });
        await rundenZug(duell.id);
      } catch (e) {
        fehler(e);
      }
    };
  });
}

async function rundeSpielen(duell, idx) {
  const runde = duell.daten.runden[idx];
  let serie = serieImRundenduell(duell);
  await fragenLaden(runde.fragen);
  // Jede Antwort wird sofort gespeichert – so kann eine Frage nicht durch Neuladen wiederholt werden
  const antwortSpeichern = (j, wert) =>
    duellAktualisieren(duell.id, (x) => {
      const liste = (x.daten.runden[idx].antworten[ich.id] ||= []);
      if (liste.length !== j) return null;
      liste.push(wert);
      return x;
    });

  const naechste = async (j) => {
    if (j >= runde.fragen.length) return rundeErgebnis(duell.id, idx);
    const frage = FRAGEN_TEXT.get(runde.fragen[j]);
    if (!frage) {
      // Frage wurde inzwischen aus der Datenbank entfernt
      await antwortSpeichern(j, 0);
      return naechste(j + 1);
    }
    frageZeigen({
      frage,
      titel: `Runde ${idx + 1} · ${runde.kategorie}`,
      info: `Frage ${j + 1}/${runde.fragen.length}`,
      sekunden: sekundenVon(duell),
      serieVorher: serie,
      beiAntwort: (richtig) => {
        serie = richtig ? serie + 1 : 0;
        lernstandBuchen(frage.id, richtig);
        return antwortSpeichern(j, richtig ? 1 : 0);
      },
      weiter: () => naechste(j + 1).catch(fehler),
    });
  };
  await naechste((runde.antworten[ich.id] || []).length);
}

async function rundeErgebnis(id, idx) {
  const duell = await DB.duellLaden(id);
  const runde = duell.daten.runden[idx];
  const meine = runde.antworten[ich.id] || [];
  const [fragen, loesungen] = await Promise.all([fragenLaden(runde.fragen), loesungenLaden(runde.fragen)]);
  const andere = gegnerVon(duell)
    .filter((s) => rundeFertig(runde, s))
    .map((s) => `${esc(nameVon(s))}: ${summe(runde.antworten[s])} richtig`)
    .join(' · ');
  ansicht = 'runden-ergebnis';
  show(`
    <div class="frage-kopf"><span>Runde ${idx + 1} · ${esc(runde.kategorie)}</span><span>gegen ${esc(gegnerNamen(duell))}</span></div>
    <div class="karte">
      <p class="meldung gross">${summe(meine)} von ${runde.fragen.length} richtig</p>
      ${andere ? `<p class="mitte gedaempft">${andere}</p>` : ''}
    </div>
    <div class="liste">
      ${runde.fragen
        .map((fid, j) => {
          const f = fragen[j];
          const l = loesungen[j];
          return `<div class="aufloesung-zeile">
            <span class="punkt ${meine[j] ? 'ok' : 'nok'}"></span>
            <div><div>${esc(f ? f.frage : 'Frage nicht mehr vorhanden')}</div>
            ${l ? `<div class="klein ok mehrzeilig">✓ ${esc(l.richtig)}</div>` : ''}
            ${f ? meldenKnopf(fid) : ''}</div>
          </div>`;
        })
        .join('')}
    </div>
    <button class="btn primaer" id="weiter">Weiter</button>`);
  on('#weiter', () => rundenZug(id).catch(fehler));
}

// ===== Live-Battle =====
// Zeit für Frage i (Standard: die aktuelle) in ms, 0 = unbegrenzt
const liveDauer = (duell, i = duell.daten.index) => {
  const s = zeitFuer(sekundenVon(duell), FRAGEN_TEXT.get(duell.daten.fragen[i]));
  return s ? s * 1000 : 0;
};
const livePunkte = (ms, dauer) => (dauer ? 10 + Math.round(10 * Math.max(0, 1 - ms / dauer)) : 10);

async function liveAnzeigen(duell) {
  await fragenLaden(duell.daten.fragen);
  const live = { duell, phase: '', weiterAngefragt: -1, optionen: [], gewaehlt: null };
  const uebernehmen = (neu) => {
    if (neu.version >= live.duell.version) {
      live.duell = neu;
      liveTick(live);
    }
  };
  live.uebernehmen = uebernehmen;
  beimVerlassen(DB.abonniereDuell(duell.id, uebernehmen));
  const takt = setInterval(() => liveTick(live), 200);
  beimVerlassen(() => clearInterval(takt));
  liveTick(live);
}

function einmal(live, phase, fn) {
  if (live.phase === phase) return false;
  live.phase = phase;
  fn();
  return true;
}

function liveTick(live) {
  const duell = live.duell;
  const d = duell.daten;
  const jetzt = Date.now();
  if (duell.status === 'offen') {
    if (!liveEinladungGueltig(duell)) return einmal(live, 'abgelaufen', () => liveHinweis('Diese Einladung ist abgelaufen.'));
    return einmal(live, 'offen:' + angenommenVon(duell).join(','), () => liveOffen(live));
  }
  if (duell.status === 'abgelehnt') return einmal(live, 'abgelehnt', () => liveHinweis('Dieses Live-Battle wurde abgesagt.'));
  if (duell.status === 'beendet') return einmal(live, 'beendet', () => liveEnde(live));

  const i = d.index;
  if (jetzt < d.start) {
    einmal(live, 'pause' + i, () => livePause(live));
    const el = app.querySelector('#countdown');
    if (el) el.textContent = Math.ceil((d.start - jetzt) / 1000);
    return;
  }

  einmal(live, 'frage' + i, () => liveFrage(live));
  const dauer = liveDauer(duell);
  const balken = app.querySelector('.timer-balken');
  if (balken && dauer) {
    const rest = Math.max(0, 1 - (jetzt - d.start) / dauer);
    balken.style.width = rest * 100 + '%';
    balken.classList.toggle('knapp', rest < 0.25);
  }
  const status = app.querySelector('#gegner-status');
  if (status) status.textContent = gegnerVon(duell).map((g) => `${d.antworten[g][i] ? '✓' : '…'} ${nameVon(g)}`).join('   ');

  const zeitUm = dauer && jetzt > d.start + dauer;
  if (zeitUm && !d.antworten[ich.id][i] && live.gewaehlt == null) {
    live.gewaehlt = -1;
    sperren(-1);
    const m = app.querySelector('#meine-meldung');
    if (m) m.innerHTML = '<span class="nok">⏱ Zeit abgelaufen</span>';
    const phase = live.phase;
    loesungenLaden([d.fragen[i]])
      .then(([l]) => {
        if (live.phase !== phase || !l) return;
        if (FRAGEN_TEXT.get(d.fragen[i])?.typ === 'beschriften') beschriftenMarkieren(beschriftenPruefen(null, l));
        else markieren(live.optionen, -1, l.richtig);
      })
      .catch(fehler);
  }

  const alle = teilnehmer(duell).every((s) => d.antworten[s][i]);
  if ((alle || (dauer && jetzt > d.start + dauer + 500)) && live.weiterAngefragt !== i) {
    live.weiterAngefragt = i;
    liveWeiter(live, i);
  }
}

function punkteKopf(duell, punkte, serien = {}) {
  return `
    <div class="karte punkte-kopf">
      ${reihenfolge(duell)
        .map((s) => `<div class="${s === ich.id ? 'ich' : ''}"><div class="spieler-name">${esc(nameVon(s))}</div><div class="stand">${punkte[s]}${serien[s] >= 2 ? `<span class="flamme" title="${serien[s]} richtig in Folge">🔥${serien[s]}</span>` : ''}</div></div>`)
        .join('')}
    </div>`;
}
const liveKopf = (duell) =>
  punkteKopf(
    duell,
    duellErgebnis(duell).punkte,
    Object.fromEntries(teilnehmer(duell).map((s) => [s, serieAusAntworten((duell.daten.antworten[s] || []).filter(Boolean))]))
  );

function liveHinweis(text) {
  ansicht = 'live';
  show(`<div class="karte stapel"><p>${esc(text)}</p><a class="btn" href="#/">Zur Startseite</a></div>`);
}

function liveOffen(live) {
  ansicht = 'live';
  const duell = live.duell;
  const d = duell.daten;
  const angenommen = angenommenVon(duell);
  const dabei = angenommen.includes(ich.id);
  const liste = teilnehmer(duell)
    .map((s) => `<li>${angenommen.includes(s) ? '✓' : '…'} ${onlinePunkt(s)}${esc(nameVon(s))}${s === duell.spieler1 ? ' <span class="gedaempft">(fordert heraus)</span>' : ''}</li>`)
    .join('');
  const info = `${esc(d.kategorie)} · ${d.fragen.length} Fragen · ${timerText(sekundenVon(duell))} pro Frage`;
  show(`
    <div class="karte stapel mitte">
      <div class="warte-animation">⚡</div>
      ${dabei
        ? '<p>Warte, bis alle angenommen haben …</p>'
        : `<p><b>${esc(nameVon(duell.spieler1))}</b> fordert dich zum Live-Battle heraus!</p>`}
      <ul class="teilnehmer-liste">${liste}</ul>
      <p class="klein gedaempft">${info}</p>
      ${dabei ? '' : '<button class="btn primaer" id="annehmen">Annehmen</button>'}
      <button class="btn" id="absagen">${dabei ? 'Absagen' : 'Ablehnen'}</button>
    </div>`);
  on('#annehmen', async () => {
    try {
      live.uebernehmen(
        await duellAktualisieren(duell.id, (x) => {
          if (x.status !== 'offen') return null;
          const a = angenommenVon(x);
          if (!a.includes(ich.id)) a.push(ich.id);
          x.daten.angenommen = a;
          if (teilnehmer(x).every((s) => a.includes(s))) {
            x.status = 'laeuft';
            x.daten.index = 0;
            x.daten.start = Date.now() + E.LIVE_PAUSE_MS;
          }
          return x;
        })
      );
    } catch (e) {
      fehler(e);
    }
  });
  on('#absagen', async () => {
    try {
      await duellAktualisieren(duell.id, (x) => {
        if (x.status !== 'offen') return null;
        x.status = 'abgelehnt';
        return x;
      });
      gehe('#/');
    } catch (e) {
      fehler(e);
    }
  });
}

// Lädt die Lösung zu Frage i nach und setzt die Auflösung in #live-aufloesung ein
function liveAufloesungEinsetzen(live, i) {
  const phase = live.phase;
  loesungenLaden([live.duell.daten.fragen[i]])
    .then(([l]) => {
      const box = app.querySelector('#live-aufloesung');
      if (box && live.phase === phase) {
        box.innerHTML = liveAufloesung(live.duell, i, l);
        bilderEinsetzen(box);
      }
    })
    .catch(fehler);
}

function livePause(live) {
  ansicht = 'live';
  const duell = live.duell;
  const d = duell.daten;
  const i = d.index;
  show(`
    ${liveKopf(duell)}
    ${i > 0 ? '<div id="live-aufloesung"></div>' : '<p class="meldung gross">Gleich geht’s los!</p>'}
    ${i > 0 ? `<p class="spruch">${esc(liveSpruch(duell, i))}</p>` : ''}
    <p class="countdown-text">Frage ${i + 1} von ${d.fragen.length} in <span id="countdown"></span> …</p>`);
  if (i > 0) liveAufloesungEinsetzen(live, i - 1);
  else vsIntro(duell);
}

// Spruch in der Pause vor Frage i, passend zur Lage nach Frage i − 1.
// Die Auswahl hängt nur von Duell-ID und Fragennummer ab – alle Spieler sehen denselben Spruch.
function liveSpruch(duell, i) {
  const d = duell.daten;
  const spieler = teilnehmer(duell);
  const stand = (k) => Object.fromEntries(spieler.map((s) => [s, summe(d.antworten[s].slice(0, k).map((a) => a && a.p))]));
  const jetzt = stand(i);
  const vorher = stand(i - 1);
  const rang = [...spieler].sort((a, b) => jetzt[b] - jetzt[a]);
  const [erster, zweiter] = rang;
  const letzter = rang[rang.length - 1];
  const fuehrend = (p) => spieler.filter((s) => p[s] === Math.max(...spieler.map((x) => p[x])));
  const antworten = spieler.map((s) => d.antworten[s][i - 1]);
  let h = 0;
  for (const c of `${duell.id}:${i}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const eins = (liste) => liste[h % liste.length];
  const n = nameVon;

  const schnellster = spieler
    .filter((s) => d.antworten[s][i - 1] && d.antworten[s][i - 1].r)
    .sort((a, b) => d.antworten[a][i - 1].ms - d.antworten[b][i - 1].ms)[0];
  const serie = spieler.map((s) => [s, serieAusAntworten(d.antworten[s].slice(0, i).filter(Boolean))]).find(([, k]) => [3, 5, 7, 10].includes(k));
  const vorn = fuehrend(jetzt);
  const vornVorher = fuehrend(vorher);
  const abstand = jetzt[erster] - jetzt[zweiter];

  let text;
  if (vorn.length === 1 && vornVorher.length === 1 && vorn[0] !== vornVorher[0] && i > 1) {
    text = eins([`${n(erster)} übernimmt die Führung! 👑`, `Führungswechsel! ${n(erster)} ist jetzt vorne.`, `${n(erster)} schnappt sich Platz 1! 👑`]);
  } else if (antworten.every((a) => a && !a.r)) {
    text = eins(['Autsch, alle daneben! 🙈', 'Keiner wusste es – die Frage merken wir uns. 📚', 'Die war fies. Alle falsch! 😅']);
  } else if (serie) {
    text = eins([`${n(serie[0])} ist on fire – ${serie[1]} richtige in Folge! 🔥`, `${n(serie[0])} läuft heiß: ${serie[1]}er-Serie! 🔥`]);
  } else if (antworten.every((a) => a && a.r)) {
    text = eins(['Alle richtig – starke Runde! 💪', 'Da kennen sich alle aus. 👏', 'Alle richtig – jetzt entscheidet das Tempo! ⚡']);
  } else if (abstand === 0) {
    text = eins(['Gleichstand an der Spitze – alles offen! ⚖️', 'Punktgleich vorne – spannend! 😬']);
  } else if (abstand <= 5) {
    text = `Knapp! Nur ${abstand} ${abstand === 1 ? 'Punkt' : 'Punkte'} zwischen ${n(erster)} und ${n(zweiter)}.`;
  } else {
    text = eins([
      `${n(erster)}, weiter so! 🏆`,
      `${n(letzter)}, streng dich mehr an! 😤`,
      `${n(letzter)}, da geht noch was! 💪`,
      `${n(erster)} macht ordentlich Druck!`,
      `${n(letzter)}, Zeit für die Aufholjagd! 🏃`,
      schnellster ? `Blitzschnell: ${n(schnellster)} in ${(d.antworten[schnellster][i - 1].ms / 1000).toFixed(1).replace('.', ',')} s! ⚡` : `${n(erster)}, weiter so! 🏆`,
    ]);
  }
  return i === d.fragen.length - 1 ? `${text} Letzte Frage – jetzt zählt’s!` : text;
}

function liveAufloesung(duell, i, loesung) {
  const d = duell.daten;
  const frage = FRAGEN_TEXT.get(d.fragen[i]);
  const dauer = liveDauer(duell, i);
  const zeile = (s) => {
    const a = d.antworten[s][i];
    const zeit = a && a.r && dauer ? ` <span class="gedaempft">(${(a.ms / 1000).toFixed(1)} s)</span>` : '';
    const text = !a ? '–' : a.r ? `✓ +${a.p}${zeit}` : dauer && a.ms >= dauer ? '⏱ Zeit abgelaufen' : '✗ falsch';
    return `<div class="live-ergebnis"><span>${esc(s === ich.id ? 'Du' : nameVon(s))}</span><span class="${a && a.r ? 'ok' : 'nok'}">${text}</span></div>`;
  };
  return `
    <div class="karte">
      <p class="klein gedaempft">Frage ${i + 1}</p>
      <p>${esc(frage ? frage.frage : 'Frage nicht mehr vorhanden')}</p>
      ${loesung ? `<p class="ok mehrzeilig">✓ ${esc(loesung.richtig)}</p>` : ''}
      ${loesung ? bildPlatz(loesung.bild_nach) : ''}
      ${loesung && loesung.erklaerung ? `<p class="erklaerung">${esc(loesung.erklaerung)}</p>` : ''}
      ${reihenfolge(duell).map(zeile).join('')}
      ${frage ? `<p class="mitte">${meldenKnopf(frage.id)}</p>` : ''}
    </div>`;
}

function liveFrage(live) {
  ansicht = 'frage';
  const duell = live.duell;
  const d = duell.daten;
  const i = d.index;
  const frage = FRAGEN_TEXT.get(d.fragen[i]);
  const eingabe = !!frage && frage.typ === 'eingabe';
  const beschriften = !!frage && frage.typ === 'beschriften';
  live.optionen = frage && !eingabe && !beschriften ? shuffle(frage.antworten) : [];
  live.gewaehlt = null;
  show(`
    ${liveKopf(duell)}
    <div class="frage-kopf"><span>⚡ ${esc(d.kategorie)}</span><span>Frage ${i + 1}/${d.fragen.length}${typHinweis(frage)}</span></div>
    ${liveDauer(duell) ? '<div class="timer"><div class="timer-balken"></div></div>' : ''}
    <div class="karte frage">${esc(frage ? frage.frage : 'Frage nicht mehr vorhanden')}</div>
    ${frage ? bildPlatz(frage.bild) : ''}
    ${beschriften ? beschriftenFeld(frage.antworten) : eingabe ? eingabeFeld() : antwortKnoepfe(live.optionen)}
    <p class="meldung" id="meine-meldung"></p>
    <p class="gegner-status" id="gegner-status"></p>
    <button class="link gedaempft" id="aufgeben">Aufgeben</button>`);
  bilderEinsetzen();
  on('#aufgeben', () => aufgeben(live.duell).catch(fehler));

  if (d.antworten[ich.id][i]) {
    // Schon beantwortet (z. B. nach Neuladen)
    live.gewaehlt = -1;
    sperren(-1);
    app.querySelector('#meine-meldung').textContent = 'Bereits beantwortet – warte auf die anderen.';
    return;
  }
  app.querySelectorAll('.antwort').forEach((k, idx) => (k.onclick = () => liveAntworten(live, frage, idx)));
  if (eingabe) eingabeAktivieren((text) => liveAntworten(live, frage, text));
  if (beschriften) beschriftenAktivieren((texte) => liveAntworten(live, frage, texte));
}

// auswahl: Index der gewählten Antwort, eingetippter Text oder Liste der Texte (Beschriften)
async function liveAntworten(live, frage, auswahl) {
  if (live.gewaehlt != null) return;
  const d = live.duell.daten;
  const i = d.index;
  const dauer = liveDauer(live.duell);
  const ms = Date.now() - d.start;
  if (dauer && ms > dauer) return;
  live.gewaehlt = auswahl;
  sperren(auswahl);
  const phase = live.phase;
  try {
    const [loesung] = await loesungenLaden([frage.id]);
    const eingabe = frage.typ === 'eingabe';
    const beschriften = frage.typ === 'beschriften';
    const pruefung = beschriften ? beschriftenPruefen(auswahl, loesung) : null;
    const richtig = beschriften ? pruefung.richtig : eingabe ? eingabePruefen(auswahl, loesung).richtig : !!loesung && live.optionen[auswahl] === loesung.richtig;
    const p = richtig ? livePunkte(ms, dauer) : 0;
    if (live.phase === phase) {
      if (beschriften) beschriftenMarkieren(pruefung);
      else if (eingabe) app.querySelector('#eingabe').classList.add(richtig ? 'richtig' : 'falsch');
      else markieren(live.optionen, auswahl, loesung && loesung.richtig);
      const serie = richtig ? serieAusAntworten(d.antworten[ich.id].slice(0, i).filter(Boolean)) + 1 : 0;
      app.querySelector('#meine-meldung').innerHTML = richtig ? `<span class="ok">✓ Richtig! +${p}</span> ${serieText(serie)}` : '<span class="nok">✗ Leider falsch</span>';
    }
    lernstandBuchen(frage.id, richtig);
    live.uebernehmen(
      await duellAktualisieren(live.duell.id, (x) => {
        if (x.status !== 'laeuft' || x.daten.index !== i || x.daten.antworten[ich.id][i]) return null;
        x.daten.antworten[ich.id][i] = { r: richtig ? 1 : 0, ms, p };
        return x;
      })
    );
  } catch (e) {
    fehler(e);
  }
}

// Schaltet zur nächsten Frage, sobald alle geantwortet haben oder die Zeit um ist.
// Alle Geräte versuchen das – durch die Versionsprüfung passiert es nur einmal.
async function liveWeiter(live, i) {
  try {
    const neu = await duellAktualisieren(live.duell.id, (x) => {
      const d = x.daten;
      if (x.status !== 'laeuft' || d.index !== i) return null;
      const jetzt = Date.now();
      const dauer = liveDauer(x);
      const spieler = teilnehmer(x);
      const alle = spieler.every((s) => d.antworten[s][i]);
      if (!alle && (!dauer || jetzt < d.start + dauer)) return null;
      // Länger als eine Minute niemand da gewesen → Battle direkt beenden
      const verwaist = dauer && jetzt > d.start + dauer + 60000;
      const bis = verwaist ? d.fragen.length : i + 1;
      for (const s of spieler) {
        for (let k = 0; k < bis; k++) if (!d.antworten[s][k]) d.antworten[s][k] = { r: 0, ms: dauer, p: 0 };
      }
      if (bis >= d.fragen.length) x.status = 'beendet';
      else {
        d.index = i + 1;
        d.start = jetzt + E.LIVE_PAUSE_MS;
      }
      return x;
    });
    live.uebernehmen(neu);
    if (neu.status === 'laeuft' && neu.daten.index === i) setTimeout(() => (live.weiterAngefragt = -1), 1000);
  } catch (e) {
    fehler(e);
    setTimeout(() => (live.weiterAngefragt = -1), 2000);
  }
}

function liveEnde(live) {
  ansicht = 'live';
  const duell = live.duell;
  const d = duell.daten;
  const spieler = reihenfolge(duell);
  const e = ergebnisSatz(duell);
  const zelle = (a) => (!a ? '–' : a.r ? `<span class="ok">+${a.p}</span>` : '<span class="nok">✗</span>');
  const beantwortet = d.antworten[ich.id].filter(Boolean).length;
  show(`
    ${liveKopf(duell)}
    <p class="meldung gross ${e.klasse}">${esc(e.text)}</p>
    ${beantwortet ? '<div id="live-aufloesung"></div>' : ''}
    <div class="karte">
      <table class="tabelle">
        <thead><tr><th>Frage</th>${spieler.map((s) => `<th>${esc(s === ich.id ? 'Du' : nameVon(s))}</th>`).join('')}</tr></thead>
        <tbody>${d.fragen
          .map((fid, i) => {
            const f = FRAGEN_TEXT.get(fid);
            return `<tr><td class="klein">${esc(f ? f.frage : '–')}</td>${spieler.map((s) => `<td>${zelle(d.antworten[s][i])}</td>`).join('')}</tr>`;
          })
          .join('')}</tbody>
      </table>
    </div>
    <div class="stapel">
      <button class="btn primaer" id="revanche">Revanche</button>
      <a class="btn" href="#/">Zur Startseite</a>
    </div>`);
  if (beantwortet) liveAufloesungEinsetzen(live, Math.min(d.index, d.fragen.length - 1));
  ergebnisEffekt(duell, app.querySelector('.meldung.gross'));
  on('#revanche', () => revanche(duell).catch(fehler));
}

// ===== Lernen =====
function lernenAuswahl() {
  ansicht = 'lernen';
  const schwach = (f) => {
    const e = lernstand.get(f.id);
    return e && e.falsch > 0 && e.serie < E.SICHER_AB_SERIE;
  };
  show(`
    <h2>Lernen</h2>
    <div class="karte stapel">
      <label>Kategorie
        <select id="kategorie">
          <option value="">Alle Kategorien</option>
          ${KATEGORIEN.map((k) => `<option>${esc(k)}</option>`).join('')}
        </select>
      </label>
      <label class="check"><input type="checkbox" id="mit-zeit"> Mit Zeitlimit (${E.LERNEN_SEKUNDEN} s)</label>
    </div>
    <div class="stapel">
      <button class="btn primaer" data-modus="schwach">🎯 Schwächen üben <small id="anz-schwach"></small></button>
      <button class="btn" data-modus="neu">✨ Neue Fragen <small id="anz-neu"></small></button>
      <button class="btn" data-modus="zufall">🎲 Zufällige Fragen</button>
    </div>`);

  const kategorieFeld = app.querySelector('#kategorie');
  const pool = () => (kategorieFeld.value ? FRAGEN_LISTE.filter((f) => f.kategorie === kategorieFeld.value) : FRAGEN_LISTE);
  const zaehlen = () => {
    app.querySelector('#anz-schwach').textContent = `(${pool().filter(schwach).length})`;
    app.querySelector('#anz-neu').textContent = `(${pool().filter((f) => !lernstand.has(f.id)).length})`;
  };
  kategorieFeld.onchange = zaehlen;
  zaehlen();

  app.querySelectorAll('[data-modus]').forEach((b) => {
    b.onclick = async () => {
      const modus = b.dataset.modus;
      let auswahl = shuffle(pool());
      if (modus === 'schwach') {
        const quote = (f) => {
          const e = lernstand.get(f.id);
          return e.richtig / (e.richtig + e.falsch);
        };
        auswahl = auswahl.filter(schwach).sort((a, b2) => quote(a) - quote(b2));
      }
      if (modus === 'neu') auswahl = auswahl.filter((f) => !lernstand.has(f.id));
      auswahl = auswahl.slice(0, E.LERNEN_FRAGEN);
      if (!auswahl.length) {
        return toast(modus === 'schwach' ? 'Keine Schwächen gefunden – stark! 💪' : 'Keine neuen Fragen mehr in dieser Auswahl.');
      }
      try {
        const fragen = (await fragenLaden(auswahl.map((f) => f.id))).filter(Boolean);
        lernrunde(fragen, app.querySelector('#mit-zeit').checked);
      } catch (e) {
        fehler(e);
      }
    };
  });
}

function lernrunde(fragen, mitZeit) {
  const falsche = [];
  let richtige = 0;
  let serie = 0;
  const naechste = (i) => {
    if (i >= fragen.length) return lernEnde(fragen, richtige, falsche, mitZeit);
    const frage = fragen[i];
    frageZeigen({
      frage,
      titel: `📚 ${frage.kategorie}`,
      info: `${i + 1}/${fragen.length}`,
      sekunden: mitZeit ? E.LERNEN_SEKUNDEN : 0,
      serieVorher: serie,
      beiAntwort: (richtig) => {
        serie = richtig ? serie + 1 : 0;
        if (richtig) richtige++;
        else falsche.push(frage);
        lernstandBuchen(frage.id, richtig);
      },
      weiter: () => naechste(i + 1),
    });
  };
  naechste(0);
}

function lernEnde(fragen, richtige, falsche, mitZeit) {
  ansicht = 'lernen-ende';
  show(`
    <div class="karte">
      <p class="meldung gross">${richtige} von ${fragen.length} richtig</p>
    </div>
    ${falsche.length ? `<h3>Das solltest du dir nochmal anschauen</h3>
    <div class="liste">${falsche
      .map((f) => {
        const l = LOESUNGEN.get(f.id);
        return `<div class="aufloesung-zeile"><span class="punkt nok"></span><div><div>${esc(f.frage)}</div>${l ? `<div class="klein ok mehrzeilig">✓ ${esc(l.richtig)}</div>` : ''}${l && l.erklaerung ? `<div class="klein gedaempft">${esc(l.erklaerung)}</div>` : ''}${meldenKnopf(f.id)}</div></div>`;
      })
      .join('')}</div>` : ''}
    <div class="stapel">
      ${falsche.length ? '<button class="btn primaer" id="wiederholen">Fehler wiederholen</button>' : ''}
      <button class="btn" id="nochmal">Neue Lernrunde</button>
      <a class="btn" href="#/">Zur Startseite</a>
    </div>`);
  on('#wiederholen', () => lernrunde(shuffle(falsche), mitZeit));
  on('#nochmal', () => lernenAuswahl());
}

// ===== Statistik =====
async function statistik() {
  const zeilen = await DB.lernstandVon(ich.id);
  lernstand = new Map(zeilen.map((z) => [z.frage_id, z]));
  ansicht = 'statistik';

  const auswerten = (fragen) => {
    let sicher = 0, geuebt = 0, richtig = 0, falsch = 0;
    for (const f of fragen) {
      const e = lernstand.get(f.id);
      if (!e) continue;
      if (e.serie >= E.SICHER_AB_SERIE) sicher++;
      else geuebt++;
      richtig += e.richtig;
      falsch += e.falsch;
    }
    const gesamt = fragen.length;
    return { gesamt, sicher, geuebt, neu: gesamt - sicher - geuebt, quote: richtig + falsch ? Math.round((100 * richtig) / (richtig + falsch)) : null };
  };
  const balken = (s) => `
    <div class="fortschritt" title="${s.sicher} sicher, ${s.geuebt} geübt, ${s.neu} neu">
      <div class="sicher" style="width:${(100 * s.sicher) / (s.gesamt || 1)}%"></div>
      <div class="geuebt" style="width:${(100 * s.geuebt) / (s.gesamt || 1)}%"></div>
    </div>`;
  const alle = auswerten(FRAGEN_LISTE);

  show(`
    <h2>Deine Statistik</h2>
    <div class="karte">
      <div class="kennzahlen">
        <div><b>${alle.sicher}</b><span>sicher</span></div>
        <div><b>${alle.geuebt}</b><span>geübt</span></div>
        <div><b>${alle.neu}</b><span>neu</span></div>
        <div><b>${alle.quote ?? '–'}${alle.quote != null ? ' %' : ''}</b><span>richtig</span></div>
      </div>
      ${balken(alle)}
      <p class="klein gedaempft">„Sicher“ = ${E.SICHER_AB_SERIE}× hintereinander richtig beantwortet.</p>
    </div>
    <h3>Nach Kategorie</h3>
    <div class="liste">${KATEGORIEN.map((k) => {
      const s = auswerten(FRAGEN_LISTE.filter((f) => f.kategorie === k));
      return `<div class="statistik-zeile">
        <div class="statistik-kopf"><b>${esc(k)}</b><span class="klein gedaempft">${s.sicher}/${s.gesamt} sicher · ${s.quote != null ? s.quote + ' % richtig' : 'noch nicht geübt'}</span></div>
        ${balken(s)}
      </div>`;
    }).join('')}</div>
    <div class="legende klein"><span><i class="sicher"></i> sicher</span><span><i class="geuebt"></i> geübt</span><span><i></i> neu</span></div>
    <a class="btn primaer" href="#/lernen">Jetzt lernen</a>`);
}

// ===== Rangliste =====
async function rangliste(filter = 'alle') {
  const [duelle] = await Promise.all([DB.beendeteDuelle(), ladeSpieler()]);
  ansicht = 'rangliste';
  const tabelle = new Map();
  const eintrag = (id) => {
    if (!tabelle.has(id)) tabelle.set(id, { id, spiele: 0, s: 0, u: 0, n: 0 });
    return tabelle.get(id);
  };
  for (const duell of duelle) {
    if (filter !== 'alle' && duell.modus !== filter) continue;
    const { ergebnis } = duellErgebnis(duell);
    for (const s of teilnehmer(duell)) {
      const e = eintrag(s);
      e.spiele++;
      e[ergebnis[s]]++;
    }
  }
  const liste = [...tabelle.values()]
    .map((e) => ({ ...e, punkte: 3 * e.s + e.u }))
    .sort((a, b) => b.punkte - a.punkte || b.s - a.s || a.spiele - b.spiele);

  show(`
    <h2>Rangliste</h2>
    <div class="segment" id="filter">
      <button data-f="alle" class="${filter === 'alle' ? 'aktiv' : ''}">Alle</button>
      <button data-f="runden" class="${filter === 'runden' ? 'aktiv' : ''}">🔁 Runden</button>
      <button data-f="live" class="${filter === 'live' ? 'aktiv' : ''}">⚡ Live</button>
    </div>
    ${liste.length ? `
    <div class="karte">
      <table class="tabelle rangliste">
        <thead><tr><th>#</th><th>Name</th><th title="Siege / Unentschieden / Niederlagen">S/U/N</th><th>Pkt</th></tr></thead>
        <tbody>${liste
          .map((e, i) => `<tr class="${e.id === ich.id ? 'ich' : ''}">
            <td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
            <td>${onlinePunkt(e.id)}${esc(nameVon(e.id))}</td>
            <td>${e.s}/${e.u}/${e.n}</td>
            <td><b>${e.punkte}</b></td></tr>`)
          .join('')}</tbody>
      </table>
      <p class="klein gedaempft">Sieg = 3 Punkte, Unentschieden bzw. geteilter Sieg = 1 Punkt. Im Duell zu dritt gewinnt nur der Erstplatzierte.</p>
    </div>` : '<p class="leer">Noch keine beendeten Duelle.</p>'}`);
  app.querySelectorAll('#filter button').forEach((b) => (b.onclick = () => rangliste(b.dataset.f).catch(fehler)));
}

// ===== Admin =====
// Eigenes Admin-Passwort, nur für diese Browser-Sitzung gemerkt
async function adminAnsicht() {
  const adminPw = gespeichertSitzung('pruefi-admin');
  if (!adminPw) return adminLogin();
  let meldungen;
  try {
    meldungen = await DB.adminMeldungen(adminPw);
  } catch (e) {
    // Admin-Passwort wurde geändert
    try { sessionStorage.removeItem('pruefi-admin'); } catch {}
    toast(e.message);
    return adminLogin();
  }
  const [spieler, duelle] = await Promise.all([ladeSpieler(), DB.alleDuelle()]);
  ansicht = 'admin';
  const offen = meldungen.filter((m) => !m.erledigt);
  const anzahlDuelle = (id) => duelle.filter((d) => teilnehmer(d).includes(id)).length;
  const datum = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const statusText = { offen: 'Einladung', laeuft: 'läuft', beendet: 'beendet', abgelehnt: 'abgesagt' };

  const meldungZeile = (m) => `
    <div class="admin-zeile meldung-zeile ${m.erledigt ? 'erledigt' : ''}">
      <div class="admin-info">
        <div class="klein gedaempft">${esc(m.kategorie || '')} · ${esc(m.frage_id)}</div>
        <div><b>${esc(m.frage || 'Frage nicht gefunden')}</b></div>
        ${m.richtig ? `<div class="klein ok mehrzeilig">✓ ${esc(m.richtig)}</div>` : ''}
        <div class="meldung-grund">⚑ ${esc(m.grund)}${m.kommentar ? ` – „${esc(m.kommentar)}“` : ''}</div>
        <div class="klein gedaempft">${esc(nameVon(m.spieler))} · ${datum(m.erstellt)}${m.erledigt ? ' · erledigt' : ''}</div>
      </div>
      ${m.erledigt ? '' : `<button class="btn klein" data-erledigt="${m.id}">Erledigt</button>`}
    </div>`;

  show(`
    <h2>Admin</h2>
    <a class="btn primaer" href="#/admin/fragen">🗂 Alle Fragen durchsehen</a>
    <h3>Gemeldete Fragen (${offen.length} offen)</h3>
    ${offen.length ? '<button class="btn" id="meldungen-kopieren">📋 Offene Meldungen für Claude kopieren</button>' : ''}
    <div class="liste">${meldungen.map(meldungZeile).join('') || '<p class="leer">Keine Meldungen.</p>'}</div>
    <h3>Spieler (${spieler.length})</h3>
    <div class="liste">${spieler
      .map((s) => `
        <div class="admin-zeile">
          <div class="admin-info">${onlinePunkt(s.id)}<b>${esc(s.name)}</b>${s.id === ich.id ? ' <span class="gedaempft">(du)</span>' : ''}
            <div class="klein gedaempft">${anzahlDuelle(s.id)} Duelle · seit ${datum(s.erstellt)}</div></div>
          <button class="btn klein" data-lernstand="${esc(s.id)}">Lernstand ↺</button>
          <button class="btn klein gefahr" data-spieler="${esc(s.id)}">Löschen</button>
        </div>`)
      .join('')}</div>
    <h3>Duelle (${duelle.length})</h3>
    <div class="liste">${duelle
      .map((d) => `
        <div class="admin-zeile">
          <div class="admin-info"><b>${d.modus === 'live' ? '⚡' : '🔁'} ${teilnehmer(d).map((s) => esc(nameVon(s))).join(' · ')}</b>
            <div class="klein gedaempft">${statusText[d.status] || d.status} · ${datum(d.aktualisiert)}</div></div>
          <button class="btn klein gefahr" data-duell="${d.id}">Löschen</button>
        </div>`)
      .join('') || '<p class="leer">Keine Duelle.</p>'}</div>
    <div class="stapel"><button class="btn" id="admin-ende">Admin abmelden</button></div>`);

  const ausfuehren = async (frage, aktion) => {
    if (!confirm(frage)) return;
    try {
      await aktion();
      toast('Erledigt.');
      adminAnsicht().catch(fehler);
    } catch (e) {
      fehler(e);
    }
  };
  app.querySelectorAll('[data-spieler]').forEach((b) => {
    const id = b.dataset.spieler;
    b.onclick = () =>
      ausfuehren(`„${nameVon(id)}“ endgültig löschen – inklusive aller Duelle (${anzahlDuelle(id)}) und des Lernstands?`, async () => {
        await DB.adminSpielerLoeschen(adminPw, id);
        if (id === ich.id) abmelden();
      });
  });
  app.querySelectorAll('[data-lernstand]').forEach((b) => {
    const id = b.dataset.lernstand;
    b.onclick = () => ausfuehren(`Lernstand von „${nameVon(id)}“ zurücksetzen?`, () => DB.adminLernstandZuruecksetzen(adminPw, id));
  });
  app.querySelectorAll('[data-duell]').forEach((b) => {
    b.onclick = () => ausfuehren('Dieses Duell endgültig löschen?', () => DB.adminDuellLoeschen(adminPw, b.dataset.duell));
  });
  app.querySelectorAll('[data-erledigt]').forEach((b) => {
    b.onclick = async () => {
      try {
        await DB.adminMeldungErledigen(adminPw, Number(b.dataset.erledigt));
        adminAnsicht().catch(fehler);
      } catch (e) {
        fehler(e);
      }
    };
  });
  on('#meldungen-kopieren', async () => {
    const text =
      'Gemeldete Fragen aus dem Prüfi-Duell – bitte prüfen und korrigieren:\n\n' +
      offen
        .map((m) =>
          [
            `[${m.frage_id}] ${m.kategorie || ''}`,
            `Frage: ${m.frage || '(nicht gefunden)'}`,
            `Richtige Antwort laut Datenbank: ${m.richtig || '–'}`,
            `Meldung: ${m.grund}${m.kommentar ? ` – ${m.kommentar}` : ''} (von ${nameVon(m.spieler)}, ${datum(m.erstellt)})`,
          ].join('\n')
        )
        .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('Kopiert – einfach bei Claude einfügen.');
    } catch {
      prompt('Text kopieren:', text);
    }
  });
  on('#admin-ende', () => {
    try { sessionStorage.removeItem('pruefi-admin'); } catch {}
    gehe('#/');
  });
}

// Alle Fragen einzeln durchklicken und mit einem Klick zum Entfernen markieren.
// Die Markierung landet in der Datenbank (fragen.zum_entfernen), Claude kann sie dort abrufen.
async function adminFragen() {
  const adminPw = gespeichertSitzung('pruefi-admin');
  if (!adminPw) return gehe('#/admin');
  let fragen;
  try {
    fragen = await DB.adminFragen(adminPw);
  } catch (e) {
    try { sessionStorage.removeItem('pruefi-admin'); } catch {}
    toast(e.message);
    return gehe('#/admin');
  }
  ansicht = 'admin-fragen';
  const kategorien = [...new Set(fragen.map((f) => f.kategorie))];
  const zustand = {
    kategorie: gespeichertSitzung('pruefi-admin-kategorie') || '',
    nurMarkiert: false,
    pos: Number(gespeichertSitzung('pruefi-admin-position')) || 0,
  };
  const auswahl = () =>
    fragen.filter((f) => (!zustand.kategorie || f.kategorie === zustand.kategorie) && (!zustand.nurMarkiert || f.zum_entfernen));

  const zeichnen = () => {
    const liste = auswahl();
    zustand.pos = Math.min(Math.max(0, zustand.pos), Math.max(0, liste.length - 1));
    try {
      sessionStorage.setItem('pruefi-admin-kategorie', zustand.kategorie);
      sessionStorage.setItem('pruefi-admin-position', zustand.pos);
    } catch {}
    const f = liste[zustand.pos];
    const markiert = fragen.filter((x) => x.zum_entfernen);
    const antworten = !f
      ? ''
      : f.typ === 'eingabe' || f.typ === 'beschriften'
        ? (f.alternativen || []).length ? `<div class="klein gedaempft">Auch richtig: ${f.alternativen.map(esc).join(' · ')}</div>` : ''
        : (f.falsch || []).map((x) => `<div class="admin-falsch mehrzeilig">✗ ${esc(x)}</div>`).join('');
    show(`
      <div class="frage-kopf"><a class="link" href="#/admin">← Admin</a><span>${markiert.length} zum Entfernen markiert</span></div>
      <div class="admin-filter">
        <select id="kategorie">
          <option value="">Alle Kategorien (${fragen.length})</option>
          ${kategorien.map((k) => `<option ${k === zustand.kategorie ? 'selected' : ''}>${esc(k)}</option>`).join('')}
        </select>
        <label class="check"><input type="checkbox" id="nur-markierte" ${zustand.nurMarkiert ? 'checked' : ''}> nur markierte</label>
      </div>
      ${f ? `
        <div class="karte admin-frage ${f.zum_entfernen ? 'markiert' : ''}">
          <div class="klein gedaempft">${zustand.pos + 1} / ${liste.length} · ${esc(f.kategorie)} · ${esc(f.id)}${typHinweis(f)}</div>
          <p class="admin-frage-text">${esc(f.frage)}</p>
          ${bildPlatz(f.bild)}
          <div class="ok mehrzeilig">✓ ${esc(f.richtig)}</div>
          ${antworten}
          ${f.bild_nach ? `<div class="klein gedaempft">Nach dem Antworten:</div>${bildPlatz(f.bild_nach)}` : ''}
          ${f.erklaerung ? `<p class="erklaerung">${esc(f.erklaerung)}</p>` : ''}
        </div>
        <div class="admin-navigation">
          <button class="btn" id="zurueck" ${zustand.pos === 0 ? 'disabled' : ''} aria-label="Vorherige Frage">←</button>
          <button class="btn ${f.zum_entfernen ? 'gefahr-voll' : 'gefahr'}" id="markieren">${f.zum_entfernen ? '✓ Markiert – nochmal tippen zum Aufheben' : '🗑 Zum Entfernen markieren'}</button>
          <button class="btn" id="vor" ${zustand.pos >= liste.length - 1 ? 'disabled' : ''} aria-label="Nächste Frage">→</button>
        </div>` : '<p class="leer">Keine Fragen in dieser Auswahl.</p>'}
      ${markiert.length ? `<button class="btn" id="kopieren">📋 Markierte für Claude kopieren (${markiert.length})</button>` : ''}
      <p class="klein gedaempft mitte">Tipp: Am PC geht's auch mit den Pfeiltasten ← →.</p>`);
    bilderEinsetzen(app, adminPw);

    on('#kategorie', (e) => { zustand.kategorie = e.target.value; zustand.pos = 0; zeichnen(); }, 'change');
    on('#nur-markierte', (e) => { zustand.nurMarkiert = e.target.checked; zustand.pos = 0; zeichnen(); }, 'change');
    on('#zurueck', () => { zustand.pos--; zeichnen(); });
    on('#vor', () => { zustand.pos++; zeichnen(); });
    on('#markieren', async () => {
      const neu = !f.zum_entfernen;
      f.zum_entfernen = neu;
      zeichnen();
      try {
        await DB.adminFrageMarkieren(adminPw, f.id, neu);
      } catch (e) {
        f.zum_entfernen = !neu;
        zeichnen();
        fehler(e);
      }
    });
    on('#kopieren', async () => {
      const text = `Zum Entfernen markierte Fragen (${markiert.length}):\n` + markiert.map((x) => `- [${x.id}] ${x.kategorie}: ${x.frage}`).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        toast('Kopiert – oder sag Claude einfach Bescheid, die Markierungen stehen auch in der Datenbank.');
      } catch {
        prompt('Text kopieren:', text);
      }
    });
  };

  const tasten = (e) => {
    if (ansicht !== 'admin-fragen' || (e.target.matches && e.target.matches('input, select, textarea'))) return;
    if (e.key === 'ArrowRight') app.querySelector('#vor')?.click();
    if (e.key === 'ArrowLeft') app.querySelector('#zurueck')?.click();
  };
  document.addEventListener('keydown', tasten);
  beimVerlassen(() => document.removeEventListener('keydown', tasten));
  zeichnen();
}

function adminLogin() {
  ansicht = 'admin-login';
  show(`
    <h2>Admin</h2>
    <form id="admin-login" class="karte stapel">
      <label>Admin-Passwort<input id="admin-pw" type="password" autocomplete="current-password" required></label>
      <button class="btn primaer">Anmelden</button>
    </form>`);
  app.querySelector('#admin-pw').focus();
  on('#admin-login', async (e) => {
    e.preventDefault();
    const pw = app.querySelector('#admin-pw').value;
    try {
      if (!(await DB.adminPruefen(pw))) return toast('Das Admin-Passwort stimmt nicht.');
      try { sessionStorage.setItem('pruefi-admin', pw); } catch {}
      adminAnsicht().catch(fehler);
    } catch (err) {
      fehler(err);
    }
  }, 'submit');
}

function gespeichertSitzung(schluessel) {
  try {
    return sessionStorage.getItem(schluessel);
  } catch {
    return null;
  }
}

// ===== Start =====
async function boot() {
  const demo = document.getElementById('demo-hinweis');
  demo.hidden = DB.modus !== 'demo';
  if (DB.modus === 'demo') demo.innerHTML += ' Gruppen-Passwort im Demo-Modus: <code>demo</code>';
  window.addEventListener('hashchange', route);
  passwort = gespeichert('pruefi-pw') || '';
  let ichGespeichert = null;
  try {
    ichGespeichert = JSON.parse(gespeichert('pruefi-ich'));
  } catch {}
  if (ichGespeichert && passwort) {
    try {
      const spieler = await DB.spielerHolen(ichGespeichert.id);
      if (spieler) return anmelden(spieler);
    } catch (e) {
      fehler(e);
    }
  }
  route();
}

boot();
