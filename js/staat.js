// @ts-check
/* De gegevens in het geheugen, met opzoekfuncties. Wijzigen gaat altijd via bewaar()/bewaarLater(): eerst het geheugen, dan de opslag. */
import * as store from './store.js';
import { vulConfigAan } from './config.js';
import { levend, sorteerObjecten, sorteerBlokken } from './model.js';

export const S = {
  config: vulConfigAan(null),
  /** @type {Map<string, any>} */ complexen: new Map(),
  /** @type {Map<string, any>} */ blokken: new Map(),
  /** @type {Map<string, any>} */ objecten: new Map(),
  /** @type {Map<string, any>} */ punten: new Map(),
  /** @type {Map<string, any>} */ documenten: new Map()
};

export async function laad() {
  const d = await store.laadAlles();
  S.config = vulConfigAan(d.config);
  for (const s of store.DATA_STORES) { S[s] = new Map(); for (const r of d[s]) S[s].set(r.id, r); }
}

/** @param {Array<[string, any]>} ops */
export async function bewaar(ops) {
  for (const [s, r] of ops) if (S[s] instanceof Map) S[s].set(r.id, r);
  await store.bewaar(ops);
}
export function bewaarLater(s, r) { S[s].set(r.id, r); store.bewaarLater(s, r); }
export async function bewaarConfig(c) { S.config = c; await store.metaPut('config', c); }
/** Grafsteen: het record blijft bestaan met verwijderd = true */
export function verwijder(s, r) { r.verwijderd = true; return bewaar([[s, r]]); }

/* ===== Opzoeken ===== */
const waar = (m, f) => Array.from(m.values()).filter(x => levend(x) && f(x));
export const complexen = () => waar(S.complexen, () => true).sort((a, b) => String(a.nummer).localeCompare(String(b.nummer), 'nl', { numeric: true }));
export const blokkenVan = cid => sorteerBlokken(waar(S.blokken, b => b.complexId === cid));
export const objectenVanBlok = bid => sorteerObjecten(waar(S.objecten, o => o.blokId === bid));
export const objectenVanComplex = cid => blokkenVan(cid).flatMap(b => objectenVanBlok(b.id));
export const puntenVan = oid => waar(S.punten, p => p.objectId === oid).sort((a, b) => a.nr - b.nr);
export const puntenVanComplex = cid => waar(S.punten, p => p.complexId === cid);
export const documentenVan = oid => Array.from(S.documenten.values()).filter(d => d.objectIds.includes(oid)).sort((a, b) => a.gemaakt < b.gemaakt ? -1 : 1);
export const documentenVanComplex = cid => Array.from(S.documenten.values()).filter(d => d.complexId === cid).sort((a, b) => a.gemaakt < b.gemaakt ? -1 : 1);
export const get = (s, id) => { const r = S[s].get(id); return levend(r) ? r : null; };
