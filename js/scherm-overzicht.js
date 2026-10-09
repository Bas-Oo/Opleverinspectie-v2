// @ts-check
/* Complexen, complex en blok — indeling van versie 1: kruimelpad als titel, één knop rechts, lijst met rijen, acties in het menu ☰ */
import { h, formulier, bevestig, toast, ICOON, dialoog, leverBestand } from './ui.js';
import { S, bewaar, bewaarConfig, complexen, blokkenVan, objectenVanBlok, objectenVanComplex, puntenVan, puntenVanComplex, documentenVanComplex, get } from './staat.js';
import * as M from './model.js';
import { ga, route, ververs } from './nav.js';
import { urgBadges, limietBadges, limietOver, statusChip, termijnChip, titelRij, knopMenu, leegStaat, melding, histRij } from './stukjes.js';
import { importeerExcel, downloadSjabloon } from './excel.js';
import { maakBackup, zetBackupTerug, opslagInfo } from './backup.js';
import { pdfVan } from './documenten.js';

const KR_COMPLEXEN = { tekst: 'Complexen', hash: route.complexen() };
const krComplex = c => ({ tekst: `${c.nummer} ${c.naam}`.trim(), hash: route.complex(c.id) });

/** Open punten opgeteld over objecten */
function somTellers(objecten) {
  const t = { A: 0, B: 0, C: 0, open: 0, ondertekend: 0, nietOpleverbaar: 0, oplever: 0 };
  for (const o of objecten) {
    const s = M.objectSamenvatting(o, puntenVan(o.id), S.config);
    for (const u of S.config.urgenties) t[u.code] = (t[u.code] || 0) + (s.tellers[u.code] || 0);
    if (o.fase === 'herstel' || o.fase === 'gereed') t.ondertekend++;
    else if (s.blokkerend) t.nietOpleverbaar++;
    if (o.fase === 'oplever') t.oplever++;
  }
  return t;
}

/* ===== Complexen ===== */
export function complexenScherm() {
  const lijst = complexen();
  const kr = [{ tekst: 'Complexen' }];
  const inhoud = h('div',
    titelRij(kr, knopMenu('Complex toevoegen', [
      { tekst: 'Handmatig toevoegen', fn: nieuwComplex },
      { tekst: 'Importeren via Excel', fn: () => importeerExcel(null) },
      { tekst: 'Importsjabloon downloaden', fn: downloadSjabloon }
    ])),
    h('div.lijst', lijst.length ? lijst.map(c => {
      const nObj = objectenVanComplex(c.id).length;
      return h('a.rij', { href: route.complex(c.id), style: { textDecoration: 'none' } },
        h('div.rij-hoofd', h('div.rij-titel', `${c.nummer} ${c.naam}`.trim()), h('div.rij-sub', `${blokkenVan(c.id).length} blok(ken) · ${nObj} object(en)`)),
        h('span.chev', '›'));
    }) : leegStaat('Nog geen complexen', 'Tik op “Complex toevoegen” om er een handmatig aan te maken of uit Excel te importeren.')));
  return { kruimels: kr, inhoud, menu: [
    { tekst: 'Back-up maken (alles)', fn: () => maakBackup(null) },
    { tekst: 'Back-up terugzetten…', fn: () => zetBackupTerug() },
    { tekst: 'Back-up en opslag', icoon: ICOON.schijf, fn: toonBackupInfo },
    null,
    { tekst: 'Instellingen', icoon: ICOON.instellingen, fn: () => ga(route.instellingen()) }
  ] };
}
function toonBackupInfo() {
  dialoog({ titel: 'Back-up en opslag', inhoud: h('div',
    h('p.hint', { style: { fontSize: '.95rem', whiteSpace: 'normal' } }, 'Alles wordt automatisch op deze tablet opgeslagen, in deze browser en op dit webadres. Een andere browser op dezelfde iPad ziet deze gegevens niet. Maak aan het eind van elke dag een back-up (met foto\'s en documenten) en bewaar die buiten de tablet. Bij veel foto\'s: maak een back-up per complex (menu ☰ in het complex).'),
    opslagInfo()), knoppen: [{ tekst: 'Sluiten', waarde: true }] });
}

async function nieuwComplex() {
  const r = await formulier({ titel: 'Nieuw complex', ok: 'Toevoegen', velden: [
    { key: 'nummer', label: 'Complexnummer', placeholder: 'bijv. 960', verplicht: true }, { key: 'naam', label: 'Naam', placeholder: 'Projectnaam' }] });
  if (!r) return;
  if (complexen().some(c => c.nummer.toLowerCase() === r.nummer.toLowerCase())) return toast(`Complex ${r.nummer} bestaat al`, 3500);
  const c = M.nieuwComplex(r); await bewaar([['complexen', c]]); ververs();
}

