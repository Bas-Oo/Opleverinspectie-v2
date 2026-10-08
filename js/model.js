// @ts-check
/* Domeinmodel en protocolregels. Pure functies zonder DOM of opslag, zodat ze met `node --test` te testen zijn.

   Kernidee: één tekortkoming is één record met een vast nummer en een statushistorie. Een punt wordt nooit
   gekopieerd tussen vooropname, oplevering en herstelcontrole; elke fase voegt alleen gebeurtenissen toe.

   Fases van een object:  voor → oplever → herstel (één of meer rondes) → gereed
   - voor:    vooropname. Punten vastleggen. "Oplevering starten" bevriest de vooropname als document (zonder handtekening).
   - oplever: elk vooropnamepunt beoordelen (hersteld / nog open), nieuwe punten toevoegen, tekenen.
   - herstel: de opdrachtnemer herstelt binnen de termijn; de opdrachtgever parafeert per punt. Afsluiten met een herstel-PV.
   - gereed:  alles hersteld en vastgelegd. */

export const FASES = /** @type {const} */ (['voor', 'oplever', 'herstel', 'gereed']);
export const FASE_LABEL = { voor: 'Vooropname', oplever: 'Oplevering', herstel: 'Herstelcontrole', gereed: 'Gereed' };
export const PARTIJ_VELDEN = [['vertOpdrachtgever', 'Namens opdrachtgever'], ['opdrachtnemer', 'Opdrachtnemer'], ['vertOpdrachtnemer', 'Namens opdrachtnemer']];
const BEOORDELING = ['hersteld', 'nog open'];

