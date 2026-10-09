// @ts-check
/* Back-up zolang er nog geen server is. Formaat: één JSON-object per regel (NDJSON), zodat ook grote back-ups
   regel voor regel worden geschreven en gelezen. Samenvoegen gebeurt per record (punt, object, …) op wijzigingstijd,
   niet per heel object: twee inspecteurs in dezelfde woning raken elkaars werk niet kwijt. */
import * as store from './store.js';
import { S, laad, complexen, blokkenVan, objectenVanComplex } from './staat.js';
import { h, toast, leverBestand, dialoog, kiesBestand, bevestig } from './ui.js';
import { APP_VERSIE } from './config.js';
import { blobAlsDataURL } from './foto.js';
import * as M from './model.js';
import { ga, route, ververs } from './nav.js';

const BLOB_TYPE = { fotos: 'image/jpeg', minis: 'image/jpeg' };

/** Welke records en bestanden horen bij een complex (of bij alles) */
function verzamel(complex) {
  const alleRecords = s => Array.from(S[s].values());
  const inComplex = (s, cid) => alleRecords(s).filter(r => r.complexId === cid || (s === 'complexen' && r.id === cid));
  const sets = {};
  if (complex) { for (const s of store.DATA_STORES) sets[s] = inComplex(s, complex.id); }
  else for (const s of store.DATA_STORES) sets[s] = alleRecords(s);
  const fotos = new Set(), bestanden = new Set();
  for (const p of sets.punten) if (p.fotoId) fotos.add(p.fotoId);
  for (const o of sets.objecten) for (const st of Object.values((o.meter && o.meter.standen) || {})) if (st && st.fotoId) fotos.add(st.fotoId);
  for (const d of sets.documenten) { bestanden.add(d.bestandId); for (const id of Object.values(d.handtekeningIds || {})) bestanden.add(id); }
  return { sets, fotos, bestanden };
}

export async function maakBackup(complex) {
  await store.spoel();
  const { sets, fotos, bestanden } = verzamel(complex);
  const delen = [new Blob([JSON.stringify({ app: 'opleverinspectie', formaat: 3, appVersie: APP_VERSIE, gemaakt: M.nuISO(), bereik: complex ? `complex ${complex.nummer}` : 'alles' }) + '\n'])];
  delen.push(new Blob([JSON.stringify({ s: 'config', r: S.config }) + '\n']));
  for (const s of store.DATA_STORES) for (const r of sets[s]) delen.push(new Blob([JSON.stringify({ s, r }) + '\n']));
  let n = 0, mist = 0; const totaal = fotos.size + bestanden.size;
  for (const [s, ids] of [['fotos', fotos], ['bestanden', bestanden]]) for (const id of ids) {
    if (++n % 15 === 0) toast(`Back-up wordt gemaakt… ${n} / ${totaal}`, 60000);
    const b = await store.blobGet(s, id); if (!b) { mist++; continue; }
    delen.push(new Blob([JSON.stringify({ s, id, d: await blobAlsDataURL(b) }) + '\n']));
  }
  const blob = new Blob(delen, { type: 'application/x-ndjson' });
  toast(mist ? `Back-up gereed; ${mist} bestand(en) niet gevonden` : 'Back-up gereed', 2500);
  const naam = `opleverinspectie-backup_${complex ? 'complex-' + complex.nummer.replace(/[^\w-]+/g, '-') + '_' : ''}${M.vandaag()}.jsonl`;
  await leverBestand(blob, naam, 'Back-up gereed', `${sets.punten.filter(M.levend).length} punten, ${fotos.size} foto's, ${sets.documenten.length} documenten`, async () => {
    const nu = M.nuISO();
    if (!complex) await store.metaPut('sindsBackup', 0);
    await store.metaPut('laatsteBackup', nu);
    /* Per complex onthouden wanneer de laatste back-up is gemaakt (staat onderaan het complexscherm, zoals in versie 1) */
    const geraakt = complex ? [complex] : complexen();
    for (const c of geraakt) c.laatsteBackup = nu;
    await store.bewaar(geraakt.map(c => /** @type {[string, any]} */ (['complexen', c])));
  });
  ververs();
}