/* ===== Complex ===== */
export function complexScherm(id) {
  const c = get('complexen', id); if (!c) return null;
  const blokken = blokkenVan(c.id), alle = objectenVanComplex(c.id), tc = somTellers(alle);
  const kr = [KR_COMPLEXEN, { tekst: `${c.nummer} ${c.naam}`.trim() }];
  const lb = c.laatsteBackup;
  const inhoud = h('div',
    titelRij(kr, h('button.knop', { type: 'button', onclick: () => nieuwBlok(c) }, 'Blok toevoegen')),
    !standaardCompleet(c) && alle.length ? h('button.banner.geel.klik', { type: 'button', style: { display: 'block' }, onclick: () => complexInstellingen(c) },
      'Vul de standaardgegevens van het complex in', h('small', 'Namens opdrachtgever, opdrachtnemer en namens opdrachtnemer gelden dan voor alle objecten. Tik om in te vullen.')) : null,
    h('div.lijst', blokken.length ? blokken.map(b => {
      const obj = objectenVanBlok(b.id), t = somTellers(obj);
      return h('a.rij', { href: route.blok(b.id), style: { textDecoration: 'none' } },
        h('div.rij-hoofd', h('div.rij-titel', `Blok ${b.naam}`),
          h('div.rij-sub', `${obj.length} object(en) · ${t.ondertekend} ondertekend opgeleverd${t.nietOpleverbaar ? ' · ' + t.nietOpleverbaar + ' niet opleverbaar' : ''}`)),
        h('div.badges', urgBadges(t), limietBadges(t, 'blok')), h('span.chev', '›'));
    }) : leegStaat('Nog geen blokken', 'Voeg een blok toe; daarin komen de woningen en algemene ruimten. Of importeer de objecten uit Excel via het menu ☰.')),
    verzamelHistorie(c, null),
    h('div.status-lijn', lb ? 'Laatste back-up van dit complex: ' + new Date(lb).toLocaleString('nl-NL') : 'Van dit complex is nog geen back-up gemaakt.'));
  return { kruimels: kr, inhoud, menu: [
    { tekst: 'Complex afronden', fn: () => ga(route.verzamel('complex', c.id)), uit: !tc.oplever, titel: tc.oplever ? `${tc.oplever} object(en) met een gestarte oplevering` : 'Geen objecten om in één keer af te ronden' },
    { tekst: 'Complex instellingen', fn: () => complexInstellingen(c) },
    { tekst: 'Back-up van dit complex', fn: async () => { await maakBackup(c); } },
    { tekst: 'Objecten importeren uit Excel', fn: () => importeerExcel(c) }
  ] };
}
const standaardCompleet = c => M.PARTIJ_VELDEN.every(([k]) => String(c.standaard[k] || '').trim());

/** Verzamelafrondingen (gezamenlijk ondertekende processen-verbaal) op het complex- of blokscherm */
function verzamelHistorie(c, b) {
  const docs = documentenVanComplex(c.id).filter(d => d.soort === 'verzamel' && (!b || d.blokId === b.id || d.objectIds.some(id => (get('objecten', id) || {}).blokId === b.id)));
  if (!docs.length) return null;
  return h('div.kaart', { style: { marginTop: '20px' } }, h('h3', 'Verzamelafrondingen'), h('div', { style: { marginTop: '6px' } }, docs.slice().reverse().map(d => {
    const vervangers = Array.from(S.documenten.values()).filter(x => x.vervangt === d.id);
    const getekend = d.ondertekenaars.filter(o => o.getekend).map(o => o.naam || o.rol).join(' en ');
    const opm = vervangers.length ? h('div.vz-reden', `Vervangen door herziening: ${vervangers.map(x => (get('objecten', x.objectIds[0]) || {}).adres).join(', ')}. Voor de andere objecten blijft dit document geldig.`) : null;
    return histRij(`${d.inhoud && d.inhoud.blok ? 'Blok ' + d.inhoud.blok : 'Complex ' + c.nummer} · ${M.fmtDatum(d.datum)}`, `${d.objectIds.length} object(en) · getekend door ${getekend || '—'}`, opm,
      pdfKnop(d, 'Verzamel-PDF'), h('a.knop.licht.klein', { href: route.document(d.id) }, 'Details'));
  })));
}
/** Knop die de vastgelegde PDF van een document aflevert */
export function pdfKnop(d, tekst = 'PDF') {
  return h('button.knop.licht.klein', { type: 'button', onclick: async () => { const b = await pdfVan(d); if (!b) return toast('Bestand niet gevonden in de opslag', 4000); leverBestand(b, d.bestandsnaam, 'PDF gereed', `kenmerk ${d.inhoudKenmerk.slice(0, 8).toUpperCase()}`); } }, tekst);
}

