'use strict';

// Datenzugriff. Mit Supabase-Zugangsdaten in config.js wird die echte Datenbank genutzt,
// ohne sie ein Demo-Modus, der alles im localStorage dieses Browsers speichert.
//
// Beide Varianten bieten dieselben Funktionen:
//   spielerHolen(id), spielerAnlegen(id, name), spielerListe()
//   duellAnlegen(duell), duellLaden(id), duellAendern(id, version, aenderung) → neues Duell oder null bei Konflikt
//   duelleVon(spielerId), beendeteDuelle()
//   lernstandBuchen(spielerId, frageId, richtig), lernstandVon(spielerId)
//   abonniereDuell(id, callback), abonniereSpieler(spielerId, callback) → Funktion zum Abmelden
//   passwortPruefen(pw), sitzungAnlegen(pw) → Sitzungs-Schlüssel (gilt danach überall statt des Passworts),
//   fragenKatalog(pw) → [{ id, kategorie, rechnung }]
//   fragenHolen(pw, ids) → [{ id, kategorie, frage, typ, antworten, begriffe, bild }]   (max. 20, ohne Lösung)
//   loesungenHolen(pw, ids) → [{ id, richtig, erklaerung, alternativen, bild_nach }]   (max. 20)
//   bildHolen(pw, bildId) → Adresse für <img src> (Gruppen- oder Admin-Passwort)
//   alleDuelle(), adminPruefen(pw), adminSpielerLoeschen(pw, id), adminDuellLoeschen(pw, id),
//   adminLernstandZuruecksetzen(pw, spielerId), adminSitzungenLoeschen(pw) → Anzahl abgemeldeter Geräte
//   frageMelden(pw, frageId, spielerId, grund, kommentar), adminMeldungen(pw), adminMeldungErledigen(pw, id)
//   adminFragen(pw) → alle Fragen inkl. Lösungen, adminFrageMarkieren(pw, id, wert)
//   chatHolen(pw, anzahl) → neueste Nachrichten [{ id, spieler, text, art, reaktionen, erstellt }] aufsteigend,
//   chatUngelesen(pw, nachId, spielerId) → Anzahl, chatSenden(pw, spielerId, text), chatErgebnis(pw, duellId, text),
//   chatReagieren(pw, id, spielerId, emoji), adminChatLoeschen(pw, id),
//   chatAbo(callback) → { anstossen(), ende() } – callback, sobald sich im Chat etwas geändert hat

// Mit ?demo in der Adresse läuft immer der Demo-Modus (zum Testen, ohne die echte Datenbank anzufassen).
const DB = (() => {
  const cfg = window.PRUEFI_CONFIG || {};
  const demoErzwungen = new URLSearchParams(location.search).has('demo');
  return cfg.SUPABASE_URL && cfg.SUPABASE_KEY && !demoErzwungen ? supabaseBackend(cfg) : demoBackend();
})();