async function* regels(file) {
  const STUK = 2 * 1048576, dec = new TextDecoder(); let rest = '';
  for (let pos = 0; pos < file.size; pos += STUK) {
    rest += dec.decode(await file.slice(pos, pos + STUK).arrayBuffer(), { stream: true });
    let i; while ((i = rest.indexOf('\n')) >= 0) { const r = rest.slice(0, i).trim(); rest = rest.slice(i + 1); if (r) yield r; }
  }
  rest += dec.decode(); if (rest.trim()) yield rest.trim();
}
function dataURLNaarBlob(d, type) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(d)); if (!m || !m[2]) throw new Error('ongeldig bestand in back-up');
  const bin = atob(m[3]), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: m[1] || type || 'application/octet-stream' });
}
const nieuwer = (a, b) => (a.gewijzigd || '') > (b.gewijzigd || '') || ((a.gewijzigd || '') === (b.gewijzigd || '') && (a.rev || 0) > (b.rev || 0));

export async function zetBackupTerug() {
  const f = await kiesBestand('.jsonl,.json,application/json,application/x-ndjson'); if (!f) return;
  await store.spoel();
  /* Ronde 1: alleen de gegevens lezen en controleren; nog niets wijzigen */
  const records = Object.fromEntries(store.DATA_STORES.map(s => [s, []]));
  let kop = null, config = null, aantalBlobs = 0;
  try {
    for await (const r of regels(f)) {
      const x = JSON.parse(r);
      if (!kop) { if (x.app !== 'opleverinspectie' || x.formaat !== 3) throw new Error(x.app === 'opleverinspectie' ? 'back-up van de vorige versie van de app (formaat ' + (x.versie || '?') + ')' : 'geen back-up van deze app'); kop = x; continue; }
      if (x.s === 'config') config = x.r;
      else if (store.DATA_STORES.includes(x.s)) { if (!x.r || !x.r.id) throw new Error('record zonder id'); records[x.s].push(x.r); }
      else if (store.BLOB_STORES.includes(x.s)) aantalBlobs++;
    }
    if (!kop) throw new Error('leeg bestand');
  } catch (e) { return dialoog({ titel: 'Back-up niet bruikbaar', tekst: `${f.name}: ${e && e.message}. Er is niets gewijzigd.` }); }

  const heeftData = complexen().length > 0;
  let modus = 'vervang';
  if (heeftData) {
    modus = await dialoog({ titel: 'Back-up terugzetten', tekst: `Back-up van ${new Date(kop.gemaakt).toLocaleString('nl-NL')} (${kop.bereik}): ${records.objecten.filter(M.levend).length} object(en), ${records.punten.filter(M.levend).length} punt(en), ${records.documenten.length} document(en), ${aantalBlobs} bestand(en).\n\nSamenvoegen: per punt, object en blok blijft de laatst gewijzigde versie staan; documenten komen erbij. Er gaat niets verloren.\n\nAlles vervangen: wist deze tablet en zet de back-up terug.`,
      knoppen: [{ tekst: 'Annuleren', waarde: null, soort: 'licht' }, { tekst: 'Alles vervangen', waarde: 'vervang', soort: 'gevaar' }, { tekst: 'Samenvoegen', waarde: 'samen' }] });
    if (!modus) return;
    if (modus === 'vervang' && !await bevestig('Alles vervangen?', 'Alle gegevens, foto\'s en documenten op deze tablet worden gewist. Dit kan niet ongedaan worden gemaakt.', 'Alles vervangen', true)) return;
  }
  /* Plan voor samenvoegen */
  const ops = [], tel = { nieuw: 0, bijgewerkt: 0, gelijk: 0, documenten: 0 };
  for (const s of store.DATA_STORES) for (const r of records[s]) {
    const lokaal = modus === 'samen' ? S[s].get(r.id) : null;
    if (!lokaal) { ops.push([s, r]); if (s === 'documenten') tel.documenten++; else tel.nieuw++; }
    else if (s !== 'documenten' && nieuwer(r, lokaal)) { ops.push([s, r]); tel.bijgewerkt++; }
    else tel.gelijk++;
  }
  /* Ronde 2: bestanden en gegevens wegschrijven */
  try {
    if (modus === 'vervang') { await store.wisAlles(); if (config) await store.metaPut('config', config); }
    const bestaand = new Set((await Promise.all(store.BLOB_STORES.map(s => store.blobKeys(s)))).flat().map(String));
    let n = 0;
    for await (const r of regels(f)) {
      if (!r.startsWith('{"s":"fotos"') && !r.startsWith('{"s":"bestanden"') && !r.startsWith('{"s":"minis"')) continue;
      const x = JSON.parse(r); if (bestaand.has(x.id)) continue;
      await store.zetRuw([[x.s, { id: x.id, blob: dataURLNaarBlob(x.d, BLOB_TYPE[x.s]) }]]);
      if (++n % 15 === 0) toast(`Terugzetten… ${n} bestand(en)`, 60000);
    }
    for (let i = 0; i < ops.length; i += 400) await store.zetRuw(ops.slice(i, i + 400));
    await laad();
  } catch (e) {
    console.error(e); await laad().catch(() => {});
    return dialoog({ titel: 'Terugzetten mislukt', tekst: `${e && e.message}. ${modus === 'samen' ? 'De gegevens op deze tablet zijn niet overschreven.' : 'Probeer het opnieuw met hetzelfde bestand.'}` });
  }
  toast(modus === 'samen' ? `Samengevoegd: ${tel.nieuw} nieuw, ${tel.bijgewerkt} bijgewerkt, ${tel.documenten} document(en)` : 'Back-up teruggezet', 4000);
  ga(route.complexen());
}

