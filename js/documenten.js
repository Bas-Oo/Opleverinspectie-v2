// @ts-check
/* Vastleggen = bevriezen. Bij het ondertekenen wordt:
   1. een momentopname gemaakt van alles wat in het document staat ('inhoud'), inclusief een hash van elke foto en handtekening;
   2. het inhoudskenmerk berekend: SHA-256 over de canonieke inhoud (staat onderaan elke pagina);
   3. de PDF één keer gemaakt en opgeslagen, met de SHA-256 van het bestand zelf;
   4. alles in één transactie weggeschreven: PDF, handtekeningen, documentrecord en de nieuwe fase van het object.
   Daarna wordt de PDF nooit opnieuw gemaakt: downloaden levert altijd exact hetzelfde bestand. */
import * as M from './model.js';
import { S, puntenVan, get } from './staat.js';
import * as store from './store.js';
import { sha256 } from './sha256.js';
import { maakDocumentPDF } from './pdf.js';

const ozWaarde = (z, v) => v === undefined || v === '' ? '' : z.soort === 'aantal' ? String(v) : ({ ja: 'Ja', nee: 'Nee', nvt: 'Niet van toepassing' })[v] || String(v);
const DOOR = { opdrachtgever: 'Opdrachtgever', opdrachtnemer: 'Opdrachtnemer', gezamenlijk: 'Gezamenlijk' };
const laadFoto = id => store.blobGet('fotos', id);
async function fotoHash(id) { if (!id) return null; const b = await laadFoto(id); return b ? (await sha256(b)).slice(0, 32) : 'ontbreekt'; }
const reden = (p, actie) => { const h = p.historie.filter(x => x.actie === actie).pop(); return h ? h.opm || '' : ''; };

function statusTekst(p, o) {
  if (p.status === 'vervallen') return 'Vervallen: ' + reden(p, 'vervallen');
  const uitVoor = p.geconstateerd.fase === 'voor';
  if (p.status === 'hersteld') return uitVoor ? 'Hersteld sinds vooropname' : 'Hersteld';
  if (uitVoor) return 'Open (uit vooropname)';
  if (p.geconstateerd.herziening && p.geconstateerd.herziening === o.herziening && o.herziening) return `Open (herziening ${o.herziening})`;
  return 'Open';
}

/** Momentopname van één object voor een document */
async function objectInhoud(o, soort, metFotoHash = true) {
  const c = get('complexen', o.complexId), b = get('blokken', o.blokId), cfg = S.config;
  const alle = puntenVan(o.id);
  let punten;
  if (soort === 'herstel') {
    const start = o.faseStart.herstel;
    punten = alle.filter(p => p.status !== 'vervallen' && (M.moetBeoordeeld(p, o) || (M.isNagekomen(p) && p.geconstateerd.t >= start))).map(p => {
      const bo = M.beoordeling(p, o), nagekomen = p.geconstateerd.t >= start;
      return { id: p.id, nr: p.nr, kenmerk: M.kenmerk(c, b, o, p), ruimte: p.ruimte, omschrijving: p.omschrijving, urgentie: p.urgentie,
        uitkomst: nagekomen ? (bo === 'hersteld' ? 'Nagekomen, hersteld' : 'Nagekomen punt') : bo === 'hersteld' ? 'Hersteld' : 'Nog open',
        paraaf: p.paraaf && bo === 'hersteld' ? p.paraaf.t.slice(0, 10) : '', nietErkend: p.nietErkend ? p.nietErkend.reden : '',
        foto: nagekomen ? p.fotoId : null };
    });
  } else {
    punten = alle.filter(p => soort === 'vooropname' ? p.status !== 'vervallen' : true).map(p => ({
      id: p.id, nr: p.nr, kenmerk: M.kenmerk(c, b, o, p), ruimte: p.ruimte, omschrijving: p.omschrijving, urgentie: p.urgentie,
      status: p.status, statusTekst: soort === 'vooropname' ? 'Open' : statusTekst(p, o), nietErkend: p.nietErkend ? p.nietErkend.reden : '', foto: p.fotoId || null }));
  }
  if (metFotoHash) for (const p of punten) p.fotoHash = await fotoHash(p.foto);
  const pj = M.partijen(o, c);
  const uit = { id: o.id, code: o.code, blok: b.naam, adres: o.adres, type: o.type, partijen: pj, punten,
    telling: M.tellers(alle, o) };
  if (soort === 'oplevering' || soort === 'verzamel') {
    const m = o.meter;
    let i = 0;
    uit.meters = { nvt: !!m.nvt, datum: m.datum, door: DOOR[m.door] || '', netElektra: M.netbeheerder(o, c, 'netElektra'), netWater: M.netbeheerder(o, c, 'netWater'),
      standen: m.nvt ? [] : cfg.meters.filter(x => !x.optioneel || (m.standen[x.key] && (m.standen[x.key].waarde || m.standen[x.key].fotoId))).map(x => {
        const st = m.standen[x.key] || {}; return { key: x.key, label: x.label, waarde: st.waarde || '', foto: st.fotoId || null, fotoNr: st.fotoId ? 'M' + (++i) : '' };
      }) };
    if (metFotoHash) for (const st of uit.meters.standen) st.fotoHash = await fotoHash(st.foto);
    uit.overig = cfg.overigeZaken.map(z => ({ label: z.label, waarde: ozWaarde(z, o.overig[z.key]) }));
    uit.vrij = o.overig.vrij || '';
  }
  return uit;
}

