// @ts-check
/* Herbruikbare weergave-onderdelen voor de schermen, in de vorm van versie 1 */
import { h, menu, ICOON } from './ui.js';
import { S } from './staat.js';
import * as M from './model.js';

/** A/B/C-badges; alleen de urgenties met minstens één open punt (zoals versie 1) */
export function urgBadges(t, alleenMetAantal = true) {
  return h('div.badges', S.config.urgenties.filter(u => !alleenMetAantal || t[u.code] > 0).map(u => h('span.badge', { class: u.code, title: `${t[u.code]} open ${u.code} ${u.titel}` }, `${u.code} ${t[u.code]}`)));
}
export const limiet = (code, niveau) => { const u = S.config.urgenties.find(x => x.code === code); return u ? (niveau === 'blok' ? u.limietBlok : u.limietObject) : null; };
/** Urgenties waarvan het aantal open punten boven de limiet uitkomt: [{code, n, limiet}] */
export function limietOver(t, niveau) {
  return S.config.urgenties.map(u => ({ code: u.code, n: t[u.code], limiet: niveau === 'blok' ? u.limietBlok : u.limietObject })).filter(x => x.limiet != null && x.n > x.limiet);
}
export const limietBadges = (t, niveau) => limietOver(t, niveau).map(x => h('span.badge.waarsch', `${x.code} > ${x.limiet}`));

/** Eén statuschip per object (versie 1: nog niet gestart / gestart, niet getekend / afgerond), aangevuld met de fases van versie 2 */
export function statusChip(o, sam) {
  if (sam.toon === 'leeg') return h('span.badge.leeg', 'Nog niet gestart');
  if (sam.toon === 'vooropname') return h('span.badge.bezig', 'Vooropname');
  if (sam.toon === 'oplever') return h('span.badge.bezig', o.herziening ? `Herziening ${o.herziening}, niet getekend` : 'Oplevering gestart, niet getekend');
  if (sam.toon === 'herstel') return h('span.badge.waarsch', `Ondertekend · herstel${o.herstelRonde ? ' ronde ' + (o.herstelRonde + 1) : ''}`);
  return h('span.badge.ok', 'Afgerond');
}
export function termijnChip(o) {
  if (o.fase !== 'herstel' || !o.herstelUiterlijk) return null;
  const n = M.werkdagenTot(o.herstelUiterlijk);
  if (n === null) return null;
  return h('span.badge', { class: n < 0 ? 'verlopen' : n <= 2 ? 'krap' : 'termijn', title: 'Herstel uiterlijk ' + M.fmtDatum(o.herstelUiterlijk) },
    n < 0 ? `termijn ${-n} wd verlopen` : n === 0 ? 'herstel vandaag' : `herstel nog ${n} wd`);
}

/** Kruimelpad als paginatitel (versie 1); het laatste kruimeltje is niet klikbaar */
export function kruimelsH1(kr) {
  return h('h1.kruimels', kr.map((k, i) => [i ? h('span.kruim-sep', '›') : null,
    k.hash && i < kr.length - 1 ? h('a.kruim', { href: k.hash, style: { textDecoration: 'none' } }, k.tekst) : h('span.kruim.nu', k.tekst)]));
}
/** Titelrij: kruimelpad links, knoppen rechts */
export function titelRij(kr, ...knoppen) {
  return h('div.kaart-kop', kruimelsH1(kr), knoppen.filter(Boolean).length ? h('div.kop-knoppen', knoppen) : null);
}
/** Knop met uitklapmenu, zoals "Complex toevoegen ▾" */
export function knopMenu(tekst, items) {
  return menu(h('button.knop', { type: 'button' }, tekst, ' ', h('span.pijl', { 'aria-hidden': 'true' }, '▾')), items);
}

export function leegStaat(titel, tekst) { return h('div.leeg', h('strong', titel), tekst); }
/** Banner van versie 1: vette titel, daaronder een kleine toelichting */
export function melding(soort, titel, tekst, ...extra) {
  return h('div.banner', { class: soort, style: { display: 'block' } }, titel, tekst ? h('small', tekst) : null, extra.length ? h('div.knoprij', extra) : null);
}
/** Regel in een lijst met documenten of afrondingen (versie 1: .vz-hist) */
export function histRij(titel, sub, opmerking, ...knoppen) {
  return h('div.vz-hist', h('span.doc-ico', ICOON.doc()), h('div.rij-hoofd', h('div.rij-titel', titel), sub ? h('div.rij-sub', sub) : null, opmerking || null), knoppen.length ? h('div.knoprij', knoppen) : null);
}

/** Suggestielijst onder een invoerveld (versie 1). lijst(tekst) geeft de waarden; kiezen gebeurt pas bij een echte tik,
 *  zodat vegen door de lijst niets kiest. minTekens: pas tonen vanaf zoveel getypte tekens. */
export function koppelSuggesties(inp, lijst, kies, minTekens = 0) {
  const wrap = inp.parentElement; let box = null;
  const sluit = () => { if (box) { box.remove(); box = null; } };
  const toon = () => {
    sluit(); if (inp.disabled || inp.value.trim().length < minTekens) return;
    const s = lijst(inp.value); if (!s.length) return;
    box = h('div.sug', s.map(v => h('button', { type: 'button', onpointerdown: e => e.preventDefault(), onclick: e => { e.preventDefault(); inp.value = v; kies(v); sluit(); } }, v)));
    wrap.appendChild(box);
  };
  inp.addEventListener('focus', toon); inp.addEventListener('input', toon);
  inp.addEventListener('blur', () => setTimeout(sluit, 250));
}
/** Waarden met frequentie, gefilterd op de getypte tekst; vaste lijst eerst in de eigen volgorde */
export function suggestieLijst(waarden, vast, tekst, max = 8) {
  const freq = new Map();
  for (const v0 of waarden) { const v = String(v0 || '').trim(); if (!v) continue; const k = v.toLowerCase(); const e = freq.get(k) || { v, n: 0 }; e.n++; freq.set(k, e); }
  const q = String(tekst || '').trim().toLowerCase();
  const past = v => !q || (v.toLowerCase().includes(q) && v.toLowerCase() !== q);
  const vastSet = new Set(vast.map(v => v.toLowerCase()));
  const eerder = Array.from(freq.values()).filter(e => !vastSet.has(e.v.toLowerCase())).sort((a, b) => b.n - a.n || a.v.localeCompare(b.v)).map(e => e.v);
  return vast.filter(past).concat(eerder.filter(past).slice(0, max));
}
