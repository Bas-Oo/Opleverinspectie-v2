// @ts-check
/* Tabbladen Vooropname, Oplevering en Herstel van het objectscherm: puntkaarten zoals in versie 1
   (ruimte, omschrijving, A/B/C, foto, niet erkend), op het model van versie 2: één punt is één record met een vast nummer
   en een historie. De vooropname, oplevering en herstelcontrole tonen hetzelfde punt in zijn eigen fase. */
import { h, toast, bevestig, formulier } from './ui.js';
import { S, bewaar, bewaarLater, puntenVanComplex, objectenVanComplex, get } from './staat.js';
import * as M from './model.js';
import { ververs, route } from './nav.js';
import { melding, leegStaat, koppelSuggesties, suggestieLijst } from './stukjes.js';
import { fotoBlok } from './foto.js';
import { startOpleveringMetVastlegging } from './documenten.js';
import { spoel } from './store.js';

/* ===== Suggesties (versie 1): vaste looproute plus eerder ingevoerde waarden in het complex ===== */
function ruimteLijst(o, tekst) {
  return suggestieLijst(puntenVanComplex(o.complexId).filter(M.levend).map(p => p.ruimte), S.config.ruimtes, tekst);
}
function omschrijvingLijst(o, tekst) {
  const eerder = suggestieLijst(puntenVanComplex(o.complexId).filter(M.levend).map(p => p.omschrijving), [], tekst);
  const q = tekst.trim().toLowerCase();
  const vast = S.config.omschrijvingen.filter(v => (!q || (v.toLowerCase().includes(q) && v.toLowerCase() !== q)) && !eerder.some(e => e.toLowerCase() === v.toLowerCase()));
  return eerder.concat(vast).slice(0, 8);
}

/** Veld van een punt wijzigen vanaf het scherm; opeenvolgende tikken in hetzelfde veld worden één historieregel */
function wijzigVeld(o, p, veld, waarde, direct = false) {
  if (!M.wijzigPuntSamengevoegd(p, { [veld]: waarde }, o)) return Promise.resolve();
  if (direct) return bewaar([['punten', p]]);
  bewaarLater('punten', p); return Promise.resolve();
}

/* Punt wisselt van lijst (open <-> hersteld): eerst zichtbaar laten wegglijden en inklappen, daarna opnieuw tekenen
   en het punt op de nieuwe plek laten oplichten (versie 1.3.4) */