function basisInhoud(soort, titel, c, datum, plaats) {
  const cfg = S.config;
  return { formaat: 1, soort, titel, organisatie: cfg.organisatie, complex: { nummer: c.nummer, naam: c.naam }, datum, plaats,
    urgenties: cfg.urgenties.map(u => ({ code: u.code, titel: u.titel, uitleg: u.uitleg })) };
}
const naamDeel = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);

async function bevries({ inhoud, objecten, puntIds, handtekeningen, bestandsnaam, extra = {}, mutaties }) {
  const hIds = {};
  inhoud.ondertekenaars = inhoud.ondertekenaars || [];
  for (const o of inhoud.ondertekenaars) { const b = handtekeningen[o.rol]; o.handtekening = b ? (await sha256(b)).slice(0, 32) : null; }
  const inhoudKenmerk = await sha256(M.canoniek(inhoud));
  const pdf = await maakDocumentPDF(inhoud, { kenmerk: inhoudKenmerk, handtekeningen, laadFoto });
  const bestandSha = await sha256(pdf);
  const nu = M.nuISO();
  const doc = Object.assign({
    id: M.uid('d'), soort: inhoud.soort, titel: inhoud.titel, complexId: objecten[0].complexId, objectIds: objecten.map(o => o.id), puntIds,
    datum: inhoud.datum, plaats: inhoud.plaats, gemaakt: nu, bestandId: M.uid('x'), bestandsnaam, bestandGrootte: pdf.size,
    sha256: bestandSha, inhoudKenmerk, inhoud, ondertekenaars: inhoud.ondertekenaars.map(o => ({ rol: o.rol, naam: o.naam, getekend: !!o.handtekening }))
  }, extra);
  const ops = [['bestanden', { id: doc.bestandId, blob: pdf }]];
  for (const o of inhoud.ondertekenaars) if (handtekeningen[o.rol]) { const id = M.uid('h'); ops.push(['bestanden', { id, blob: handtekeningen[o.rol] }]); hIds[o.rol] = id; }
  doc.handtekeningIds = hIds;
  /* Fase-overgangen op kopieën; pas na een geslaagde transactie in het geheugen zetten */
  const kopie = objecten.map(o => structuredClone(o));
  kopie.forEach(o => mutaties(o, doc, nu));
  ops.push(['documenten', doc], ...kopie.map(o => /** @type {[string, any]} */ (['objecten', o])));
  await store.bewaar(ops);
  S.documenten.set(doc.id, doc); kopie.forEach(o => S.objecten.set(o.id, o));
  return doc;
}

/** Vooropname vastleggen (zonder handtekening) en de oplevering starten */
export async function startOpleveringMetVastlegging(object) {
  const c = get('complexen', object.complexId);
  const punten = puntenVan(object.id).filter(p => p.status !== 'vervallen');
  if (!punten.length) {   // niets vast te leggen: alleen de fase
    const o = structuredClone(object); M.startOplevering(o); await store.bewaar([['objecten', o]]); S.objecten.set(o.id, o); return null;
  }
  const datum = M.vandaag();
  const inhoud = Object.assign(basisInhoud('vooropname', 'Proces-verbaal van vooropname', c, datum, S.config.organisatie.plaats), {
    objecten: [await objectInhoud(object, 'vooropname')],
    verklaring: 'Vooropname: dit proces-verbaal wordt niet ondertekend. De nummers van de punten blijven gelijk in de oplevering en de herstelcontrole.' });
  return bevries({ inhoud, objecten: [object], puntIds: punten.map(p => p.id), handtekeningen: {},
    bestandsnaam: `${naamDeel(object.adres)} - PV vooropname ${M.fmtDatum(datum)}.pdf`, mutaties: (o, d, nu) => M.startOplevering(o, nu) });
}