/* Complex instellingen (versie 1.6.3): complexgegevens, standaardgegevens en waarschuwing C-punten in één dialoog */
export async function complexInstellingen(c) {
  const C = S.config.urgenties.find(u => u.code === 'C');
  const r = await formulier({ titel: 'Complex instellingen', velden: [
    { key: 'nummer', label: 'Complexnummer', waarde: c.nummer, verplicht: true, sectie: 'Complex' }, { key: 'naam', label: 'Naam', waarde: c.naam },
    ...M.PARTIJ_VELDEN.map(([k, l], i) => Object.assign({ key: k, label: l, waarde: c.standaard[k] }, i ? {} : { sectie: 'Standaardgegevens', sectieHint: 'Gelden voor alle objecten van dit complex, ook voor geïmporteerde. Een object wijkt alleen af als daar zelf iets anders is ingevuld.' })),
    { key: 'netElektra', label: 'Netbeheerder elektra', waarde: c.standaard.netElektra, placeholder: 'bijv. Liander' },
    { key: 'netWater', label: 'Netbeheerder water', waarde: c.standaard.netWater, placeholder: 'bijv. Vitens' },
    ...(C ? [{ key: 'cObject', label: 'Max. C-punten per woning', soort: 'getal', waarde: C.limietObject ?? '', placeholder: 'geen waarschuwing', sectie: 'Waarschuwing C-punten (laag)', sectieHint: 'De app waarschuwt als een woning of blok meer C-punten heeft dan hier ingesteld. Leeg laten = geen waarschuwing. Deze waarden gelden voor alle complexen (ook te wijzigen onder Instellingen).' },
      { key: 'cBlok', label: 'Max. C-punten per blok', soort: 'getal', waarde: C.limietBlok ?? '', placeholder: 'geen waarschuwing' }] : [])],
    extra: [{ tekst: 'Complex verwijderen…', waarde: 'weg', soort: 'gevaar' }] });
  if (!r) return;
  if (r._actie === 'weg') return verwijderComplex(c);
  if (r.nummer.toLowerCase() !== c.nummer.toLowerCase() && complexen().some(x => x.nummer.toLowerCase() === r.nummer.toLowerCase())) return toast(`Complex ${r.nummer} bestaat al`, 3500);
  c.nummer = r.nummer; c.naam = r.naam;
  for (const k of ['vertOpdrachtgever', 'opdrachtnemer', 'vertOpdrachtnemer', 'netElektra', 'netWater']) c.standaard[k] = r[k];
  await bewaar([['complexen', c]]);
  if (C) {
    const getal = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; };
    const cfg = structuredClone(S.config), cc = cfg.urgenties.find(u => u.code === 'C');
    if (cc.limietObject !== getal(r.cObject) || cc.limietBlok !== getal(r.cBlok)) { cc.limietObject = getal(r.cObject); cc.limietBlok = getal(r.cBlok); await bewaarConfig(cfg); }
  }
  ververs(); toast('Opgeslagen');
}
async function nieuwBlok(c) {
  const r = await formulier({ titel: 'Nieuw blok', ok: 'Toevoegen', velden: [{ key: 'naam', label: 'Bloknaam of -letter', placeholder: 'bijv. A', verplicht: true }] });
  if (!r) return;
  if (blokkenVan(c.id).some(b => b.naam.toLowerCase() === r.naam.toLowerCase())) return toast(`Blok ${r.naam} bestaat al`);
  const b = M.nieuwBlok(c, r.naam); await bewaar([['blokken', b]]); ververs();
}
async function verwijderComplex(c) {
  const docs = documentenVanComplex(c.id);
  if (docs.some(d => d.soort !== 'vooropname')) return dialoog({ titel: 'Kan niet verwijderen', tekst: `Complex ${c.nummer} heeft ondertekende documenten. Die blijven altijd bewaard; het complex kan daarom niet worden verwijderd.` });
  const obj = objectenVanComplex(c.id);
  if (!await bevestig('Complex verwijderen?', `Complex ${c.nummer} ${c.naam} met ${blokkenVan(c.id).length} blok(ken) en ${obj.length} object(en), inclusief alle punten en foto's, wordt definitief verwijderd.`, 'Verwijderen', true)) return;
  const ops = [['complexen', c], ...blokkenVan(c.id).map(b => ['blokken', b]), ...obj.map(o => ['objecten', o]), ...puntenVanComplex(c.id).map(p => ['punten', p])];
  ops.forEach(([, r]) => { r.verwijderd = true; });
  await bewaar(/** @type {any} */ (ops)); ga(route.complexen()); toast('Complex verwijderd');
}