function verhuisPunt(el, id) {
  const markeer = () => setTimeout(() => { const n = document.querySelector(`[data-punt="${id}"]`); if (n) { n.classList.add('net-verplaatst'); setTimeout(() => n.classList.remove('net-verplaatst'), 1800); } }, 0);
  if (!el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { ververs(); markeer(); return; }
  el.style.pointerEvents = 'none'; el.style.overflow = 'hidden';
  const hgt = el.offsetHeight + 'px', weg = { opacity: 0, transform: 'translateX(48px) scale(.97)' };
  const anim = el.animate([
    { opacity: 1, transform: 'none', height: hgt, marginBottom: '12px', paddingTop: '12px', paddingBottom: '12px' },
    Object.assign({ offset: .55, height: hgt, marginBottom: '12px', paddingTop: '12px', paddingBottom: '12px' }, weg),
    Object.assign({ height: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }, weg)
  ], { duration: 520, easing: 'ease-in-out', fill: 'forwards' });
  let klaar = false; const verder = () => { if (klaar) return; klaar = true; ververs(); markeer(); };
  anim.onfinish = verder; setTimeout(verder, 800);
}

/** Puntkaart. modus = het tabblad waarop de kaart staat: 'voor' | 'oplever' | 'herstel' */
function puntKaart(ctx, p, modus) {
  const { o, docs } = ctx;
  const inFase = modus === o.fase;
  const bewerkbaar = inFase && M.puntBewerkbaar(p, o, docs);
  const moet = inFase && (M.moetBeoordeeld(p, o) || (M.isNagekomen(p) && o.fase === 'herstel' && p.geconstateerd.t < (o.faseStart.herstel || '')));
  const bo = M.beoordeling(p, o);
  const kanErkenning = inFase && o.fase !== 'gereed' && p.status !== 'vervallen';
  const nr = String(p.nr);

  const klasse = () => `punt ${p.urgentie || ''} ${p.status === 'hersteld' ? 'hersteld' : ''} ${p.status === 'vervallen' ? 'vervallen' : ''}`;
  const vlaggen = [
    p.geconstateerd.fase === 'voor' && modus !== 'voor' ? h('span.vlag', 'uit vooropname') : null,
    p.geconstateerd.herziening && modus !== 'voor' ? h('span.vlag.nieuw', `herziening ${p.geconstateerd.herziening}`) : null,
    M.isNagekomen(p) ? h('span.vlag.nieuw', 'nagekomen') : null,
    p.status === 'vervallen' ? h('span.vlag.grijs', 'vervallen') : null,
    p.paraaf ? h('span.vlag.groen', 'paraaf ' + M.fmtDatum(p.paraaf.t)) : null
  ];

  /* Ruimte */
  const ruimte = /** @type {HTMLInputElement} */ (h('input.invoer.klein', { placeholder: 'Ruimte (bijv. woonkamer, keuken)', value: p.ruimte || '', disabled: !bewerkbaar, autocomplete: 'off', autocapitalize: 'sentences',
    oninput: e => wijzigVeld(o, p, 'ruimte', e.target.value) }));
  const ruimteWrap = h('div.ruimte.sug-wrap', ruimte);
  /* Omschrijving */
  const omschr = /** @type {HTMLTextAreaElement} */ (h('textarea.invoer', { rows: 2, placeholder: 'Omschrijving tekortkoming (incl. schatting levertijd indien van toepassing)', value: p.omschrijving || '', disabled: !bewerkbaar, autocapitalize: 'sentences',
    oninput: e => wijzigVeld(o, p, 'omschrijving', e.target.value) }));
  const omschrWrap = h('div.sug-wrap', { style: { marginBottom: '8px' } }, omschr);
  /* Urgentie A/B/C: nog een keer tikken = leeg */
  const urg = h('div.urg', S.config.urgenties.map(u => h('button', { type: 'button', class: u.code + (p.urgentie === u.code ? ' aan' : ''), disabled: !bewerkbaar, dataset: { u: u.code }, title: u.uitleg,
    onclick: async () => {
      await wijzigVeld(o, p, 'urgentie', p.urgentie === u.code ? '' : u.code, true);
      for (const b of urg.children) b.classList.toggle('aan', /** @type {HTMLElement} */ (b).dataset.u === p.urgentie);
      el.className = klasse(); ctx.verversKop();
    } }, h('b', u.code), h('small', u.titel))));
  /* Beoordelen: hersteld of niet (oplevering), hersteld met paraaf of nog open (herstelcontrole) */
  const herstel = moet && o.fase !== 'gereed' ? h('div.herstel',
    h('button.ja', { type: 'button', class: bo === 'hersteld' ? 'aan' : '', onclick: () => beoordeel('hersteld') }, o.fase === 'herstel' ? '✓ Hersteld (paraaf)' : '✓ Hersteld'),
    h('button.nee', { type: 'button', class: bo === 'nog open' ? 'aan' : '', onclick: () => beoordeel('nog open') }, o.fase === 'herstel' ? '✗ Nog open' : '✗ Niet hersteld')) : null;
  async function beoordeel(uitkomst) {
    const wasHersteld = p.status === 'hersteld';
    if (M.beoordeling(p, o) === uitkomst) M.wisBeoordeling(p, o);
    else { if (M.beoordeling(p, o)) M.wisBeoordeling(p, o); M.beoordeel(p, o, uitkomst, M.nuISO(), M.partijen(o, get('complexen', o.complexId)).vertOpdrachtgever); }
    await bewaar([['punten', p]]);
    if (wasHersteld === (p.status === 'hersteld')) return ververs();   // blijft in dezelfde lijst
    verhuisPunt(el, p.id);
  }
  /* Niet erkend door de opdrachtnemer, met reden */
  const ne = !!p.nietErkend;
  const neKnop = h('button.vink', { type: 'button', class: ne ? 'aan' : '', disabled: !kanErkenning, onclick: async () => {
    if (p.nietErkend) { M.zetNietErkend(p, o, null); await bewaar([['punten', p]]); return ververs(); }
    const r = await formulier({ titel: `Punt ${nr} niet erkend`, tekst: 'De opdrachtnemer erkent dit punt niet. De reden komt in het proces-verbaal.', ok: 'Vastleggen',
      velden: [{ key: 'reden', label: 'Reden van de opdrachtnemer', soort: 'lang', rijen: 2, verplicht: true }] });
    if (!r) return;
    M.zetNietErkend(p, o, r.reden); await bewaar([['punten', p]]); ververs();
  } }, h('span.box', ne ? '✓' : ''), 'Niet erkend (opdrachtnemer)');
  /* Verwijderen zolang het punt in geen enkel document staat; anders laten vervallen met een reden */
  let wegKnop = null;
  if (inFase && o.fase !== 'gereed' && p.status !== 'vervallen') {
    if (M.magVerwijderen(p, o, docs)) wegKnop = h('button.verwijder', { type: 'button', onclick: async () => {
      if (!await bevestig('Tekortkoming verwijderen?', `Punt ${nr} inclusief foto wordt verwijderd. Het nummer wordt niet opnieuw gebruikt.`, 'Verwijderen', true)) return;
      p.verwijderd = true; await bewaar([['punten', p]]); ververs();
    } }, 'Verwijderen');
    else wegKnop = h('button.verwijder', { type: 'button', onclick: async () => {
      const r = await formulier({ titel: `Punt ${nr} laten vervallen`, tekst: 'Dit punt staat al in een vastgelegd proces-verbaal en kan daarom niet worden verwijderd. Het blijft zichtbaar als vervallen, met deze reden.', ok: 'Laten vervallen',
        velden: [{ key: 'reden', label: 'Reden', soort: 'lang', rijen: 2, verplicht: true }] });
      if (!r) return;
      M.laatVervallen(p, o, r.reden); await bewaar([['punten', p]]); ververs();
    } }, 'Laten vervallen…');
  }
  const reden = (actie) => { const x = p.historie.filter(e => e.actie === actie).pop(); return x && x.opm ? x.opm : ''; };
  const foto = fotoBlok(p.fotoId, { nr, alleenLezen: !bewerkbaar, tekst: () => `${nr}. ${[p.ruimte, p.omschrijving].filter(Boolean).join(' — ')}`,
    onGezet: id => wijzigVeld(o, p, 'fotoId', id, true), onWeg: () => wijzigVeld(o, p, 'fotoId', null, true) });

  const historie = p.historie.length > 1 ? h('details.historie', h('summary', `Historie (${p.historie.length})`), h('ol', p.historie.map(e => h('li',
    new Date(e.t).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }), ' · ', h('strong', e.actie), ` · ${M.FASE_LABEL[e.fase] || e.fase}`,
    e.opm ? ` — ${e.opm}` : '', e.naar ? ` — ${Object.entries(e.naar).map(([k, x]) => `${k}: ${e.van[k] || '—'} → ${x || '—'}`).join(', ')}` : '')))) : null;

  const el = h('div', { class: klasse(), dataset: { punt: p.id } },
    h('div.punt-kop', h('span.punt-nr', nr + '.'), vlaggen, ruimteWrap),
    h('div.punt-body', h('div', omschrWrap, urg, herstel), h('div.fotoslot', foto)),
    h('div.punt-onder', neKnop, h('span.spacer'), wegKnop,
      p.nietErkend ? h('div.reden', 'Niet erkend: ' + p.nietErkend.reden) : null,
      p.status === 'vervallen' ? h('div.reden', 'Vervallen: ' + reden('vervallen')) : null),
    historie);
  if (bewerkbaar) {
    koppelSuggesties(ruimte, t => ruimteLijst(o, t), v => wijzigVeld(o, p, 'ruimte', v));
    koppelSuggesties(omschr, t => omschrijvingLijst(o, t), v => wijzigVeld(o, p, 'omschrijving', v), 1);   // pas vanaf 1 teken, anders valt de lijst over de A/B/C-knoppen
  }
  return el;
}