/** Oplevering of herstelcontrole van één object ondertekenen */
export async function onderteken({ soort, object, plaats, datum, namen, handtekeningen }) {
  const c = get('complexen', object.complexId), cfg = S.config;
  const punten = puntenVan(object.id);
  let titel, extra = {}, verklaring;
  if (soort === 'oplevering') {
    titel = 'Proces-verbaal van oplevering' + (object.herziening ? ` — herziening ${object.herziening}` : '');
    verklaring = cfg.teksten.verklaringOplevering.replace('{termijn}', String(cfg.herstelTermijnWerkdagen));
    extra = { herziening: object.herziening || 0, vervangt: object.herziening ? object.opleverDocId || null : null };
  } else {
    titel = `Proces-verbaal herstelcontrole${object.herstelRonde ? ' — ronde ' + (object.herstelRonde + 1) : ''}`;
    verklaring = cfg.teksten.verklaringHerstel;
    extra = { herstelRonde: (object.herstelRonde || 0) + 1 };
  }
  const inhoud = Object.assign(basisInhoud(soort, titel, c, datum, plaats), {
    objecten: [await objectInhoud(object, soort)], verklaring,
    ondertekenaars: [{ rol: 'Opdrachtgever', naam: namen.opdrachtgever }].concat(soort === 'oplevering' || handtekeningen.Opdrachtnemer ? [{ rol: 'Opdrachtnemer', naam: namen.opdrachtnemer }] : [])
  });
  if (soort === 'oplevering') {
    inhoud.termijn = { werkdagen: cfg.herstelTermijnWerkdagen, uiterlijk: M.telWerkdagen(datum, cfg.herstelTermijnWerkdagen) };
    if (object.herziening) {
      const vorig = S.documenten.get(object.opleverDocId), hz = object.herzieningen[object.herzieningen.length - 1];
      inhoud.herziening = { nr: object.herziening, reden: hz ? hz.reden : '', vervangtDatum: vorig ? vorig.datum : '', vervangtKenmerk: vorig ? vorig.inhoudKenmerk.slice(0, 16).toUpperCase() : '' };
    }
  } else {
    const opl = S.documenten.get(object.opleverDocId);
    inhoud.referentie = opl ? `Bij het proces-verbaal van oplevering van ${M.fmtDatum(opl.datum)} (kenmerk ${opl.inhoudKenmerk.slice(0, 16).toUpperCase()})` : '';
  }
  const bestandsnaam = `${naamDeel(object.adres)} - ${soort === 'oplevering' ? 'PV oplevering' + (object.herziening ? ' herziening ' + object.herziening : '') : 'PV herstelcontrole' + (object.herstelRonde ? ' ronde ' + (object.herstelRonde + 1) : '')} ${M.fmtDatum(datum)}.pdf`;
  return bevries({ inhoud, objecten: [object], puntIds: inhoud.objecten[0].punten.map(p => p.id), handtekeningen, bestandsnaam, extra,
    mutaties: (o, doc, nu) => soort === 'oplevering' ? M.naOplevering(o, punten, doc, cfg, nu) : M.naHerstel(o, punten, doc, nu) });
}

/** Eén verzamel-PV voor meerdere objecten: één document, één keer tekenen, de volledige inhoud per object erin */
export async function ondertekenVerzamel({ complex, blok, objecten, plaats, datum, namen, handtekeningen, aandacht }) {
  const cfg = S.config;
  const inhoud = Object.assign(basisInhoud('verzamel', 'Proces-verbaal van oplevering — verzamelafronding', complex, datum, plaats), {
    blok: blok ? blok.naam : null,
    objecten: [], verklaring: cfg.teksten.verklaringOplevering.replace('{termijn}', String(cfg.herstelTermijnWerkdagen)),
    termijn: { werkdagen: cfg.herstelTermijnWerkdagen, uiterlijk: M.telWerkdagen(datum, cfg.herstelTermijnWerkdagen) },
    ondertekenaars: [{ rol: 'Opdrachtgever', naam: namen.opdrachtgever }, { rol: 'Opdrachtnemer', naam: namen.opdrachtnemer }]
  });
  for (const o of objecten) { const oi = await objectInhoud(o, 'verzamel'); oi.aandacht = aandacht[o.id] || []; inhoud.objecten.push(oi); }
  const puntIds = inhoud.objecten.flatMap(o => o.punten.map(p => p.id));
  const bestandsnaam = `Complex ${naamDeel(complex.nummer)}${blok ? ' blok ' + naamDeel(blok.naam) : ''} - PV oplevering verzamel ${M.fmtDatum(datum)}.pdf`;
  return bevries({ inhoud, objecten, puntIds, handtekeningen, bestandsnaam, extra: { blokId: blok ? blok.id : null },
    mutaties: (o, doc, nu) => M.naOplevering(o, puntenVan(o.id), doc, cfg, nu) });
}

export const pdfVan = doc => store.blobGet('bestanden', doc.bestandId);
/** Is dit bestand exact het opgeslagen ondertekende document? */
export async function controleerBestand(doc, bestand) { return (await sha256(bestand)) === doc.sha256; }
