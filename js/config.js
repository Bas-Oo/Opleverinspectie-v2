// @ts-check
/* Standaardconfiguratie. Alles wat per organisatie of per project kan verschillen staat hier als data,
   niet in de code. De gebruiker past het aan onder Instellingen; daar wordt het als record 'config' bewaard.
   Een nieuwe sleutel in deze standaard wordt bij het laden automatisch aangevuld (zie vulConfigAan). */

export const APP_VERSIE = '2.1.0';

/** @typedef {{code:string, titel:string, uitleg:string, blokkeertOplevering:boolean, limietObject:number|null, limietBlok:number|null, kleur:string}} Urgentie */
/** @typedef {{key:string, label:string, optioneel?:boolean}} Meter */
/** @typedef {{key:string, label:string, soort:'aantal'|'jn'|'jnn'}} OverigeZaak */

export const STANDAARD_CONFIG = {
  id: 'config',
  organisatie: {
    naam: 'De Woningstichting Wageningen',
    adres: 'Buurtseweg 3',
    postbus: 'Postbus 38, 6700 AA Wageningen',
    plaats: 'Wageningen'
  },
  /** Volgorde = volgorde in de app en de PDF. blokkeertOplevering: een open punt met deze urgentie blokkeert het ondertekenen. */
  /** @type {Urgentie[]} */
  urgenties: [
    { code: 'A', titel: 'Kritiek', uitleg: 'Verhindert veilig gebruik, verhuur of ingebruikname. Oplevering kan niet plaatsvinden.', blokkeertOplevering: true, limietObject: null, limietBlok: null, kleur: '#B52C44' },
    { code: 'B', titel: 'Hoog', uitleg: 'Functionele tekortkoming. Herstel vóór de formele oplevering is vereist.', blokkeertOplevering: true, limietObject: null, limietBlok: null, kleur: '#8CBAE2' },
    { code: 'C', titel: 'Laag', uitleg: 'Restpunt na oplevering: cosmetisch of afwerking, geen belemmering voor gebruik.', blokkeertOplevering: false, limietObject: 3, limietBlok: 5, kleur: '#F0B400' }
  ],
  herstelTermijnWerkdagen: 10,
  objectTypes: ['Appartement', 'Woning', 'Algemene ruimte', 'Overig'],
  /** Looproute: deze volgorde bepaalt de groepering van de punten */
  ruimtes: ['Hal', 'Toilet', 'Woonkamer', 'Keuken', 'Trapopgang', 'Overloop', 'Slaapkamer 1', 'Slaapkamer 2', 'Slaapkamer 3', 'Badkamer', 'Technische ruimte', 'Berging', 'Balkon', 'Tuin', 'Gevel', 'Algemeen'],
  /** Snelkeuzes bij de omschrijving; eerder gebruikte omschrijvingen in het complex komen erbij */
  omschrijvingen: ['Beschadiging', 'Kras', 'Kitwerk ontbreekt of is onvolledig', 'Schilderwerk niet in orde', 'Deur klemt', 'Werkt niet', 'Ontbreekt', 'Lekkage', 'Tegel beschadigd', 'Niet schoon opgeleverd'],
  /** @type {Meter[]} */
  meters: [
    { key: 'elLaag', label: 'Elektra laag' },
    { key: 'elHoog', label: 'Elektra hoog' },
    { key: 'elLaagTerug', label: 'Elektra laag teruglevering' },
    { key: 'elHoogTerug', label: 'Elektra hoog teruglevering' },
    { key: 'water', label: 'Water' },
    { key: 'gas', label: 'Gas', optioneel: true }
  ],
  /** @type {OverigeZaak[]} */
  overigeZaken: [
    { key: 'sleutels', label: 'Sleutels (aantal)', soort: 'aantal' },
    { key: 'raamsleutels', label: 'Raamsleutels compleet', soort: 'jnn' },
    { key: 'groepenkast', label: 'Groepenkastkaart gesealed aanwezig', soort: 'jn' },
    { key: 'screens', label: 'Bediening screens aanwezig', soort: 'jnn' },
    { key: 'dakluik', label: 'Bediening dakluik aanwezig', soort: 'jnn' },
    { key: 'wp', label: 'Inregelrapport warmtepomp', soort: 'jnn' },
    { key: 'wtw', label: 'Inregelrapport WTW', soort: 'jnn' },
    { key: 'elektra', label: 'Testrapport elektra', soort: 'jn' }
  ],
  teksten: {
    verklaringOplevering: 'De opdrachtgever verklaart het werk te hebben opgenomen en de hierboven genoemde tekortkomingen te hebben geconstateerd. Ondertekening van dit proces-verbaal houdt geen aanvaarding in van gebreken die bij de opname redelijkerwijs niet waarneembaar waren (verborgen gebreken), noch doet ondertekening afbreuk aan enige andere aanspraak van opdrachtgever uit hoofde van de onderliggende overeenkomst. De opdrachtnemer verklaart de geconstateerde tekortkomingen binnen {termijn} werkdagen na datum van ondertekening te herstellen, tenzij sprake is van langere levertijden.',
    verklaringHerstel: 'De opdrachtgever heeft de afhandeling van de tekortkomingen uit het proces-verbaal van oplevering gecontroleerd. Punten met een paraaf zijn naar tevredenheid hersteld. Punten zonder paraaf staan nog open; de opdrachtnemer herstelt die alsnog.'
  }
};

/** Vult een opgeslagen configuratie aan met sleutels die in een nieuwere versie zijn bijgekomen. Wijzigt niets wat al bestaat. */
export function vulConfigAan(c) {
  const uit = JSON.parse(JSON.stringify(STANDAARD_CONFIG));
  if (!c || typeof c !== 'object') return uit;
  for (const k of Object.keys(uit)) if (c[k] !== undefined) uit[k] = (typeof uit[k] === 'object' && !Array.isArray(uit[k]) && uit[k]) ? Object.assign(uit[k], c[k]) : c[k];
  for (const k of Object.keys(c)) if (uit[k] === undefined) uit[k] = c[k];
  return uit;
}

export const urgentie = (config, code) => config.urgenties.find(u => u.code === code) || null;