/** Nieuw (leeg) punt, zoals de knop "+ Tekortkoming" in versie 1; het krijgt direct het volgende vaste nummer */
async function nieuwPunt(ctx) {
  const { o } = ctx;
  const p = M.nieuwPunt(o, {});
  await bewaar([['punten', p], ['objecten', o]]);
  ververs();
  setTimeout(() => { const k = document.querySelector(`[data-punt="${p.id}"]`); if (k) { k.scrollIntoView({ block: 'center' }); k.classList.add('net-verplaatst'); setTimeout(() => k.classList.remove('net-verplaatst'), 1500); } }, 0);
}
const toevoegKnop = (ctx, tekst = '+ Tekortkoming') => h('div.knoprij', { style: { margin: '2px 0 14px' } }, h('button.knop.breed', { type: 'button', onclick: () => nieuwPunt(ctx) }, tekst));
const opNr = (a, b) => a.nr - b.nr;

/* ===== Tab: vooropname ===== */
export function tabVoor(ctx) {
  const { o, punten, docs } = ctx;
  const box = h('div');
  const voorDoc = docs.find(d => d.soort === 'vooropname');
  const lijst = punten.filter(p => M.levend(p) && p.geconstateerd.fase === 'voor').sort(opNr);
  if (o.fase !== 'voor') box.appendChild(melding('blauw', '🔒 De oplevering is gestart; de vooropname is vastgelegd.', 'Het proces-verbaal van de vooropname staat op het tabblad Afronden. Nieuwe of gewijzigde punten leg je vast in de oplevering.'));
  const datum = voorDoc ? voorDoc.datum : lijst.length ? lijst[0].geconstateerd.t.slice(0, 10) : '';
  box.appendChild(h('div.rijvelden', { style: { marginBottom: '12px' } }, h('label.veld', { style: { flex: '0 1 220px' } }, h('span.label', 'Datum vooropname'),
    h('input.invoer', { type: 'date', value: datum, disabled: true }), h('span.hint', voorDoc ? 'Vastgelegd bij het starten van de oplevering' : 'Begint bij het eerste punt'))));
  for (const p of lijst) box.appendChild(puntKaart(ctx, p, 'voor'));
  if (o.fase === 'voor') box.appendChild(toevoegKnop(ctx));
  else if (!lijst.length) box.appendChild(leegStaat('Geen punten in de vooropname', 'De oplevering is gestart zonder vooropnamepunten.'));
  return box;
}