/* ===== Blok ===== */
export function blokScherm(id) {
  const b = get('blokken', id); if (!b) return null;
  const c = get('complexen', b.complexId), obj = objectenVanBlok(b.id), t = somTellers(obj);
  const kr = [KR_COMPLEXEN, krComplex(c), { tekst: `Blok ${b.naam}` }];
  const over = limietOver(t, 'blok');
  const inhoud = h('div',
    over.map(x => h('div.banner.geel', `⚠️ ${x.n} ${x.code}-punten in dit blok — meer dan de limiet van ${x.limiet} per blok.`)),
    titelRij(kr, h('button.knop', { type: 'button', onclick: () => nieuwObject(c, b) }, 'Object toevoegen')),
    h('div.lijst', obj.length ? obj.map(o => {
      const s = M.objectSamenvatting(o, puntenVan(o.id), S.config);
      return h('a.rij', { href: route.object(o.id), style: { textDecoration: 'none' } },
        h('div.rij-hoofd', h('div.rij-titel', o.adres), h('div.rij-sub', o.type),
          h('div.badges', { style: { marginTop: '6px' } }, statusChip(o, s), termijnChip(o), s.tellers.teBeoordelen ? h('span.badge.krap', `${s.tellers.teBeoordelen} te beoordelen`) : null)),
        h('div.badges', urgBadges(s.tellers), limietBadges(s.tellers, 'object')), h('span.chev', '›'));
    }) : leegStaat('Nog geen objecten', 'Voeg de woningen en algemene ruimten van dit blok toe.')),
    verzamelHistorie(c, b));
  return { kruimels: kr, inhoud, menu: [
    { tekst: 'Blok afronden', fn: () => ga(route.verzamel('blok', b.id)), uit: !t.oplever, titel: t.oplever ? `${t.oplever} object(en) met een gestarte oplevering` : 'Geen objecten om in één keer af te ronden' },
    { tekst: 'Blok bewerken', fn: () => blokBewerken(c, b) }
  ] };
}
async function nieuwObject(c, b) {
  const r = await formulier({ titel: 'Nieuw object', ok: 'Toevoegen', velden: [
    { key: 'adres', label: 'Adres', placeholder: 'Straat en huisnummer', verplicht: true }, { key: 'type', label: 'Type', soort: 'keuze', opties: S.config.objectTypes, waarde: S.config.objectTypes[0] }] });
  if (!r) return;
  if (objectenVanBlok(b.id).some(o => o.adres.toLowerCase() === r.adres.toLowerCase())) return toast('Dit adres staat al in het blok');
  const o = M.nieuwObject(c, b, r); await bewaar([['objecten', o], ['complexen', c]]); ververs();
}
async function blokBewerken(c, b) {
  const obj = objectenVanBlok(b.id), kanWeg = !obj.some(o => o.fase !== 'voor');
  const r = await formulier({ titel: 'Blok bewerken', velden: [{ key: 'naam', label: 'Bloknaam', waarde: b.naam, verplicht: true }],
    extra: [{ tekst: 'Blok verwijderen…', waarde: 'weg', soort: 'gevaar' }] });
  if (!r) return;
  if (r._actie === 'weg') {
    if (!kanWeg) return dialoog({ titel: 'Kan niet verwijderen', tekst: `In blok ${b.naam} is bij een of meer objecten de oplevering al gestart. Vastgelegde documenten blijven altijd bewaard; het blok kan daarom niet worden verwijderd.` });
    if (!await bevestig('Blok verwijderen?', `Blok ${b.naam} met ${obj.length} object(en), inclusief alle punten en foto's, wordt definitief verwijderd.`, 'Verwijderen', true)) return;
    const ops = [['blokken', b], ...obj.flatMap(o => [['objecten', o], ...puntenVan(o.id).map(p => ['punten', p])])];
    ops.forEach(([, x]) => { x.verwijderd = true; });
    await bewaar(/** @type {any} */ (ops)); return ga(route.complex(c.id));
  }
  if (blokkenVan(c.id).some(x => x !== b && x.naam.toLowerCase() === r.naam.toLowerCase())) return toast(`Blok ${r.naam} bestaat al`);
  b.naam = r.naam; await bewaar([['blokken', b]]); ververs();
}
export { melding };
