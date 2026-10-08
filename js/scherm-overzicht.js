// @ts-check
/* Complexen, complex (matrix per blok) en blok */
import { h, formulier, bevestig, toast, ICOON, menu, dialoog } from './ui.js';
import { S, bewaar, complexen, blokkenVan, objectenVanBlok, objectenVanComplex, puntenVan, puntenVanComplex, documentenVanComplex, get, verwijder } from './staat.js';
import * as M from './model.js';
import { ga, route, ververs } from './nav.js';
import { urgBadges, faseChip, deadlineChip, kortLabels, leegStaat } from './stukjes.js';
import { importeerExcel, downloadSjabloon, exportTekortkomingen } from './excel.js';
import { maakBackup } from './backup.js';

const telFases = objecten => {
  const n = { leeg: 0, vooropname: 0, oplever: 0, herstel: 0, gereed: 0, blokkerend: 0, verlopen: 0 };
  for (const o of objecten) {
    const s = M.objectSamenvatting(o, puntenVan(o.id), S.config); n[s.toon]++; if (s.blokkerend) n.blokkerend++;
    if (o.fase === 'herstel' && o.herstelUiterlijk && M.werkdagenTot(o.herstelUiterlijk) < 0) n.verlopen++;
  }
  return n;
};
const FASE_TEGELS = [['leeg', 'Niet gestart'], ['vooropname', 'Vooropname'], ['oplever', 'Oplevering'], ['herstel', 'Herstel'], ['gereed', 'Gereed']];

/* ===== Complexen ===== */
export function complexenScherm() {
  const lijst = complexen();
  const toevoegen = menu(h('button.knop', { type: 'button' }, ICOON.plus(), 'Complex toevoegen'), [
    { tekst: 'Handmatig toevoegen', fn: nieuwComplex },
    { tekst: 'Importeren uit Excel', fn: () => importeerExcel(null) },
    { tekst: 'Importsjabloon downloaden', fn: downloadSjabloon }
  ]);
  const inhoud = h('div',
    h('div.titelrij', h('h1', 'Complexen'), toevoegen),
    lijst.length ? h('div.lijst', lijst.map(c => {
      const obj = objectenVanComplex(c.id), n = telFases(obj);
      return h('a.rij', { href: route.complex(c.id) },
        h('div.rij-hoofd', h('div.rij-titel', `${c.nummer} ${c.naam}`.trim()),
          h('div.rij-sub', `${blokkenVan(c.id).length} blok(ken) · ${obj.length} object(en)`),
          h('div.fasebalk', FASE_TEGELS.filter(([k]) => n[k]).map(([k, l]) => h('span.chip', { class: 'f-' + k }, `${l} ${n[k]}`)),
            n.blokkerend ? h('span.chip.verlopen', `${n.blokkerend} met open A/B`) : null, n.verlopen ? h('span.chip.verlopen', `${n.verlopen} termijn verlopen`) : null)),
        h('span.chev', ICOON.verder()));
    })) : leegStaat('Nog geen complexen', 'Voeg een complex toe, of importeer de woningen uit Excel (kolommen Blok, Straat, Huisnummer, Toevoeging, of Adres).',
      h('button.knop', { type: 'button', onclick: () => importeerExcel(null) }, 'Importeren uit Excel'), h('button.knop.licht', { type: 'button', onclick: nieuwComplex }, 'Handmatig toevoegen')));
  return { kruimels: [{ tekst: 'Complexen' }], inhoud, menu: [
    { tekst: 'Back-up maken (alles)', icoon: ICOON.schijf, fn: () => maakBackup(null) },
    { tekst: 'Back-up terugzetten…', fn: () => import('./backup.js').then(m => m.zetBackupTerug()) },
    null,
    { tekst: 'Instellingen', fn: () => ga(route.instellingen()) }
  ] };
}

async function nieuwComplex() {
  const r = await formulier({ titel: 'Nieuw complex', ok: 'Toevoegen', velden: [
    { key: 'nummer', label: 'Complexnummer', placeholder: 'bijv. 960', verplicht: true }, { key: 'naam', label: 'Naam', placeholder: 'Projectnaam' }] });
  if (!r) return;
  if (complexen().some(c => c.nummer.toLowerCase() === r.nummer.toLowerCase())) return toast(`Complex ${r.nummer} bestaat al`, 3500);
  const c = M.nieuwComplex(r); await bewaar([['complexen', c]]); ga(route.complex(c.id));
}

