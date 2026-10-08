// @ts-check
/* Objectscherm: fase-stappen, punten (foto-eerst, per ruimte), meters, overige zaken, gegevens en documenten */
import { h, $, toast, ICOON, keuze, dialoog, bevestig, formulier, leeg } from './ui.js';
import { S, bewaar, bewaarLater, get, puntenVan, documentenVan, objectenVanBlok, puntenVanComplex, objectenVanComplex } from './staat.js';
import * as M from './model.js';
import { ga, route, ververs } from './nav.js';
import { urgBadges, deadlineChip, melding } from './stukjes.js';
import { camera, bewaarFoto, miniatuur } from './foto.js';
import { docRij } from './scherm-overzicht.js';
import { startOpleveringMetVastlegging } from './documenten.js';
import { exportTekortkomingen } from './excel.js';

const DELEN = [['punten', 'Punten', ICOON.lijst], ['meters', 'Meters', ICOON.meter], ['overig', 'Overig', ICOON.vink], ['gegevens', 'Gegevens', ICOON.gegevens], ['documenten', 'Documenten', ICOON.doc]];
let filterTeBeoordelen = false;

export function objectScherm(id, deel = 'punten') {
  const o = get('objecten', id); if (!o) return null;
  const c = get('complexen', o.complexId), b = get('blokken', o.blokId);
  const punten = puntenVan(o.id), docs = documentenVan(o.id);
  const ctl = M.controles({ config: S.config, complex: c, object: o, punten, blokPunten: objectenVanBlok(b.id).flatMap(x => puntenVan(x.id)), blokObjecten: objectenVanBlok(b.id) });
  const t = ctl.tellers;
  const ctx = { o, c, b, punten, docs, ctl };

  const inhoud = h('div.object',
    h('div.titelrij', h('div', h('h1', o.adres), h('div.sub', `${o.type} · Blok ${b.naam} · Complex ${c.nummer}`)), urgBadges(t)),
    faseStappen(o),
    o.fase === 'oplever' && o.herziening ? melding('geel', `Herziening ${o.herziening} van de oplevering`, `Reden: ${(o.herzieningen.at(-1) || {}).reden || ''}. Het eerder ondertekende proces-verbaal blijft ongewijzigd bewaard; na ondertekenen vervangt de herziening het.`) : null,
    o.fase === 'herstel' ? herstelBanner(o) : null,
    h('nav.delen', { 'aria-label': 'Onderdelen' }, DELEN.map(([k, l, ico]) => h('a', { href: route.object(o.id, k), class: deel === k ? 'aan' : '', 'aria-current': deel === k ? 'page' : null }, ico(), h('span', l),
      k === 'punten' && t.teBeoordelen ? h('i.stip', String(t.teBeoordelen)) : k === 'documenten' && docs.length ? h('i.tel', String(docs.length)) : null))),
    h('div.deel', ({ punten: puntenDeel, meters: metersDeel, overig: overigDeel, gegevens: gegevensDeel, documenten: documentenDeel })[deel](ctx)));

  return { kruimels: [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: `${c.nummer} ${c.naam}`.trim(), hash: route.complex(c.id) }, { tekst: `Blok ${b.naam}`, hash: route.blok(b.id) }, { tekst: o.adres }],
    inhoud, balk: actieBalk(ctx, deel), menu: [
      { tekst: 'Adres en type wijzigen', fn: () => wijzigObject(o) },
      { tekst: 'Tekortkomingen naar Excel', icoon: ICOON.excel, fn: () => exportTekortkomingen('excel', { complex: c, blok: b, object: o }) },
      { tekst: 'Tekortkomingenlijst (PDF)', icoon: ICOON.doc, fn: () => exportTekortkomingen('pdf', { complex: c, blok: b, object: o }) },
      null,
      { tekst: 'Object verwijderen…', gevaar: true, fn: () => verwijderObject(o), uit: docs.length > 0 }
    ] };
}

function faseStappen(o) {
  const i = M.FASES.indexOf(o.fase);
  return h('ol.stappen', M.FASES.map((f, n) => h('li', { class: n < i ? 'klaar' : n === i ? 'nu' : '' }, h('span.stap-nr', n < i ? ICOON.vink() : String(n + 1)), h('span', M.FASE_LABEL[f]))));
}
function herstelBanner(o) {
  const n = M.werkdagenTot(o.herstelUiterlijk);
  return melding(n !== null && n < 0 ? 'rood' : 'blauw', `Herstel uiterlijk ${M.fmtDatum(o.herstelUiterlijk)}${o.herstelRonde ? ` · ronde ${o.herstelRonde + 1}` : ''}`,
    n === null ? '' : n < 0 ? `De hersteltermijn is ${-n} werkdag(en) verstreken.` : `Nog ${n} werkdag(en). Controleer per punt of het is hersteld; "Hersteld" is je paraaf als opdrachtgever.`, deadlineChip(o));
}