/** Weesbestanden opruimen: foto's en bestanden waar niets meer naar verwijst, ouder dan een dag */
export async function ruimOp() {
  const { fotos, bestanden } = verzamel(null);
  /* foto's van verwijderde punten mogen weg; die van vervallen punten niet (die staan in documenten) */
  for (const p of S.punten.values()) if (p.verwijderd && p.fotoId && !Array.from(S.documenten.values()).some(d => d.puntIds.includes(p.id))) fotos.delete(p.fotoId);
  let n = 0;
  for (const [s, houden] of [['fotos', fotos], ['minis', fotos], ['bestanden', bestanden]]) {
    const weg = (await store.blobKeys(s)).map(String).filter(id => !houden.has(id) && (M.idTijd(id) || Infinity) < Date.now() - 864e5);
    if (weg.length) { await store.blobDel(s, weg); n += weg.length; }
  }
  return n;
}

/** Status van opslag en back-up, voor Instellingen en de herinnering */
export function opslagInfo() {
  const el = h('div.opslag', h('p.hint', 'Bezig met opvragen…'));
  (async () => {
    const r = [];
    const standalone = matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
    r.push(['Geopend als', standalone ? 'app op het beginscherm' : 'website in de browser']);
    if (navigator.storage && navigator.storage.persisted) r.push(['Opslag beschermd', (await navigator.storage.persisted()) ? 'ja' : 'nee — zet de app op het beginscherm']);
    if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); r.push(['Gebruikt', `${((e.usage || 0) / 1048576).toFixed(0)} MB van ${((e.quota || 0) / 1073741824).toFixed(1).replace('.', ',')} GB`]); }
    const lb = await store.metaGet('laatsteBackup'), sb = await store.metaGet('sindsBackup');
    r.push(['Laatste back-up', lb ? new Date(lb).toLocaleString('nl-NL') : 'nog nooit']);
    r.push(['Wijzigingen sinds', String(sb || 0)]);
    el.replaceChildren(h('dl.kvs', r.map(([k, v]) => h('div.kv', h('dt', k), h('dd', v)))),
      h('div.knoprij', h('button.knop.licht', { type: 'button', onclick: () => maakBackup(null) }, 'Back-up maken'), h('button.knop.licht', { type: 'button', onclick: zetBackupTerug }, 'Back-up terugzetten…')));
  })().catch(e => el.replaceChildren(h('p.hint', 'Niet beschikbaar: ' + e.message)));
  return el;
}
export { blokkenVan, objectenVanComplex };