/* ===== Complex ===== */
export function complexScherm(id) {
  const c = get('complexen', id); if (!c) return null;
  const blokken = blokkenVan(c.id), alle = objectenVanComplex(c.id), n = telFases(alle);
  const docs = documentenVanComplex(c.id);
  const opleverKlaar = alle.filter(o => o.fase === 'oplever').length;
  const inhoud = h('div',
    h('div.titelrij', h('h1', `${c.nummer} ${c.naam}`.trim()),
      opleverKlaar ? h('a.knop', { href: route.verzamel('complex', c.id) }, ICOON.pen(), 'Gezamenlijk ondertekenen') : null),
    h('div.tegels', FASE_TEGELS.map(([k, l]) => h('div.tegel', { class: 'f-' + k }, h('div.n', n[k]), h('div.l', l))),
      h('div.tegel', { class: n.blokkerend ? 'alarm' : '' }, h('div.n', n.blokkerend), h('div.l', 'met open A/B')),
      n.verlopen ? h('div.tegel.alarm', h('div.n', n.verlopen), h('div.l', 'termijn verlopen')) : null),
    !standaardCompleet(c) ? h('button.banner.geel', { type: 'button', onclick: () => complexInstellingen(c) },
      h('div', h('strong', 'Vul de standaardpartijen van het complex in'), h('small', 'Namens opdrachtgever, opdrachtnemer en namens opdrachtnemer gelden dan voor alle objecten. Tik om in te vullen.'))) : null,
    blokken.length ? blokken.map(b => blokMatrix(b)) : leegStaat('Nog geen blokken', 'Voeg een blok toe of importeer de objecten uit Excel.',
      h('button.knop', { type: 'button', onclick: () => importeerExcel(c) }, 'Importeren uit Excel'), h('button.knop.licht', { type: 'button', onclick: () => nieuwBlok(c) }, 'Blok toevoegen')),
    blokken.length ? legenda() : null,
    docs.length ? h('details.kaart.uitklap', h('summary', h('h3', `Ondertekende en vastgelegde documenten (${docs.length})`)),
      h('div.lijst.compact', docs.slice().reverse().map(d => docRij(d)))) : null);
  return { kruimels: [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: `${c.nummer} ${c.naam}`.trim() }], inhoud, menu: [
    { tekst: 'Complex instellingen', fn: () => complexInstellingen(c) },
    { tekst: 'Blok toevoegen', fn: () => nieuwBlok(c) },
    { tekst: 'Objecten importeren uit Excel', fn: () => importeerExcel(c) },
    null,
    { tekst: 'Gezamenlijk ondertekenen…', fn: () => ga(route.verzamel('complex', c.id)), uit: !opleverKlaar },
    { tekst: 'Tekortkomingen naar Excel', icoon: ICOON.excel, fn: () => exportTekortkomingen('excel', { complex: c }) },
    { tekst: 'Tekortkomingenlijst (PDF)', icoon: ICOON.doc, fn: () => exportTekortkomingen('pdf', { complex: c }) },
    { tekst: 'Back-up van dit complex', icoon: ICOON.schijf, fn: () => maakBackup(c) },
    null,
    { tekst: 'Complex verwijderen…', gevaar: true, fn: () => verwijderComplex(c) }
  ] };
}
const standaardCompleet = c => M.PARTIJ_VELDEN.every(([k]) => String(c.standaard[k] || '').trim());

