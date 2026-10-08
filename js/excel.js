// @ts-check
/* Excel: complex importeren, sjabloon, en exporteren van tekortkomingen (Excel of PDF-lijst, zonder foto's) */
import { h, toast, kiesBestand, dialoog, formulier, leverBestand, keuze } from './ui.js';
import { S, bewaar, complexen, blokkenVan, objectenVanBlok, objectenVanComplex, puntenVan, get } from './staat.js';
import * as M from './model.js';
import { laadXLSX } from './lader.js';
import { ga, route } from './nav.js';
import { maakLijstPDF } from './pdf.js';

const KOLOMMEN = {
  complex: ['complex', 'complexnummer', 'complexnr', 'complex nr'],
  naam: ['complexnaam', 'projectnaam', 'project'],
  blok: ['blok', 'gebouw', 'bouwblok'],
  adres: ['adres'],
  straat: ['straat', 'straatnaam'],
  nr: ['huisnummer', 'huisnr', 'nummer', 'nr'],
  toev: ['toevoeging', 'toev', 'huisletter'],
  type: ['woningtype', 'type', 'objecttype', 'soort']
};
const norm = s => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');

/** Leest de eerste tabel in het werkblad: zoekt de koprij (titel of lege regels erboven mogen) */
export function leesRijen(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const kop = (aoa[i] || []).map(norm), kol = {};
    for (const [k, namen] of Object.entries(KOLOMMEN)) { const j = kop.findIndex(x => namen.includes(x)); if (j >= 0) kol[k] = j; }
    if (kol.adres !== undefined || (kol.straat !== undefined && kol.nr !== undefined)) {
      const rijen = [];
      for (let r = i + 1; r < aoa.length; r++) {
        const rij = aoa[r] || [], cel = k => kol[k] === undefined ? '' : String(rij[kol[k]] ?? '').trim();
        const adres = kol.adres !== undefined ? cel('adres') : M.bouwAdres(cel('straat'), cel('nr'), cel('toev'));
        if (!adres && !rij.some(x => String(x ?? '').trim())) continue;
        rijen.push({ excelRij: r + 1, complex: cel('complex'), naam: cel('naam'), blok: cel('blok'), adres, toev: cel('toev'), type: cel('type') });
      }
      return { kol, rijen };
    }
  }
  return null;
}