/* ===== Actiebalk onderin: de volgende stap in de fase ===== */
function actieBalk({ o, ctl, punten }, deel) {
  const knoppen = [];
  const kanPunt = o.fase !== 'gereed';
  if (kanPunt && deel === 'punten') {
    knoppen.push(h('button.knop.licht', { type: 'button', onclick: () => puntSheet(o, null, null) }, ICOON.plus(), 'Zonder foto'));
    knoppen.push(h('button.knop.camera', { type: 'button', onclick: () => puntMetFoto(o) }, ICOON.camera(), o.fase === 'herstel' ? 'Nagekomen punt' : 'Punt met foto'));
  }
  if (o.fase === 'voor') knoppen.push(h('button.knop.volgende', { type: 'button', onclick: () => startOplevering(o, punten) }, 'Oplevering starten', ICOON.verder()));
  if (o.fase === 'oplever' || o.fase === 'herstel') {
    const nb = ctl.blokkades.length;
    knoppen.push(h('a.knop.volgende', { href: route.tekenen(o.id), class: nb ? 'met-blokkade' : '' }, o.fase === 'oplever' ? 'Ondertekenen' : 'Herstel afronden', nb ? h('i.tel', String(nb)) : ICOON.verder()));
  }
  return knoppen.length ? h('div.actiebalk', knoppen) : null;
}

async function startOplevering(o, punten) {
  const n = punten.filter(p => M.levend(p) && p.status !== 'vervallen').length;
  if (!await bevestig('Oplevering starten?', n
    ? `De vooropname met ${n} punt(en) wordt vastgelegd als proces-verbaal (zonder handtekening). In de oplevering beoordeel je per punt of het is hersteld. De nummers blijven gelijk.`
    : 'Er zijn geen vooropnamepunten. De oplevering begint met een lege lijst.', 'Starten')) return;
  try {
    toast('Vooropname wordt vastgelegd…', 10000);
    const d = await startOpleveringMetVastlegging(o);
    toast(d ? 'Vooropname vastgelegd; oplevering gestart' : 'Oplevering gestart', 3000);
    ga(route.object(o.id));
  } catch (e) { console.error(e); toast('Starten mislukt: ' + (e && e.message), 5000); }
}

/* ===== Punten ===== */
function puntenDeel({ o, punten, docs }) {
  const levende = punten.filter(M.levend);
  const beoordelen = levende.filter(p => M.teBeoordelen(p, o));
  const kader = h('div');
  if (beoordelen.length) kader.appendChild(melding('geel', `${beoordelen.length} punt(en) nog beoordelen`, o.fase === 'oplever' ? 'Geef bij elk punt uit de vooropname aan of het is hersteld.' : 'Geef bij elk open punt aan of het is hersteld.',
    h('button.knop.licht.klein', { type: 'button', onclick: () => { filterTeBeoordelen = !filterTeBeoordelen; ververs(); } }, filterTeBeoordelen ? 'Alles tonen' : 'Alleen deze')));
  else filterTeBeoordelen = false;
  const zichtbaar = filterTeBeoordelen ? beoordelen : levende;
  const actief = zichtbaar.filter(p => p.status === 'open' || M.teBeoordelen(p, o) || M.beoordeling(p, o));
  const afgehandeld = zichtbaar.filter(p => !actief.includes(p));
  if (!levende.length) kader.appendChild(h('div.leeg-staat', h('strong', 'Nog geen punten'), h('p', o.fase === 'gereed' ? 'Dit object is zonder punten opgeleverd.' : 'Loop de ruimtes langs. Tik op "Punt met foto": de camera opent direct, daarna kies je ruimte, omschrijving en urgentie.')));
  for (const g of M.perRuimte(actief, S.config)) kader.appendChild(h('section.ruimte-groep', h('h3', g.ruimte, h('span.aantal', String(g.punten.length))), g.punten.map(p => puntKaart(o, p, docs))));
  if (afgehandeld.length) kader.appendChild(h('details.uitklap.afgehandeld', { open: !actief.length }, h('summary', h('h3', `Hersteld of vervallen (${afgehandeld.length})`)), afgehandeld.sort((a, b) => a.nr - b.nr).map(p => puntKaart(o, p, docs))));
  return kader;
}