function blokMatrix(b) {
  const obj = objectenVanBlok(b.id), labels = kortLabels(obj);
  return h('section.blok-sectie',
    h('div.blok-kop', h('h2', `Blok ${b.naam}`), h('span.hint', `${obj.length} object(en)`), h('a.knop.licht.klein', { href: route.blok(b.id) }, 'Lijst', ICOON.verder())),
    obj.length ? h('div.matrix', obj.map(o => {
      const s = M.objectSamenvatting(o, puntenVan(o.id), S.config);
      const dl = o.fase === 'herstel' && o.herstelUiterlijk ? M.werkdagenTot(o.herstelUiterlijk) : null;
      return h('a.cel', { href: route.object(o.id), class: 'f-' + s.toon + (s.blokkerend ? ' blokkeert' : '') + (dl !== null && dl < 0 ? ' verlopen' : ''), title: `${o.adres} — ${s.label}` },
        h('span.cel-label', labels.get(o.id)),
        h('span.cel-sub', s.tellers.open ? `${s.tellers.open} open` : s.label === 'Niet gestart' ? '' : s.toon === 'gereed' ? '✓' : '0 open'));
    })) : h('p.hint', 'Nog geen objecten in dit blok.'));
}
function legenda() {
  return h('div.legenda', FASE_TEGELS.map(([k, l]) => h('span', h('i.cel-mini', { class: 'f-' + k }), l)), h('span', h('i.cel-mini.blokkeert'), 'open A/B'), h('span', h('i.cel-mini.verlopen'), 'termijn verlopen'));
}
export function docRij(d) {
  const vervangers = Array.from(S.documenten.values()).filter(x => x.vervangt === d.id);
  const vervangen = vervangers.length ? (d.objectIds.length > 1 ? 'deels vervangen' : 'vervangen') : '';
  return h('a.rij.klein', { href: route.document(d.id) }, h('span.rij-ico', ICOON.doc()),
    h('div.rij-hoofd', h('div.rij-titel', d.titel + (d.soort === 'verzamel' ? '' : ` — ${(get('objecten', d.objectIds[0]) || {}).adres || ''}`)),
      h('div.rij-sub', `${M.fmtDatum(d.datum)} · ${d.soort === 'vooropname' ? 'vastgelegd, niet ondertekend' : 'ondertekend'} · kenmerk ${d.inhoudKenmerk.slice(0, 8).toUpperCase()}${d.objectIds.length > 1 ? ` · ${d.objectIds.length} objecten` : ''}`)),
    vervangen ? h('span.chip.verlopen', vervangen) : null, h('span.chev', ICOON.verder()));
}

export async function complexInstellingen(c) {
  const r = await formulier({ titel: `Complex ${c.nummer}`, tekst: 'Standaardpartijen en netbeheerders gelden voor alle objecten die zelf niets hebben ingevuld.', velden: [
    { key: 'nummer', label: 'Complexnummer', waarde: c.nummer, verplicht: true }, { key: 'naam', label: 'Naam', waarde: c.naam },
    ...M.PARTIJ_VELDEN.map(([k, l]) => ({ key: k, label: l, waarde: c.standaard[k] })),
    { key: 'netElektra', label: 'Netbeheerder elektra', waarde: c.standaard.netElektra, placeholder: 'bijv. Liander' },
    { key: 'netWater', label: 'Netbeheerder water', waarde: c.standaard.netWater, placeholder: 'bijv. Vitens' }] });
  if (!r) return;
  if (r.nummer.toLowerCase() !== c.nummer.toLowerCase() && complexen().some(x => x.nummer.toLowerCase() === r.nummer.toLowerCase())) return toast(`Complex ${r.nummer} bestaat al`, 3500);
  c.nummer = r.nummer; c.naam = r.naam;
  for (const k of ['vertOpdrachtgever', 'opdrachtnemer', 'vertOpdrachtnemer', 'netElektra', 'netWater']) c.standaard[k] = r[k];
  await bewaar([['complexen', c]]); ververs(); toast('Opgeslagen');
}
async function nieuwBlok(c) {
  const r = await formulier({ titel: 'Blok toevoegen', ok: 'Toevoegen', velden: [{ key: 'naam', label: 'Naam of letter van het blok', verplicht: true }] });
  if (!r) return;
  if (blokkenVan(c.id).some(b => b.naam.toLowerCase() === r.naam.toLowerCase())) return toast(`Blok ${r.naam} bestaat al`);
  const b = M.nieuwBlok(c, r.naam); await bewaar([['blokken', b]]); ververs();
}
async function verwijderComplex(c) {
  const docs = documentenVanComplex(c.id);
  if (docs.some(d => d.soort !== 'vooropname')) return dialoog({ titel: 'Kan niet verwijderen', tekst: `Complex ${c.nummer} heeft ondertekende documenten. Die blijven altijd bewaard; het complex kan daarom niet worden verwijderd.` });
  if (!await bevestig(`Complex ${c.nummer} verwijderen?`, 'Alle blokken, objecten, punten en foto\'s van dit complex worden verwijderd. Maak eerst een back-up als je twijfelt.', 'Verwijderen', true)) return;
  const ops = [['complexen', c], ...blokkenVan(c.id).map(b => ['blokken', b]), ...objectenVanComplex(c.id).map(o => ['objecten', o]), ...puntenVanComplex(c.id).map(p => ['punten', p])];
  ops.forEach(([, r]) => { r.verwijderd = true; });
  await bewaar(/** @type {any} */ (ops)); ga(route.complexen()); toast('Complex verwijderd');
}

