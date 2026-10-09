// @ts-check
/* Objectscherm zoals versie 1: kruimelpad en tabbladen plakken onder de kop, met een schuivende tabknop.
   Tabbladen: Gegevens, Vooropname, Oplevering, Herstel, Meterstanden, Overige zaken, Afronden, Documenten.
   Herstel en Documenten zijn nieuw in versie 2; de rest volgt de indeling van versie 1. */
import { h, $, $$, toast, bevestig, formulier, dialoog, keuze } from './ui.js';
import { S, bewaar, bewaarLater, get, puntenVan, documentenVan, objectenVanComplex } from './staat.js';
import * as M from './model.js';
import { ga, route, ververs } from './nav.js';
import { urgBadges, kruimelsH1, melding, koppelSuggesties, suggestieLijst, limietOver } from './stukjes.js';
import { fotoBlok } from './foto.js';
import { tabVoor, tabOplever, tabHerstel, overigBronnen } from './scherm-punten.js';
import { tabAfronden, tabDocumenten } from './scherm-afronden.js';

export const TABS = [['gegevens', 'Gegevens'], ['voor', 'Vooropname'], ['oplever', 'Oplevering'], ['herstel', 'Herstel'], ['meter', 'Meterstanden'], ['overig', 'Overige zaken'], ['afronden', 'Afronden'], ['documenten', 'Documenten']];
const TAB_FN = { gegevens: tabGegevens, voor: tabVoor, oplever: tabOplever, herstel: tabHerstel, meter: tabMeter, overig: tabOverig, afronden: tabAfronden, documenten: tabDocumenten };

export function objectScherm(id, tab) {
  const o = get('objecten', id); if (!o) return null;
  if (!TAB_FN[tab]) tab = 'gegevens';
  const c = get('complexen', o.complexId), b = get('blokken', o.blokId);
  const punten = puntenVan(o.id), docs = documentenVan(o.id);
  const kr = [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: `${c.nummer} ${c.naam}`.trim(), hash: route.complex(c.id) }, { tekst: `Blok ${b.naam}`, hash: route.blok(b.id) }, { tekst: o.adres }];

  const badges = h('div#objBadges');
  const tabs = h('div.tabs', h('span.tab-pil'), TABS.map(([k, l]) => h('button', { type: 'button', class: tab === k ? 'aan' : '', dataset: { tab: k },
    onclick: e => { if (tab === k) return; schuifTabPil(tabs, e.currentTarget, o.id); ga(route.object(o.id, k), { vervang: true }); } }, l)));
  const plak = h('div.obj-plak', h('div.kaart-kop', { style: { marginBottom: '6px' } }, kruimelsH1(kr), badges), tabs);
  const ctx = { o, c, b, punten, docs, verversKop: () => verversKop(o, badges, tabs) };
  verversKop(o, badges, tabs);

  /* Banners onder de tabbalk (versie 1): afgerond, of een lopende herziening */
  const banners = [];
  if (o.fase === 'gereed') banners.push(melding('groen', '🔒 Oplevering afgerond en alle punten hersteld', 'Dit object is gereed. De processen-verbaal staan op het tabblad Documenten en kunnen niet meer veranderen.'));
  else if (o.fase === 'oplever' && o.herziening) { const hz = o.herzieningen[o.herzieningen.length - 1]; banners.push(melding('geel', `Herziening ${o.herziening}: afronding heropend op ${M.fmtDatum(hz && hz.t)}`, `Reden: ${hz ? hz.reden : ''}. Het eerder ondertekende proces-verbaal staat ongewijzigd onder Eerdere versies (tabblad Afronden). Beide partijen moeten opnieuw tekenen.`)); }

  const inhoud = h('div#objInhoud', { class: o.fase === 'gereed' ? 'alleen-lezen' : '' }, TAB_FN[tab](ctx));
  return { kruimels: kr, inhoud: h('div', plak, banners, inhoud), menu: [{ tekst: 'Bewerken', fn: () => objectMenu(o, docs) }],
    naTekenen: () => plaatsTabPil(tabs, o.id) };
}