let teller = 0;
/** Uniek id: tijd (base36) + volgnummer + toeval. Het tijdsdeel maakt opruimen van weesbestanden veilig. */
export function uid(prefix = '') {
  teller = (teller + 1) % 1296;
  return prefix + Date.now().toString(36) + teller.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
}
export function idTijd(id) {
  const m = /^[a-z]?([0-9a-z]{8})/.exec(String(id)); if (!m) return null;
  const t = parseInt(m[1], 36); return t > 1.5e12 && t < Date.now() + 864e5 ? t : null;
}
export const nuISO = () => new Date().toISOString();
/** Lokale datum JJJJ-MM-DD (toISOString is UTC en geeft 's nachts de vorige dag) */
export function vandaag(d = new Date()) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
export function fmtDatum(d) { if (!d) return ''; const [j, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}-${m}-${j}`; }

/* ===== Aanmaken ===== */
export function nieuwComplex({ nummer, naam = '' }) {
  return { id: uid('c'), nummer: String(nummer).trim(), naam: String(naam || '').trim(), objectTeller: 0,
    standaard: { vertOpdrachtgever: '', opdrachtnemer: '', vertOpdrachtnemer: '', netElektra: '', netWater: '' } };
}
export function nieuwBlok(complex, naam) { return { id: uid('b'), complexId: complex.id, naam: String(naam).trim() }; }
export function nieuwObject(complex, blok, { adres, type }) {
  complex.objectTeller = (complex.objectTeller || 0) + 1;
  return {
    id: uid('o'), complexId: complex.id, blokId: blok.id, code: complex.objectTeller, adres: String(adres).trim(), type,
    partijen: { vertOpdrachtgever: '', opdrachtnemer: '', vertOpdrachtnemer: '' },
    puntTeller: 0, fase: 'voor', faseStart: {}, herziening: 0, herzieningen: [], herstelRonde: 0, opleverDatum: '', herstelUiterlijk: '',
    meter: { nvt: false, datum: '', door: '', netElektra: '', netWater: '', standen: {} },
    overig: { vrij: '' }
  };
}
/** Nieuw punt met het volgende vaste nummer van het object. Nummers worden nooit hergebruikt. */
export function nieuwPunt(object, velden, t = nuISO()) {
  object.puntTeller = (object.puntTeller || 0) + 1;
  const fase = object.fase === 'gereed' ? 'herstel' : object.fase;
  return {
    id: uid('p'), objectId: object.id, complexId: object.complexId, nr: object.puntTeller,
    ruimte: velden.ruimte || '', omschrijving: velden.omschrijving || '', urgentie: velden.urgentie || '', fotoId: velden.fotoId || null,
    geconstateerd: { fase, t, herziening: object.herziening || 0 },
    status: 'open', nietErkend: null, paraaf: null,
    historie: [{ t, fase, actie: 'geconstateerd' }]
  };
}

/* ===== Afgeleide gegevens ===== */
export const partijen = (object, complex) => Object.fromEntries(PARTIJ_VELDEN.map(([k]) => [k, (object.partijen && object.partijen[k]) || (complex && complex.standaard && complex.standaard[k]) || '']));
export const netbeheerder = (object, complex, k) => (object.meter && object.meter[k]) || (complex && complex.standaard && complex.standaard[k]) || '';
export const kenmerk = (complex, blok, object, punt) => `${complex.nummer}-${blok.naam}-${String(object.code).padStart(3, '0')}-${String(punt.nr).padStart(2, '0')}`;
export const levend = x => x && !x.verwijderd;

/** Status van een punt op tijdstip t, door de historie af te spelen */
export function statusOp(punt, t) {
  let s = null;
  for (const h of punt.historie) {
    if (h.t > t) break;
    if (h.actie === 'geconstateerd' || h.actie === 'nog open' || h.actie === 'heropend') s = 'open';
    else if (h.actie === 'hersteld') s = 'hersteld';
    else if (h.actie === 'vervallen') s = 'vervallen';
  }
  return s;
}
/** Beoordeling in de lopende fase: 'hersteld' | 'nog open' | null */
export function beoordeling(punt, object) {
  const start = object.faseStart && object.faseStart[object.fase]; if (!start) return null;
  let b = null;
  for (const h of punt.historie) if (h.t >= start && h.fase === object.fase && BEOORDELING.includes(h.actie)) b = h.actie;
  return b;
}
/** Moet dit punt in de lopende fase nog worden beoordeeld? Alleen punten die bij de start van de fase open stonden. */
export function moetBeoordeeld(punt, object) {
  if (!levend(punt) || punt.status === 'vervallen') return false;
  if (object.fase !== 'oplever' && object.fase !== 'herstel') return false;
  const start = object.faseStart && object.faseStart[object.fase]; if (!start) return false;
  if (punt.geconstateerd.t >= start) return false;
  return statusOp(punt, start) === 'open';
}
export const teBeoordelen = (punt, object) => moetBeoordeeld(punt, object) && beoordeling(punt, object) === null;
export const isNagekomen = p => p.geconstateerd.fase === 'herstel';

export function tellers(punten, object) {
  const t = { A: 0, B: 0, C: 0, zonderUrgentie: 0, open: 0, hersteld: 0, vervallen: 0, nietErkend: 0, teBeoordelen: 0, totaal: 0 };
  for (const p of punten) {
    if (!levend(p)) continue;
    t.totaal++;
    if (p.status === 'vervallen') { t.vervallen++; continue; }
    if (object && teBeoordelen(p, object)) t.teBeoordelen++;
    if (p.status === 'hersteld') { t.hersteld++; continue; }
    t.open++;
    if (p.urgentie && t[p.urgentie] !== undefined) t[p.urgentie]++; else t.zonderUrgentie++;
    if (p.nietErkend) t.nietErkend++;
  }
  return t;
}

/* ===== Handelingen op een punt (muteren het punt; de aanroeper slaat op) ===== */
export function wijzigPunt(punt, velden, object, t = nuISO()) {
  const oud = {}, nieuw = {};
  for (const k of ['ruimte', 'omschrijving', 'urgentie', 'fotoId']) if (k in velden && velden[k] !== punt[k]) { oud[k] = punt[k]; nieuw[k] = velden[k]; punt[k] = velden[k]; }
  if (!Object.keys(nieuw).length) return false;
  /* Tikfouten direct na vastleggen niet als wijziging loggen: alleen als het punt al eerder in een fase stond */
  const laatste = punt.historie[punt.historie.length - 1];
  const vers = laatste && laatste.actie === 'geconstateerd' && laatste.fase === object.fase && punt.geconstateerd.fase === object.fase;
  if (!vers) punt.historie.push({ t, fase: object.fase, actie: 'gewijzigd', van: oud, naar: nieuw });
  return true;
}
/** Hersteld of nog open in de lopende fase. In de herstelcontrole is 'hersteld' tegelijk de paraaf van de opdrachtgever. */
export function beoordeel(punt, object, uitkomst, t = nuISO(), door = '') {
  if (!BEOORDELING.includes(uitkomst)) throw new Error('onbekende beoordeling');
  if (!moetBeoordeeld(punt, object) && !(isNagekomen(punt) && object.fase === 'herstel'))
    throw new Error('dit punt hoeft in deze fase niet te worden beoordeeld');
  punt.historie.push({ t, fase: object.fase, actie: uitkomst, door });
  punt.status = uitkomst === 'hersteld' ? 'hersteld' : 'open';
  punt.paraaf = uitkomst === 'hersteld' && object.fase === 'herstel' ? { t, door } : (uitkomst === 'nog open' ? null : punt.paraaf);
}
/** Beoordeling in de lopende fase terugdraaien (verkeerd getikt) */
export function wisBeoordeling(punt, object) {
  const start = object.faseStart[object.fase];
  const i = punt.historie.findLastIndex(h => h.t >= start && h.fase === object.fase && BEOORDELING.includes(h.actie));
  if (i < 0) return false;
  punt.historie.splice(i, 1);
  punt.status = statusOp(punt, '9999') || 'open';
  if (object.fase === 'herstel') punt.paraaf = null;
  return true;
}
export function zetNietErkend(punt, object, reden, t = nuISO()) {
  if (reden) { punt.nietErkend = { reden: String(reden).trim(), t }; punt.historie.push({ t, fase: object.fase, actie: 'niet erkend', opm: punt.nietErkend.reden }); }
  else if (punt.nietErkend) { punt.nietErkend = null; punt.historie.push({ t, fase: object.fase, actie: 'erkend' }); }
}
export function laatVervallen(punt, object, reden, t = nuISO()) {
  if (!reden || !String(reden).trim()) throw new Error('reden is verplicht');
  punt.status = 'vervallen'; punt.historie.push({ t, fase: object.fase, actie: 'vervallen', opm: String(reden).trim() });
}

/** Mag de constatering (ruimte, omschrijving, urgentie, foto) nog worden aangepast? */
export function puntBewerkbaar(punt, object, documenten) {
  if (!levend(punt) || punt.status === 'vervallen' || object.fase === 'gereed') return false;
  if (object.fase === 'voor' || object.fase === 'oplever') return true;
  /* herstelcontrole: alleen nagekomen punten die nog in geen enkel ondertekend document staan */
  return isNagekomen(punt) && !inDocument(punt, documenten);
}
export const inDocument = (punt, documenten) => documenten.some(d => d.puntIds && d.puntIds.includes(punt.id));
/** Verwijderen kan alleen zolang het punt in geen enkel document staat; anders 'laten vervallen' met reden */
export const magVerwijderen = (punt, object, documenten) => puntBewerkbaar(punt, object, documenten) && !inDocument(punt, documenten);

/* ===== Fase-overgangen ===== */
export function startOplevering(object, t = nuISO()) {
  if (object.fase !== 'voor') throw new Error('de oplevering is al gestart');
  object.fase = 'oplever'; object.faseStart = Object.assign({}, object.faseStart, { oplever: t });
}
/** Na het ondertekenen van de oplevering (los of in een verzamelronde) */
export function naOplevering(object, punten, doc, config, t = nuISO()) {
  object.opleverDatum = doc.datum;
  object.herstelUiterlijk = telWerkdagen(doc.datum, config.herstelTermijnWerkdagen);
  object.opleverDocId = doc.id;
  const open = punten.filter(p => levend(p) && p.status === 'open').length;
  object.fase = open ? 'herstel' : 'gereed';
  object.faseStart = Object.assign({}, object.faseStart, { herstel: t });
}
export function naHerstel(object, punten, doc, t = nuISO()) {
  object.herstelRonde = (object.herstelRonde || 0) + 1;
  object.laatsteHerstelDocId = doc.id;
  const open = punten.filter(p => levend(p) && p.status === 'open').length;
  object.fase = open ? 'herstel' : 'gereed';
  object.faseStart = Object.assign({}, object.faseStart, { herstel: t });
}
/** Herziening van de oplevering (toch een punt vergeten). Kan zolang er nog geen herstel is vastgelegd. */
export function herzieningMogelijk(object, punten) {
  if (object.fase !== 'herstel' && object.fase !== 'gereed') return { kan: false, reden: 'De oplevering is nog niet ondertekend.' };
  if ((object.herstelRonde || 0) > 0) return { kan: false, reden: 'Er is al een herstelcontrole ondertekend. Leg het vergeten punt vast als nagekomen punt in de herstelcontrole.' };
  const start = object.faseStart.herstel;
  if (punten.some(p => levend(p) && p.historie.some(h => h.fase === 'herstel' && h.t >= start && h.actie !== 'geconstateerd') || (levend(p) && isNagekomen(p))))
    return { kan: false, reden: 'In de herstelcontrole is al iets vastgelegd. Leg het vergeten punt daar vast als nagekomen punt.' };
  return { kan: true, reden: '' };
}
export function startHerziening(object, punten, reden, t = nuISO()) {
  const m = herzieningMogelijk(object, punten); if (!m.kan) throw new Error(m.reden);
  if (!reden || !String(reden).trim()) throw new Error('reden is verplicht');
  object.herziening = (object.herziening || 0) + 1;
  object.herzieningen = (object.herzieningen || []).concat({ nr: object.herziening, reden: String(reden).trim(), t, vervangt: object.opleverDocId });
  object.fase = 'oplever';
}

/* ===== Controles vóór ondertekenen =====
   blokkade = ondertekenen kan niet; waarschuwing = kan wel, maar wordt vermeld. Elke melding verwijst naar het onderdeel waar je het oplost. */
export function controles({ config, complex, object, punten, blokPunten = null, blokObjecten = null }) {
  const blokkades = [], waarschuwingen = [];
  const lp = punten.filter(p => levend(p) && p.status !== 'vervallen');
  const t = tellers(lp, object);
  const mv = n => n === 1 ? '' : 'en';
  if (object.fase === 'voor') {
    if (t.zonderUrgentie) waarschuwingen.push({ tekst: `${t.zonderUrgentie} punt${mv(t.zonderUrgentie)} zonder urgentie`, naar: 'punten' });
    return { blokkades, waarschuwingen, tellers: t };
  }
  if (t.teBeoordelen) blokkades.push({ tekst: `${t.teBeoordelen} punt${mv(t.teBeoordelen)} nog niet beoordeeld (hersteld of nog open)`, naar: 'punten' });
  const zonderOmschr = lp.filter(p => p.status === 'open' && !String(p.omschrijving).trim()).length;
  if (zonderOmschr) blokkades.push({ tekst: `${zonderOmschr} punt${mv(zonderOmschr)} zonder omschrijving`, naar: 'punten' });
  if (t.zonderUrgentie) blokkades.push({ tekst: `${t.zonderUrgentie} open punt${mv(t.zonderUrgentie)} zonder urgentie`, naar: 'punten' });
  const pj = partijen(object, complex);
  if (object.fase === 'oplever') {
    for (const u of config.urgenties) if (u.blokkeertOplevering && t[u.code])
      blokkades.push({ tekst: `${t[u.code]} open ${u.code}-punt${mv(t[u.code])} (${u.titel.toLowerCase()}): eerst herstellen, dan opleveren`, naar: 'punten' });
    const mist = PARTIJ_VELDEN.filter(([k]) => !String(pj[k]).trim()).map(([, l]) => l.toLowerCase());
    if (mist.length) blokkades.push({ tekst: `Vul in: ${mist.join(', ')}`, naar: 'gegevens' });
    for (const u of config.urgenties) {
      if (u.limietObject != null && t[u.code] > u.limietObject) waarschuwingen.push({ tekst: `${t[u.code]} open ${u.code}-punten: meer dan ${u.limietObject} per woning`, naar: 'punten' });
      if (u.limietBlok != null && blokPunten && blokObjecten) {
        const n = blokPunten.filter(p => levend(p) && p.status === 'open' && p.urgentie === u.code).length;
        if (n > u.limietBlok) waarschuwingen.push({ tekst: `${n} open ${u.code}-punten in het blok: meer dan ${u.limietBlok} per blok`, naar: 'punten' });
      }
    }
    const m = object.meter;
    if (!m.nvt) {
      const verplicht = config.meters.filter(x => !x.optioneel);
      const leeg = verplicht.filter(x => !String((m.standen[x.key] || {}).waarde || '').trim()).length;
      if (leeg) waarschuwingen.push({ tekst: leeg === verplicht.length ? 'Geen meterstanden opgenomen' : `${leeg} meterstand${leeg === 1 ? '' : 'en'} niet ingevuld`, naar: 'meters' });
      const zonderFoto = config.meters.filter(x => String((m.standen[x.key] || {}).waarde || '').trim() && !(m.standen[x.key] || {}).fotoId).length;
      if (zonderFoto) waarschuwingen.push({ tekst: `${zonderFoto} meterstand${zonderFoto === 1 ? '' : 'en'} zonder foto`, naar: 'meters' });
    }
    const ozLeeg = config.overigeZaken.filter(z => !String(object.overig[z.key] ?? '').trim()).length;
    if (ozLeeg) waarschuwingen.push({ tekst: `Overige zaken: ${ozLeeg} van ${config.overigeZaken.length} niet ingevuld`, naar: 'overig' });
    if (t.nietErkend) waarschuwingen.push({ tekst: `${t.nietErkend} punt${mv(t.nietErkend)} niet erkend door de opdrachtnemer`, naar: 'punten' });
  }
  if (object.fase === 'herstel') {
    if (!String(pj.vertOpdrachtgever).trim()) blokkades.push({ tekst: 'Vul in: namens opdrachtgever', naar: 'gegevens' });
    const blijftOpen = lp.filter(p => p.status === 'open').length;
    if (blijftOpen && !t.teBeoordelen) waarschuwingen.push({ tekst: `${blijftOpen} punt${mv(blijftOpen)} blijft open: er volgt een nieuwe herstelronde`, naar: 'punten' });
  }
  if (object.fase === 'gereed') blokkades.push({ tekst: 'Dit object is gereed; er is niets meer te ondertekenen', naar: 'documenten' });
  return { blokkades, waarschuwingen, tellers: t };
}

/** Samenvatting voor lijsten en de complexmatrix */
export function objectSamenvatting(object, punten, config) {
  const t = tellers(punten, object);
  const blokkerend = config.urgenties.filter(u => u.blokkeertOplevering).reduce((n, u) => n + t[u.code], 0);
  const gestart = object.fase !== 'voor' || punten.some(levend);
  let toon = object.fase === 'voor' ? (gestart ? 'vooropname' : 'leeg') : object.fase;
  return { fase: object.fase, toon, label: !gestart ? 'Niet gestart' : FASE_LABEL[object.fase] + (object.fase === 'herstel' && object.herstelRonde ? ` (ronde ${object.herstelRonde + 1})` : ''), tellers: t, blokkerend };
}

/* ===== Werkdagen ===== */
export function telWerkdagen(datum, n) {
  const d = new Date(String(datum).slice(0, 10) + 'T12:00:00');
  let over = n;
  while (over > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) over--; }
  return vandaag(d);
}
/** Werkdagen van vandaag tot en met de deadline; negatief = verlopen */
export function werkdagenTot(deadline, van = vandaag()) {
  if (!deadline) return null;
  const a = new Date(van + 'T12:00:00'), b = new Date(deadline + 'T12:00:00');
  const teken = b >= a ? 1 : -1; let n = 0; const d = new Date(a);
  while ((teken > 0 ? d < b : d > b)) { d.setDate(d.getDate() + teken); const w = d.getDay(); if (w !== 0 && w !== 6) n += teken; }
  return n;
}

/* ===== Canonieke vorm voor het inhoudskenmerk ===== */
export function canoniek(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canoniek).join(',') + ']';
  return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canoniek(x[k])).join(',') + '}';
}

/* ===== Sorteren ===== */
const nlSort = (a, b) => String(a).localeCompare(String(b), 'nl', { numeric: true, sensitivity: 'base' });
export const sorteerObjecten = lijst => lijst.slice().sort((a, b) => nlSort(a.adres, b.adres));
export const sorteerBlokken = lijst => lijst.slice().sort((a, b) => nlSort(a.naam, b.naam));
/** Punten gegroepeerd per ruimte in looproutevolgorde; binnen een ruimte op nummer */
export function perRuimte(punten, config) {
  const volg = new Map(config.ruimtes.map((r, i) => [r.toLowerCase(), i]));
  const groepen = new Map();
  for (const p of punten) { const k = (p.ruimte || '').trim() || 'Zonder ruimte'; if (!groepen.has(k)) groepen.set(k, []); groepen.get(k).push(p); }
  return Array.from(groepen.entries())
    .sort(([a], [b]) => (volg.get(a.toLowerCase()) ?? 900) - (volg.get(b.toLowerCase()) ?? 900) || (a === 'Zonder ruimte') - (b === 'Zonder ruimte') || nlSort(a, b))
    .map(([ruimte, ps]) => ({ ruimte, punten: ps.sort((x, y) => x.nr - y.nr) }));
}

/* ===== Excel-import: adres en type ===== */
export function bouwAdres(straat, nr, toev) {
  const basis = [straat, nr].map(x => String(x ?? '').trim()).filter(Boolean).join(' ');
  toev = String(toev ?? '').trim(); if (!toev) return basis;
  if (/^alg/i.test(toev)) return basis + ' — ' + toev;
  return basis + (/^[a-z]$/i.test(toev) ? toev.toUpperCase() : '-' + toev);
}
export function normType(s, standaard, typen) {
  const v = String(s || '').trim().toLowerCase(); if (!v) return standaard;
  const exact = typen.find(t => t.toLowerCase() === v); if (exact) return exact;
  if (v.startsWith('app')) return 'Appartement';
  if (v.startsWith('alg') || v.includes('ruimte') || v.startsWith('berg') || v.startsWith('gem')) return 'Algemene ruimte';
  if (v.startsWith('ov')) return 'Overig';
  if (v.startsWith('won') || v.includes('eengezins') || v.includes('rij')) return 'Woning';
  return standaard;
}