/* ===== Blok ===== */
export function blokScherm(id) {
  const b = get('blokken', id); if (!b) return null;
  const c = get('complexen', b.complexId), obj = objectenVanBlok(b.id);
  const opleverKlaar = obj.filter(o => o.fase === 'oplever').length;
  const inhoud = h('div',
    h('div.titelrij', h('h1', `Blok ${b.naam}`),
      h('div.knoprij.rechts', opleverKlaar ? h('a.knop', { href: route.verzamel('blok', b.id) }, ICOON.pen(), 'Gezamenlijk ondertekenen') : null,
        h('button.knop.licht', { type: 'button', onclick: () => nieuwObject(c, b) }, ICOON.plus(), 'Object'))),
    obj.length ? h('div.lijst', obj.map(o => {
      const s = M.objectSamenvatting(o, puntenVan(o.id), S.config);
      return h('a.rij', { href: route.object(o.id) },
        h('div.rij-hoofd', h('div.rij-titel', o.adres), h('div.rij-sub', o.type),
          h('div.fasebalk', faseChip(s), deadlineChip(o), s.tellers.teBeoordelen ? h('span.chip.krap', `${s.tellers.teBeoordelen} te beoordelen`) : null)),
        urgBadges(s.tellers), h('span.chev', ICOON.verder()));
    })) : leegStaat('Nog geen objecten', 'Voeg een object toe of importeer ze uit Excel op het complexscherm.'));
  return { kruimels: [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: `${c.nummer} ${c.naam}`.trim(), hash: route.complex(c.id) }, { tekst: `Blok ${b.naam}` }], inhoud, menu: [
    { tekst: 'Object toevoegen', fn: () => nieuwObject(c, b) },
    { tekst: 'Blok hernoemen', fn: () => hernoemBlok(c, b) },
    { tekst: 'Gezamenlijk ondertekenen…', fn: () => ga(route.verzamel('blok', b.id)), uit: !opleverKlaar },
    { tekst: 'Tekortkomingen naar Excel', icoon: ICOON.excel, fn: () => exportTekortkomingen('excel', { complex: c, blok: b }) },
    { tekst: 'Tekortkomingenlijst (PDF)', icoon: ICOON.doc, fn: () => exportTekortkomingen('pdf', { complex: c, blok: b }) },
    null,
    { tekst: 'Blok verwijderen…', gevaar: true, fn: () => verwijderBlok(c, b), uit: obj.some(o => o.fase !== 'voor') }
  ] };
}
async function nieuwObject(c, b) {
  const r = await formulier({ titel: `Object toevoegen aan blok ${b.naam}`, ok: 'Toevoegen', velden: [
    { key: 'adres', label: 'Adres', placeholder: 'bijv. Churchillweg 31-1', verplicht: true }, { key: 'type', label: 'Type', soort: 'keuze', opties: S.config.objectTypes, waarde: S.config.objectTypes[0] }] });
  if (!r) return;
  if (objectenVanBlok(b.id).some(o => o.adres.toLowerCase() === r.adres.toLowerCase())) return toast('Dit adres staat al in het blok');
  const o = M.nieuwObject(c, b, r); await bewaar([['objecten', o], ['complexen', c]]); ga(route.object(o.id));
}
async function hernoemBlok(c, b) {
  const r = await formulier({ titel: 'Blok hernoemen', velden: [{ key: 'naam', label: 'Naam', waarde: b.naam, verplicht: true }] });
  if (!r) return;
  if (blokkenVan(c.id).some(x => x !== b && x.naam.toLowerCase() === r.naam.toLowerCase())) return toast(`Blok ${r.naam} bestaat al`);
  b.naam = r.naam; await bewaar([['blokken', b]]); ververs();
}
async function verwijderBlok(c, b) {
  if (!await bevestig(`Blok ${b.naam} verwijderen?`, 'Het blok met alle objecten, punten en foto\'s wordt verwijderd.', 'Verwijderen', true)) return;
  const ops = [['blokken', b], ...objectenVanBlok(b.id).flatMap(o => [['objecten', o], ...puntenVan(o.id).map(p => ['punten', p])])];
  ops.forEach(([, r]) => { r.verwijderd = true; });
  await bewaar(/** @type {any} */ (ops)); ga(route.complex(c.id));
}
export { verwijder };
