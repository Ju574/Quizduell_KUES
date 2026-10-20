// Fragenkatalog für das Prüfi-Duell
//
// Aufbau einer Frage:
//   id:         eindeutige Kennung. NIE nachträglich ändern – Lernstand und Duelle hängen daran.
//   kategorie:  Themengebiet (daraus werden die Kategorien im Spiel gebildet)
//   frage:      Fragetext
//   richtig:    die richtige Antwort
//   falsch:     Liste mit falschen Antworten (meist 3)
//   erklaerung: optional, wird nach dem Beantworten angezeigt
//
// Die Reihenfolge der Antworten wird im Spiel automatisch gemischt.
// HINWEIS: Das hier sind Beispielfragen – bitte mit den Ausbildungsunterlagen abgleichen.

const FRAGEN = [
  // ---------- HU & Recht ----------
  {
    id: 'hu-001',
    kategorie: 'HU & Recht',
    frage: 'Welche Vorschrift regelt die regelmäßige Untersuchung der Fahrzeuge (HU)?',
    richtig: '§ 29 StVZO',
    falsch: ['§ 19 StVZO', '§ 21 StVZO', '§ 36 StVZO'],
    erklaerung: '§ 29 StVZO in Verbindung mit Anlage VIII regelt HU und Sicherheitsprüfung.',
  },
  {
    id: 'hu-002',
    kategorie: 'HU & Recht',
    frage: 'Wann muss ein neu zugelassener Pkw erstmals zur Hauptuntersuchung?',
    richtig: 'Nach 36 Monaten',
    falsch: ['Nach 12 Monaten', 'Nach 24 Monaten', 'Nach 48 Monaten'],
    erklaerung: 'Danach im Regelfall alle 24 Monate.',
  },
  {
    id: 'hu-003',
    kategorie: 'HU & Recht',
    frage: 'Bei welcher Einstufung wird keine Prüfplakette zugeteilt und das Fahrzeug ist innerhalb eines Monats erneut vorzuführen?',
    richtig: 'Erhebliche Mängel (EM)',
    falsch: ['Geringe Mängel (GM)', 'Ohne festgestellte Mängel (OM)', 'Leichte Mängel (LM)'],
  },
  {
    id: 'hu-004',
    kategorie: 'HU & Recht',
    frage: 'Was zeigt die Zahl an der 12-Uhr-Position der Prüfplakette an?',
    richtig: 'Den Monat, in dem die nächste HU fällig ist',
    falsch: ['Das Jahr der nächsten HU', 'Die Nummer der Prüfstelle', 'Die Anzahl der bisherigen Hauptuntersuchungen'],
    erklaerung: 'Das Jahr steht in der Mitte der Plakette und ist zusätzlich an der Plakettenfarbe erkennbar.',
  },
  {
    id: 'hu-005',
    kategorie: 'HU & Recht',
    frage: 'Wie wird ein Fahrzeug eingestuft, von dem eine unmittelbare Verkehrsgefährdung ausgeht?',
    richtig: 'Verkehrsunsicher (VU)',
    falsch: ['Erhebliche Mängel (EM)', 'Geringe Mängel (GM)', 'Bedingt verkehrssicher (BV)'],
  },

  // ---------- Betriebserlaubnis ----------
  {
    id: 'be-001',
    kategorie: 'Betriebserlaubnis',
    frage: 'Welche Vorschrift regelt Erteilung, Wirksamkeit und Erlöschen der Betriebserlaubnis?',
    richtig: '§ 19 StVZO',
    falsch: ['§ 29 StVZO', '§ 30 StVZO', '§ 47 StVZO'],
  },
  {
    id: 'be-002',
    kategorie: 'Betriebserlaubnis',
    frage: 'Nach welcher Vorschrift wird eine Betriebserlaubnis für ein Einzelfahrzeug erteilt?',
    richtig: '§ 21 StVZO',
    falsch: ['§ 20 StVZO', '§ 22a StVZO', '§ 29 StVZO'],
    erklaerung: '§ 20 StVZO betrifft die Allgemeine Betriebserlaubnis für Typen.',
  },
  {
    id: 'be-003',
    kategorie: 'Betriebserlaubnis',
    frage: 'Wofür steht die Abkürzung ABE?',
    richtig: 'Allgemeine Betriebserlaubnis',
    falsch: ['Amtliche Bauartbescheinigung', 'Abnahmebestätigung Einzelfahrzeug', 'Allgemeine Bauteil-Erlaubnis'],
  },
  {
    id: 'be-004',
    kategorie: 'Betriebserlaubnis',
    frage: 'Ein Teil mit Teilegutachten wurde verbaut. Was ist in der Regel erforderlich?',
    richtig: 'Eine Änderungsabnahme nach § 19 Abs. 3 StVZO',
    falsch: ['Keine weitere Maßnahme', 'Eine Einzelbetriebserlaubnis nach § 21 StVZO', 'Eine neue Typgenehmigung beim KBA'],
  },
  {
    id: 'be-005',
    kategorie: 'Betriebserlaubnis',
    frage: 'Welche Behörde erteilt in Deutschland Typgenehmigungen für Fahrzeuge?',
    richtig: 'Kraftfahrt-Bundesamt (KBA)',
    falsch: ['Bundesanstalt für Straßenwesen (BASt)', 'Die örtliche Zulassungsstelle', 'Das Landratsamt'],
  },

  // ---------- Bremsen ----------
  {
    id: 'br-001',
    kategorie: 'Bremsen',
    frage: 'Warum muss Bremsflüssigkeit regelmäßig gewechselt werden?',
    richtig: 'Sie ist hygroskopisch – aufgenommenes Wasser senkt den Siedepunkt',
    falsch: ['Sie verdunstet mit der Zeit', 'Sie wird durch Bremsabrieb dickflüssiger', 'Sie greift durch Oxidation die Bremsscheiben an'],
  },
  {
    id: 'br-002',
    kategorie: 'Bremsen',
    frage: 'Welche Bremsflüssigkeit basiert auf Silikon?',
    richtig: 'DOT 5',
    falsch: ['DOT 3', 'DOT 4', 'DOT 5.1'],
    erklaerung: 'DOT 3, DOT 4 und DOT 5.1 sind glykolbasiert, DOT 5 ist damit nicht mischbar.',
  },
  {
    id: 'br-003',
    kategorie: 'Bremsen',
    frage: 'Was ist die Hauptaufgabe des ABS?',
    richtig: 'Blockieren der Räder verhindern, damit das Fahrzeug lenkbar bleibt',
    falsch: ['Den Bremsweg auf jedem Untergrund verkürzen', 'Das Fahrzeug am Berg halten', 'Die Bremsbeläge gleichmäßig abnutzen'],
  },
  {
    id: 'br-004',
    kategorie: 'Bremsen',
    frage: 'Was wird auf dem Rollenbremsprüfstand gemessen?',
    richtig: 'Die Bremskraft am Radumfang',
    falsch: ['Der Druck im Hauptbremszylinder', 'Die Temperatur der Bremsscheibe', 'Der Bremsweg aus 100 km/h'],
  },
  {
    id: 'br-005',
    kategorie: 'Bremsen',
    frage: 'Welche Bremsanlage sichert ein abgestelltes Fahrzeug gegen Wegrollen?',
    richtig: 'Feststellbremsanlage',
    falsch: ['Hilfsbremsanlage', 'Dauerbremsanlage', 'Betriebsbremsanlage'],
  },

  // ---------- Beleuchtung ----------
  {
    id: 'bl-001',
    kategorie: 'Beleuchtung',
    frage: 'Welche Lichtfarbe muss ein Rückfahrscheinwerfer haben?',
    richtig: 'Weiß',
    falsch: ['Gelb', 'Rot', 'Orange'],
  },
  {
    id: 'bl-002',
    kategorie: 'Beleuchtung',
    frage: 'Mit welcher Frequenz müssen Fahrtrichtungsanzeiger blinken?',
    richtig: '90 ± 30 Impulse pro Minute',
    falsch: ['30 ± 10 Impulse pro Minute', '150 ± 30 Impulse pro Minute', '200 ± 50 Impulse pro Minute'],
  },
  {
    id: 'bl-003',
    kategorie: 'Beleuchtung',
    frage: 'Wann darf die Nebelschlussleuchte eingeschaltet werden?',
    richtig: 'Wenn durch Nebel die Sichtweite unter 50 m liegt',
    falsch: ['Wenn die Sichtweite unter 100 m liegt', 'Bei Dunkelheit und starkem Regen', 'Immer zusammen mit dem Abblendlicht'],
    erklaerung: '§ 17 Abs. 3 StVO.',
  },
  {
    id: 'bl-004',
    kategorie: 'Beleuchtung',
    frage: 'Welche Lichtfarbe haben seitliche Markierungsleuchten?',
    richtig: 'Gelb',
    falsch: ['Weiß', 'Blau', 'Grün'],
    erklaerung: 'Die hinterste seitliche Markierungsleuchte darf rot sein.',
  },
  {
    id: 'bl-005',
    kategorie: 'Beleuchtung',
    frage: 'Welche Lichtfarbe muss die Kennzeichenbeleuchtung haben?',
    richtig: 'Weiß',
    falsch: ['Gelb', 'Rot', 'Beliebig'],
  },

  // ---------- Reifen & Räder ----------
  {
    id: 're-001',
    kategorie: 'Reifen & Räder',
    frage: 'Wie groß ist die gesetzliche Mindestprofiltiefe bei Pkw-Reifen?',
    richtig: '1,6 mm',
    falsch: ['1,0 mm', '2,0 mm', '3,0 mm'],
    erklaerung: '§ 36 StVZO – gemessen in den Hauptprofilrillen.',
  },
  {
    id: 're-002',
    kategorie: 'Reifen & Räder',
    frage: 'Welche Kennzeichnung muss ein Winterreifen seit dem 1.10.2024 tragen?',
    richtig: 'Alpine-Symbol (Bergpiktogramm mit Schneeflocke)',
    falsch: ['Nur M+S', 'Eine einzelne Schneeflocke', 'Ein rotes W'],
  },
  {
    id: 're-003',
    kategorie: 'Reifen & Räder',
    frage: 'Welche maximale Tragfähigkeit pro Reifen bedeutet der Lastindex 91?',
    richtig: '615 kg',
    falsch: ['910 kg', '500 kg', '715 kg'],
  },
  {
    id: 're-004',
    kategorie: 'Reifen & Räder',
    frage: 'Für welche Höchstgeschwindigkeit steht der Geschwindigkeitsindex H?',
    richtig: '210 km/h',
    falsch: ['190 km/h', '240 km/h', '180 km/h'],
  },
  {
    id: 're-005',
    kategorie: 'Reifen & Räder',
    frage: 'Was bedeutet die DOT-Kennung „2319“ auf einem Reifen?',
    richtig: 'Hergestellt in der 23. Kalenderwoche 2019',
    falsch: ['Hergestellt am 23. Januar 2019', 'Charge 23, Werk 19', 'Hergestellt im Februar 2023'],
  },

  // ---------- Maße & Gewichte ----------
  {
    id: 'mg-001',
    kategorie: 'Maße & Gewichte',
    frage: 'Wie breit darf ein Fahrzeug nach § 32 StVZO im Regelfall höchstens sein?',
    richtig: '2,55 m',
    falsch: ['2,50 m', '2,60 m', '3,00 m'],
    erklaerung: 'Ausnahme u. a. klimatisierte Aufbauten (Kühlfahrzeuge): 2,60 m.',
  },
  {
    id: 'mg-002',
    kategorie: 'Maße & Gewichte',
    frage: 'Wie hoch darf ein Fahrzeug höchstens sein?',
    richtig: '4,00 m',
    falsch: ['3,80 m', '4,20 m', '4,50 m'],
  },
  {
    id: 'mg-003',
    kategorie: 'Maße & Gewichte',
    frage: 'Wie lang darf ein Sattelkraftfahrzeug höchstens sein?',
    richtig: '16,50 m',
    falsch: ['15,00 m', '18,75 m', '12,00 m'],
  },
  {
    id: 'mg-004',
    kategorie: 'Maße & Gewichte',
    frage: 'Wie lang darf ein Lastzug (Lkw mit Anhänger) höchstens sein?',
    richtig: '18,75 m',
    falsch: ['16,50 m', '20,00 m', '25,25 m'],
  },
];