/* Badges (A/B/C open) en de stippen op de tabbladen, na de eerste opbouw én na elke wijziging (versie 1: H4) */
function verversKop(o, badges, tabs) {
  const ps = puntenVan(o.id), t = M.tellers(ps, o);
  badges.replaceChildren(urgBadges(t));
  for (const x of limietOver(t, 'object')) badges.firstChild && badges.firstChild.appendChild(h('span.badge.waarsch', `${x.code} > ${x.limiet}`));
  const blokkeert = S.config.urgenties.filter(u => u.blokkeertOplevering).some(u => t[u.code] > 0);
  const stip = {
    voor: o.fase === 'voor' && blokkeert,
    oplever: o.fase === 'oplever' && (blokkeert || t.teBeoordelen > 0),
    herstel: o.fase === 'herstel' && (t.teBeoordelen > 0 || (o.herstelUiterlijk && (M.werkdagenTot(o.herstelUiterlijk) ?? 0) < 0))
  };
  const nDocs = documentenVan(o.id).length;
  for (const bt of $$('[data-tab]', tabs)) {
    const k = /** @type {HTMLElement} */ (bt).dataset.tab;
    const heeft = $('.stip', bt), moet = !!stip[k];
    if (moet && !heeft) bt.appendChild(h('span.stip')); if (!moet && heeft) heeft.remove();
    if (k === 'documenten') { const tel = $('.tel', bt); if (nDocs && !tel) bt.appendChild(h('span.tel', String(nDocs))); else if (tel) tel.textContent = String(nDocs); }
  }
}

/* ===== Schuivende tabknop (versie 1.4.2) =====
   Bij een tik begint de knop direct te schuiven; het scherm wordt tijdens de fade opnieuw opgebouwd, en de nieuwe knop
   gaat verder vanaf hetzelfde punt in dezelfde beweging. */
const TABPIL_MS = 300;
let tabPilBeweging = null;   // { van: {x, w}, naar: tab, t0 }
let tabScroll = { objectId: null, left: 0 };   // horizontale scrollstand van de tabbalk blijft staan bij opnieuw opbouwen
const tabPilPos = bt => ({ x: bt.offsetLeft, w: bt.offsetWidth });
const tabPilFrames = (van, naar) => [{ transform: `translateX(${van.x}px)`, width: van.w + 'px' }, { transform: `translateX(${naar.x}px)`, width: naar.w + 'px' }];
const zetPil = (pil, p) => { pil.style.transform = `translateX(${p.x}px)`; pil.style.width = p.w + 'px'; };
const stil = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function schuifTabPil(tabs, naarBt, objectId) {
  const pil = $('.tab-pil', tabs), vanBt = $('button.aan', tabs); if (!pil || !vanBt) return;
  for (const b of $$('button', tabs)) b.classList.toggle('aan', b === naarBt);   // tekstkleur wisselt mee
  if (!pil.animate || stil()) { tabPilBeweging = null; zetPil(pil, tabPilPos(naarBt)); return; }
  const van = tabPilPos(vanBt), naar = tabPilPos(naarBt);
  tabScroll = { objectId, left: tabs.scrollLeft };
  tabPilBeweging = { van, naar: naarBt.dataset.tab, t0: performance.now() };
  zetPil(pil, naar); pil.animate(tabPilFrames(van, naar), { duration: TABPIL_MS, easing: 'cubic-bezier(.3,.7,.2,1)' });
}
function plaatsTabPil(tabs, objectId) {
  const pil = $('.tab-pil', tabs), bt = /** @type {HTMLElement} */ ($('button.aan', tabs)); if (!pil || !bt) return;
  tabs.classList.add('met-pil');
  if (tabScroll.objectId === objectId) tabs.scrollLeft = tabScroll.left;
  tabs.addEventListener('scroll', () => { tabScroll = { objectId, left: tabs.scrollLeft }; }, { passive: true });
  const doel = tabPilPos(bt); zetPil(pil, doel);
  const bw = tabPilBeweging; tabPilBeweging = null;
  const verstreken = bw && bw.naar === bt.dataset.tab ? performance.now() - bw.t0 : Infinity;
  if (verstreken < TABPIL_MS && pil.animate) { const a = pil.animate(tabPilFrames(bw.van, doel), { duration: TABPIL_MS, easing: 'cubic-bezier(.3,.7,.2,1)' }); a.currentTime = verstreken; }
  /* Draaien van de iPad of later geladen lettertype: knop opnieuw onder het actieve tabblad zetten */
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (!tabs.isConnected) return ro.disconnect(); const b = $('button.aan', tabs); if (b) zetPil(pil, tabPilPos(b)); }); ro.observe(tabs); for (const b of $$('button', tabs)) ro.observe(b); }
  /* Actief tabblad in beeld houden als de tabbalk horizontaal scrolt (smal scherm) */
  if (bt.offsetLeft < tabs.scrollLeft || bt.offsetLeft + bt.offsetWidth > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = bt.offsetLeft - 8;
  tabScroll = { objectId, left: tabs.scrollLeft };
}