function puntKaart(o, p, docs) {
  const moet = M.moetBeoordeeld(p, o) || (M.isNagekomen(p) && o.fase === 'herstel' && p.geconstateerd.t < (o.faseStart.herstel || ''));
  const bo = M.beoordeling(p, o);
  const vlaggen = [
    p.geconstateerd.fase === 'voor' && o.fase !== 'voor' ? h('span.vlag', 'uit vooropname') : null,
    p.geconstateerd.herziening && o.fase !== 'voor' ? h('span.vlag.geel', `herziening ${p.geconstateerd.herziening}`) : null,
    M.isNagekomen(p) ? h('span.vlag.geel', 'nagekomen') : null,
    p.nietErkend ? h('span.vlag.rood', 'niet erkend') : null,
    p.status === 'vervallen' ? h('span.vlag', 'vervallen') : null,
    p.paraaf ? h('span.vlag.groen', 'paraaf ' + M.fmtDatum(p.paraaf.t)) : p.status === 'hersteld' ? h('span.vlag.groen', 'hersteld') : null
  ];
  const kaart = h('article.punt', { class: `u-${p.urgentie || 'geen'} s-${p.status}`, tabindex: 0, onclick: () => puntSheet(o, p, null), onkeydown: e => { if (e.key === 'Enter') puntSheet(o, p, null); } },
    p.fotoId ? miniatuur(p.fotoId, { nr: String(p.nr), bijschrift: `${p.nr}. ${p.ruimte} — ${p.omschrijving}` }) : h('div.mini.geen', h('span.mini-nr', String(p.nr))),
    h('div.punt-hoofd',
      h('div.punt-titel', h('span.nr', p.nr + '.'), p.omschrijving || h('em.hint', 'geen omschrijving')),
      h('div.punt-vlaggen', p.urgentie ? h('span.badge', { class: 'u-' + p.urgentie }, p.urgentie) : h('span.badge.u-geen', '?'), vlaggen),
      moet && o.fase !== 'gereed' ? h('div.beoordeel', { onclick: e => e.stopPropagation() },
        h('button.knop.klein', { type: 'button', class: bo === 'hersteld' ? 'groen' : 'licht', onclick: () => zetBeoordeling(o, p, 'hersteld') }, ICOON.vink(), o.fase === 'herstel' ? 'Hersteld (paraaf)' : 'Hersteld'),
        h('button.knop.klein', { type: 'button', class: bo === 'nog open' ? 'rood' : 'licht', onclick: () => zetBeoordeling(o, p, 'nog open') }, 'Nog open')) : null));
  return kaart;
}
async function zetBeoordeling(o, p, uitkomst) {
  if (M.beoordeling(p, o) === uitkomst) M.wisBeoordeling(p, o);
  else { if (M.beoordeling(p, o)) M.wisBeoordeling(p, o); M.beoordeel(p, o, uitkomst, M.nuISO(), M.partijen(o, get('complexen', o.complexId)).vertOpdrachtgever); }
  await bewaar([['punten', p]]); ververs();
}

/* ===== Punt vastleggen of bewerken =====
   Foto eerst: de knop opent direct de camera; daarna ruimte, omschrijving en urgentie in één scherm. */
let laatsteRuimte = '';
async function puntMetFoto(o) {
  const f = await camera(); if (!f) return;
  let fotoId = null;
  try { fotoId = await bewaarFoto(f); } catch (e) { toast('Foto mislukt: ' + (e && e.message), 4000); }
  puntSheet(o, null, fotoId);
}

function suggestiesOmschrijving(o, tekst) {
  const freq = new Map();
  for (const p of puntenVanComplex(o.complexId)) { const v = (p.omschrijving || '').trim(); if (v) { const k = v.toLowerCase(); const e = freq.get(k) || { v, n: 0 }; e.n++; freq.set(k, e); } }
  for (const v of S.config.omschrijvingen) if (!freq.has(v.toLowerCase())) freq.set(v.toLowerCase(), { v, n: 0.5 });
  const q = tekst.trim().toLowerCase();
  return Array.from(freq.values()).filter(e => !q || (e.v.toLowerCase().includes(q) && e.v.toLowerCase() !== q)).sort((a, b) => b.n - a.n || a.v.localeCompare(b.v)).slice(0, 8).map(e => e.v);
}
function ruimteOpties(o) {
  const extra = new Set();
  for (const p of puntenVanComplex(o.complexId)) if (p.ruimte && !S.config.ruimtes.some(r => r.toLowerCase() === p.ruimte.toLowerCase())) extra.add(p.ruimte);
  return S.config.ruimtes.concat(Array.from(extra));
}

