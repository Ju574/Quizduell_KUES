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
    ['serie', 'Serien-Flamme'], ['laden', 'Laser laden'], ['laser', 'Laser'], ['explosion', 'Explosion'], ['stempel', 'Stempel'], ['pling', 'Plakette'],
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
    // name: Schlüssel aus SOUNDS, verzoegerung in Sekunden
    spiel(name, verzoegerung = 0) {
      if (!an || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
      try {
        SOUNDS[name](ctx.currentTime + 0.01 + verzoegerung);
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
  const ARTEN =['orbital', 'hu', 'blitzer', 'abschlepp', 'motor'];
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

  // ---------- Szenen ----------
  // Jede Szene: dauer (dann kommt das Banner), toene [[zeit, name]], vibration [[zeit, muster]],
  // vorbereiten(d) → Zusatzdaten, zeichne(c, w, h, t, d) gibt optional eine Wackel-Stärke zurück.
  const SZENEN = {
    orbital: {
      dauer: 3.3,
      toene: [[0, 'whoosh'], [1.0, 'laden'], [2.0, 'laser'], [2.3, 'explosion']],
      vibration: [[2.3, [80, 40, 160]]],
      gewinnText: (v) => `Orbitalschlag auf ${v} ausgeführt 🛸`,
      verlierText: 'Du wurdest aus dem Orbit erledigt 😵',
      vorbereiten: () => ({
        sterne: Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() < 0.1 ? 2 : 1, p: Math.random() * 6 })),
        teile: teileErzeugen(140, 260, ['#fde047', '#f97316', '#ef4444', '#fff7ed']),
        flug: Math.random() < 0.5 ? -1 : 1,
      }),
      zeichne(c, w, h, t, d) {
        sterne(c, w, h, d.sterne, t);
        const r = Math.min(w * 0.75, h * 0.55);
        const ex = w / 2;
        const ey = h + r * 0.2;
        const oben = ey - r;
        // Erde
        const verlauf = c.createRadialGradient(ex - r * 0.3, ey - r * 0.5, r * 0.1, ex, ey, r);
        verlauf.addColorStop(0, '#60a5fa');
        verlauf.addColorStop(1, '#1e3a8a');
        c.fillStyle = verlauf;
        c.beginPath();
        c.arc(ex, ey, r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#22c55e';
        for (const [dx, dy, rx, ry] of [[-0.35, -0.75, 0.22, 0.1], [0.25, -0.82, 0.18, 0.08], [0.05, -0.6, 0.12, 0.06], [-0.6, -0.45, 0.1, 0.12]]) {
          c.beginPath();
          c.ellipse(ex + dx * r, ey + dy * r, rx * r, ry * r, 0.3, 0, Math.PI * 2);
          c.fill();
        }
        c.strokeStyle = 'rgba(147,197,253,0.6)';
        c.lineWidth = 6;
        c.beginPath();
        c.arc(ex, ey, r + 4, 0, Math.PI * 2);
        c.stroke();
        // Krater nach dem Einschlag
        if (t > 2.3) {
          const k = c.createRadialGradient(ex, oben + 6, 2, ex, oben + 6, r * 0.25);
          k.addColorStop(0, 'rgba(255,237,213,0.95)');
          k.addColorStop(0.3, 'rgba(249,115,22,0.8)');
          k.addColorStop(1, 'rgba(127,29,29,0)');
          c.fillStyle = k;
          c.beginPath();
          c.arc(ex, oben + 6, r * 0.25, 0, Math.PI * 2);
          c.fill();
        }
        // Verlierer auf der Erde – nach dem Einschlag fliegen ihre Namen davon
        d.verlierer.forEach((name, i) => {
          const n = d.verlierer.length;
          const px = ex + (n === 1 ? 0 : (i - (n - 1) / 2) * Math.min(w * 0.35, 150));
          const py = oben + 18 + Math.abs(px - ex) * 0.15;
          const flug = Math.max(0, t - 2.3);
          c.save();
          c.translate(px + flug * (i % 2 ? 140 : -140), py - 30 - flug * 260 + flug * flug * 60);
          c.rotate(flug * (i % 2 ? 4 : -4));
          c.font = `${28}px ${SCHRIFT}`;
          c.textAlign = 'center';
          c.fillText(flug > 0 ? '😵' : '🧍', 0, 0);
          c.restore();
          if (flug < 0.9) namensschild(c, kurz(name), px + flug * (i % 2 ? 140 : -140), py - 62 - flug * 260, { hinter: `rgba(255,255,255,${0.92 * (1 - flug / 0.9)})` });
        });
        // Raumschiff
        const sx = w / 2 + (1 - sanft(anteil(t, 0, 1.0))) * w * 0.7 * d.flug;
        const sy = h * 0.2;
        const s = Math.min(w * 0.32, 140);
        ufo(c, sx, sy, s, t);
        namensschild(c, '🏆 ' + kurz(d.gewinner.join(' & ')), sx, sy - s * 0.42, { hinter: 'rgba(250,204,21,0.95)' });
        // Aufladen
        const laden = anteil(t, 1.0, 2.0);
        if (laden > 0 && t < 2.35) {
          c.fillStyle = `rgba(239,68,68,${0.4 + 0.4 * Math.sin(t * 30)})`;
          c.beginPath();
          c.arc(sx, sy + s * 0.12, 4 + laden * s * 0.12, 0, Math.PI * 2);
          c.fill();
        }
        // Strahl
        if (t > 2.0 && t < 2.7) {
          const breite = 4 + 26 * Math.sin(anteil(t, 2.0, 2.7) * Math.PI);
          const strahl = c.createLinearGradient(sx - breite, 0, sx + breite, 0);
          strahl.addColorStop(0, 'rgba(239,68,68,0)');
          strahl.addColorStop(0.5, 'rgba(254,226,226,1)');
          strahl.addColorStop(1, 'rgba(239,68,68,0)');
          c.fillStyle = strahl;
          c.fillRect(sx - breite, sy + s * 0.12, breite * 2, oben - sy);
        }
        if (t > 2.3) explosion(c, d.teile, t - 2.3, ex, oben);
        blitzlicht(c, w, h, t, 2.3, 0.4);
        return t > 2.3 ? 14 * Math.max(0, 1 - (t - 2.3) / 0.9) : 0;
      },
    },

    hu: {
      dauer: 3.6,
      toene: [[0, 'whoosh'], [1.6, 'stempel'], [2.1, 'whoosh'], [3.0, 'pling']],
      vibration: [[1.6, [70]]],
      gewinnText: (v) => `${v}: erhebliche Mängel – keine Plakette 🚫`,
      verlierText: 'Erhebliche Mängel – keine Plakette für dich 🚫',
      vorbereiten: () => ({ funken: teileErzeugen(40, 120, ['#fde047', '#fff', '#22c55e']) }),
      zeichne(c, w, h, t, d) {
        const wand = c.createLinearGradient(0, 0, 0, h);
        wand.addColorStop(0, '#334155');
        wand.addColorStop(0.55, '#475569');
        wand.addColorStop(0.56, '#64748b');
        wand.addColorStop(1, '#334155');
        c.fillStyle = wand;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#facc15';
        for (let x = -40; x < w + 40; x += 60) c.fillRect(x, h * 0.86, 30, 8);
        namensschild(c, '🔧 HU-Prüfstraße', w / 2, h * 0.1, { hinter: '#1e3a8a', farbe: '#fff', groesse: 18 });
        const s = Math.min(w * 0.36, 170);
        const n = d.verlierer.length;
        const vx = w * 0.27 - (1 - raus(anteil(t, 0, 1.0))) * w * 0.7;
        const zeilen = n === 1 ? [h * 0.62] : [h * 0.48, h * 0.78];
        d.verlierer.forEach((name, i) => {
          auto(c, vx, zeilen[i], s, i ? '#f97316' : '#dc2626');
          namensschild(c, kurz(name), vx, zeilen[i] - s * 0.62);
        });
        // Stempel
        const st = anteil(t, 1.3, 1.6);
        if (st > 0) {
          const mitte = n === 1 ? zeilen[0] - s * 0.25 : (zeilen[0] + zeilen[1]) / 2 - s * 0.25;
          const skala = 3 - 2 * sanft(st);
          c.save();
          c.translate(w * 0.27, mitte);
          c.rotate(-0.2);
          c.scale(skala, skala);
          c.globalAlpha = st;
          const sb = Math.min(w * 0.46, 220);
          c.strokeStyle = '#dc2626';
          c.lineWidth = 6;
          c.fillStyle = 'rgba(254,226,226,0.88)';
          c.beginPath();
          c.roundRect(-sb / 2, -34, sb, 68, 10);
          c.fill();
          c.stroke();
          c.fillStyle = '#b91c1c';
          c.textAlign = 'center';
          c.font = `900 ${Math.round(sb / 11)}px ${SCHRIFT}`;
          c.fillText('ERHEBLICHE MÄNGEL', 0, -6);
          c.font = `900 ${Math.round(sb / 13)}px ${SCHRIFT}`;
          c.fillText('KEINE PLAKETTE', 0, 20);
          c.restore();
        }
        // Gewinner fährt vor und bekommt die Plakette
        const gx = w * 0.74 + (1 - raus(anteil(t, 2.0, 2.8))) * w * 0.7;
        const gy = h * 0.62;
        auto(c, gx, gy, s, '#16a34a');
        namensschild(c, '🏆 ' + kurz(d.gewinner.join(' & ')), gx, gy - s * 0.62, { hinter: 'rgba(250,204,21,0.95)' });
        const pl = anteil(t, 2.8, 3.1);
        if (pl > 0) {
          const pr = s * 0.13 * (1 + 3 * (1 - sanft(pl)));
          const px = gx + s * 0.2;
          const py = gy - s * 0.2;
          c.globalAlpha = pl;
          c.fillStyle = '#16a34a';
          c.beginPath();
          c.arc(px, py, pr, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#fde047';
          c.beginPath();
          c.arc(px, py, pr * 0.72, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#14532d';
          c.font = `900 ${Math.round(pr * 0.8)}px ${SCHRIFT}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('✓', px, py + 1);
          c.globalAlpha = 1;
          if (t > 3.0) explosion(c, d.funken, t - 3.0, px, py);
        }
        return t > 1.6 && t < 1.9 ? 8 : 0;
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
    const d = { ...daten, alle: [...daten.gewinner, ...daten.verlierer], ...szene.vorbereiten() };
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
      const ausstehend = szene.toene.map(([zeit, name]) => ({ zeit, name }));
      const vibrationen = szene.vibration.map(([zeit, muster]) => ({ zeit, muster }));
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
          start = performance.now() - szene.dauer * 1000 - 1500;
        } else schliessen();
      });
      const schritt = (jetzt) => {
        if (weg) return;
        const t = (jetzt - start) / 1000;
        while (ausstehend.length && ausstehend[0].zeit <= t) Ton.spiel(ausstehend.shift().name);
        while (vibrationen.length && vibrationen[0].zeit <= t) Ton.vibrieren(vibrationen.shift().muster);
        bild(t);
        if (t >= szene.dauer) {
          bannerZeigen();
          if (schliessenUm == null) schliessenUm = jetzt + 4000;
        }
        if (schliessenUm != null && jetzt > schliessenUm) return schliessen();
        requestAnimationFrame(schritt);
      };
      requestAnimationFrame(schritt);
    });
  }

  return { zeigen, ARTEN };
})();
