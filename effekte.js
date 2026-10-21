'use strict';

// Soundeffekte und Finisher-Animationen. Wird vor app.js geladen und hängt nicht von app.js ab.

// ===== Soundeffekte =====
// Alle Töne werden im Browser erzeugt (Web Audio) – keine Audiodateien. Arcade-Stil passend zu den Animationen.
// Browser spielen Ton erst nach der ersten Berührung der Seite; bis dahin bleibt es still.
const Ton = (() => {
  const SCHLUESSEL = 'pruefi-ton';
  let an = true;
  try {
    an = localStorage.getItem(SCHLUESSEL) !== 'aus';
  } catch {}
  let ctx = null;
  let master = null;
  let rauschPuffer = null;

  function freischalten() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  for (const ereignis of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(ereignis, freischalten, { capture: true, passive: true });
  }

  // Oszillator mit kurzer Hüllkurve; bis = Zielfrequenz für einen Frequenzverlauf
  function ton(frequenz, start, dauer, { typ = 'sine', laut = 0.2, bis = null, anschlag = 0.01 } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = typ;
    o.frequency.setValueAtTime(frequenz, start);
    if (bis) o.frequency.exponentialRampToValueAtTime(bis, start + dauer);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(laut, start + anschlag);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dauer);
    o.connect(g).connect(master);
    o.start(start);
    o.stop(start + dauer + 0.05);
    return o;
  }

  // Gefiltertes Rauschen (Whoosh, Explosion, Papier …)
  function rauschen(start, dauer, { laut = 0.3, filter = 'lowpass', von = 2000, bis = 200, q = 1 } = {}) {
    if (!rauschPuffer) {
      rauschPuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = rauschPuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = rauschPuffer;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(von, start);
    f.frequency.exponentialRampToValueAtTime(bis, start + dauer);
    const g = ctx.createGain();
    g.gain.setValueAtTime(laut, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dauer);
    s.connect(f).connect(g).connect(master);
    s.start(start);
    s.stop(start + dauer + 0.05);
  }

  const SOUNDS = {
    whoosh: (t) => rauschen(t, 0.45, { filter: 'bandpass', von: 300, bis: 3000, q: 1.5, laut: 0.6 }),
    gong: (t) => {
      [110, 220, 331, 440].forEach((f, i) => ton(f, t, 1.6 - i * 0.25, { laut: 0.28 / (i + 1), anschlag: 0.005 }));
      rauschen(t, 0.15, { laut: 0.3, von: 4000, bis: 500 });
    },
    piep: (t) => ton(880, t, 0.12, { typ: 'square', laut: 0.12 }),
    los: (t) => ton(1320, t, 0.3, { typ: 'square', laut: 0.14 }),
    richtig: (t) => {
      ton(784, t, 0.12, { typ: 'triangle', laut: 0.25 });
      ton(1175, t + 0.09, 0.25, { typ: 'triangle', laut: 0.25 });
    },
    falsch: (t) => {
      ton(150, t, 0.35, { typ: 'sawtooth', laut: 0.13 });
      ton(143, t, 0.35, { typ: 'sawtooth', laut: 0.13 });
    },
    serie: (t) => {
      rauschen(t, 0.6, { von: 400, bis: 3500, laut: 0.35 });
      ton(440, t, 0.4, { typ: 'triangle', bis: 880, laut: 0.1 });
    },
    laden: (t) => ton(150, t, 1.0, { typ: 'sawtooth', bis: 1400, laut: 0.12, anschlag: 0.3 }),
    laser: (t) => ton(1600, t, 0.35, { typ: 'square', bis: 120, laut: 0.18 }),
    ladenLang: (t, lang = 4.0) => {
      ton(110, t, lang, { typ: 'sawtooth', bis: 900, laut: 0.07, anschlag: 0.6 });
      ton(220, t, lang, { bis: 1800, laut: 0.04, anschlag: 0.6 });
    },
    lockon: (t) => {
      for (let k = 0; k < 4; k++) ton(1200, t + k * 0.12, 0.06, { typ: 'square', laut: 0.1 });
      ton(1600, t + 0.5, 0.35, { typ: 'square', laut: 0.12 });
    },
    nachhall: (t) => {
      rauschen(t, 2.5, { von: 400, bis: 40, laut: 0.5 });
      ton(45, t, 2.5, { bis: 25, laut: 0.4, anschlag: 0.05 });
    },
    rolltor: (t) => {
      for (let k = 0; k < 14; k++) rauschen(t + k * 0.05, 0.04, { filter: 'bandpass', von: 900, bis: 700, q: 3, laut: 0.25 });
    },
    hydraulik: (t, lang = 0.8) => ton(70, t, lang, { typ: 'sawtooth', bis: 110, laut: 0.12, anschlag: 0.1 }),
    scheppern: (t) => {
      for (let k = 0; k < 4; k++) ton(600 + Math.random() * 900, t + k * 0.06, 0.18, { typ: 'square', laut: 0.08 });
      rauschen(t, 0.3, { filter: 'highpass', von: 2000, bis: 5000, laut: 0.35 });
    },
    klack: (t) => {
      rauschen(t, 0.05, { filter: 'highpass', von: 3000, bis: 4000, laut: 0.5 });
      ton(700, t, 0.06, { typ: 'square', laut: 0.12 });
    },
    hyperraum: (t) => {
      ton(200, t, 0.6, { typ: 'sawtooth', bis: 3000, laut: 0.1 });
      rauschen(t, 0.6, { filter: 'bandpass', von: 500, bis: 6000, q: 1.2, laut: 0.4 });
    },
    explosion: (t) => {
      rauschen(t, 1.4, { von: 3000, bis: 60, laut: 0.9 });
      ton(90, t, 0.8, { bis: 30, laut: 0.6, anschlag: 0.005 });
    },
    stempel: (t) => {
      ton(120, t, 0.35, { bis: 50, laut: 0.7, anschlag: 0.003 });
      rauschen(t, 0.12, { von: 5000, bis: 800, laut: 0.5 });
    },
    pling: (t) => [1568, 2093, 2637].forEach((f, i) => ton(f, t + i * 0.07, 0.4, { laut: 0.15 })),
    blitz: (t) => {
      rauschen(t, 0.08, { filter: 'highpass', von: 3000, bis: 6000, laut: 0.6 });
      ton(2400, t + 0.05, 0.3, { bis: 1800, laut: 0.08 });
    },
    papier: (t) => rauschen(t, 0.5, { filter: 'bandpass', von: 1500, bis: 4000, q: 0.8, laut: 0.25 }),
    hupe: (t) => {
      for (const d of [0, 0.35]) {
        ton(392, t + d, 0.28, { typ: 'square', laut: 0.1 });
        ton(494, t + d, 0.28, { typ: 'square', laut: 0.1 });
      }
    },
    stottern: (t) => {
      for (let k = 0; k < 16; k++) ton(55 + Math.random() * 25, t + k * 0.13 + Math.random() * 0.03, 0.09, { typ: 'sawtooth', laut: 0.18 });
    },
    knall: (t) => {
      rauschen(t, 0.35, { von: 4000, bis: 300, laut: 0.8 });
      ton(200, t, 0.2, { typ: 'square', bis: 60, laut: 0.3 });
    },
    fanfare: (t) => {
      [523, 659, 784, 1047].forEach((f, i) => ton(f, t + i * 0.12, 0.25, { typ: 'square', laut: 0.1 }));
      [523, 659, 784, 1047].forEach((f) => ton(f, t + 0.5, 0.9, { typ: 'triangle', laut: 0.12 }));
    },
    wahwah: (t) => {
      [392, 370, 349, 330].forEach((f, i) => {
        const lang = i === 3;
        const o = ton(f, t + i * 0.38, lang ? 1.1 : 0.36, { typ: 'sawtooth', laut: 0.1, anschlag: 0.04 });
        if (lang) {
          const lfo = ctx.createOscillator();
          const tiefe = ctx.createGain();
          lfo.frequency.value = 6;
          tiefe.gain.value = 8;
          lfo.connect(tiefe).connect(o.frequency);
          lfo.start(t + i * 0.38);
          lfo.stop(t + i * 0.38 + 1.1);
        }
      });
    },
  };

  // Für den Admin-Bereich „Effekte testen“
  const LISTE = [
    ['whoosh', 'Whoosh (VS)'], ['gong', 'Gong (VS)'], ['piep', 'Countdown-Piep'], ['los', 'Los!'], ['richtig', 'Richtig'], ['falsch', 'Falsch'],
    ['serie', 'Serien-Flamme'], ['laden', 'Laser laden'], ['ladenLang', 'Laser laden (lang)'], ['lockon', 'Ziel erfasst'], ['laser', 'Laser'], ['nachhall', 'Nachhall'], ['hyperraum', 'Hyperraum'], ['rolltor', 'Rolltor'], ['hydraulik', 'Hebebühne'], ['scheppern', 'Scheppern'], ['klack', 'Klack'], ['explosion', 'Explosion'], ['stempel', 'Stempel'], ['pling', 'Plakette'],
    ['blitz', 'Blitzer'], ['papier', 'Papier'], ['hupe', 'Hupe'], ['stottern', 'Motor stottert'], ['knall', 'Knall'], ['fanfare', 'Sieger-Fanfare'],
    ['wahwah', 'Verlierer-Wah-wah'],
  ];

  return {
    liste: LISTE,
    get an() {
      return an;
    },
    umschalten() {
      an = !an;
      try {
        localStorage.setItem(SCHLUESSEL, an ? 'an' : 'aus');
      } catch {}
      if (an) freischalten();
      return an;
    },
    // name: Schlüssel aus SOUNDS, verzoegerung in Sekunden, lang: Länge für Töne mit einstellbarer Dauer
    spiel(name, verzoegerung = 0, lang) {
      if (!an || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
      try {
        SOUNDS[name](ctx.currentTime + 0.01 + verzoegerung, lang);
      } catch (e) {
        console.error(e);
      }
    },
    vibrieren(muster) {
      if (an && navigator.vibrate) {
        try {
          navigator.vibrate(muster);
        } catch {}
      }
    },
  };
})();

// ===== Finisher am Duell-Ende =====
// Zufällig aus fünf Animationen (pro Duell fest, alle Spieler sehen dieselbe), bei Gleichstand „Doppel-K.O.“.
// Alles wird auf ein Canvas gezeichnet – keine Bilddateien. Antippen überspringt bzw. schließt.
const Finisher = (() => {
  // Ältere Browser (z. B. iOS < 16) kennen roundRect noch nicht – dann eben eckig
  if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, b, h) {
      this.rect(x, y, b, h);
    };
  }
  // Vorerst nur die fertigen Mini-Filme; blitzer, abschlepp, motor kommen später wieder dazu
  const ARTEN = ['orbital', 'hu'];
  const wenigBewegung = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anteil = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const sanft = (x) => x * x * (3 - 2 * x);
  const raus = (x) => 1 - (1 - x) * (1 - x);
  const kurz = (name) => (name.length > 14 ? name.slice(0, 13) + '…' : name);
  const SCHRIFT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function streuung(seed) {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h;
  }

  // ---------- Zeichenhelfer ----------
  function namensschild(c, text, x, y, { farbe = '#111827', hinter = 'rgba(255,255,255,0.92)', groesse = 16 } = {}) {
    c.save();
    c.font = `800 ${groesse}px ${SCHRIFT}`;
    const b = c.measureText(text).width + 16;
    const h = groesse + 10;
    c.fillStyle = hinter;
    c.beginPath();
    c.roundRect(x - b / 2, y - h / 2, b, h, 8);
    c.fill();
    c.fillStyle = farbe;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x, y + 1);
    c.restore();
  }

  // Auto, Unterkante Mitte bei (x, y), Breite s, nach rechts fahrend
  function auto(c, x, y, s, farbe, winkel = 0) {
    c.save();
    c.translate(x, y);
    c.rotate(winkel);
    const h = s * 0.32;
    c.fillStyle = farbe;
    c.beginPath();
    c.roundRect(-s / 2, -h - s * 0.06, s, h, s * 0.07);
    c.fill();
    c.beginPath();
    c.moveTo(-s * 0.28, -h - s * 0.06);
    c.lineTo(-s * 0.16, -h - s * 0.26);
    c.lineTo(s * 0.16, -h - s * 0.26);
    c.lineTo(s * 0.3, -h - s * 0.06);
    c.fill();
    c.fillStyle = 'rgba(191,219,254,0.95)';
    c.beginPath();
    c.moveTo(-s * 0.23, -h - s * 0.08);
    c.lineTo(-s * 0.14, -h - s * 0.22);
    c.lineTo(-s * 0.01, -h - s * 0.22);
    c.lineTo(-s * 0.01, -h - s * 0.08);
    c.fill();
    c.beginPath();
    c.moveTo(s * 0.02, -h - s * 0.08);
    c.lineTo(s * 0.02, -h - s * 0.22);
    c.lineTo(s * 0.14, -h - s * 0.22);
    c.lineTo(s * 0.25, -h - s * 0.08);
    c.fill();
    c.fillStyle = '#fde68a';
    c.fillRect(s * 0.44, -h * 0.75, s * 0.06, h * 0.25);
    for (const rx of [-s * 0.3, s * 0.3]) {
      c.fillStyle = '#111827';
      c.beginPath();
      c.arc(rx, -s * 0.06, s * 0.1, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#9ca3af';
      c.beginPath();
      c.arc(rx, -s * 0.06, s * 0.045, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function sterne(c, w, h, liste, t) {
    c.fillStyle = '#050816';
    c.fillRect(0, 0, w, h);
    for (const s of liste) {
      c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + s.p);
      c.fillStyle = '#fff';
      c.fillRect(s.x * w, s.y * h, s.r, s.r);
    }
    c.globalAlpha = 1;
  }

  function ufo(c, x, y, s, t) {
    c.save();
    c.translate(x, y + Math.sin(t * 4) * s * 0.05);
    c.fillStyle = 'rgba(125,211,252,0.85)';
    c.beginPath();
    c.ellipse(0, -s * 0.12, s * 0.22, s * 0.2, 0, Math.PI, 0);
    c.fill();
    c.fillStyle = '#94a3b8';
    c.beginPath();
    c.ellipse(0, 0, s * 0.5, s * 0.14, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#475569';
    c.beginPath();
    c.ellipse(0, s * 0.04, s * 0.5, s * 0.08, 0, 0, Math.PI);
    c.fill();
    for (let i = -2; i <= 2; i++) {
      c.fillStyle = (Math.floor(t * 6) + i) % 2 ? '#fde047' : '#f97316';
      c.beginPath();
      c.arc(i * s * 0.17, s * 0.02, s * 0.035, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function explosion(c, teile, alter, x, y) {
    for (const p of teile) {
      const a = Math.max(0, 1 - alter / p.leben);
      if (a <= 0) continue;
      c.globalAlpha = a;
      c.fillStyle = p.farbe;
      c.beginPath();
      c.arc(x + p.vx * alter, y + p.vy * alter + 120 * alter * alter * p.schwer, p.r * (1 + alter), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function teileErzeugen(n, tempo, farben) {
    return Array.from({ length: n }, () => {
      const w = Math.random() * Math.PI * 2;
      const v = tempo * (0.3 + Math.random());
      return { vx: Math.cos(w) * v, vy: Math.sin(w) * v, r: 2 + Math.random() * 5, leben: 0.6 + Math.random() * 1.2, schwer: Math.random(), farbe: farben[Math.floor(Math.random() * farben.length)] };
    });
  }

  // Kurzer Blitz ab Zeitpunkt start, klingt in dauer Sekunden ab (vorher nichts)
  function blitzlicht(c, w, h, t, start, dauer, farbe = '#fff', stark = 1) {
    const alpha = stark * (1 - (t - start) / dauer);
    if (t < start || !(alpha > 0.001)) return; // negative Werte ignoriert der Browser (= voll deckend)
    c.globalAlpha = Math.min(1, alpha);
    c.fillStyle = farbe;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }

  // ---------- Film-Werkzeuge (für die Mini-Filme) ----------
  const UEBERGANG = { linear: (x) => x, sanft, raus, rein: (x) => x * x };
  const zw = (a, b, x) => a + (b - a) * x;

  // Kamerafahrt aus Abschnitten [von, bis, [x, y, k], [x, y, k], übergang?]. Ein neuer Abschnitt, der woanders
  // anfängt als der vorige aufgehört hat, wirkt wie ein harter Schnitt.
  function kamerafahrt(abschnitte) {
    return (t) => {
      let a = abschnitte[0];
      for (const s of abschnitte) if (t >= s[0]) a = s;
      const x = UEBERGANG[a[4] || 'sanft'](anteil(t, a[0], a[1]));
      return { x: zw(a[2][0], a[3][0], x), y: zw(a[2][1], a[3][1], x), k: zw(a[2][2], a[3][2], x) };
    };
  }

  // Welt zeichnen: Kamera (x, y, k) bezogen auf den Grundzoom b; gibt die Umrechnung Welt → Bildschirm zurück
  function inWelt(c, w, h, kam, b, zeichnen) {
    const z = kam.k * b;
    c.save();
    c.translate(w / 2, h / 2);
    c.scale(z, z);
    c.translate(-kam.x, -kam.y);
    zeichnen(z);
    c.restore();
    return (x, y) => [w / 2 + (x - kam.x) * z, h / 2 + (y - kam.y) * z];
  }
  const grundzoom = (w, h) => Math.min(w, h * 0.8) / 600;

  function kinobalken(c, w, h, t, dauer) {
    const hoehe = h * 0.1 * (t < dauer ? Math.min(1, t / 0.3) : 1 - anteil(t, dauer, dauer + 0.5));
    if (hoehe > 0) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, w, hoehe);
      c.fillRect(0, h - hoehe, w, hoehe);
    }
  }

  function untertitel(c, w, h, t, text, von, bis, farbe = '#fde047') {
    if (t < von || t > bis) return;
    c.save();
    c.globalAlpha = Math.min(anteil(t, von, von + 0.25), 1 - anteil(t, bis - 0.25, bis));
    let groesse = Math.round(Math.min(20, w / 18));
    c.font = `800 ${groesse}px ${SCHRIFT}`;
    while (groesse > 10 && c.measureText(text).width > w - 36) {
      groesse--;
      c.font = `800 ${groesse}px ${SCHRIFT}`;
    }
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.shadowColor = '#000';
    c.shadowBlur = 6;
    c.fillStyle = farbe;
    c.fillText(text, 18, h - h * 0.1 - 22);
    c.restore();
  }

  // Figur (Weltmaß ca. 60 hoch), Füße bei (x, y); gesicht = Emoji
  function figur(c, x, y, farbe, gesicht, { dreh = 0, gross = 1, laufen = 0, tuete = false } = {}) {
    c.save();
    c.translate(x, y);
    c.rotate(dreh);
    c.scale(gross, gross);
    const bein = Math.sin(laufen * 18) * 6 * (laufen ? 1 : 0);
    c.fillStyle = '#1f2937';
    c.fillRect(-9 + bein, -6, 7, 8);
    c.fillRect(2 - bein, -6, 7, 8);
    c.fillStyle = farbe;
    c.beginPath();
    c.roundRect(-11, -34, 22, 30, 7);
    c.fill();
    if (tuete) {
      c.fillStyle = '#d6a36a';
      c.fillRect(10, -26, 14, 18);
      c.fillStyle = '#22c55e';
      c.beginPath();
      c.arc(15, -27, 4, 0, Math.PI * 2);
      c.fill();
    }
    c.font = `26px ${SCHRIFT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(gesicht, 0, -46);
    c.restore();
  }

  // Rauch: Liste von Wölkchen { start, dx, r } – alter in Sekunden ab start
  function rauch(c, wolken, t, x, y, { farbe = '#6b7280', steigen = 120, dichte = 0.5, leben = 2 } = {}) {
    for (const p of wolken) {
      const alter = t - p.start;
      if (alter < 0 || alter > leben) continue;
      c.globalAlpha = dichte * (1 - alter / leben);
      c.fillStyle = farbe;
      c.beginPath();
      c.arc(x + p.dx * (0.3 + alter), y - alter * steigen, p.r * (1 + alter * 0.8), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }
  const wolkenListe = (n, von, abstand) => Array.from({ length: n }, (_, i) => ({ start: von + i * abstand, dx: (Math.random() - 0.5) * 60, r: 10 + Math.random() * 14 }));

  // Text in Weltkoordinaten (z. B. Schilder an der Wand)
  function schild(c, text, x, y, { groesse = 28, farbe = '#fff', hinter = '#1e3a8a', rand = null } = {}) {
    c.save();
    c.font = `900 ${groesse}px ${SCHRIFT}`;
    const b = c.measureText(text).width + groesse;
    c.fillStyle = hinter;
    c.beginPath();
    c.roundRect(x - b / 2, y - groesse * 0.85, b, groesse * 1.7, groesse * 0.3);
    c.fill();
    if (rand) {
      c.strokeStyle = rand;
      c.lineWidth = 4;
      c.stroke();
    }
    c.fillStyle = farbe;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x, y + 1);
    c.restore();
  }

  // HU-Prüfplakette nach Anlage IX StVZO: Farbe nach Durchführungsjahr (RAL-Töne, Zyklus ab 2008: blau, gelb, braun,
  // rosa, grün, orange), Monatszahlen 1–12 entgegen dem Uhrzeigersinn, nach außen gedreht, mit Strichen über und
  // unter jeder Zahl; im 60°-Abschnitt 11–12–1 schwarze Felder, bei 12 geteilt; Jahr zweistellig im Mittelkreis.
  // Die ganze Plakette ist so gedreht, dass der Durchführungsmonat oben steht.
  const PLAKETTEN_FARBEN = ['#2271b3', '#d7b12e', '#8f4e35', '#e1a6ad', '#57a639', '#ed760e']; // RAL 5015, 1012, 8004, 3015, 6018, 2000
  function huPlakette(c, x, y, r, jahr, monat) {
    const farbe = PLAKETTEN_FARBEN[(((jahr - 2008) % 6) + 6) % 6];
    const strich = r * 0.045;
    const winkelVon = (m) => -Math.PI / 2 - ((m - 12) * Math.PI) / 6; // ungedreht: 12 oben, 1 links daneben
    c.save();
    c.translate(x, y);
    c.rotate(((monat - 12) * Math.PI) / 6);
    c.fillStyle = farbe;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111';
    // Schwarze Felder im Abschnitt 11–12–1 (außen am Rand und innen am Mittelkreis), bei 12 durch einen Strich geteilt
    const feld = (r1, r2, halb) => {
      c.beginPath();
      c.arc(0, 0, r2, -Math.PI / 2 - halb, -Math.PI / 2 + halb);
      c.arc(0, 0, r1, -Math.PI / 2 + halb, -Math.PI / 2 - halb, true);
      c.closePath();
      c.fill();
    };
    feld(r * 0.8, r * 0.97, Math.PI / 6);
    feld(r * 0.31, r * 0.45, Math.PI / 8);
    c.strokeStyle = farbe;
    c.lineWidth = strich * 0.8;
    c.beginPath();
    c.moveTo(0, -r * 0.3);
    c.lineTo(0, -r * 0.46);
    c.moveTo(0, -r * 0.79);
    c.lineTo(0, -r * 0.98);
    c.stroke();
    // Striche über und unter den Zahlen
    c.strokeStyle = '#111';
    c.lineWidth = strich;
    c.lineCap = 'butt';
    for (let m = 1; m <= 12; m++) {
      if (m === 12) continue;
      const w = winkelVon(m);
      const [cx, cy] = [Math.cos(w), Math.sin(w)];
      c.beginPath();
      c.moveTo(cx * r * 0.3, cy * r * 0.3);
      c.lineTo(cx * r * 0.46, cy * r * 0.46);
      c.moveTo(cx * r * 0.79, cy * r * 0.79);
      c.lineTo(cx * r * 0.97, cy * r * 0.97);
      c.stroke();
    }
    // Monatszahlen (DIN-1451-Optik: einstellig Mittelschrift, zweistellig Engschrift), Oberkante nach außen
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let m = 1; m <= 12; m++) {
      const w = winkelVon(m);
      c.save();
      c.translate(Math.cos(w) * r * 0.625, Math.sin(w) * r * 0.625);
      c.rotate(w + Math.PI / 2);
      c.scale(m > 9 ? 0.62 : 0.8, 1);
      c.font = `700 ${r * 0.27}px "DIN 1451", "Arial Narrow", ${SCHRIFT}`;
      c.fillText(String(m), 0, r * 0.01);
      c.restore();
    }
    // Mittelkreis mit Jahr (Engschrift)
    c.lineWidth = strich;
    c.beginPath();
    c.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    c.stroke();
    c.save();
    c.scale(0.68, 1);
    c.font = `700 ${r * 0.36}px "DIN 1451", "Arial Narrow", ${SCHRIFT}`;
    c.fillText(String(jahr % 100).padStart(2, '0'), 0, r * 0.02);
    c.restore();
    // Umrandung
    c.lineWidth = r * 0.05;
    c.beginPath();
    c.arc(0, 0, r * 0.975, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  // Siegel der Zulassungsstelle (Stempelplakette) – allgemein gehalten, kein echtes Landeswappen
  function siegel(c, x, y, r) {
    c.save();
    c.translate(x, y);
    c.fillStyle = '#f1f5f9';
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#64748b';
    c.lineWidth = r * 0.12;
    c.beginPath();
    c.arc(0, 0, r * 0.85, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#b91c1c';
    c.beginPath();
    c.moveTo(-r * 0.38, -r * 0.4);
    c.lineTo(r * 0.38, -r * 0.4);
    c.lineTo(r * 0.38, r * 0.05);
    c.quadraticCurveTo(r * 0.38, r * 0.45, 0, r * 0.55);
    c.quadraticCurveTo(-r * 0.38, r * 0.45, -r * 0.38, r * 0.05);
    c.closePath();
    c.fill();
    c.fillStyle = '#fff';
    c.fillRect(-r * 0.06, -r * 0.35, r * 0.12, r * 0.8);
    c.restore();
  }

  // Heckansicht eines Autos mit Kennzeichen [EU-Feld D] [HU-Plakette + Siegel] [NAME]; Mitte (0, 0), Breite 600.
  // Kennzeichen-Mitte liegt bei (0, KENNZEICHEN_Y). plakette: 0 = noch nicht da, 1 = aufgeklebt
  const KENNZEICHEN_Y = 18;
  function heckansicht(c, farbe, name, t, plakette, jahr, monat) {
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, 175, 330, 22, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111827';
    c.beginPath();
    c.roundRect(-285, 110, 80, 62, 10);
    c.roundRect(205, 110, 80, 62, 10);
    c.fill();
    c.fillStyle = farbe;
    c.beginPath();
    c.moveTo(-250, -130);
    c.lineTo(-185, -280);
    c.lineTo(185, -280);
    c.lineTo(250, -130);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(147,197,253,0.9)';
    c.beginPath();
    c.moveTo(-215, -145);
    c.lineTo(-165, -262);
    c.lineTo(165, -262);
    c.lineTo(215, -145);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.moveTo(-120, -262);
    c.lineTo(-60, -262);
    c.lineTo(-130, -145);
    c.lineTo(-190, -145);
    c.closePath();
    c.fill();
    c.fillStyle = farbe;
    c.beginPath();
    c.roundRect(-305, -140, 610, 260, 40);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(-305, 40, 610, 80);
    for (const s of [-1, 1]) {
      const glut = c.createRadialGradient(s * 255, -85, 5, s * 255, -85, 70);
      glut.addColorStop(0, 'rgba(248,113,113,0.6)');
      glut.addColorStop(1, 'rgba(248,113,113,0)');
      c.fillStyle = glut;
      c.fillRect(s * 255 - 70, -155, 140, 140);
      c.fillStyle = '#dc2626';
      c.beginPath();
      c.roundRect(s > 0 ? 200 : -295, -110, 95, 50, 12);
      c.fill();
      c.fillStyle = '#fecaca';
      c.fillRect(s > 0 ? 215 : -280, -100, 30, 10);
    }
    c.fillStyle = '#374151';
    c.beginPath();
    c.roundRect(-315, 80, 630, 45, 14);
    c.fill();
    c.fillStyle = '#9ca3af';
    c.beginPath();
    c.roundRect(170, 118, 46, 16, 8);
    c.fill();

    // Kennzeichen 340 × 74
    c.save();
    c.translate(-170, KENNZEICHEN_Y - 37);
    c.fillStyle = '#fff';
    c.strokeStyle = '#111';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(0, 0, 340, 74, 7);
    c.fill();
    c.stroke();
    c.fillStyle = '#003399';
    c.beginPath();
    c.roundRect(1.5, 1.5, 40, 71, [6, 0, 0, 6]);
    c.fill();
    c.fillStyle = '#ffcc00';
    for (let k = 0; k < 12; k++) {
      const winkel = (k / 12) * Math.PI * 2;
      c.beginPath();
      c.arc(21.5 + Math.cos(winkel) * 10, 24 + Math.sin(winkel) * 10, 1.6, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#fff';
    c.font = `800 22px ${SCHRIFT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('D', 21.5, 55);
    // Plakettenfeld: HU-Plakette oben, Siegel unten
    siegel(c, 66, 53, 13);
    if (plakette > 0) {
      const s = 1 + 2.2 * (1 - sanft(plakette));
      c.save();
      c.globalAlpha = Math.min(1, plakette * 1.5);
      c.translate(66, 21);
      c.scale(s, s);
      huPlakette(c, 0, 0, 15.5, jahr, monat);
      c.restore();
    }
    // Name in FE-Schrift-Optik (schmal, fett, Großbuchstaben)
    const text = name.toUpperCase();
    let groesse = 56;
    c.font = `800 ${groesse}px "Arial Narrow", ${SCHRIFT}`;
    while (groesse > 16 && c.measureText(text).width * 0.82 > 238) {
      groesse -= 2;
      c.font = `800 ${groesse}px "Arial Narrow", ${SCHRIFT}`;
    }
    c.save();
    c.translate(215, 39);
    c.scale(0.82, 1);
    c.fillStyle = '#111';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 0, 2);
    c.restore();
    c.restore();
  }

  // ---------- Szenen ----------
  // Jede Szene: dauer (dann kommt das Banner), toene [[zeit, name, bis?]] (bis = Tonende für Töne mit Länge),
  // vibration [[zeit, muster]], dehnung [[von, bis, faktor]] (ruhige Abschnitte langsamer abspielen),
  // vorbereiten(d) → Zusatzdaten, zeichne(c, w, h, t, d) gibt optional eine Wackel-Stärke zurück.
  const SZENEN = {
    // Orbitalschlag als Mini-Film: virtuelle Kamera fährt durch eine „Welt“ (Raumschiff oben, Erde weit darunter).
    // Einstellungen: Nahaufnahme Schiff (lädt) → Schwenk zur Erde (Ziel erfasst) → zurück → Feuer →
    // Kamera folgt dem Strahl → Einschlag in Zeitlupe → Rückzoom, Schiff springt in den Hyperraum.
    orbital: {
      dauer: 7.8,
      toene: [[0.1, 'ladenLang', 4.1], [1.6, 'whoosh'], [2.75, 'lockon'], [3.5, 'whoosh'], [4.2, 'laser'], [4.7, 'whoosh'], [5.2, 'explosion'], [5.3, 'nachhall'], [7.45, 'hyperraum']],
      vibration: [[4.2, [30]], [5.2, [120, 50, 200]]],
      dehnung: [[0.3, 1.6, 1.5], [2.1, 3.5, 1.7], [5.5, 6.3, 1.6], [6.3, 7.4, 1.5], [7.5, 7.8, 2.5]],
      gewinnText: (v) => `Orbitalschlag auf ${v} ausgeführt 🛸`,
      verlierText: 'Du wurdest aus dem Orbit erledigt 😵',
      vorbereiten: (d) => {
        const n = d.verlierer.length;
        return {
          sterne: Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() < 0.15 ? 2 : 1, p: Math.random() * 6, tiefe: 0.3 + Math.random() * 0.7 })),
          funken: Array.from({ length: 26 }, () => ({ w: Math.random() * Math.PI * 2, versatz: Math.random() })),
          truemmer: Array.from({ length: 150 }, () => {
            const w = -Math.PI * (0.05 + Math.random() * 0.9);
            const v = 150 + Math.random() * 650;
            return { vx: Math.cos(w) * v, vy: Math.sin(w) * v, r: 3 + Math.random() * 9, farbe: ['#fde047', '#f97316', '#ef4444', '#78716c', '#fff7ed'][Math.floor(Math.random() * 5)] };
          }),
          rauch: Array.from({ length: 40 }, (_, i) => ({ start: 0.25 + i * 0.05, dx: (Math.random() - 0.5) * 80, r: 25 + Math.random() * 35 })),
          // Verlierer stehen auf der Erdkrümmung, fliegen beim Einschlag in verschiedene Richtungen
          figuren: d.verlierer.map((name, i) => ({ name, x: n === 1 ? 0 : i ? 85 : -85, flugX: n === 1 ? 420 : i ? 560 : -560, flugY: 1250, dreh: i ? 7 : -7 })),
        };
      },
      zeichne(c, w, h, t, d) {
        const ERDE = { y: 2600, r: 1400 };
        const OBEN = ERDE.y - ERDE.r; // y der Erdoberfläche unter dem Schiff
        const KANONE = 62; // y der Laserspitze unter dem Schiff
        const EINSCHLAG = 5.2;
        const b = Math.min(w, h * 0.8) / 600; // Grundzoom passend zur Bildschirmgröße
        const zwischenwert = (a, z, x) => a + (z - a) * x;

        // ---------- Kamera ----------
        const kamera = (z) => {
          if (z < 1.6) { const x = sanft(z / 1.6); return { y: zwischenwert(28, 48, x), k: zwischenwert(1.9, 2.35, x) }; }
          if (z < 2.1) { const x = sanft(anteil(z, 1.6, 2.1)); return { y: zwischenwert(48, OBEN - 45, x), k: zwischenwert(2.35, 2.0, x) }; }
          if (z < 3.5) { const x = sanft(anteil(z, 2.1, 3.5)); return { y: zwischenwert(OBEN - 45, OBEN - 40, x), k: zwischenwert(2.0, 2.3, x) }; }
          if (z < 4.0) { const x = sanft(anteil(z, 3.5, 4.0)); return { y: zwischenwert(OBEN - 40, 40, x), k: zwischenwert(2.3, 2.7, x) }; }
          if (z < 4.7) return { y: 40, k: 2.7 };
          if (z < 5.2) { const x = Math.pow(anteil(z, 4.7, 5.2), 2); return { y: zwischenwert(40, OBEN - 110, x), k: zwischenwert(2.7, 1.8, x) }; }
          if (z < 5.5) { const x = raus(anteil(z, 5.2, 5.5)); return { y: zwischenwert(OBEN - 110, OBEN - 80, x), k: zwischenwert(1.8, 1.25, x) }; }
          if (z < 6.3) return { y: OBEN - 80, k: zwischenwert(1.25, 1.15, anteil(z, 5.5, 6.3)) };
          const x = sanft(anteil(z, 6.3, 7.4));
          return { y: zwischenwert(OBEN - 80, OBEN / 2, x), k: zwischenwert(1.15, 0.36, x) };
        };
        const kam = kamera(t);
        const z = kam.k * b;
        const vorher = kamera(Math.max(0, t - 0.04));
        const tempo = (kam.y - vorher.y) * z; // Bildschirm-Pixel je 40 ms → Länge der Sternstreifen
        const bild = (x, y) => [w / 2 + x * z, h / 2 + (y - kam.y) * z];

        // ---------- Hintergrund: Sterne mit Parallaxe, bei Reißschwenks als Streifen ----------
        c.fillStyle = '#02040c';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = '#fff';
        c.fillStyle = '#fff';
        for (const s of d.sterne) {
          const kachel = h * 1.5;
          const y = (((s.y * kachel - kam.y * z * 0.15 * s.tiefe) % kachel) + kachel) % kachel - kachel * 0.25;
          const x = s.x * w;
          c.globalAlpha = 0.45 + 0.45 * Math.sin(t * 3 + s.p);
          const streifen = Math.abs(tempo) * 0.6 * s.tiefe;
          if (streifen > 3) {
            c.lineWidth = s.r;
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x, y - Math.sign(tempo) * streifen);
            c.stroke();
          } else c.fillRect(x, y, s.r, s.r);
        }
        c.globalAlpha = 1;

        // ---------- Welt (in Weltkoordinaten zeichnen) ----------
        const wackeln = t > 4.2 && t < 4.5 ? (Math.random() - 0.5) * 6 : 0;
        c.save();
        c.translate(w / 2, h / 2);
        c.scale(z, z);
        c.translate(0, -kam.y);

        // Erde
        const verlauf = c.createRadialGradient(-ERDE.r * 0.3, ERDE.y - ERDE.r * 0.6, ERDE.r * 0.1, 0, ERDE.y, ERDE.r);
        verlauf.addColorStop(0, '#60a5fa');
        verlauf.addColorStop(1, '#1e3a8a');
        c.fillStyle = 'rgba(147,197,253,0.18)';
        c.beginPath();
        c.arc(0, ERDE.y, ERDE.r + 40, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = verlauf;
        c.beginPath();
        c.arc(0, ERDE.y, ERDE.r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#16a34a';
        for (const [x, y, rx, ry, dreh] of [[-420, 1330, 260, 90, 0.2], [260, 1300, 220, 70, -0.15], [40, 1420, 150, 60, 0.4], [-760, 1600, 140, 160, 0.3], [700, 1560, 180, 120, -0.3]]) {
          c.beginPath();
          c.ellipse(x, y, rx, ry, dreh, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = 'rgba(255,255,255,0.55)';
        for (const [x, y, rx] of [[-200, 1250, 120], [380, 1265, 90], [-600, 1420, 100]]) {
          c.beginPath();
          c.ellipse(x + Math.sin(t * 0.5) * 20, y, rx, 18, 0, 0, Math.PI * 2);
          c.fill();
        }

        // Einschlag: Krater, Feuerball, Druckwelle, Trümmer, Rauch (in Zeitlupe)
        const nachEinschlag = t >= EINSCHLAG;
        const tau = !nachEinschlag ? 0 : t < EINSCHLAG + 0.6 ? (t - EINSCHLAG) * 0.3 : 0.18 + (t - EINSCHLAG - 0.6);
        if (nachEinschlag) {
          const krater = c.createRadialGradient(0, OBEN + 8, 4, 0, OBEN + 8, 160);
          krater.addColorStop(0, 'rgba(255,237,213,0.95)');
          krater.addColorStop(0.35, 'rgba(249,115,22,0.85)');
          krater.addColorStop(1, 'rgba(127,29,29,0)');
          c.fillStyle = krater;
          c.beginPath();
          c.arc(0, OBEN + 8, 160, 0, Math.PI * 2);
          c.fill();
          for (const p of d.rauch) {
            const alter = tau - p.start;
            if (alter < 0) continue;
            c.globalAlpha = Math.max(0, 0.55 - alter * 0.12);
            c.fillStyle = '#57534e';
            c.beginPath();
            c.arc(p.dx * (1 + alter), OBEN - 30 - alter * 160, p.r * (1 + alter * 0.8), 0, Math.PI * 2);
            c.fill();
          }
          c.globalAlpha = 1;
          if (tau < 1.6) {
            const feuer = c.createRadialGradient(0, OBEN, 5, 0, OBEN, 70 + tau * 160);
            feuer.addColorStop(0, `rgba(255,255,255,${1 - tau / 1.6})`);
            feuer.addColorStop(0.4, `rgba(253,186,116,${0.9 * (1 - tau / 1.6)})`);
            feuer.addColorStop(1, 'rgba(239,68,68,0)');
            c.fillStyle = feuer;
            c.beginPath();
            c.arc(0, OBEN, 70 + tau * 160, 0, Math.PI * 2);
            c.fill();
          }
          if (tau < 1) {
            c.strokeStyle = `rgba(255,255,255,${1 - tau})`;
            c.lineWidth = 16 * (1 - tau) + 2;
            c.beginPath();
            c.ellipse(0, OBEN, 40 + tau * 900, 12 + tau * 220, 0, 0, Math.PI * 2);
            c.stroke();
          }
          for (const p of d.truemmer) {
            const a = Math.max(0, 1 - tau / 2.2);
            if (a <= 0) break;
            c.globalAlpha = a;
            c.fillStyle = p.farbe;
            c.beginPath();
            c.arc(p.vx * tau, OBEN + p.vy * tau + 260 * tau * tau, p.r, 0, Math.PI * 2);
            c.fill();
          }
          c.globalAlpha = 1;
        }

        // Verlierer-Figuren (Körper + Gesicht); nach dem Einschlag wirbeln sie Richtung Kamera aus dem Bild
        const n = d.figuren.length;
        const lock = (i) => 2.4 + i * 0.45 + 0.35;
        d.figuren.forEach((f, i) => {
          const boden = ERDE.y - Math.sqrt(ERDE.r * ERDE.r - f.x * f.x);
          let x = f.x;
          let y = boden;
          let dreh = 0;
          let gross = 1;
          if (nachEinschlag) {
            x += f.flugX * tau;
            y += -f.flugY * tau + 120 * tau * tau;
            dreh = f.dreh * tau;
            gross = 1 + tau * 2.6;
          }
          c.save();
          c.translate(x, y);
          c.rotate(dreh);
          c.scale(gross, gross);
          c.fillStyle = i ? '#f97316' : '#dc2626';
          c.beginPath();
          c.roundRect(-11, -34, 22, 30, 7);
          c.fill();
          c.fillStyle = '#1f2937';
          c.fillRect(-9, -6, 7, 8);
          c.fillRect(2, -6, 7, 8);
          c.font = `26px ${SCHRIFT}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(nachEinschlag ? '😵' : t > lock(i) ? '😨' : '🙂', 0, -46);
          c.restore();
        });

        // Raumschiff (Seitenansicht), Kanone unten bei (0, KANONE)
        const abflug = t > 7.45 ? Math.pow((t - 7.45) / 0.4, 3) * 4000 : 0;
        const rueckstoss = t > 4.2 ? -10 * Math.max(0, 1 - (t - 4.2) / 0.3) : 0;
        c.save();
        c.translate(abflug + wackeln, rueckstoss + wackeln);
        if (abflug > 0) {
          const spur = c.createLinearGradient(-150 - abflug, 0, -150, 0);
          spur.addColorStop(0, 'rgba(147,197,253,0)');
          spur.addColorStop(1, 'rgba(219,234,254,0.95)');
          c.fillStyle = spur;
          c.fillRect(-150 - abflug, -12, abflug, 24);
        }
        // Triebwerke
        for (const ty of [-18, 6]) {
          const glut = c.createRadialGradient(-152, ty, 2, -152, ty, 26 + Math.sin(t * 20) * 3);
          glut.addColorStop(0, 'rgba(219,234,254,1)');
          glut.addColorStop(1, 'rgba(59,130,246,0)');
          c.fillStyle = glut;
          c.beginPath();
          c.arc(-152, ty, 30, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#64748b';
        c.beginPath();
        c.moveTo(-150, -30);
        c.lineTo(-120, -40);
        c.lineTo(70, -40);
        c.lineTo(160, -6);
        c.lineTo(160, 4);
        c.lineTo(80, 26);
        c.lineTo(-130, 26);
        c.lineTo(-150, 14);
        c.closePath();
        c.fill();
        c.fillStyle = '#475569';
        c.beginPath();
        c.moveTo(-150, 2);
        c.lineTo(160, 2);
        c.lineTo(80, 26);
        c.lineTo(-130, 26);
        c.lineTo(-150, 14);
        c.closePath();
        c.fill();
        c.strokeStyle = 'rgba(15,23,42,0.5)';
        c.lineWidth = 1.5;
        for (const x of [-90, -30, 30, 90]) {
          c.beginPath();
          c.moveTo(x, -40);
          c.lineTo(x, 24);
          c.stroke();
        }
        c.fillStyle = '#94a3b8';
        c.fillRect(-70, -64, 80, 26);
        c.fillStyle = 'rgba(191,219,254,0.9)';
        for (let k = 0; k < 5; k++) c.fillRect(-62 + k * 14, -56, 8, 7);
        c.fillStyle = Math.floor(t * 3) % 2 ? '#ef4444' : '#7f1d1d';
        c.beginPath();
        c.arc(150, -8, 3.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = Math.floor(t * 3 + 1) % 2 ? '#22c55e' : '#14532d';
        c.beginPath();
        c.arc(-140, -28, 3.5, 0, Math.PI * 2);
        c.fill();
        // Laserkanone
        c.fillStyle = '#334155';
        c.beginPath();
        c.arc(0, 26, 18, 0, Math.PI);
        c.fill();
        c.fillStyle = '#1e293b';
        c.fillRect(-6, 30, 12, KANONE - 30);
        // Aufladen: Glut an der Spitze + eingesaugte Funken
        if (t > 0.2 && t < 4.25) {
          const laden = anteil(t, 0.2, 4.0);
          const glow = c.createRadialGradient(0, KANONE, 1, 0, KANONE, 8 + 26 * laden);
          glow.addColorStop(0, 'rgba(255,255,255,1)');
          glow.addColorStop(0.35, `rgba(248,113,113,${0.7 + 0.3 * Math.sin(t * 25)})`);
          glow.addColorStop(1, 'rgba(239,68,68,0)');
          c.fillStyle = glow;
          c.beginPath();
          c.arc(0, KANONE, 8 + 26 * laden, 0, Math.PI * 2);
          c.fill();
          for (const f of d.funken) {
            const phase = (t * 1.2 + f.versatz) % 1;
            const r = 70 * (1 - phase);
            c.globalAlpha = phase;
            c.fillStyle = '#fecaca';
            c.fillRect(Math.cos(f.w) * r - 1.5, KANONE + Math.sin(f.w) * r - 1.5, 3, 3);
          }
          c.globalAlpha = 1;
        }
        // Mündungsblitz
        if (t > 4.2 && t < 4.4) {
          c.fillStyle = `rgba(255,255,255,${1 - (t - 4.2) / 0.2})`;
          c.beginPath();
          c.arc(0, KANONE + 10, 60, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();

        // Laserstrahl von der Kanone bis zur Strahlspitze (erreicht die Erde beim Einschlag)
        if (t > 4.2 && t < 5.9) {
          const spitze = KANONE + (OBEN - KANONE) * Math.pow(anteil(t, 4.2, EINSCHLAG), 2);
          const breite = (14 + Math.sin(t * 60) * 3) * (t > 5.5 ? 1 - (t - 5.5) / 0.4 : 1);
          const strahl = c.createLinearGradient(-breite, 0, breite, 0);
          strahl.addColorStop(0, 'rgba(239,68,68,0)');
          strahl.addColorStop(0.5, 'rgba(255,241,242,1)');
          strahl.addColorStop(1, 'rgba(239,68,68,0)');
          c.fillStyle = strahl;
          c.fillRect(-breite * 2, KANONE + rueckstoss, breite * 4, spitze - KANONE);
          const kopf = c.createRadialGradient(0, spitze, 2, 0, spitze, 40);
          kopf.addColorStop(0, 'rgba(255,255,255,1)');
          kopf.addColorStop(1, 'rgba(239,68,68,0)');
          c.fillStyle = kopf;
          c.beginPath();
          c.arc(0, spitze, 40, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();

        // ---------- Bildschirm-Ebene: Zielkreuz, Namen, Untertitel, Blitz, Kinobalken ----------
        d.figuren.forEach((f, i) => {
          const boden = ERDE.y - Math.sqrt(ERDE.r * ERDE.r - f.x * f.x);
          const [sx, sy] = bild(f.x, boden - 30);
          if (!nachEinschlag && t > 2.1) namensschild(c, kurz(f.name), sx, sy - 66 * z / 1.2);
          const start = 2.4 + i * 0.45;
          if (t > start && t < 3.5) {
            const a = anteil(t, start, start + 0.35);
            const r = 90 - 55 * sanft(a);
            const fest = a >= 1;
            c.save();
            c.translate(sx, sy);
            c.rotate((1 - sanft(a)) * 2);
            c.strokeStyle = fest ? '#ef4444' : 'rgba(248,113,113,0.8)';
            c.lineWidth = fest ? 3.5 : 2;
            c.beginPath();
            c.arc(0, 0, r, 0, Math.PI * 2);
            c.stroke();
            for (const winkel of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
              c.beginPath();
              c.moveTo(Math.cos(winkel) * (r - 10), Math.sin(winkel) * (r - 10));
              c.lineTo(Math.cos(winkel) * (r + 14), Math.sin(winkel) * (r + 14));
              c.stroke();
            }
            c.restore();
            if (fest && i === n - 1 && Math.floor(t * 6) % 2 === 0) {
              c.font = `900 ${Math.round(Math.min(22, w / 18))}px ${SCHRIFT}`;
              c.textAlign = 'center';
              c.fillStyle = '#ef4444';
              c.fillText('🎯 ZIEL ERFASST', w / 2, h * 0.3);
            }
          }
        });

        const balken = h * 0.1 * (t < this.dauer ? Math.min(1, t / 0.3) : 1 - anteil(t, this.dauer, this.dauer + 0.5));
        const untertitel = (text, von, bis) => {
          if (t < von || t > bis) return;
          c.globalAlpha = Math.min(anteil(t, von, von + 0.25), 1 - anteil(t, bis - 0.25, bis));
          c.font = `800 ${Math.round(Math.min(20, w / 20))}px ${SCHRIFT}`;
          c.textAlign = 'left';
          c.fillStyle = '#fde047';
          c.fillText(text, 18, h - balken - 22);
          c.globalAlpha = 1;
        };
        untertitel('🏆 Kommandant ' + kurz(d.gewinner.join(' & ')), 0.3, 1.6);
        untertitel('🌍 Ziel: ' + d.figuren.map((f) => kurz(f.name)).join(' & '), 2.2, 3.5);
        untertitel('🔥 FEUER!', 4.15, 4.8);

        blitzlicht(c, w, h, t, EINSCHLAG, 0.45);
        blitzlicht(c, w, h, t, 7.45, 0.25, '#dbeafe', 0.3);
        if (balken > 0) {
          c.fillStyle = '#000';
          c.fillRect(0, 0, w, balken);
          c.fillRect(0, h - balken, w, balken);
        }
        return nachEinschlag && tau < 0.9 ? 16 * (1 - tau / 0.9) : 0;
      },
    },

    // HU verweigert als Mini-Film: Rolltor auf, Verlierer-Auto rollt qualmend rein → Nahaufnahme Prüfbericht
    // (Mängel mit Buzzer) → Hebebühne, Auspuff fällt ab → Riesenstempel in Zeitlupe → Gewinner bekommt die
    // Plakette (Nahaufnahme) → Verlierer wird rausgeschoben, Rolltor zu.
    hu: {
      dauer: 10.0,
      toene: [[0, 'rolltor'], [0.5, 'stottern'], [2.2, 'falsch'], [2.65, 'falsch'], [3.1, 'falsch'], [3.55, 'falsch'], [4.3, 'hydraulik', 5.0],
        [5.0, 'scheppern'], [5.32, 'klack'], [5.5, 'whoosh'], [5.85, 'stempel'], [7.3, 'whoosh'], [7.7, 'stempel'], [7.75, 'pling'], [9.5, 'rolltor']],
      vibration: [[5.85, [90]]],
      dehnung: [[0.8, 1.8, 1.4], [1.8, 3.85, 1.7], [3.85, 4.2, 3], [4.2, 5.0, 1.6], [5.0, 5.32, 2.5], [5.32, 5.4, 5], [5.4, 5.85, 1.5],
        [5.9, 6.8, 1.5], [6.8, 7.3, 1.4], [7.9, 9.0, 2.0], [9.0, 10.0, 1.4]],
      gewinnText: (v) => `${v}: erhebliche Mängel – keine Plakette 🚫`,
      verlierText: 'Erhebliche Mängel – keine Plakette für dich 🚫',
      vorbereiten: (d) => {
        const pool = ['Längsträger durchgerostet', 'Bremsscheiben verschlissen', 'Spurstangenkopf ausgeschlagen', 'Auspuff mit Panzertape fixiert',
          'Reifenprofil 0,8 mm', 'Scheinwerfer: ein Auge blind', 'Ölverlust – Ölsee unterm Fahrzeug', 'Lenkungsspiel gefühlt 90°',
          'Bremsflüssigkeit: Apfelschorle', 'Hupe macht nur noch „Mööp“'];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return { maengel: pool.slice(0, 4), qualm: wolkenListe(30, 0.4, 0.06), staub: teileErzeugen(70, 260, ['#a8a29e', '#d6d3d1', '#78716c']) };
      },
      zeichne(c, w, h, t, d) {
        const n = d.verlierer.length;
        const b = grundzoom(w, h);
        const X2 = -400; // zweites Verlierer-Auto wartet hier
        const kamera = kamerafahrt([
          [0, 1.8, [-700, -180, 0.75], [-170, -170, 1.0]],
          [4.2, 5.4, [0, -210, 1.15], [0, -240, 1.35]],
          [5.4, 6.8, [n > 1 ? -200 : 0, -250, n > 1 ? 0.72 : 1.0], [n > 1 ? -200 : 0, -250, n > 1 ? 0.78 : 1.08]],
          [9.0, 10.0, [-300, -200, 0.7], [-420, -200, 0.75]],
        ]);
        const kam = kamera(t);
        const S = 260; // Autobreite in Welt-Einheiten
        const tor = t < 4 ? 1 - sanft(anteil(t, 0, 0.7)) : sanft(anteil(t, 9.5, 10.0)); // 1 = Rolltor zu
        const buehne = t < 8.7 ? -150 * sanft(anteil(t, 4.3, 5.0)) : -150 * (1 - sanft(anteil(t, 8.7, 9.0)));
        const x1 = t < 9.0 ? -1150 + 1150 * raus(anteil(t, 0.4, 1.8)) : -1500 * sanft(anteil(t, 9.0, 9.8));
        const x2 = t < 9.0 ? -1450 + (1450 + X2) * raus(anteil(t, 0.6, 2.0)) : X2 - 1100 * sanft(anteil(t, 9.05, 9.9));
        const autos = [{ x: x1, y: buehne, farbe: '#dc2626', name: d.verlierer[0] }];
        if (n > 1) autos.push({ x: x2, y: 0, farbe: '#f97316', name: d.verlierer[1] });
        const stempelAb = (x) => (t < 5.5 ? -1400 : t < 5.85 ? zw(-1400, x, Math.pow(anteil(t, 5.5, 5.85), 2)) : t < 6.3 ? x : zw(x, -1400, sanft(anteil(t, 6.3, 6.7))));

        // ---------- Prüfbericht in Nahaufnahme (eigene Einstellung, Bildschirm-Ebene) ----------
        if (t >= 1.8 && t < 4.2) {
          const hg = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
          hg.addColorStop(0, '#57534e');
          hg.addColorStop(1, '#1c1917');
          c.fillStyle = hg;
          c.fillRect(0, 0, w, h);
          const zoom = 1 + 0.08 * anteil(t, 1.8, 4.2);
          const bw = Math.min(w * 0.94, 560, h * 0.62) * zoom;
          const bh = bw * 1.3;
          const bx = w / 2 - bw / 2;
          const by = h / 2 - bh / 2;
          c.fillStyle = '#92400e';
          c.beginPath();
          c.roundRect(bx, by, bw, bh, 14);
          c.fill();
          c.fillStyle = '#f8fafc';
          c.fillRect(bx + bw * 0.06, by + bh * 0.07, bw * 0.88, bh * 0.89);
          c.fillStyle = '#9ca3af';
          c.beginPath();
          c.roundRect(bx + bw * 0.3, by - bh * 0.015, bw * 0.4, bh * 0.07, 8);
          c.fill();
          const f = bw / 15;
          c.fillStyle = '#111827';
          c.textAlign = 'left';
          c.textBaseline = 'alphabetic';
          c.font = `900 ${Math.round(f * 1.1)}px ${SCHRIFT}`;
          c.fillText('PRÜFBERICHT · HU', bx + bw * 0.1, by + bh * 0.17);
          c.fillStyle = '#374151';
          if (n > 1) {
            // Zwei Halter: eigene Zeile, fett und so groß wie es passt, damit beide Namen gut lesbar sind
            c.font = `600 ${Math.round(f * 0.65)}px ${SCHRIFT}`;
            c.fillText('Fahrzeuge von:', bx + bw * 0.1, by + bh * 0.215);
            const namen = d.verlierer.map(kurz).join(' & ');
            let fn = Math.round(f * 0.95);
            c.font = `800 ${fn}px ${SCHRIFT}`;
            while (fn > 9 && c.measureText(namen).width > bw * 0.8) {
              fn--;
              c.font = `800 ${fn}px ${SCHRIFT}`;
            }
            c.fillStyle = '#111827';
            c.fillText(namen, bx + bw * 0.1, by + bh * 0.275);
          } else {
            c.font = `600 ${Math.round(f * 0.8)}px ${SCHRIFT}`;
            c.fillText('Fahrzeug von: ' + kurz(d.verlierer[0]), bx + bw * 0.1, by + bh * 0.24);
          }
          d.maengel.forEach((m, i) => {
            const ab = 2.2 + i * 0.45;
            if (t < ab) return;
            const y = by + bh * (0.36 + i * 0.12);
            c.globalAlpha = anteil(t, ab, ab + 0.15);
            c.fillStyle = '#111827';
            let fg = Math.round(f * 0.8);
            c.font = `600 ${fg}px ${SCHRIFT}`;
            while (fg > 9 && c.measureText(m).width > bw * 0.68) {
              fg--;
              c.font = `600 ${fg}px ${SCHRIFT}`;
            }
            c.fillText(m, bx + bw * 0.1, y);
            const s = 1 + 1.5 * (1 - sanft(anteil(t, ab, ab + 0.2)));
            c.save();
            c.translate(bx + bw * 0.86, y - f * 0.3);
            c.scale(s, s);
            c.font = `${Math.round(f * 0.9)}px ${SCHRIFT}`;
            c.textAlign = 'center';
            c.fillText('❌', 0, f * 0.3);
            c.restore();
            c.globalAlpha = 1;
          });
          if (t > 3.85) {
            c.save();
            c.translate(bx + bw * 0.5, by + bh * 0.88);
            c.rotate(-0.12);
            c.globalAlpha = anteil(t, 3.85, 4.0);
            const ergebnis = 'Ergebnis: ERHEBLICHE MÄNGEL';
            let fe = Math.round(f * 0.85);
            c.font = `900 ${fe}px ${SCHRIFT}`;
            while (fe > 9 && c.measureText(ergebnis).width > bw * 0.66) {
              fe--;
              c.font = `900 ${fe}px ${SCHRIFT}`;
            }
            const breite = c.measureText(ergebnis).width + fe;
            c.strokeStyle = '#dc2626';
            c.lineWidth = 4;
            c.strokeRect(-breite / 2, -fe * 1.05, breite, fe * 1.9);
            c.fillStyle = '#dc2626';
            c.textAlign = 'center';
            c.fillText(ergebnis, 0, fe * 0.35);
            c.restore();
          }
          kinobalken(c, w, h, t, this.dauer);
          return 0;
        }

        // ---------- Gewinner von hinten: Kennzeichen mit Plakette (eigene Einstellung) ----------
        if (t >= 6.8 && t < 9.0) {
          const hg = c.createRadialGradient(w / 2, h * 0.35, 20, w / 2, h * 0.5, Math.max(w, h) * 0.8);
          hg.addColorStop(0, '#64748b');
          hg.addColorStop(1, '#0f172a');
          c.fillStyle = hg;
          c.fillRect(0, 0, w, h);
          c.fillStyle = '#273241';
          c.fillRect(0, h * 0.62, w, h);
          const jetzt = new Date();
          const jahr = jetzt.getFullYear() + 2;
          const monat = jetzt.getMonth() + 1;
          // Kamera: ganzes Heck → Plakettenfeld groß → ganzes Kennzeichen
          const ganz = Math.min(w * 0.82, h * 0.9) / 640;
          const feld = Math.min(w, h) * 0.55 / 40;
          const schild = Math.min(w * 0.94, 900) / 350;
          const plakX = -170 + 66;
          const plakY = KENNZEICHEN_Y - 37 + 21;
          let zoom;
          let fx;
          let fy;
          if (t < 7.3) {
            const x = sanft(anteil(t, 6.8, 7.3));
            zoom = zw(ganz, ganz * 1.15, x);
            fx = 0;
            fy = zw(-40, -20, x);
          } else if (t < 8.3) {
            const x = raus(anteil(t, 7.3, 7.6));
            zoom = zw(ganz * 1.15, feld, x);
            fx = zw(0, plakX, x);
            fy = zw(-20, plakY + 10, x);
          } else {
            const x = sanft(anteil(t, 8.3, 8.9));
            zoom = zw(feld, schild, x);
            fx = zw(plakX, 0, x);
            fy = zw(plakY + 10, KENNZEICHEN_Y, x);
          }
          c.save();
          c.translate(w / 2, h * 0.52);
          c.scale(zoom, zoom);
          c.translate(-fx, -fy);
          heckansicht(c, '#16a34a', d.gewinner.join(' & '), t, anteil(t, 7.7, 7.85), jahr, monat);
          if (t > 7.9 && t < 8.35) {
            const gx = plakX + zw(-22, 22, anteil(t, 7.9, 8.35));
            c.fillStyle = 'rgba(255,255,255,0.7)';
            c.beginPath();
            c.moveTo(gx - 3, plakY - 16);
            c.lineTo(gx + 3, plakY - 16);
            c.lineTo(gx - 3, plakY + 16);
            c.lineTo(gx - 9, plakY + 16);
            c.fill();
          }
          c.restore();
          untertitel(c, w, h, t, '🏆 ' + kurz(d.gewinner.join(' & ')) + ': ohne Mängel – Plakette erteilt', 6.9, 9.0);
          kinobalken(c, w, h, t, this.dauer);
          return t > 7.7 && t < 7.85 ? 6 : 0;
        }

        // ---------- Prüfhalle (Welt) ----------
        const nachStempel = t >= 5.85;
        const wackeln = t > 5.85 && t < 6.2 ? 14 * (1 - anteil(t, 5.85, 6.2)) : t > 5.0 && t < 5.2 ? 4 : 0;
        const bild = inWelt(c, w, h, kam, b, () => {
          c.fillStyle = '#0f172a';
          c.fillRect(-2000, -1600, 4000, 3200);
          // Wand mit Paneelen
          c.fillStyle = '#3f4b5c';
          c.fillRect(-1300, -560, 2600, 560);
          c.strokeStyle = 'rgba(15,23,42,0.35)';
          c.lineWidth = 3;
          for (let y = -500; y < 0; y += 70) {
            c.beginPath();
            c.moveTo(-1300, y);
            c.lineTo(1300, y);
            c.stroke();
          }
          // Deckenlampen mit Lichtkegel
          for (let x = -900; x <= 900; x += 360) {
            c.fillStyle = 'rgba(254,249,195,0.07)';
            c.beginPath();
            c.moveTo(x - 40, -530);
            c.lineTo(x + 40, -530);
            c.lineTo(x + 220, 0);
            c.lineTo(x - 220, 0);
            c.fill();
            c.fillStyle = '#fef9c3';
            c.fillRect(x - 50, -545, 100, 14);
          }
          // Spot auf den Gewinner
          if (t > 6.8) {
            c.fillStyle = `rgba(254,240,138,${0.22 * anteil(t, 6.8, 7.1)})`;
            c.beginPath();
            c.moveTo(560, -530);
            c.lineTo(640, -530);
            c.lineTo(790, 0);
            c.lineTo(410, 0);
            c.fill();
          }
          schild(c, '🔧 HU-Prüfstraße', 0, -420, { groesse: 30 });
          // Rolltor links
          c.fillStyle = '#1e293b';
          c.fillRect(-880, -310, 260, 310);
          c.fillStyle = '#94a3b8';
          const unten = -300 + 300 * tor;
          c.fillRect(-880, -310, 260, unten + 310);
          c.strokeStyle = '#64748b';
          for (let y = -300; y < unten; y += 22) {
            c.beginPath();
            c.moveTo(-880, y);
            c.lineTo(-620, y);
            c.stroke();
          }
          // Boden
          c.fillStyle = '#273241';
          c.fillRect(-1300, 0, 2600, 600);
          c.fillStyle = '#facc15';
          for (let x = -1300; x < 1300; x += 110) c.fillRect(x, 50, 60, 10);
          // Hebebühne (Schere)
          c.strokeStyle = '#ef4444';
          c.lineWidth = 10;
          c.beginPath();
          c.moveTo(-110, 0);
          c.lineTo(110, buehne + 4);
          c.moveTo(110, 0);
          c.lineTo(-110, buehne + 4);
          c.stroke();
          c.fillStyle = '#b91c1c';
          c.fillRect(-160, buehne, 320, 14);
          // Gewinner-Auto in der Nachbarspur, glänzend
          auto(c, 600, 0, S, '#16a34a');
          // Verlierer-Autos (qualmend), Auspuff fällt ab
          for (const [i, a] of autos.entries()) {
            if (t < 2.2) rauch(c, d.qualm, t, a.x - S * 0.55, a.y - 20, { farbe: '#94a3b8', steigen: 60, dichte: 0.45 });
            auto(c, a.x, a.y, S, a.farbe);
            if (i === 0) {
              let ax = a.x - S * 0.42;
              let ay = a.y - 12;
              let dreh = 0;
              if (t > 5.0) {
                const f = Math.min(t - 5.0, 0.32);
                ay = Math.min(-6, a.y - 12 + 1500 * f * f);
                dreh = Math.min(0.5, (t - 5.0) * 3);
                if (t > 5.32) ay = -6;
              }
              c.save();
              c.translate(ax, ay);
              c.rotate(dreh);
              c.fillStyle = '#475569';
              c.fillRect(-36, -5, 60, 10);
              c.fillStyle = '#9ca3af';
              c.fillRect(-20, -6, 10, 12);
              c.restore();
            }
            if (nachStempel) {
              c.save();
              c.translate(a.x, a.y - S * 0.32);
              c.rotate(-0.18);
              c.strokeStyle = 'rgba(220,38,38,0.92)';
              c.lineWidth = 8;
              c.fillStyle = 'rgba(254,226,226,0.72)';
              c.beginPath();
              c.roundRect(-150, -46, 300, 92, 12);
              c.fill();
              c.stroke();
              c.fillStyle = '#b91c1c';
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.font = `900 26px ${SCHRIFT}`;
              c.fillText('ERHEBLICHE MÄNGEL', 0, -14);
              c.font = `900 22px ${SCHRIFT}`;
              c.fillText('KEINE PLAKETTE', 0, 18);
              c.restore();
            }
            // Riesenstempel
            const sy = stempelAb(a.y - S * 0.58);
            if (t > 5.5 && t < 6.7) {
              const quetsch = t > 5.85 && t < 6.3 ? 0.88 : 1;
              c.save();
              c.translate(a.x, sy);
              c.scale(1, quetsch);
              c.fillStyle = '#7c2d12';
              c.fillRect(-26, -330, 52, 220);
              c.beginPath();
              c.arc(0, -340, 46, 0, Math.PI * 2);
              c.fill();
              c.fillStyle = '#6b7280';
              c.fillRect(-170, -120, 340, 90);
              c.fillStyle = '#b91c1c';
              c.fillRect(-160, -30, 320, 30);
              c.restore();
            }
            if (nachStempel && t < 7.2) {
              const tau = (t - 5.85) * 0.5;
              for (const p of d.staub) {
                const al = Math.max(0, 1 - tau / 0.6);
                c.globalAlpha = al * 0.8;
                c.fillStyle = p.farbe;
                c.beginPath();
                c.arc(a.x + p.vx * tau, a.y - 40 + Math.abs(p.vy) * tau * -0.3, p.r * 2 * (1 + tau * 2), 0, Math.PI * 2);
                c.fill();
              }
              c.globalAlpha = 1;
            }
          }
        });

        // ---------- Bildschirm-Ebene ----------
        autos.forEach((a) => {
          if (t < 4.2 || t > 8.2) return;
          const [sx, sy] = bild(a.x, a.y - S * 0.62);
          if (t < 5.5) namensschild(c, kurz(a.name), sx, sy);
        });
        untertitel(c, w, h, t, '🔧 Hauptuntersuchung – Fahrzeug von ' + kurz(d.verlierer.join(' & ')), 0.3, 1.8);
        untertitel(c, w, h, t, '⬆️ Unterbodenprüfung …', 4.3, 5.4);
        blitzlicht(c, w, h, t, 5.85, 0.2, '#fff', 0.5);
        kinobalken(c, w, h, t, this.dauer);
        return wackeln;
      },
    },

    blitzer: {
      dauer: 3.5,
      toene: [[0, 'whoosh'], [1.0, 'blitz'], [1.4, 'papier']],
      vibration: [[1.0, [40]]],
      gewinnText: (v) => `${v} geblitzt – 3 Punkte in Flensburg 📸`,
      verlierText: 'Geblitzt! 3 Punkte in Flensburg 📸',
      vorbereiten: () => ({}),
      zeichne(c, w, h, t, d) {
        const himmel = c.createLinearGradient(0, 0, 0, h);
        himmel.addColorStop(0, '#0f172a');
        himmel.addColorStop(0.5, '#1e293b');
        c.fillStyle = himmel;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#374151';
        c.fillRect(0, h * 0.5, w, h * 0.45);
        const fahrt = 1 - anteil(t, 0.9, 1.2);
        const versatz = (t * 900 * Math.max(0.15, fahrt)) % 80;
        c.fillStyle = '#e5e7eb';
        for (let x = -80 + versatz; x < w + 80; x += 80) c.fillRect(x, h * 0.72, 40, 5);
        // Blitzer-Säule
        const bx = w * 0.88;
        c.fillStyle = '#6b7280';
        c.fillRect(bx - 6, h * 0.3, 12, h * 0.22);
        c.fillStyle = '#d1d5db';
        c.beginPath();
        c.roundRect(bx - 22, h * 0.22, 44, 52, 6);
        c.fill();
        c.fillStyle = t > 1.0 && t < 1.25 ? '#fff' : '#111827';
        c.beginPath();
        c.arc(bx, h * 0.22 + 22, 10, 0, Math.PI * 2);
        c.fill();
        const s = Math.min(w * 0.36, 170);
        const n = d.verlierer.length;
        const vx = w * 0.56 - (1 - raus(anteil(t, 0, 1.0))) * w * 0.9;
        const zeilen = n === 1 ? [h * 0.66] : [h * 0.6, h * 0.86];
        d.verlierer.forEach((name, i) => {
          if (t < 1.0) {
            c.strokeStyle = 'rgba(255,255,255,0.35)';
            c.lineWidth = 3;
            for (let k = 0; k < 4; k++) {
              c.beginPath();
              c.moveTo(vx - s * 0.6 - k * 14, zeilen[i] - s * (0.1 + k * 0.07));
              c.lineTo(vx - s * 1.1 - k * 30, zeilen[i] - s * (0.1 + k * 0.07));
              c.stroke();
            }
          }
          auto(c, vx, zeilen[i], s, i ? '#f97316' : '#dc2626');
          namensschild(c, kurz(name), vx, zeilen[i] - s * 0.62);
        });
        // Bußgeldbescheid flattert herunter
        const fall = anteil(t, 1.4, 2.6);
        if (fall > 0) {
          const zielY = zeilen[0] - s * 0.45;
          const py = -80 + (zielY + 80) * sanft(fall);
          const px = vx + Math.sin(t * 7) * 40 * (1 - fall);
          c.save();
          c.translate(px, py);
          c.rotate(Math.sin(t * 5) * 0.5 * (1 - fall) - 0.12);
          const pb = Math.min(w * 0.42, 190);
          c.fillStyle = '#fff';
          c.shadowColor = 'rgba(0,0,0,0.4)';
          c.shadowBlur = 10;
          c.fillRect(-pb / 2, -pb * 0.32, pb, pb * 0.64);
          c.shadowBlur = 0;
          c.fillStyle = '#111827';
          c.font = `900 ${Math.round(pb / 12)}px ${SCHRIFT}`;
          c.textAlign = 'center';
          c.fillText('BUSSGELDBESCHEID', 0, -pb * 0.16);
          c.fillStyle = '#cbd5e1';
          for (let k = 0; k < 3; k++) c.fillRect(-pb * 0.38, -pb * 0.08 + k * pb * 0.08, pb * 0.76, 4);
          c.fillStyle = '#dc2626';
          c.font = `900 ${Math.round(pb / 10)}px ${SCHRIFT}`;
          c.fillText('+3 Punkte', 0, pb * 0.25);
          c.restore();
        }
        // Gewinner rollt vorschriftsmäßig vorbei
        const gx = -w * 0.3 + raus(anteil(t, 2.2, 3.3)) * w * 0.55;
        const gy = n === 1 ? h * 0.9 : h * 0.4;
        if (t > 2.2) {
          auto(c, gx, gy, s * 0.8, '#16a34a');
          namensschild(c, '👍 ' + kurz(d.gewinner.join(' & ')), gx, gy - s * 0.52, { hinter: 'rgba(250,204,21,0.95)' });
        }
        blitzlicht(c, w, h, t, 1.0, 0.35);
        return 0;
      },
    },

    abschlepp: {
      dauer: 3.8,
      toene: [[0.6, 'hupe'], [2.0, 'whoosh']],
      vibration: [],
      gewinnText: (v) => `${v} wurde abgeschleppt 🚛`,
      verlierText: 'Du wurdest abgeschleppt 🚛',
      vorbereiten: () => ({}),
      zeichne(c, w, h, t, d) {
        const himmel = c.createLinearGradient(0, 0, 0, h);
        himmel.addColorStop(0, '#7dd3fc');
        himmel.addColorStop(0.6, '#e0f2fe');
        c.fillStyle = himmel;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#9ca3af';
        c.fillRect(0, h * 0.7, w, h * 0.3);
        c.fillStyle = '#6b7280';
        c.fillRect(0, h * 0.68, w, h * 0.03);
        const n = d.verlierer.length;
        const s = Math.min(w * (n > 1 ? 0.26 : 0.3), 150);
        const boden = h * 0.82;
        // Abschleppwagen: kommt von rechts (0.6–1.6 s), fährt ab 2.0 s mit den Autos nach rechts weg
        const ls = s * 1.25;
        const autoX = w * (n > 1 ? 0.47 : 0.42);
        const ankunft = autoX + s * 0.5 + ls * 0.22 + 10 + (1 - raus(anteil(t, 0.6, 1.6))) * w * 0.9;
        const wegfahrt = Math.pow(anteil(t, 2.0, 3.6), 2) * w * 1.6;
        const lx = ankunft + wegfahrt;
        c.save();
        c.translate(lx, boden);
        c.fillStyle = '#facc15';
        c.fillRect(-ls * 0.1, -ls * 0.38, ls * 0.75, ls * 0.26);
        c.beginPath();
        c.roundRect(ls * 0.35, -ls * 0.62, ls * 0.3, ls * 0.3, 6);
        c.fill();
        c.fillStyle = 'rgba(191,219,254,0.95)';
        c.fillRect(ls * 0.42, -ls * 0.57, ls * 0.18, ls * 0.13);
        c.strokeStyle = '#78350f';
        c.lineWidth = 6;
        c.beginPath();
        c.moveTo(ls * 0.0, -ls * 0.38);
        c.lineTo(-ls * 0.22, -ls * 0.62);
        c.stroke();
        c.fillStyle = Math.floor(t * 6) % 2 ? '#f97316' : '#fde68a';
        c.beginPath();
        c.arc(ls * 0.5, -ls * 0.66, 7, 0, Math.PI * 2);
        c.fill();
        for (const rx of [ls * 0.05, ls * 0.5]) {
          c.fillStyle = '#111827';
          c.beginPath();
          c.arc(rx, -ls * 0.1, ls * 0.09, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
        // Verlierer-Autos: ab 1.6 s angehängt (vorne angehoben), fahren dann mit
        const haken = anteil(t, 1.6, 2.0);
        d.verlierer.forEach((name, i) => {
          const x = autoX - i * s * 1.05 + wegfahrt;
          const winkel = -0.12 * sanft(haken);
          if (i === 0 && haken > 0) {
            c.strokeStyle = '#1f2937';
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(lx - ls * 0.22, boden - ls * 0.62);
            c.lineTo(x + s * 0.45, boden - s * 0.3);
            c.stroke();
          }
          auto(c, x, boden - s * 0.06 * haken, s, i ? '#f97316' : '#dc2626', winkel);
          namensschild(c, kurz(name), x, boden - s * 0.7);
        });
        // Gewinner winkt
        if (t > 1.8) {
          const gx = w * 0.14;
          c.save();
          c.translate(gx, h * 0.6);
          c.rotate(Math.sin(t * 8) * 0.25);
          c.font = `${Math.round(s * 0.45)}px ${SCHRIFT}`;
          c.textAlign = 'center';
          c.fillText('👋', 0, 0);
          c.restore();
          namensschild(c, '🏆 ' + kurz(d.gewinner.join(' & ')), Math.max(gx, 70), h * 0.6 - s * 0.45, { hinter: 'rgba(250,204,21,0.95)' });
        }
        return 0;
      },
    },

    motor: {
      dauer: 3.6,
      toene: [[0.1, 'stottern'], [2.2, 'knall'], [2.25, 'explosion']],
      vibration: [[2.2, [60, 30, 120]]],
      gewinnText: (v) => `Kapitaler Motorschaden bei ${v} 💥`,
      verlierText: 'Kapitaler Motorschaden 💥',
      vorbereiten: () => ({
        rauch: Array.from({ length: 60 }, (_, i) => ({ start: (i / 60) * 3.4, dx: (Math.random() - 0.5) * 60, r: 10 + Math.random() * 18 })),
        teile: teileErzeugen(80, 200, ['#f97316', '#fde047', '#9ca3af']),
      }),
      zeichne(c, w, h, t, d) {
        const hint = c.createLinearGradient(0, 0, 0, h);
        hint.addColorStop(0, '#1f2937');
        hint.addColorStop(1, '#111827');
        c.fillStyle = hint;
        c.fillRect(0, 0, w, h);
        const n = d.verlierer.length;
        const s = Math.min(w * (n === 1 ? 0.5 : 0.36), 220);
        const wackeln = t < 2.2 ? 2 + 8 * anteil(t, 0, 2.2) : 0;
        d.verlierer.forEach((name, i) => {
          const mx = n === 1 ? w / 2 : w * (0.28 + i * 0.44);
          const my = h * 0.6;
          c.save();
          c.translate(mx + (Math.random() - 0.5) * wackeln, my + (Math.random() - 0.5) * wackeln);
          c.fillStyle = t > 2.2 ? '#44403c' : '#6b7280';
          c.fillRect(-s / 2, -s * 0.35, s, s * 0.5);
          c.fillStyle = t > 2.2 ? '#57534e' : '#9ca3af';
          c.fillRect(-s * 0.45, -s * 0.5, s * 0.9, s * 0.16);
          c.fillStyle = '#374151';
          c.fillRect(-s * 0.4, s * 0.15, s * 0.8, s * 0.12);
          for (let k = 0; k < 4; k++) {
            c.fillStyle = '#ef4444';
            c.fillRect(-s * 0.36 + k * s * 0.22, -s * 0.58, s * 0.08, s * 0.08);
          }
          if (t > 2.2) {
            c.strokeStyle = '#0c0a09';
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(-s * 0.1, -s * 0.35);
            c.lineTo(s * 0.05, -s * 0.15);
            c.lineTo(-s * 0.05, 0);
            c.lineTo(s * 0.12, s * 0.12);
            c.stroke();
          }
          c.restore();
          namensschild(c, (n === 1 ? 'Motor von ' : '') + kurz(name), mx, my + s * 0.42);
          // Rauch
          for (const p of d.rauch) {
            const alter = t - p.start;
            if (alter < 0 || alter > 2) continue;
            const dichte = t > 2.2 ? 0.7 : 0.25 + 0.35 * anteil(t, 0, 2.2);
            c.globalAlpha = dichte * (1 - alter / 2);
            c.fillStyle = '#9ca3af';
            c.beginPath();
            c.arc(mx + p.dx * alter, my - s * 0.6 - alter * 90, p.r * (1 + alter * (t > 2.2 ? 2 : 1)), 0, Math.PI * 2);
            c.fill();
          }
          c.globalAlpha = 1;
          // Kolben fliegt raus
          if (t > 2.2) {
            const f = t - 2.2;
            c.save();
            c.translate(mx + f * 90 * (i ? -1 : 1), my - s * 0.6 - f * 520 + f * f * 260);
            c.rotate(f * 9);
            c.fillStyle = '#d1d5db';
            c.fillRect(-s * 0.1, -s * 0.08, s * 0.2, s * 0.14);
            c.fillStyle = '#9ca3af';
            c.fillRect(-s * 0.025, s * 0.06, s * 0.05, s * 0.2);
            c.restore();
            explosion(c, d.teile, f, mx, my - s * 0.5);
          }
        });
        if (t > 2.6) namensschild(c, '🏁 ' + kurz(d.gewinner.join(' & ')) + ': läuft wie geschmiert ✨', w / 2, h * 0.16, { hinter: 'rgba(250,204,21,0.95)' });
        blitzlicht(c, w, h, t, 2.2, 0.4, '#fdba74', 0.8);
        return t > 2.2 ? 10 * Math.max(0, 1 - (t - 2.2) / 0.6) : 0;
      },
    },

    doppelko: {
      dauer: 2.6,
      toene: [[0, 'whoosh'], [1.2, 'explosion']],
      vibration: [[1.2, [80, 40, 80]]],
      vorbereiten: () => ({
        sterne: Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() < 0.1 ? 2 : 1, p: Math.random() * 6 })),
        teile: teileErzeugen(160, 280, ['#fde047', '#f97316', '#ef4444', '#93c5fd']),
      }),
      zeichne(c, w, h, t, d) {
        sterne(c, w, h, d.sterne, t);
        const s = Math.min(w * 0.3, 130);
        const anflug = sanft(anteil(t, 0, 1.2));
        const links = d.alle.slice(0, Math.ceil(d.alle.length / 2));
        const rechts = d.alle.slice(Math.ceil(d.alle.length / 2));
        if (t < 1.25) {
          const lx = -s + anflug * (w / 2 - s * 0.45 + s);
          const rx = w + s - anflug * (w / 2 - s * 0.45 + s);
          ufo(c, lx, h * 0.45, s, t);
          ufo(c, rx, h * 0.45, s, t);
          namensschild(c, kurz(links.join(' & ')), lx, h * 0.45 - s * 0.45);
          namensschild(c, kurz(rechts.join(' & ')), rx, h * 0.45 - s * 0.45);
        }
        if (t > 1.2) explosion(c, d.teile, t - 1.2, w / 2, h * 0.45);
        const ko = anteil(t, 1.5, 1.9);
        if (ko > 0) {
          c.save();
          c.translate(w / 2, h * 0.45);
          c.scale(3 - 2 * sanft(ko), 3 - 2 * sanft(ko));
          c.globalAlpha = ko;
          c.font = `900 ${Math.round(Math.min(w * 0.18, 90))}px ${SCHRIFT}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillStyle = '#fde047';
          c.strokeStyle = '#7c2d12';
          c.lineWidth = 6;
          c.strokeText('K.O.!', 0, 0);
          c.fillText('K.O.!', 0, 0);
          c.restore();
        }
        blitzlicht(c, w, h, t, 1.2, 0.4);
        return t > 1.2 ? 12 * Math.max(0, 1 - (t - 1.2) / 0.8) : 0;
      },
    },
  };

  // daten: { id, gewinner: [Namen], verlierer: [Namen], ichGewonnen }
  // optionen.standbild: Zeit in s – zeichnet nur dieses Bild und bleibt stehen (zum Testen)
  // optionen.art: bestimmte Szene erzwingen (zum Testen)
  function zeigen(daten, optionen = {}) {
    const art = daten.verlierer.length === 0 ? 'doppelko' : optionen.art || ARTEN[streuung(daten.id || '') % ARTEN.length];
    const szene = SZENEN[art];
    // Zeitdehnung: echte Zeit ↔ Szenenzeit (Abschnitte sortiert, ohne Überlappung)
    const dehnung = szene.dehnung || [];
    const echtZeit = (s) => dehnung.reduce((e, [von, bis, f]) => e + (Math.min(Math.max(s, von), bis) - von) * (f - 1), s);
    const szenenZeit = (e) => {
      let versatz = 0;
      for (const [von, bis, f] of dehnung) {
        const a = von + versatz;
        if (e < a) break;
        if (e < a + (bis - von) * f) return von + (e - a) / f;
        versatz += (bis - von) * (f - 1);
      }
      return e - versatz;
    };
    const d = { ...daten, alle: [...daten.gewinner, ...daten.verlierer], ...szene.vorbereiten(daten) };
    const verlierer = daten.verlierer.join(' & ');
    let titel;
    let unter;
    if (art === 'doppelko') {
      titel = '💥 Doppel-K.O.!';
      unter = 'Unentschieden – keiner kommt davon.';
    } else if (daten.ichGewonnen) {
      titel = daten.gewinner.length > 1 ? '🏆 Geteilter Sieg!' : '🏆 Du gewinnst!';
      unter = szene.gewinnText(verlierer);
    } else {
      titel = `🏆 ${daten.gewinner.join(' & ')} ${daten.gewinner.length > 1 ? 'gewinnen' : 'gewinnt'}`;
      unter = szene.verlierText;
    }

    const el = document.createElement('div');
    el.className = 'finisher';
    el.innerHTML = `<canvas></canvas>
      <div class="finisher-banner" hidden><div class="finisher-titel"></div><div class="finisher-unter"></div><div class="finisher-hinweis">Antippen zum Schließen</div></div>
      <div class="finisher-ueberspringen">Antippen zum Überspringen</div>`;
    el.querySelector('.finisher-titel').textContent = titel;
    el.querySelector('.finisher-unter').textContent = unter;
    document.body.appendChild(el);
    const leinwand = el.querySelector('canvas');
    const c = leinwand.getContext('2d');
    const banner = el.querySelector('.finisher-banner');

    const bild = (t) => {
      const dpr = window.devicePixelRatio || 1;
      const w = innerWidth;
      const h = innerHeight;
      if (leinwand.width !== Math.round(w * dpr) || leinwand.height !== Math.round(h * dpr)) {
        leinwand.width = Math.round(w * dpr);
        leinwand.height = Math.round(h * dpr);
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      c.save();
      const wackeln = szene.zeichne(c, w, h, t, d) || 0;
      c.restore();
      if (wackeln) el.style.transform = `translate(${(Math.random() - 0.5) * wackeln}px, ${(Math.random() - 0.5) * wackeln}px)`;
      else el.style.transform = '';
    };

    const bannerZeigen = () => {
      if (!banner.hidden) return;
      banner.hidden = false;
      el.querySelector('.finisher-ueberspringen').hidden = true;
      Ton.spiel(art === 'doppelko' ? 'gong' : daten.ichGewonnen ? 'fanfare' : 'wahwah');
    };

    if (optionen.standbild != null) {
      bild(optionen.standbild);
      if (optionen.standbild >= szene.dauer) bannerZeigen();
      return Promise.resolve(el);
    }

    return new Promise((fertig) => {
      let start = performance.now();
      let weg = false;
      let schliessenUm = null;
      const ausstehend = szene.toene.map(([zeit, name, bis]) => ({ zeit: echtZeit(zeit), name, lang: bis && echtZeit(bis) - echtZeit(zeit) }));
      const vibrationen = szene.vibration.map(([zeit, muster]) => ({ zeit: echtZeit(zeit), muster }));
      const schliessen = () => {
        if (weg) return;
        weg = true;
        el.classList.add('aus');
        window.removeEventListener('hashchange', schliessen);
        setTimeout(() => {
          el.remove();
          fertig();
        }, 300);
      };
      window.addEventListener('hashchange', schliessen);
      if (wenigBewegung()) {
        // Ruhige Fassung: nur das Schlussbild mit Banner
        bild(szene.dauer + 1);
        bannerZeigen();
        el.addEventListener('click', schliessen);
        setTimeout(schliessen, 3500);
        return;
      }
      el.addEventListener('click', () => {
        if (banner.hidden) {
          // überspringen: noch ausstehende Töne verwerfen, direkt zum Schlussbild
          ausstehend.length = 0;
          vibrationen.length = 0;
          start = performance.now() - echtZeit(szene.dauer) * 1000 - 1500;
        } else schliessen();
      });
      const schritt = (jetzt) => {
        if (weg) return;
        const echt = (jetzt - start) / 1000;
        const t = szenenZeit(echt);
        while (ausstehend.length && ausstehend[0].zeit <= echt) {
          const ton = ausstehend.shift();
          Ton.spiel(ton.name, 0, ton.lang);
        }
        while (vibrationen.length && vibrationen[0].zeit <= echt) Ton.vibrieren(vibrationen.shift().muster);
        bild(t);
        if (t >= szene.dauer) {
          bannerZeigen();
          if (schliessenUm == null) schliessenUm = jetzt + 6000;
        }
        if (schliessenUm != null && jetzt > schliessenUm) return schliessen();
        requestAnimationFrame(schritt);
      };
      requestAnimationFrame(schritt);
    });
  }

  return { zeigen, ARTEN, huPlakette };
})();
