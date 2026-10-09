// @ts-check
/* Opslag in IndexedDB, één record per complex, blok, object, punt en document.
   - Elke wijziging schrijft alleen het gewijzigde record (niet de hele dataset).
   - Elk record krijgt 'gewijzigd' (tijd) en 'rev' (teller): de basis voor samenvoegen per record, en later voor synchroniseren met een server.
   - Verwijderen laat een grafsteen achter ({verwijderd: true}), zodat samenvoegen een verwijdering niet terugzet.
   - Documenten (ondertekende PDF's) worden één keer geschreven en daarna nooit meer gewijzigd. */

const DB_NAAM = 'opleverinspectie-v2';
const DB_VERSIE = 1;
export const DATA_STORES = ['complexen', 'blokken', 'objecten', 'punten', 'documenten'];
export const BLOB_STORES = ['fotos', 'minis', 'bestanden'];   // bestanden = handtekeningen en PDF's

/** @type {IDBDatabase|null} */
let idb = null;
export const tijdelijkeWijzigingen = { aantal: 0 };

export function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAAM, DB_VERSIE);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of DATA_STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      for (const s of BLOB_STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    r.onsuccess = () => { idb = r.result; idb.onversionchange = () => { idb && idb.close(); location.reload(); }; res(idb); };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('De opslag is in gebruik door een ander tabblad'));
  });
}

function txn(stores, mode, werk) {
  return new Promise((res, rej) => {
    if (!idb) return rej(new Error('opslag niet geopend'));
    const t = idb.transaction(stores, mode);
    let uit;
    try { uit = werk((/** @type {string} */ n) => t.objectStore(n)); } catch (e) { try { t.abort(); } catch (x) { /* al afgebroken */ } return rej(e); }
    t.oncomplete = () => res(uit && typeof uit === 'object' && 'result' in uit ? uit.result : uit);
    t.onerror = () => rej(t.error || new Error('opslaan mislukt'));
    t.onabort = () => rej(t.error || new Error('opslaan afgebroken'));
  });
}
const alle = s => txn([s], 'readonly', st => st(s).getAll());

/** Laadt alle gegevens (zonder foto's en bestanden) in het geheugen */
export async function laadAlles() {
  const uit = {};
  for (const s of DATA_STORES) uit[s] = await alle(s);
  uit.config = await metaGet('config');
  return uit;
}
export const metaGet = k => txn(['meta'], 'readonly', st => st('meta').get(k));
export const metaPut = (k, v) => txn(['meta'], 'readwrite', st => { st('meta').put(v, k); });

function stempel(r) { r.gewijzigd = new Date().toISOString(); r.rev = (r.rev || 0) + 1; return r; }

/** Schrijft een of meer records in één transactie: alles of niets.
 *  @param {Array<[string, any]>} ops  [storeNaam, record] — voor blobstores: [naam, {id, blob}] */
export async function bewaar(ops) {
  const stores = Array.from(new Set(ops.map(([s]) => s)));
  for (const [s, r] of ops) if (DATA_STORES.includes(s) && s !== 'documenten') stempel(r);
  await txn(stores, 'readwrite', st => {
    for (const [s, r] of ops) {
      if (BLOB_STORES.includes(s)) st(s).put(r.blob, r.id);
      else if (s === 'documenten') st(s).add(r);     // add: een bestaand document overschrijven geeft een fout
      else st(s).put(r);
    }
  });
  tijdelijkeWijzigingen.aantal += ops.length;
  verhoogTeller(ops.length);
  for (const f of naOpslaan) try { f(); } catch (e) { /* weergave mag opslaan nooit breken */ }
}
/** Luisteraars na elke geslaagde opslag (statusregel "Opgeslagen 14:32" onderaan het scherm) */
export const naOpslaan = new Set();
/* Wijzigingen sinds de laatste back-up, voor de herinnering */
let tellerTimer = null, tellerExtra = 0;
function verhoogTeller(n) {
  tellerExtra += n; clearTimeout(tellerTimer);
  tellerTimer = setTimeout(async () => { const x = tellerExtra; tellerExtra = 0; const v = (await metaGet('sindsBackup')) || 0; await metaPut('sindsBackup', v + x); }, 800);
}

/* Uitgesteld bewaren bij typen: per record hooguit eens per 400 ms, en altijd direct bij verlaten van de pagina */
const wachtrij = new Map();   // key store|id → [store, record]
let wachtTimer = null;
export function bewaarLater(store, record) {
  wachtrij.set(store + '|' + record.id, [store, record]);
  clearTimeout(wachtTimer); wachtTimer = setTimeout(spoel, 400);
}
export async function spoel() {
  clearTimeout(wachtTimer);
  if (!wachtrij.size) return;
  const ops = Array.from(wachtrij.values()); wachtrij.clear();
  try { await bewaar(ops); }
  catch (e) { for (const [s, r] of ops) wachtrij.set(s + '|' + r.id, [s, r]); throw e; }
}
export const heeftWachtrij = () => wachtrij.size > 0;

export const blobGet = (s, id) => id ? txn([s], 'readonly', st => st(s).get(id)) : Promise.resolve(null);
export const blobKeys = s => txn([s], 'readonly', st => st(s).getAllKeys());
export const blobDel = (s, ids) => txn([s], 'readwrite', st => { for (const id of ids) st(s).delete(id); });

/** Alles wissen (bij 'Alles vervangen' vanuit een back-up) */
export function wisAlles() {
  return txn([...DATA_STORES, ...BLOB_STORES, 'meta'], 'readwrite', st => { for (const s of [...DATA_STORES, ...BLOB_STORES]) st(s).clear(); });
}
/** Ruwe put zonder stempel (voor herstel uit back-up: de wijzigingstijd van de bron blijft behouden) */
export function zetRuw(ops) {
  const stores = Array.from(new Set(ops.map(([s]) => s)));
  return txn(stores, 'readwrite', st => { for (const [s, r] of ops) { if (BLOB_STORES.includes(s)) st(s).put(r.blob, r.id); else st(s).put(r); } });
}