/* ===== Tab: oplevering ===== */
export function tabOplever(ctx) {
  const { o, punten } = ctx;
  const box = h('div');
  if (o.fase === 'voor') {
    const n = punten.filter(p => M.levend(p) && p.status !== 'vervallen').length;
    box.appendChild(h('div.knoprij', h('button.knop', { type: 'button', onclick: async e => {
      if (!await bevestig('Oplevering starten?', n
        ? `De ${n} vooropnamepunt(en) worden vastgelegd als proces-verbaal van de vooropname (zonder handtekening). In de oplevering geef je per punt aan of het hersteld is. De nummers blijven gelijk.`
        : 'Er zijn geen vooropnamepunten. De oplevering begint met een lege lijst.', 'Starten')) return;
      const knop = /** @type {HTMLButtonElement} */ (e.target); knop.disabled = true; knop.textContent = 'Vooropname wordt vastgelegd…';
      try { await spoel(); const d = await startOpleveringMetVastlegging(o); toast(d ? 'Vooropname vastgelegd; oplevering gestart' : 'Oplevering gestart', 3000); ververs(); }
      catch (err) { console.error(err); toast('Starten mislukt: ' + (err && err.message), 5000); knop.disabled = false; knop.textContent = 'Oplevering starten'; }
    } }, 'Oplevering starten')));
    box.appendChild(h('p.hint', 'Bij het starten wordt de vooropname vastgelegd. Daarna beoordeel je hier per punt of het is hersteld, en leg je nieuwe punten vast.'));
    return box;
  }
  const slot = o.fase !== 'oplever';
  const opl = S.documenten.get(o.opleverDocId);
  if (slot) box.appendChild(melding('blauw', `🔒 De oplevering is ondertekend${opl ? ' op ' + M.fmtDatum(opl.datum) : ''} en daarom alleen-lezen.`,
    'Het proces-verbaal staat op het tabblad Afronden. Toch een punt vergeten? Leg het vast als nagekomen punt op het tabblad Herstel, of heropen de afronding op het tabblad Afronden.'));
  const lijst = punten.filter(p => M.levend(p) && !M.isNagekomen(p)).sort(opNr);
  const teBeoordelen = lijst.filter(p => M.teBeoordelen(p, o)).length;
  if (!slot && teBeoordelen) box.appendChild(melding('geel', `${teBeoordelen} vooropnamepunt(en) nog beoordelen`, 'Geef bij elk punt uit de vooropname aan of het hersteld is.'));
  const open = lijst.filter(p => p.status === 'open'), afgehandeld = lijst.filter(p => p.status !== 'open');
  for (const p of open) box.appendChild(puntKaart(ctx, p, 'oplever'));
  if (!slot) box.appendChild(toevoegKnop(ctx));
  if (afgehandeld.length) {
    box.appendChild(h('h3', { style: { margin: '18px 0 8px', color: 'var(--groen)' } }, `Hersteld sinds vooropname (${afgehandeld.length})`));
    for (const p of afgehandeld) box.appendChild(puntKaart(ctx, p, 'oplever'));
  }
  return box;
}