/* ===== Menu: bewerken ===== */
async function objectMenu(o, docs) {
  const typen = S.config.objectTypes.includes(o.type) ? S.config.objectTypes : S.config.objectTypes.concat(o.type);
  const r = await formulier({ titel: 'Object bewerken', velden: [{ key: 'adres', label: 'Adres', waarde: o.adres, verplicht: true }, { key: 'type', label: 'Type', soort: 'keuze', opties: typen, waarde: o.type }],
    extra: [{ tekst: 'Object verwijderen…', waarde: 'weg', soort: 'gevaar' }] });
  if (!r) return;
  if (r._actie === 'weg') {
    if (docs.length) return dialoog({ titel: 'Kan niet verwijderen', tekst: `${o.adres} heeft vastgelegde documenten. Die blijven altijd bewaard; het object kan daarom niet worden verwijderd.` });
    if (!await bevestig('Object verwijderen?', `${o.adres} met alle punten en foto's wordt definitief verwijderd.`, 'Verwijderen', true)) return;
    o.verwijderd = true; const ps = puntenVan(o.id); ps.forEach(p => { p.verwijderd = true; });
    await bewaar([['objecten', o], ...ps.map(p => /** @type {[string, any]} */ (['punten', p]))]); return ga(route.blok(o.blokId));
  }
  o.adres = r.adres; o.type = r.type; await bewaar([['objecten', o]]); ververs();
}

/* ===== Tab: gegevens ===== */
function tabGegevens({ o, c }) {
  const org = S.config.organisatie;
  const vast = o.fase === 'herstel' || o.fase === 'gereed';
  const box = h('div', h('div.kaart', h('h3', 'Opdrachtgever'), h('p', { style: { margin: '6px 0 0' } }, org.naam, h('br'), org.adres, h('br'), org.postbus)));
  const placeholder = { vertOpdrachtgever: 'Naam inspecteur / vertegenwoordiger', opdrachtnemer: 'Bedrijfsnaam', vertOpdrachtnemer: 'Naam uitvoerder / vertegenwoordiger' };
  const waarden = k => objectenVanComplex(c.id).map(x => x.partijen[k]).concat(c.standaard[k] || '');
  const velden = M.PARTIJ_VELDEN.map(([k, l]) => {
    const std = c.standaard[k] || '';
    const inp = /** @type {HTMLInputElement} */ (h('input.invoer', { value: o.partijen[k] || '', placeholder: std || placeholder[k], autocomplete: 'off', oninput: e => { o.partijen[k] = e.target.value; bewaarLater('objecten', o); } }));
    const veld = h('div.veld.sug-wrap', h('label', l), inp, std ? h('span.hint', `Leeg = standaard van het complex: ${std}`) : null);
    koppelSuggesties(inp, t => suggestieLijst(waarden(k), [], t), v => { o.partijen[k] = v; bewaarLater('objecten', o); }, 1);
    return veld;
  });
  box.appendChild(h('div.kaart', h('h3', 'Partijen'),
    vast ? h('p.hint', 'Het proces-verbaal van oplevering ligt vast met de partijen van dat moment. Een wijziging hier geldt alleen voor volgende documenten (herstelcontrole).') : null,
    h('div.velden', { style: { marginTop: '8px' } }, velden),
    h('div.knoprij', h('button.knop.licht.klein', { type: 'button', style: { flex: '0 1 auto' }, onclick: async () => {
      let n = 0; for (const [k] of M.PARTIJ_VELDEN) if (String(o.partijen[k] || '').trim()) { c.standaard[k] = o.partijen[k].trim(); n++; }
      if (!n) return toast('Vul eerst een of meer velden in');
      await bewaar([['complexen', c]]); ververs(); toast('Standaard ingesteld voor alle objecten zonder eigen invulling', 3000);
    } }, `Instellen als standaard voor heel complex ${c.nummer}`))));
  return box;
}