export async function importeerExcel(binnenComplex) {
  const f = await kiesBestand('.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'); if (!f) return;
  let tabel;
  try {
    const XLSX = await laadXLSX();
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    tabel = leesRijen(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }));
  } catch (e) { console.error(e); return toast('Bestand kon niet worden gelezen: ' + (e && e.message), 5000); }
  if (!tabel || !tabel.rijen.length) return dialoog({ titel: 'Geen objecten gevonden', tekst: 'Er is geen koprij gevonden met Adres, of met Straat en Huisnummer. Gebruik het importsjabloon.' });

  /* Complex bepalen */
  let vast = binnenComplex;
  if (!vast && tabel.kol.complex === undefined) {
    const r = await formulier({ titel: 'Voor welk complex?', tekst: `Het bestand bevat geen kolom Complex. ${tabel.rijen.length} rij(en) gevonden.`, ok: 'Verder', velden: [
      { key: 'nummer', label: 'Complexnummer', verplicht: true, placeholder: 'bijv. 960' }, { key: 'naam', label: 'Naam', placeholder: 'Projectnaam' }] });
    if (!r) return;
    vast = complexen().find(c => c.nummer.toLowerCase() === r.nummer.toLowerCase()) || Object.assign(M.nieuwComplex(r), { _nieuw: true });
  }
  /* Type bepalen als de kolom ontbreekt */
  let standaardType = S.config.objectTypes[0];
  if (tabel.kol.type === undefined) {
    let keus = standaardType;
    const w = await dialoog({ titel: 'Welk type?', tekst: 'Het bestand bevat geen kolom Woningtype. Rijen met een toevoeging als "Algemene ruimte" worden een algemene ruimte; welk type krijgen de andere?',
      inhoud: keuze(S.config.objectTypes.filter(t => !/alg/i.test(t)), keus, v => { keus = v; }, { uitzetbaar: false }), knoppen: [{ tekst: 'Annuleren', waarde: null, soort: 'licht' }, { tekst: 'Verder', waarde: true }] });
    if (!w) return; standaardType = keus;
  }

  /* Plan */
  const ops = [], nieuweComplexen = new Map(), nieuweBlokken = new Map(), overgeslagen = [], tel = { complexen: 0, blokken: 0, objecten: 0 };
  const geraakteComplexen = new Set();
  for (const r of tabel.rijen) {
    if (!r.adres) { overgeslagen.push(`rij ${r.excelRij}: geen adres`); continue; }
    let c = vast;
    if (!c) {
      let nummer = r.complex, naam = r.naam;
      const m = /^(\d+)\s+(.+)$/.exec(nummer); if (m && !naam) { nummer = m[1]; naam = m[2]; }
      if (!nummer) { overgeslagen.push(`rij ${r.excelRij}: geen complexnummer`); continue; }
      c = complexen().find(x => x.nummer.toLowerCase() === nummer.toLowerCase()) || nieuweComplexen.get(nummer.toLowerCase());
      if (!c) { c = M.nieuwComplex({ nummer, naam }); nieuweComplexen.set(nummer.toLowerCase(), c); tel.complexen++; }
    } else if (c._nieuw && !nieuweComplexen.has(c.nummer.toLowerCase())) { nieuweComplexen.set(c.nummer.toLowerCase(), c); tel.complexen++; }
    geraakteComplexen.add(c);
    const bnaam = r.blok || 'A', bk = c.id + '|' + bnaam.toLowerCase();
    let b = blokkenVan(c.id).find(x => x.naam.toLowerCase() === bnaam.toLowerCase()) || nieuweBlokken.get(bk);
    if (!b) { b = M.nieuwBlok(c, bnaam); nieuweBlokken.set(bk, b); tel.blokken++; ops.push(['blokken', b]); }
    const bestaand = objectenVanBlok(b.id).concat(ops.filter(([s, x]) => s === 'objecten' && x.blokId === b.id).map(([, x]) => x));
    if (bestaand.some(o => o.adres.toLowerCase() === r.adres.toLowerCase())) { overgeslagen.push(`rij ${r.excelRij}: ${r.adres} staat al in blok ${b.naam}`); continue; }
    const type = /^alg/i.test(r.toev) ? 'Algemene ruimte' : M.normType(r.type, standaardType, S.config.objectTypes);
    ops.push(['objecten', M.nieuwObject(c, b, { adres: r.adres, type })]); tel.objecten++;
  }
  for (const c of geraakteComplexen) { delete c._nieuw; ops.push(['complexen', c]); }
  const samen = [`${tel.objecten} object(en) in ${tel.blokken ? tel.blokken + ' nieuw(e) blok(ken)' : 'bestaande blokken'}${tel.complexen ? `, ${tel.complexen} nieuw complex` : ''}.`,
    overgeslagen.length ? `\nOvergeslagen (${overgeslagen.length}):\n${overgeslagen.slice(0, 12).join('\n')}${overgeslagen.length > 12 ? '\n…' : ''}` : '', '\nEr wordt niets gewijzigd of verwijderd.'].join('');
  if (!tel.objecten) return dialoog({ titel: 'Niets te importeren', tekst: samen });
  const ok = await dialoog({ titel: 'Importeren?', tekst: samen, knoppen: [{ tekst: 'Annuleren', waarde: null, soort: 'licht' }, { tekst: 'Importeren', waarde: true }] });
  if (!ok) return;
  await bewaar(/** @type {any} */ (ops));
  toast(`${tel.objecten} object(en) geïmporteerd`, 3000);
  const doel = Array.from(geraakteComplexen)[0]; if (doel) ga(route.complex(doel.id));
}

