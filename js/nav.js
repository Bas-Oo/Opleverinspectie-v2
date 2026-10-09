// @ts-check
/* Navigatie via de hash (#/c/…, #/o/…/tab): de terugknop en terugvegen werken vanzelf, zonder eigen geschiedenisbeheer.
   Wisselen van tabblad binnen een object vervangt de plek in de geschiedenis (zoals versie 1), zodat "terug" naar het blok gaat. */
let hertekenen = () => {};
export function zetHertekenaar(f) { hertekenen = f; }
/* Beloftes die worden ingelost zodra het volgende scherm is opgebouwd (een dialoog openen ná het wisselen van scherm) */
let wachtenden = [];
export function getekend() { const w = wachtenden; wachtenden = []; w.forEach(f => f()); }
/** Naar een scherm; gelijk scherm = opnieuw tekenen met behoud van scrollpositie. vervang: geen nieuwe plek in de geschiedenis.
 *  Geeft een belofte die wordt ingelost als het scherm is opgebouwd. */
export function ga(hash, { vervang = false } = {}) {
  const klaar = new Promise(r => wachtenden.push(r));
  if (location.hash === hash) hertekenen(true);
  else if (vervang) location.replace(hash);
  else location.hash = hash;
  return klaar;
}
export function ververs() { hertekenen(true); }
export const TAB_STANDAARD = 'gegevens';
export const route = {
  complexen: () => '#/',
  complex: id => '#/c/' + id,
  blok: id => '#/b/' + id,
  object: (id, tab) => '#/o/' + id + (tab && tab !== TAB_STANDAARD ? '/' + tab : ''),
  verzamel: (niveau, id) => `#/v/${niveau}/${id}`,
  document: id => '#/d/' + id,
  instellingen: () => '#/instellingen'
};