/* ===== Tab: meterstanden (optioneel per object) ===== */
function tabMeter({ o, c }) {
  const m = o.meter, slot = !(o.fase === 'voor' || o.fase === 'oplever'), cfg = S.config;
  const box = h('div');
  if (slot) box.appendChild(melding('blauw', '🔒 De oplevering is ondertekend; de meterstanden zijn alleen-lezen.', 'Ze staan in het proces-verbaal van oplevering.'));
  const kaart = h('div.kaart', keuze([['nee', 'Ja, meterstanden opnemen'], ['ja', 'Nee, niet van toepassing']], m.nvt ? 'ja' : 'nee', async w => { m.nvt = w === 'ja'; await bewaar([['objecten', o]]); ververs(); }, { uitzetbaar: false, uit: slot }));
  box.appendChild(kaart);
  if (m.nvt) {
    const bewaard = Object.values(m.standen || {}).some(st => st && (st.waarde || st.fotoId));
    kaart.appendChild(h('p', { style: { margin: '12px 0 0', color: 'var(--grijs)', fontSize: '.9rem' } }, 'Er worden bij dit object geen meterstanden vastgelegd; het proces-verbaal vermeldt "niet van toepassing".' + (bewaard ? ' Eerder ingevulde standen en foto\'s blijven bewaard, maar komen niet in de PDF.' : '')));
    return box;
  }
  const datum = /** @type {HTMLInputElement} */ (h('input.invoer', { type: 'date', value: m.datum || '', disabled: slot, onchange: e => { m.datum = e.target.value; bewaarLater('objecten', o); } }));
  const net = (k, label, ph) => {
    const std = c.standaard[k] || '';
    return h('div.veld', h('label', label), h('input.invoer', { value: m[k] || '', placeholder: std || ph, disabled: slot, autocomplete: 'off', oninput: e => { m[k] = e.target.value; bewaarLater('objecten', o); } }),
      std ? h('span.hint', `Leeg = standaard van het complex: ${std}`) : null);
  };
  kaart.appendChild(h('div', h('div.velden', { style: { marginTop: '16px' } }, h('div.veld', h('label', 'Datum meteropname'), datum), net('netElektra', 'Netbeheerder elektra', 'bijv. Liander'), net('netWater', 'Netbeheerder water', 'bijv. Vitens')),
    h('div.veld', h('label', 'Opgenomen door'), keuze([['opdrachtgever', 'Opdrachtgever'], ['opdrachtnemer', 'Opdrachtnemer'], ['gezamenlijk', 'Gezamenlijk']], m.door, w => { m.door = w; bewaarLater('objecten', o); }, { uit: slot }))));
  cfg.meters.forEach((mt, i) => {
    const st = m.standen[mt.key] || (m.standen[mt.key] = { waarde: '', fotoId: null });
    const inp = /** @type {HTMLInputElement} */ (h('input.invoer', { inputmode: 'decimal', value: st.waarde || '', placeholder: '—', disabled: slot, autocomplete: 'off', oninput: e => {
      /* alleen cijfers met hooguit één komma of punt; de eerste stand zet de datum van de meteropname */
      const ruw = e.target.value, schoon = ruw.replace(/[^0-9.,]/g, '').replace(/^([^.,]*[.,])(.*)$/, (x, a, b2) => a + b2.replace(/[.,]/g, ''));
      if (schoon !== ruw) e.target.value = schoon;
      st.waarde = schoon;
      if (schoon && !m.datum) { m.datum = M.vandaag(); datum.value = m.datum; }
      bewaarLater('objecten', o);
    } }));
    box.appendChild(h('div.meter', h('div.veld', h('label', mt.label, mt.optioneel ? h('span', { style: { fontWeight: '400', color: 'var(--grijs)' } }, ' (optioneel, alleen bij gasaansluiting)') : null), inp),
      fotoBlok(st.fotoId, { klein: true, label: 'Meter', nr: 'M' + (i + 1), tekst: `M${i + 1}. ${mt.label}`, alleenLezen: slot,
        onGezet: id => { st.fotoId = id; return bewaar([['objecten', o]]); }, onWeg: () => { st.fotoId = null; return bewaar([['objecten', o]]); } })));
  });
  return box;
}