export async function puntSheet(o, p, fotoId) {
  const nieuw = !p, docs = documentenVan(o.id);
  const bewerkbaar = nieuw || M.puntBewerkbaar(p, o, docs);
  const v = { ruimte: p ? p.ruimte : laatsteRuimte, omschrijving: p ? p.omschrijving : '', urgentie: p ? p.urgentie : '', fotoId: p ? p.fotoId : fotoId,
    nietErkend: p && p.nietErkend ? p.nietErkend.reden : '' };
  const nietErkendAan = { aan: !!v.nietErkend };

  /* Foto */
  const fotoVak = h('div.foto-vak');
  const tekenFoto = () => {
    leeg(fotoVak);
    if (v.fotoId) fotoVak.appendChild(miniatuur(v.fotoId, { bijschrift: v.omschrijving }));
    if (bewerkbaar) fotoVak.appendChild(h('div.foto-knoppen',
      h('button.knop.licht', { type: 'button', onclick: async () => { const f = await camera(); if (!f) return; try { v.fotoId = await bewaarFoto(f); tekenFoto(); } catch (e) { toast('Foto mislukt', 3000); } } }, ICOON.camera(), v.fotoId ? 'Andere foto' : 'Foto maken'),
      v.fotoId ? h('button.knop.licht.klein', { type: 'button', onclick: () => { v.fotoId = null; tekenFoto(); } }, 'Foto weghalen') : null));
    else if (!v.fotoId) fotoVak.appendChild(h('p.hint', 'Geen foto'));
  };
  tekenFoto();

  /* Ruimte: knoppen in looproutevolgorde, plus vrij invullen */
  const opties = ruimteOpties(o), isOptie = r => opties.some(x => x.toLowerCase() === String(r).trim().toLowerCase());
  const ruimteInp = /** @type {HTMLInputElement} */ (h('input.invoer', { value: isOptie(v.ruimte) ? '' : v.ruimte, placeholder: 'Andere ruimte…', disabled: !bewerkbaar, autocomplete: 'off', autocapitalize: 'sentences', oninput: e => { v.ruimte = e.target.value; markeer(); } }));
  const chips = h('div.chips', opties.map(r => h('button.chip-knop', { type: 'button', disabled: !bewerkbaar, dataset: { r }, onclick: () => { v.ruimte = r; ruimteInp.value = ''; markeer(); } }, r)));
  const markeer = () => { for (const b of chips.children) b.classList.toggle('aan', /** @type {HTMLElement} */ (b).dataset.r.toLowerCase() === v.ruimte.trim().toLowerCase()); };
  markeer();

  /* Omschrijving met snelkeuzes */
  const omschr = /** @type {HTMLTextAreaElement} */ (h('textarea.invoer', { rows: 3, value: v.omschrijving, disabled: !bewerkbaar, placeholder: 'Omschrijving tekortkoming (dicteren kan met de microfoon op het toetsenbord)', autocapitalize: 'sentences' }));
  const sug = h('div.chips.sug');
  const tekenSug = () => { leeg(sug); if (!bewerkbaar) return; for (const s of suggestiesOmschrijving(o, omschr.value)) sug.appendChild(h('button.chip-knop', { type: 'button', onclick: () => { omschr.value = s; v.omschrijving = s; tekenSug(); } }, s)); };
  omschr.addEventListener('input', () => { v.omschrijving = omschr.value; tekenSug(); });
  tekenSug();

  /* Urgentie */
  const urg = keuze(S.config.urgenties.map(u => [u.code, u.code + ' · ' + u.titel, u.uitleg]), v.urgentie, w => { v.urgentie = w; }, { uit: !bewerkbaar, klasse: 'urgentie' });

  /* Niet erkend door de opdrachtnemer, met reden */
  const kanErkenning = o.fase !== 'gereed' && (!p || p.status !== 'vervallen');
  const redenInp = /** @type {HTMLInputElement} */ (h('input.invoer', { value: v.nietErkend, placeholder: 'Reden van de opdrachtnemer', hidden: !nietErkendAan.aan, disabled: !kanErkenning, oninput: e => { v.nietErkend = e.target.value; } }));
  const neKnop = h('button.vink', { type: 'button', class: nietErkendAan.aan ? 'aan' : '', disabled: !kanErkenning, onclick: () => { nietErkendAan.aan = !nietErkendAan.aan; neKnop.classList.toggle('aan', nietErkendAan.aan); redenInp.hidden = !nietErkendAan.aan; if (nietErkendAan.aan) redenInp.focus(); } }, h('span.box', ICOON.vink()), 'Niet erkend door de opdrachtnemer');

  const historie = p ? h('details.historie', h('summary', `Historie (${p.historie.length})`), h('ol', p.historie.map(e => h('li', h('span.t', new Date(e.t).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })), ' ', h('strong', e.actie), ` · ${M.FASE_LABEL[e.fase] || e.fase}`,
    e.opm ? ` — ${e.opm}` : '', e.naar ? ` — ${Object.entries(e.naar).map(([k, x]) => `${k}: ${e.van[k] || '—'} → ${x || '—'}`).join(', ')}` : '')))) : null;

  const inhoud = h('div.punt-sheet',
    !bewerkbaar ? melding('blauw', 'Vastgelegd in een proces-verbaal', 'Ruimte, omschrijving, urgentie en foto liggen vast. Niet erkend kun je nog aanpassen; een onterecht punt laat je vervallen met een reden.') : null,
    fotoVak,
    h('div.veld', h('span.label', 'Ruimte'), chips, ruimteInp),
    h('div.veld', h('span.label', 'Omschrijving'), omschr, sug),
    h('div.veld', h('span.label', 'Urgentie'), urg),
    h('div.veld', neKnop, redenInp),
    historie);

  const knoppen = [];
  if (p && M.magVerwijderen(p, o, docs)) knoppen.push({ tekst: 'Verwijderen', waarde: 'weg', soort: 'gevaar' });
  else if (p && p.status !== 'vervallen' && o.fase !== 'gereed') knoppen.push({ tekst: 'Laten vervallen…', waarde: 'vervallen', soort: 'gevaar' });
  knoppen.push({ tekst: 'Annuleren', waarde: null, soort: 'licht' });
  if (nieuw) knoppen.push({ tekst: 'Opslaan + volgende foto', waarde: 'volgende', soort: 'licht' });
  knoppen.push({ tekst: 'Opslaan', waarde: 'ok' });

  /* 'Opslaan + volgende foto' moet de camera binnen de tik openen (iOS); de dialoog roept daarom 'controle' synchroon aan */
  let volgendeCamera = null;
  const w = await dialoog({ titel: nieuw ? (o.fase === 'herstel' ? 'Nagekomen punt' : 'Nieuw punt') : `Punt ${p.nr}`, inhoud, knoppen, breed: true,
    controle: waarde => {
      if (waarde === 'ok' || waarde === 'volgende') {
        if (bewerkbaar && !v.omschrijving.trim() && !v.fotoId) return 'Vul een omschrijving in of maak een foto';
        if (nietErkendAan.aan && !String(v.nietErkend).trim()) return 'Vul de reden van niet erkennen in';
        if (waarde === 'volgende') volgendeCamera = camera();
      }
      return null;
    } });
  if (w === null) { if (nieuw && v.fotoId && fotoId) toast('Punt niet opgeslagen', 2000); return; }
  try {
    if (w === 'weg') {
      if (!await bevestig(`Punt ${p.nr} verwijderen?`, 'Het punt staat nog in geen enkel document en wordt verwijderd. Het nummer wordt niet opnieuw gebruikt.', 'Verwijderen', true)) return;
      p.verwijderd = true; await bewaar([['punten', p]]); ververs(); return;
    }
    if (w === 'vervallen') {
      const r = await formulier({ titel: `Punt ${p.nr} laten vervallen`, tekst: 'Het punt blijft zichtbaar in de historie en in latere processen-verbaal als vervallen, met deze reden.', ok: 'Laten vervallen', velden: [{ key: 'reden', label: 'Reden', soort: 'lang', rijen: 2, verplicht: true }] });
      if (!r) return;
      M.laatVervallen(p, o, r.reden); await bewaar([['punten', p]]); ververs(); return;
    }
    const velden = { ruimte: v.ruimte.trim(), omschrijving: v.omschrijving.trim(), urgentie: v.urgentie, fotoId: v.fotoId };
    if (velden.ruimte) laatsteRuimte = velden.ruimte;
    const ops = [];
    if (nieuw) { p = M.nieuwPunt(o, velden); ops.push(['punten', p], ['objecten', o]); }
    else if (bewerkbaar && M.wijzigPunt(p, velden, o)) ops.push(['punten', p]);
    const ne = nietErkendAan.aan ? String(v.nietErkend).trim() : '';
    if (kanErkenning && (ne || null) !== (p.nietErkend ? p.nietErkend.reden : null)) { M.zetNietErkend(p, o, ne || null); if (!ops.some(x => x[1] === p)) ops.push(['punten', p]); }
    if (ops.length) await bewaar(/** @type {any} */ (ops));
    ververs();
    if (nieuw) toast(`Punt ${p.nr} opgeslagen`, 1600);
  } catch (e) { console.error(e); toast('Opslaan mislukt: ' + (e && e.message), 5000); }
  if (volgendeCamera) {
    const f = await volgendeCamera; if (!f) return;
    let id = null; try { id = await bewaarFoto(f); } catch (e) { toast('Foto mislukt', 3000); }
    puntSheet(o, null, id);
  }
}