/* ===== Tab: herstelcontrole ===== */
export function tabHerstel(ctx) {
  const { o, punten } = ctx;
  const box = h('div');
  if (o.fase === 'voor' || o.fase === 'oplever') {
    box.appendChild(melding('blauw', 'De herstelcontrole begint na het ondertekenen van de oplevering',
      `Na ondertekening heeft de opdrachtnemer ${S.config.herstelTermijnWerkdagen} werkdagen om de open punten te herstellen. Hier controleer je dan per punt of het is hersteld; dat is je paraaf als opdrachtgever. Een vergeten punt leg je hier vast als nagekomen punt.`));
    return box;
  }
  if (o.fase === 'gereed') {
    const alle = punten.filter(M.levend).sort(opNr);
    if (alle.length) box.appendChild(h('details.uitklap.kaart', h('summary', h('h3', `Alle punten (${alle.length})`)), h('div', { style: { marginTop: '10px' } }, alle.map(p => puntKaart(ctx, p, 'herstel')))));
    return box;
  }
  const n = M.werkdagenTot(o.herstelUiterlijk);
  box.appendChild(melding(n !== null && n < 0 ? 'rood' : 'blauw', `Herstel uiterlijk ${M.fmtDatum(o.herstelUiterlijk)}${o.herstelRonde ? ` · ronde ${o.herstelRonde + 1}` : ''}`,
    n === null ? '' : n < 0 ? `De hersteltermijn is ${-n} werkdag(en) verstreken.` : `Nog ${n} werkdag(en). Controleer per punt of het is hersteld; "Hersteld (paraaf)" is je paraaf als opdrachtgever.`));
  const start = o.faseStart.herstel || '';
  const rel = punten.filter(p => M.levend(p) && (M.moetBeoordeeld(p, o) || (M.isNagekomen(p) && p.geconstateerd.t >= start))).sort(opNr);
  const teBeoordelen = rel.filter(p => M.teBeoordelen(p, o)).length;
  if (teBeoordelen) box.appendChild(melding('geel', `${teBeoordelen} punt(en) nog beoordelen`, 'Geef bij elk open punt aan of het is hersteld.'));
  const open = rel.filter(p => p.status === 'open'), klaar = rel.filter(p => p.status !== 'open');
  for (const p of open) box.appendChild(puntKaart(ctx, p, 'herstel'));
  box.appendChild(toevoegKnop(ctx, '+ Nagekomen punt'));
  if (klaar.length) {
    box.appendChild(h('h3', { style: { margin: '18px 0 8px', color: 'var(--groen)' } }, `Hersteld in deze ronde (${klaar.length})`));
    for (const p of klaar) box.appendChild(puntKaart(ctx, p, 'herstel'));
  }
  const eerder = punten.filter(p => M.levend(p) && !rel.includes(p)).sort(opNr);
  if (eerder.length) box.appendChild(h('details.uitklap.kaart', { style: { marginTop: '14px' } }, h('summary', h('h3', `Eerder hersteld of vervallen (${eerder.length})`)), h('div', { style: { marginTop: '10px' } }, eerder.map(p => puntKaart(ctx, p, 'voor')))));
  box.appendChild(h('div.knoprij', { style: { marginTop: '18px' } }, h('a.knop.licht', { href: route.object(o.id, 'afronden'), style: { textDecoration: 'none' } }, 'Herstelcontrole afronden op het tabblad Afronden ›')));
  return box;
}

/* Overige zaken kunnen van een andere woning worden overgenomen; daarvoor de bronnen in hetzelfde complex */
export function overigBronnen(o) {
  return objectenVanComplex(o.complexId).filter(x => x.id !== o.id && S.config.overigeZaken.some(z => String(x.overig[z.key] ?? '').trim()));
}