function supabaseBackend(cfg) {
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  const pruefe = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  // Supabase liefert max. 1000 Zeilen pro Abfrage – hier wird seitenweise nachgeladen.
  async function alle(abfrage) {
    const seite = 1000;
    let ergebnis = [];
    for (let von = 0; ; von += seite) {
      const daten = pruefe(await abfrage().range(von, von + seite - 1));
      ergebnis = ergebnis.concat(daten);
      if (daten.length < seite) return ergebnis;
    }
  }

  function abonniere(name, filter, callback) {
    let kanal = sb.channel(`${name}-${Math.random().toString(36).slice(2)}`);
    for (const f of filter) {
      kanal = kanal.on('postgres_changes', { event: '*', schema: 'public', table: 'duelle', filter: f }, (p) => {
        if (p.new && p.new.id) callback(p.new);
      });
    }
    kanal.subscribe();
    return () => sb.removeChannel(kanal);
  }

  return {
    modus: 'supabase',
    async spielerHolen(id) {
      return pruefe(await sb.from('spieler').select().eq('id', id).maybeSingle());
    },
    async spielerAnlegen(id, name) {
      return pruefe(await sb.from('spieler').insert({ id, name }).select().single());
    },
    spielerListe: () => alle(() => sb.from('spieler').select().order('name')),
    async duellAnlegen(duell) {
      return pruefe(await sb.from('duelle').insert(duell).select().single());
    },
    async duellLaden(id) {
      return pruefe(await sb.from('duelle').select().eq('id', id).single());
    },
    async duellAendern(id, version, aenderung) {
      const zeilen = pruefe(
        await sb
          .from('duelle')
          .update({ ...aenderung, version: version + 1, aktualisiert: new Date().toISOString() })
          .eq('id', id)
          .eq('version', version)
          .select()
      );
      return zeilen[0] || null;
    },
    async duelleVon(spielerId) {
      const listen = await Promise.all(
        ['spieler1', 'spieler2', 'spieler3'].map((spalte) => alle(() => sb.from('duelle').select().eq(spalte, spielerId).order('id')))
      );
      return listen.flat().sort((x, y) => y.aktualisiert.localeCompare(x.aktualisiert));
    },
    beendeteDuelle: () => alle(() => sb.from('duelle').select().eq('status', 'beendet').order('id')),
    async lernstandBuchen(spielerId, frageId, richtig) {
      pruefe(await sb.rpc('lernstand_buchen', { p_spieler: spielerId, p_frage_id: frageId, p_richtig: richtig }));
    },
    lernstandVon: (spielerId) => alle(() => sb.from('lernstand').select().eq('spieler', spielerId).order('frage_id')),
    abonniereDuell: (id, callback) => abonniere('duell', [`id=eq.${id}`], callback),
    abonniereSpieler: (spielerId, callback) =>
      abonniere('spieler', [`spieler1=eq.${spielerId}`, `spieler2=eq.${spielerId}`, `spieler3=eq.${spielerId}`], callback),
    async passwortPruefen(pw) {
      return pruefe(await sb.rpc('passwort_ok', { p_passwort: pw }));
    },
    async sitzungAnlegen(pw) {
      return pruefe(await sb.rpc('sitzung_anlegen', { p_passwort: pw }));
    },
    fragenKatalog: (pw) => alle(() => sb.rpc('fragen_katalog', { p_passwort: pw })),
    async fragenHolen(pw, ids) {
      return pruefe(await sb.rpc('fragen_holen', { p_passwort: pw, p_ids: ids }));
    },
    async loesungenHolen(pw, ids) {
      return pruefe(await sb.rpc('loesungen_holen', { p_passwort: pw, p_ids: ids }));
    },
    async bildHolen(pw, bildId) {
      const [b] = pruefe(await sb.rpc('bild_holen', { p_passwort: pw, p_id: bildId }));
      if (!b) throw new Error('Bild fehlt: ' + bildId);
      return `data:${b.mime};base64,${b.daten}`;
    },
    // Wer gerade online ist (Supabase Realtime Presence, ohne Tabelle) – callback(Set der Spieler-IDs)
    anwesenheit(spielerId, callback) {
      const kanal = sb.channel('online', { config: { presence: { key: spielerId } } });
      kanal.on('presence', { event: 'sync' }, () => callback(new Set(Object.keys(kanal.presenceState()))));
      kanal.subscribe((status) => {
        if (status === 'SUBSCRIBED') kanal.track({ seit: Date.now() });
      });
      return () => sb.removeChannel(kanal);
    },
    alleDuelle: () => alle(() => sb.from('duelle').select().order('aktualisiert', { ascending: false })),
    async adminPruefen(pw) {
      return pruefe(await sb.rpc('admin_ok', { p_passwort: pw }));
    },
    async adminSpielerLoeschen(pw, id) {
      pruefe(await sb.rpc('admin_spieler_loeschen', { p_passwort: pw, p_spieler: id }));
    },
    async adminDuellLoeschen(pw, id) {
      pruefe(await sb.rpc('admin_duell_loeschen', { p_passwort: pw, p_duell: id }));
    },
    async adminLernstandZuruecksetzen(pw, id) {
      pruefe(await sb.rpc('admin_lernstand_zuruecksetzen', { p_passwort: pw, p_spieler: id }));
    },
    async adminSitzungenLoeschen(pw) {
      return pruefe(await sb.rpc('admin_sitzungen_loeschen', { p_passwort: pw }));
    },
    async frageMelden(pw, frageId, spielerId, grund, kommentar) {
      pruefe(await sb.rpc('frage_melden', { p_passwort: pw, p_frage_id: frageId, p_spieler: spielerId, p_grund: grund, p_kommentar: kommentar }));
    },
    async adminMeldungen(pw) {
      return pruefe(await sb.rpc('admin_meldungen', { p_passwort: pw }));
    },
    async adminMeldungErledigen(pw, id) {
      pruefe(await sb.rpc('admin_meldung_erledigen', { p_passwort: pw, p_id: id }));
    },
    adminFragen: (pw) => alle(() => sb.rpc('admin_fragen', { p_passwort: pw })),
    async adminFrageMarkieren(pw, id, wert) {
      pruefe(await sb.rpc('admin_frage_markieren', { p_passwort: pw, p_id: id, p_wert: wert }));
    },
    async chatHolen(pw, anzahl) {
      return pruefe(await sb.rpc('chat_holen', { p_passwort: pw, p_anzahl: anzahl }));
    },
    async chatUngelesen(pw, nachId, spielerId) {
      return pruefe(await sb.rpc('chat_ungelesen', { p_passwort: pw, p_nach: nachId, p_spieler: spielerId }));
    },
    async chatSenden(pw, spielerId, text) {
      pruefe(await sb.rpc('chat_senden', { p_passwort: pw, p_spieler: spielerId, p_text: text }));
    },
    async chatErgebnis(pw, duellId, text) {
      pruefe(await sb.rpc('chat_ergebnis', { p_passwort: pw, p_duell: duellId, p_text: text }));
    },
    async chatReagieren(pw, id, spielerId, emoji) {
      pruefe(await sb.rpc('chat_reagieren', { p_passwort: pw, p_id: id, p_spieler: spielerId, p_emoji: emoji }));
    },
    async adminChatLoeschen(pw, id) {
      pruefe(await sb.rpc('admin_chat_loeschen', { p_passwort: pw, p_id: id }));
    },
    // Broadcast ohne Inhalt – die Nachrichten selbst gibt es nur mit Gruppen-Passwort über chat_holen
    chatAbo(callback) {
      const kanal = sb.channel('chat', { config: { broadcast: { self: false } } });
      kanal.on('broadcast', { event: 'neu' }, () => callback());
      kanal.subscribe();
      return {
        anstossen: () => kanal.send({ type: 'broadcast', event: 'neu', payload: {} }),
        ende: () => sb.removeChannel(kanal),
      };
    },
  };
}