/* ===== Meters ===== */
function metersDeel({ o, c }) {
  const m = o.meter, slot = !(o.fase === 'voor' || o.fase === 'oplever'), cfg = S.config;
  const kader = h('div');
  if (slot) kader.appendChild(melding('blauw', 'Vastgelegd in het proces-verbaal van oplevering', 'De meterstanden zijn niet meer te wijzigen.'));
  kader.appendChild(h('div.kaart', keuze([['nee', 'Meterstanden opnemen'], ['ja', 'Niet van toepassing']], m.nvt ? 'ja' : 'nee', async w => { m.nvt = w === 'ja'; await bewaar([['objecten', o]]); ververs(); }, { uitzetbaar: false, uit: slot })));
  if (m.nvt) { kader.appendChild(h('p.hint', 'Bij dit object worden geen meterstanden vastgelegd; het proces-verbaal vermeldt "niet van toepassing".')); return kader; }
  const veld = (k, label, ph) => h('label.veld', h('span.label', label), h('input.invoer', { value: m[k] || '', placeholder: ph, disabled: slot, autocomplete: 'off', oninput: e => { m[k] = e.target.value; bewaarLater('objecten', o); } }));
  kader.appendChild(h('div.kaart', h('div.velden.twee',
    h('label.veld', h('span.label', 'Datum meteropname'), h('input.invoer#meterDatum', { type: 'date', value: m.datum || '', disabled: slot, onchange: e => { m.datum = e.target.value; bewaarLater('objecten', o); } })),
    veld('netElektra', 'Netbeheerder elektra', c.standaard.netElektra || 'bijv. Liander'),
    veld('netWater', 'Netbeheerder water', c.standaard.netWater || 'bijv. Vitens'),
    h('div.veld', h('span.label', 'Opgenomen door'), keuze([['opdrachtgever', 'Opdrachtgever'], ['opdrachtnemer', 'Opdrachtnemer'], ['gezamenlijk', 'Gezamenlijk']], m.door, w => { m.door = w; bewaarLater('objecten', o); }, { uit: slot })))));
  for (const mt of cfg.meters) {
    const st = m.standen[mt.key] || (m.standen[mt.key] = { waarde: '', fotoId: null });
    const fotoPlek = h('div.meter-foto');
    const tekenFoto = () => {
      leeg(fotoPlek);
      if (st.fotoId) fotoPlek.appendChild(miniatuur(st.fotoId, { klein: true, bijschrift: mt.label }));
      if (!slot) fotoPlek.appendChild(h('button.knop.licht.klein', { type: 'button', 'aria-label': 'Foto van ' + mt.label, onclick: async () => { const f = await camera(); if (!f) return; try { st.fotoId = await bewaarFoto(f); await bewaar([['objecten', o]]); tekenFoto(); } catch (e) { toast('Foto mislukt', 3000); } } }, ICOON.camera(), st.fotoId ? '' : 'Foto'));
    };
    tekenFoto();
    kader.appendChild(h('div.meter',
      h('label.veld', h('span.label', mt.label, mt.optioneel ? h('span.hint', ' (optioneel)') : null),
        h('input.invoer.getal', { inputmode: 'decimal', value: st.waarde || '', placeholder: '—', disabled: slot, autocomplete: 'off', oninput: e => {
          const ruw = e.target.value, schoon = ruw.replace(/[^0-9.,]/g, '').replace(/^([^.,]*[.,])(.*)$/, (x, a, b) => a + b.replace(/[.,]/g, ''));
          if (schoon !== ruw) e.target.value = schoon;
          st.waarde = schoon;
          if (schoon && !m.datum) { m.datum = M.vandaag(); const d = /** @type {HTMLInputElement|null} */ ($('#meterDatum')); if (d) d.value = m.datum; }
          bewaarLater('objecten', o);
        } })),
      fotoPlek));
  }
  return kader;
}

