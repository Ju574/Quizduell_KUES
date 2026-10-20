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
//   passwortPruefen(pw), fragenKatalog(pw) → [{ id, kategorie }]
//   fragenHolen(pw, ids) → [{ id, kategorie, frage, antworten }]   (max. 20, ohne Lösung)
//   loesungenHolen(pw, ids) → [{ id, richtig, erklaerung }]       (max. 20)

const DB = (() => {
  const cfg = window.PRUEFI_CONFIG || {};
  return cfg.SUPABASE_URL && cfg.SUPABASE_KEY ? supabaseBackend(cfg) : demoBackend();
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
      const [a, b] = await Promise.all([
        alle(() => sb.from('duelle').select().eq('spieler1', spielerId).order('id')),
        alle(() => sb.from('duelle').select().eq('spieler2', spielerId).order('id')),
      ]);
      return a.concat(b).sort((x, y) => y.aktualisiert.localeCompare(x.aktualisiert));
    },
    beendeteDuelle: () => alle(() => sb.from('duelle').select().eq('status', 'beendet').order('id')),
    async lernstandBuchen(spielerId, frageId, richtig) {
      pruefe(await sb.rpc('lernstand_buchen', { p_spieler: spielerId, p_frage_id: frageId, p_richtig: richtig }));
    },
    lernstandVon: (spielerId) => alle(() => sb.from('lernstand').select().eq('spieler', spielerId).order('frage_id')),
    abonniereDuell: (id, callback) => abonniere('duell', [`id=eq.${id}`], callback),
    abonniereSpieler: (spielerId, callback) =>
      abonniere('spieler', [`spieler1=eq.${spielerId}`, `spieler2=eq.${spielerId}`], callback),
    async passwortPruefen(pw) {
      return pruefe(await sb.rpc('passwort_ok', { p_passwort: pw }));
    },
    fragenKatalog: (pw) => alle(() => sb.rpc('fragen_katalog', { p_passwort: pw })),
    async fragenHolen(pw, ids) {
      return pruefe(await sb.rpc('fragen_holen', { p_passwort: pw, p_ids: ids }));
    },
    async loesungenHolen(pw, ids) {
      return pruefe(await sb.rpc('loesungen_holen', { p_passwort: pw, p_ids: ids }));
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
          .duelle.filter((d) => d.spieler1 === spielerId || d.spieler2 === spielerId)
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
      const f = (duell) => (duell.spieler1 === spielerId || duell.spieler2 === spielerId) && callback(duell);
      zuhoerer.add(f);
      return () => zuhoerer.delete(f);
    },
    // Im Demo-Modus kommen die Fragen aus der lokalen fragen.json, Gruppen-Passwort ist „demo“.
    async passwortPruefen(pw) {
      return pw === 'demo';
    },
    async fragenKatalog(pw) {
      return (await demoFragen(pw)).map(({ id, kategorie }) => ({ id, kategorie }));
    },
    async fragenHolen(pw, ids) {
      return (await demoFragen(pw))
        .filter((f) => ids.includes(f.id))
        .map((f) => ({ id: f.id, kategorie: f.kategorie, frage: f.frage, antworten: mischen([f.richtig, ...f.falsch]) }));
    },
    async loesungenHolen(pw, ids) {
      return (await demoFragen(pw))
        .filter((f) => ids.includes(f.id))
        .map((f) => ({ id: f.id, richtig: f.richtig, erklaerung: f.erklaerung || null }));
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

function mischen(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