function demoBackend() {
  const KEY = 'pruefi-duell-demo';
  const leer = () => ({ spieler: [], duelle: [], lernstand: [], geaendert: null });
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  const jetzt = () => new Date().toISOString();
  const neueId = () =>
    window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

  function lesen() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || leer();
    } catch {
      return leer();
    }
  }

  const zuhoerer = new Set();
  const melden = (duell) => zuhoerer.forEach((f) => f(kopie(duell)));

  function schreiben(db, geaendertesDuell) {
    db.geaendert = geaendertesDuell ? { id: geaendertesDuell.id, t: Date.now() } : null;
    localStorage.setItem(KEY, JSON.stringify(db));
    if (geaendertesDuell) setTimeout(() => melden(geaendertesDuell));
  }

  // Änderungen aus anderen Tabs (zum Testen: zwei Tabs = zwei Spieler)
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    const db = JSON.parse(e.newValue);
    const duell = db.geaendert && db.duelle.find((d) => d.id === db.geaendert.id);
    if (duell) melden(duell);
  });

  return {
    modus: 'demo',
    async spielerHolen(id) {
      return kopie(lesen().spieler.find((s) => s.id === id) || null);
    },
    async spielerAnlegen(id, name) {
      const db = lesen();
      if (db.spieler.some((s) => s.id === id)) throw new Error('Dieser Name ist schon vergeben.');
      const spieler = { id, name, erstellt: jetzt() };
      db.spieler.push(spieler);
      schreiben(db);
      return kopie(spieler);
    },
    async spielerListe() {
      return kopie(lesen().spieler).sort((a, b) => a.name.localeCompare(b.name));
    },
    async duellAnlegen(duell) {
      const db = lesen();
      const zeile = { ...kopie(duell), id: neueId(), version: 0, erstellt: jetzt(), aktualisiert: jetzt() };
      db.duelle.push(zeile);
      schreiben(db, zeile);
      return kopie(zeile);
    },
    async duellLaden(id) {
      const duell = lesen().duelle.find((d) => d.id === id);
      if (!duell) throw new Error('Duell nicht gefunden.');
      return kopie(duell);
    },
    async duellAendern(id, version, aenderung) {
      const db = lesen();
      const duell = db.duelle.find((d) => d.id === id);
      if (!duell || duell.version !== version) return null;
      Object.assign(duell, kopie(aenderung), { version: version + 1, aktualisiert: jetzt() });
      schreiben(db, duell);
      return kopie(duell);
    },
    async duelleVon(spielerId) {
      return kopie(
        lesen()
          .duelle.filter((d) => [d.spieler1, d.spieler2, d.spieler3].includes(spielerId))
          .sort((a, b) => b.aktualisiert.localeCompare(a.aktualisiert))
      );
    },
    async beendeteDuelle() {
      return kopie(lesen().duelle.filter((d) => d.status === 'beendet'));
    },
    async lernstandBuchen(spielerId, frageId, richtig) {
      const db = lesen();
      let eintrag = db.lernstand.find((l) => l.spieler === spielerId && l.frage_id === frageId);
      if (!eintrag) {
        eintrag = { spieler: spielerId, frage_id: frageId, richtig: 0, falsch: 0, serie: 0 };
        db.lernstand.push(eintrag);
      }
      if (richtig) eintrag.richtig++;
      else eintrag.falsch++;
      eintrag.serie = richtig ? eintrag.serie + 1 : 0;
      eintrag.zuletzt = jetzt();
      schreiben(db);
    },
    async lernstandVon(spielerId) {
      return kopie(lesen().lernstand.filter((l) => l.spieler === spielerId));
    },
    abonniereDuell(id, callback) {
      const f = (duell) => duell.id === id && callback(duell);
      zuhoerer.add(f);
      return () => zuhoerer.delete(f);
    },
    abonniereSpieler(spielerId, callback) {
      const f = (duell) => [duell.spieler1, duell.spieler2, duell.spieler3].includes(spielerId) && callback(duell);
      zuhoerer.add(f);
      return () => zuhoerer.delete(f);
    },
    // Im Demo-Modus kommen die Fragen aus der lokalen fragen.json, Gruppen-Passwort ist „demo“.
    async passwortPruefen(pw) {
      return pw === 'demo';
    },
    // Im Demo-Modus ist der „Schlüssel“ einfach wieder das Demo-Passwort
    async sitzungAnlegen(pw) {
      if (pw !== 'demo') throw new Error('Falsches Gruppen-Passwort');
      return 'demo';
    },
    async fragenKatalog(pw) {
      return (await demoFragen(pw)).map(({ id, kategorie, rechnung }) => ({ id, kategorie, rechnung: !!rechnung }));
    },
    async fragenHolen(pw, ids) {
      return (await demoFragen(pw))
        .filter((f) => ids.includes(f.id))
        .map((f) => ({
          id: f.id,
          kategorie: f.kategorie,
          frage: f.frage,
          typ: f.typ || 'auswahl',
          antworten: f.typ === 'eingabe' ? [] : f.typ === 'beschriften' ? beschriftungNummern(f.richtig) : mischen([f.richtig, ...f.falsch]),
          begriffe: f.typ === 'beschriften' ? mischen(beschriftungBegriffe(f.richtig)) : null,
          bild: f.bild || null,
        }));
    },
    async loesungenHolen(pw, ids) {
      return (await demoFragen(pw))
        .filter((f) => ids.includes(f.id))
        .map((f) => ({ id: f.id, richtig: f.richtig, erklaerung: f.erklaerung || null, alternativen: f.alternativen || [], bild_nach: f.bild_nach || null }));
    },
    // Bilder liegen im Demo-Modus lokal in quellen/bilder/
    async bildHolen(pw, bildId) {
      if (pw !== 'demo' && pw !== 'admin') throw new Error('Falsches Passwort');
      return 'quellen/bilder/' + encodeURIComponent(bildId);
    },
    // Online-Anzeige im Demo-Modus: jeder Tab meldet sich alle 5 s im localStorage
    anwesenheit(spielerId, callback) {
      const SCHLUESSEL = 'pruefi-duell-demo-online';
      const melden = () => {
        let liste = {};
        try { liste = JSON.parse(localStorage.getItem(SCHLUESSEL)) || {}; } catch {}
        liste[spielerId] = Date.now();
        localStorage.setItem(SCHLUESSEL, JSON.stringify(liste));
        pruefen();
      };
      const pruefen = () => {
        let liste = {};
        try { liste = JSON.parse(localStorage.getItem(SCHLUESSEL)) || {}; } catch {}
        callback(new Set(Object.keys(liste).filter((id) => Date.now() - liste[id] < 12000)));
      };
      const beiAenderung = (e) => e.key === SCHLUESSEL && pruefen();
      window.addEventListener('storage', beiAenderung);
      const takt = setInterval(melden, 5000);
      melden();
      return () => {
        clearInterval(takt);
        window.removeEventListener('storage', beiAenderung);
      };
    },
    // Admin-Passwort im Demo-Modus: „admin“
    async alleDuelle() {
      return kopie(lesen().duelle).sort((a, b) => b.aktualisiert.localeCompare(a.aktualisiert));
    },
    async adminPruefen(pw) {
      return pw === 'admin';
    },
    async adminSpielerLoeschen(pw, id) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      const db = lesen();
      db.duelle = db.duelle.filter((d) => ![d.spieler1, d.spieler2, d.spieler3].includes(id));
      db.lernstand = db.lernstand.filter((l) => l.spieler !== id);
      db.spieler = db.spieler.filter((s) => s.id !== id);
      schreiben(db);
    },
    async adminDuellLoeschen(pw, id) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      const db = lesen();
      db.duelle = db.duelle.filter((d) => d.id !== id);
      schreiben(db);
    },
    async adminSitzungenLoeschen(pw) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      return 0;
    },
    async adminLernstandZuruecksetzen(pw, id) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      const db = lesen();
      db.lernstand = db.lernstand.filter((l) => l.spieler !== id);
      schreiben(db);
    },
    async frageMelden(pw, frageId, spielerId, grund, kommentar) {
      if (pw !== 'demo') throw new Error('Falsches Gruppen-Passwort');
      const db = lesen();
      db.meldungen = db.meldungen || [];
      db.meldungen.push({ id: Date.now(), frage_id: frageId, spieler: spielerId, grund, kommentar: kommentar || null, erstellt: jetzt(), erledigt: false });
      schreiben(db);
    },
    async adminMeldungen(pw) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      const fragen = await demoFragen('demo');
      return kopie(lesen().meldungen || [])
        .map((m) => {
          const f = fragen.find((x) => x.id === m.frage_id) || {};
          return { ...m, kategorie: f.kategorie, frage: f.frage, richtig: f.richtig };
        })
        .sort((a, b) => a.erledigt - b.erledigt || b.erstellt.localeCompare(a.erstellt));
    },
    async adminMeldungErledigen(pw, id) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      const db = lesen();
      const m = (db.meldungen || []).find((x) => x.id === id);
      if (m) m.erledigt = true;
      schreiben(db);
    },
    async adminFragen(pw) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      const markiert = lesen().markiert || [];
      return kopie(await demoFragen('demo')).map((f) => ({ typ: 'auswahl', alternativen: [], ...f, zum_entfernen: markiert.includes(f.id) }));
    },
    async adminFrageMarkieren(pw, id, wert) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      const db = lesen();
      db.markiert = (db.markiert || []).filter((x) => x !== id).concat(wert ? [id] : []);
      schreiben(db);
    },
    async chatHolen(pw, anzahl) {
      if (pw !== 'demo') throw new Error('Falsches Gruppen-Passwort');
      return kopie((lesen().chat || []).slice(-anzahl));
    },
    async chatUngelesen(pw, nachId, spielerId) {
      if (pw !== 'demo') throw new Error('Falsches Gruppen-Passwort');
      return (lesen().chat || []).filter((n) => n.id > (nachId || 0) && n.spieler !== spielerId).length;
    },
    async chatSenden(pw, spielerId, text) {
      if (pw !== 'demo') throw new Error('Falsches Gruppen-Passwort');
      const db = lesen();
      db.chat = db.chat || [];
      db.chat.push({ id: (db.chat.at(-1)?.id || 0) + 1, spieler: spielerId, text: text.trim().slice(0, 500), art: 'text', duell: null, reaktionen: {}, erstellt: jetzt() });
      schreiben(db);
    },
    async chatErgebnis(pw, duellId, text) {
      if (pw !== 'demo') throw new Error('Falsches Gruppen-Passwort');
      const db = lesen();
      db.chat = db.chat || [];
      if (db.chat.some((n) => n.duell === duellId)) return;
      db.chat.push({ id: (db.chat.at(-1)?.id || 0) + 1, spieler: null, text: text.slice(0, 500), art: 'ergebnis', duell: duellId, reaktionen: {}, erstellt: jetzt() });
      schreiben(db);
    },
    async chatReagieren(pw, id, spielerId, emoji) {
      if (pw !== 'demo') throw new Error('Falsches Gruppen-Passwort');
      const db = lesen();
      const n = (db.chat || []).find((x) => x.id === id);
      if (!n) return;
      const liste = n.reaktionen[emoji] || [];
      n.reaktionen[emoji] = liste.includes(spielerId) ? liste.filter((x) => x !== spielerId) : [...liste, spielerId];
      schreiben(db);
    },
    async adminChatLoeschen(pw, id) {
      if (pw !== 'admin') throw new Error('Falsches Admin-Passwort');
      const db = lesen();
      db.chat = (db.chat || []).filter((x) => x.id !== id);
      schreiben(db);
    },
    // Andere Tabs (= andere Spieler im Demo-Modus) bekommen Änderungen über das storage-Ereignis mit
    chatAbo(callback) {
      let letzter = JSON.stringify(lesen().chat || []);
      const beiAenderung = (e) => {
        if (e.key !== KEY) return;
        const stand = JSON.stringify(lesen().chat || []);
        if (stand !== letzter) {
          letzter = stand;
          callback();
        }
      };
      window.addEventListener('storage', beiAenderung);
      return { anstossen: () => {}, ende: () => window.removeEventListener('storage', beiAenderung) };
    },
  };
}

let demoFragenCache = null;
async function demoFragen(pw) {
  if (pw !== 'demo') throw new Error('Falsches Gruppen-Passwort');
  if (!demoFragenCache) {
    const antwort = await fetch('fragen.json');
    if (!antwort.ok) throw new Error('fragen.json fehlt – die wird nur für den Demo-Modus gebraucht.');
    demoFragenCache = await antwort.json();
  }
  return demoFragenCache;
}

// „1: Heizelement⏎2: …“ → ['1', '2', …] (wie fragen_holen in der Datenbank)
const beschriftungNummern = (richtig) =>
  String(richtig).split('\n').filter((z) => z.includes(':')).map((z) => z.split(':')[0].trim());

// … → ['Heizelement', …] (Begriffe, werden gemischt angezeigt)
const beschriftungBegriffe = (richtig) =>
  String(richtig).split('\n').filter((z) => z.includes(':')).map((z) => z.slice(z.indexOf(':') + 1).trim());

function mischen(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