/* ===== Tab: overige zaken ===== */
function tabOverig({ o, b }) {
  const oz = o.overig, slot = !(o.fase === 'voor' || o.fase === 'oplever');
  const box = h('div');
  if (slot) box.appendChild(melding('blauw', '🔒 De oplevering is ondertekend; overige zaken zijn alleen-lezen.', 'Ze staan in het proces-verbaal van oplevering.'));
  const ingevuld = x => S.config.overigeZaken.some(z => String(x.overig[z.key] ?? '').trim()) || String(x.overig.vrij || '').trim();
  if (!slot) {
    /* Kopiëren van een andere woning in hetzelfde complex: eerst het eigen blok, dan de rest; standaard de laatst gewijzigde */
    const bronnen = overigBronnen(o).sort((x, y) => (x.blokId === b.id ? 0 : 1) - (y.blokId === b.id ? 0 : 1) || String((get('blokken', x.blokId) || {}).naam).localeCompare(String((get('blokken', y.blokId) || {}).naam), 'nl', { numeric: true }) || x.adres.localeCompare(y.adres, 'nl', { numeric: true }));
    const kp = h('div.kaart', h('h3', 'Overnemen van een andere woning'));
    if (!bronnen.length) kp.appendChild(h('p', { style: { margin: '6px 0 0', color: 'var(--grijs)', fontSize: '.9rem' } }, 'Zodra bij een andere woning in dit complex overige zaken zijn ingevuld, kun je die hier in één keer overnemen en daarna aanpassen.'));
    else {
      const laatste = bronnen.reduce((mx, x) => ((x.gewijzigd || '') > (mx.gewijzigd || '') ? x : mx), bronnen[0]);
      const sel = /** @type {HTMLSelectElement} */ (h('select.invoer', bronnen.map(x => h('option', { value: x.id, selected: x === laatste }, `Blok ${(get('blokken', x.blokId) || {}).naam} · ${x.adres}`))));
      kp.appendChild(h('div.rijvelden', { style: { marginTop: '8px' } }, h('div.veld', { style: { margin: '0' } }, sel), h('button.knop', { type: 'button', style: { flex: '0 0 auto' }, onclick: async () => {
        const bron = get('objecten', sel.value); if (!bron) return;
        if (ingevuld(o) && !await bevestig('Overige zaken overschrijven?', `Alle overige zaken van dit object (ook het vrije tekstveld) worden vervangen door die van ${bron.adres}.`, 'Overschrijven')) return;
        o.overig = structuredClone(bron.overig); await bewaar([['objecten', o]]); ververs(); toast(`Overgenomen van ${bron.adres}; controleer en pas aan waar nodig`, 3500);
      } }, 'Kopiëren')));
    }
    box.appendChild(kp);
  }
  const lijst = h('div.oz-lijst', { style: { marginTop: '4px' } });
  for (const z of S.config.overigeZaken) {
    let bediening;
    if (z.soort === 'aantal') {
      const inp = /** @type {HTMLInputElement} */ (h('input.invoer', { inputmode: 'numeric', pattern: '[0-9]*', value: oz[z.key] ?? '', placeholder: '—', disabled: slot, autocomplete: 'off', oninput: e => { e.target.value = e.target.value.replace(/\D/g, ''); oz[z.key] = e.target.value; bewaarLater('objecten', o); } }));
      const stap = d => () => { const n = Math.max(0, (parseInt(oz[z.key], 10) || 0) + d); oz[z.key] = String(n); inp.value = oz[z.key]; bewaarLater('objecten', o); };
      bediening = h('div.teller', h('button', { type: 'button', disabled: slot, onclick: stap(-1), 'aria-label': 'minder' }, '−'), inp, h('button', { type: 'button', disabled: slot, onclick: stap(1), 'aria-label': 'meer' }, '+'));
    } else {
      bediening = keuze(z.soort === 'jnn' ? [['ja', 'Ja'], ['nee', 'Nee'], ['nvt', 'N.v.t.']] : [['ja', 'Ja'], ['nee', 'Nee']], oz[z.key] || '', w => { oz[z.key] = w; bewaarLater('objecten', o); }, { uit: slot });
    }
    lijst.appendChild(h('div.oz-rij', h('span.oz-label', z.label), bediening));
  }
  box.appendChild(h('div.kaart', h('h3', 'Overige zaken'), lijst,
    h('div.veld', { style: { margin: '12px 0 0' } }, h('label', 'Overig'), h('textarea.invoer', { rows: 3, value: oz.vrij || '', disabled: slot, placeholder: 'Overige opmerkingen, afspraken of overgedragen zaken', oninput: e => { oz.vrij = e.target.value; bewaarLater('objecten', o); } }))));
  return box;
}