/* ===== Overige zaken ===== */
function overigDeel({ o, c }) {
  const oz = o.overig, slot = !(o.fase === 'voor' || o.fase === 'oplever');
  const kader = h('div');
  if (slot) kader.appendChild(melding('blauw', 'Vastgelegd in het proces-verbaal van oplevering', 'De overige zaken zijn niet meer te wijzigen.'));
  if (!slot) {
    const bronnen = objectenVanComplex(c.id).filter(x => x.id !== o.id && S.config.overigeZaken.some(z => String(x.overig[z.key] ?? '').trim()));
    if (bronnen.length) {
      const sel = /** @type {HTMLSelectElement} */ (h('select.invoer', bronnen.map(x => h('option', { value: x.id }, `Blok ${(get('blokken', x.blokId) || {}).naam} · ${x.adres}`))));
      kader.appendChild(h('div.kaart', h('h3', 'Overnemen van een ander object'), h('div.rijvelden', sel, h('button.knop', { type: 'button', onclick: async () => {
        const bron = get('objecten', sel.value); if (!bron) return;
        if (S.config.overigeZaken.some(z => String(oz[z.key] ?? '').trim()) && !await bevestig('Overschrijven?', `De overige zaken worden vervangen door die van ${bron.adres}.`, 'Overschrijven')) return;
        o.overig = structuredClone(bron.overig); await bewaar([['objecten', o]]); ververs(); toast('Overgenomen; controleer en pas aan', 3000);
      } }, 'Kopiëren'))));
    }
  }
  const kaart = h('div.kaart.overig');
  for (const z of S.config.overigeZaken) {
    let bediening;
    if (z.soort === 'aantal') {
      const inp = /** @type {HTMLInputElement} */ (h('input.invoer.getal.kort', { inputmode: 'numeric', value: oz[z.key] ?? '', placeholder: '—', disabled: slot, oninput: e => { e.target.value = e.target.value.replace(/\D/g, ''); oz[z.key] = e.target.value; bewaarLater('objecten', o); } }));
      const stap = d => () => { const n = Math.max(0, (parseInt(oz[z.key], 10) || 0) + d); oz[z.key] = String(n); inp.value = oz[z.key]; bewaarLater('objecten', o); };
      bediening = h('div.teller', h('button.knop.licht', { type: 'button', disabled: slot, onclick: stap(-1), 'aria-label': 'minder' }, '−'), inp, h('button.knop.licht', { type: 'button', disabled: slot, onclick: stap(1), 'aria-label': 'meer' }, '+'));
    } else {
      bediening = keuze(z.soort === 'jnn' ? [['ja', 'Ja'], ['nee', 'Nee'], ['nvt', 'N.v.t.']] : [['ja', 'Ja'], ['nee', 'Nee']], oz[z.key] || '', w => { oz[z.key] = w; bewaarLater('objecten', o); }, { uit: slot });
    }
    kaart.appendChild(h('div.oz-rij', h('span.oz-label', z.label), bediening));
  }
  kaart.appendChild(h('label.veld', h('span.label', 'Overig'), h('textarea.invoer', { rows: 3, value: oz.vrij || '', disabled: slot, placeholder: 'Overige opmerkingen, afspraken of overgedragen zaken', oninput: e => { oz.vrij = e.target.value; bewaarLater('objecten', o); } })));
  kader.appendChild(kaart);
  return kader;
}