export async function downloadSjabloon() {
  const XLSX = await laadXLSX();
  const ws = XLSX.utils.aoa_to_sheet([['Complex', 'Complexnaam', 'Blok', 'Straat', 'Huisnummer', 'Toevoeging', 'Woningtype'],
    ['960', 'Voorbeeldproject', 'B', 'Churchillweg', 31, 'Algemene ruimte', 'Algemene ruimte'], ['960', 'Voorbeeldproject', 'B', 'Churchillweg', 31, 1, 'Appartement'], ['960', 'Voorbeeldproject', 'D', 'Harnjesweg', 40, 'A', 'Woning']]);
  ws['!cols'] = [10, 22, 8, 22, 12, 16, 16].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Objecten');
  await leverBestand(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Importsjabloon opleverinspectie.xlsx', 'Importsjabloon');
}

/* ===== Export van tekortkomingen ===== */
function bereik({ complex, blok, object }) {
  const objecten = object ? [object] : blok ? objectenVanBlok(blok.id) : objectenVanComplex(complex.id);
  const titel = object ? object.adres : blok ? `Complex ${complex.nummer} - blok ${blok.naam}` : `Complex ${complex.nummer}${complex.naam ? ' ' + complex.naam : ''}`;
  return { objecten, titel };
}
const statusTekst = (p, o) => p.status === 'vervallen' ? 'Vervallen' : M.teBeoordelen(p, o) ? 'Te beoordelen' : p.status === 'hersteld' ? 'Hersteld' : 'Open';

export async function exportTekortkomingen(soort, sel) {
  const { complex } = sel, { objecten, titel } = bereik(sel);
  const rijen = [], perObject = [];
  for (const o of objecten) {
    const b = get('blokken', o.blokId), ps = puntenVan(o.id), t = M.tellers(ps, o), fase = M.objectSamenvatting(o, ps, S.config).label;
    perObject.push([b.naam, o.adres, o.type, fase, t.A, t.B, t.C, t.hersteld, t.nietErkend, t.teBeoordelen, M.fmtDatum(o.opleverDatum), M.fmtDatum(o.herstelUiterlijk)]);
    for (const p of ps) rijen.push({ o, b, p, rij: [M.kenmerk(complex, b, o, p), complex.nummer, b.naam, o.adres, o.type, fase, p.nr, p.ruimte, p.omschrijving, p.urgentie, statusTekst(p, o),
      M.FASE_LABEL[p.geconstateerd.fase], p.nietErkend ? 'Ja' : '', p.nietErkend ? p.nietErkend.reden : '', p.paraaf ? M.fmtDatum(p.paraaf.t) : '', p.fotoId ? 'Ja' : ''] });
  }
  const datum = M.fmtDatum(M.vandaag());
  try {
    if (soort === 'excel') {
      const XLSX = await laadXLSX();
      const kop = ['Kenmerk', 'Complex', 'Blok', 'Adres', 'Type', 'Fase object', 'Nr', 'Ruimte', 'Omschrijving', 'Urgentie', 'Status', 'Geconstateerd in', 'Niet erkend', 'Reden niet erkend', 'Paraaf', 'Foto'];
      const ws = XLSX.utils.aoa_to_sheet([kop, ...rijen.map(r => r.rij)]);
      ws['!cols'] = [16, 8, 6, 26, 14, 14, 5, 16, 48, 8, 13, 15, 10, 28, 10, 6].map(w => ({ wch: w }));
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rijen.length, c: kop.length - 1 } }) };
      const ws2 = XLSX.utils.aoa_to_sheet([['Blok', 'Adres', 'Type', 'Fase', 'A open', 'B open', 'C open', 'Hersteld', 'Niet erkend', 'Te beoordelen', 'Opgeleverd', 'Herstel uiterlijk'], ...perObject]);
      ws2['!cols'] = [6, 26, 14, 16, 7, 7, 7, 9, 11, 13, 11, 15].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Tekortkomingen'); XLSX.utils.book_append_sheet(wb, ws2, 'Per object');
      await leverBestand(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${titel} - tekortkomingen ${datum}.xlsx`.replace(/[\\/:*?"<>|]/g, ' '), 'Excel gereed', `${rijen.length} punt(en)`);
    } else {
      toast('PDF wordt gemaakt…', 8000);
      const zichtbaar = rijen.filter(r => r.p.status !== 'vervallen');
      const blob = await maakLijstPDF({ titel: 'Tekortkomingenlijst', regel1: `Complex ${complex.nummer}${complex.naam ? ' ' + complex.naam : ''}`, regel2: sel.object ? sel.object.adres : sel.blok ? `Blok ${sel.blok.naam}` : 'Alle blokken',
        organisatie: S.config.organisatie,
        samenvatting: objecten.length > 1 ? { kop: ['Blok', 'Adres', 'Fase', 'A', 'B', 'C', 'Hersteld', 'Niet erkend'], rijen: perObject.map(r => [r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[8]]) } : null,
        punten: { kop: objecten.length > 1 ? ['Adres', 'Nr', 'Ruimte', 'Omschrijving', 'Urg.', 'Status'] : ['Nr', 'Ruimte', 'Omschrijving', 'Urg.', 'Status', 'Niet erkend'], urgKolom: objecten.length > 1 ? 4 : 3,
          rijen: zichtbaar.map(r => objecten.length > 1 ? [r.o.adres, r.p.nr, r.p.ruimte, r.p.omschrijving, r.p.urgentie, statusTekst(r.p, r.o)] : [r.p.nr, r.p.ruimte, r.p.omschrijving, r.p.urgentie, statusTekst(r.p, r.o), r.p.nietErkend ? r.p.nietErkend.reden : '']) },
        voet: `${S.config.organisatie.naam} · Tekortkomingenlijst · ${titel} · ${datum} · geen ondertekend document` });
      await leverBestand(blob, `${titel} - tekortkomingenlijst ${datum}.pdf`.replace(/[\\/:*?"<>|]/g, ' '), 'PDF gereed', `${zichtbaar.length} punt(en)`);
    }
  } catch (e) { console.error(e); toast('Export mislukt: ' + (e && e.message), 5000); }
}
