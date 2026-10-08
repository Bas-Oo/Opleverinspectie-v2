// @ts-check
/* Herbruikbare weergave-onderdelen voor de schermen */
import { h } from './ui.js';
import { S } from './staat.js';
import * as M from './model.js';

export function urgBadges(t, alleenMetAantal = true) {
  return h('span.badges', S.config.urgenties.filter(u => !alleenMetAantal || t[u.code] > 0).map(u => h('span.badge', { class: 'u-' + u.code, title: `${t[u.code]} open ${u.code} ${u.titel}` }, `${u.code} ${t[u.code]}`)));
}
export function faseChip(sam) { return h('span.chip', { class: 'f-' + sam.toon }, sam.label); }
export function deadlineChip(o) {
  if (o.fase !== 'herstel' || !o.herstelUiterlijk) return null;
  const n = M.werkdagenTot(o.herstelUiterlijk);
  if (n === null) return null;
  return h('span.chip', { class: n < 0 ? 'verlopen' : n <= 2 ? 'krap' : 'termijn', title: 'Herstel uiterlijk ' + M.fmtDatum(o.herstelUiterlijk) },
    n < 0 ? `${-n} wd verlopen` : n === 0 ? 'vandaag' : `nog ${n} wd`);
}
/** Kort label voor de matrix: het deel van het adres dat verschilt binnen het blok */
export function kortLabels(objecten) {
  const adressen = objecten.map(o => o.adres);
  let pre = adressen.length > 1 ? adressen[0] : '';
  for (const a of adressen) while (pre && !a.startsWith(pre)) pre = pre.slice(0, -1);
  pre = pre.replace(/[^\s-]*$/, '');   // niet midden in een huisnummer afbreken
  return new Map(objecten.map(o => {
    let k = o.adres.slice(pre.length).trim() || o.adres;
    if (/alg/i.test(k) && /ruimte/i.test(k)) k = k.replace(/\s*—?\s*Algemene ruimte/i, ' alg.');
    return [o.id, k];
  }));
}
export function leegStaat(titel, tekst, ...knoppen) { return h('div.leeg-staat', h('strong', titel), h('p', tekst), knoppen.length ? h('div.knoprij', knoppen) : null); }
export function melding(soort, titel, tekst, ...extra) { return h('div.banner', { class: soort }, h('div', h('strong', titel), tekst ? h('small', tekst) : null), ...extra); }