/* ===== Gegevens ===== */
function gegevensDeel({ o, c, punten }) {
  const slot = o.fase === 'herstel' || o.fase === 'gereed';
  const org = S.config.organisatie;
  const kader = h('div',
    h('div.kaart', h('h3', 'Opdrachtgever'), h('p', org.naam, h('br'), org.adres, h('br'), org.postbus)),
    h('div.kaart', h('h3', 'Partijen'),
      slot ? h('p.hint', 'De partijen liggen vast in het ondertekende proces-verbaal. Een wijziging geldt alleen voor volgende documenten (herstelcontrole).') : null,
      h('div.velden', M.PARTIJ_VELDEN.map(([k, l]) => {
        const std = c.standaard[k] || '';
        return h('label.veld', h('span.label', l), h('input.invoer', { value: o.partijen[k] || '', placeholder: std || (k === 'opdrachtnemer' ? 'Bedrijfsnaam' : 'Naam'), autocomplete: 'off', oninput: e => { o.partijen[k] = e.target.value; bewaarLater('objecten', o); } }),
          std ? h('span.hint', `Leeg = standaard van het complex: ${std}`) : h('span.hint', 'Tip: vul de standaard eenmalig in bij Complex instellingen'));
      })),
      h('div.knoprij', h('button.knop.licht.klein', { type: 'button', onclick: async () => {
        let n = 0; for (const [k] of M.PARTIJ_VELDEN) if (String(o.partijen[k] || '').trim()) { c.standaard[k] = o.partijen[k].trim(); o.partijen[k] = ''; n++; }
        if (!n) return toast('Vul eerst een of meer velden in');
        await bewaar([['complexen', c], ['objecten', o]]); ververs(); toast('Ingesteld als standaard voor het hele complex', 3000);
      } }, 'Als standaard voor complex ' + c.nummer))));
  const hz = M.herzieningMogelijk(o, punten);
  if (o.fase === 'herstel' || o.fase === 'gereed') kader.appendChild(h('div.kaart', h('h3', 'Toch een punt vergeten?'),
    h('p.hint', hz.kan ? 'Start een herziening van de oplevering. Het ondertekende proces-verbaal blijft ongewijzigd bewaard; beide partijen tekenen de herziening opnieuw, die vervangt het eerdere document.' : hz.reden),
    hz.kan ? h('button.knop.licht', { type: 'button', onclick: () => herziening(o, punten) }, 'Herziening starten…') : null));
  return kader;
}
async function herziening(o, punten) {
  const r = await formulier({ titel: 'Herziening van de oplevering', tekst: 'Na de herziening tekenen opdrachtgever en opdrachtnemer opnieuw. Het huidige proces-verbaal blijft bewaard en wordt gemarkeerd als vervangen.', ok: 'Herziening starten', velden: [{ key: 'reden', label: 'Reden', soort: 'lang', rijen: 2, verplicht: true, placeholder: 'bijv. punt in de badkamer vergeten' }] });
  if (!r) return;
  M.startHerziening(o, punten, r.reden); await bewaar([['objecten', o]]); ga(route.object(o.id)); toast(`Herziening ${o.herziening} gestart`, 3000);
}
async function wijzigObject(o) {
  const r = await formulier({ titel: 'Object wijzigen', velden: [{ key: 'adres', label: 'Adres', waarde: o.adres, verplicht: true }, { key: 'type', label: 'Type', soort: 'keuze', opties: S.config.objectTypes.includes(o.type) ? S.config.objectTypes : S.config.objectTypes.concat(o.type), waarde: o.type }] });
  if (!r) return;
  o.adres = r.adres; o.type = r.type; await bewaar([['objecten', o]]); ververs();
}
async function verwijderObject(o) {
  if (!await bevestig(`${o.adres} verwijderen?`, 'Het object met alle punten en foto\'s wordt verwijderd.', 'Verwijderen', true)) return;
  o.verwijderd = true; const ps = puntenVan(o.id); ps.forEach(p => { p.verwijderd = true; });
  await bewaar([['objecten', o], ...ps.map(p => /** @type {[string, any]} */ (['punten', p]))]); ga(route.blok(o.blokId));
}

/* ===== Documenten ===== */
function documentenDeel({ o, docs }) {
  return h('div',
    docs.length ? h('div.lijst', docs.slice().reverse().map(d => docRij(d))) : h('div.leeg-staat', h('strong', 'Nog geen documenten'), h('p', 'Bij "Oplevering starten" wordt de vooropname vastgelegd; bij ondertekenen ontstaat het proces-verbaal. Een vastgelegd document verandert nooit meer.')),
    h('p.hint', 'Elk document is één keer gemaakt en opgeslagen, met een SHA-256-kenmerk. Downloaden levert altijd exact hetzelfde bestand.'));
}
