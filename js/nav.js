// @ts-check
/* Navigatie via de hash (#/c/…, #/o/…): de terugknop en terugvegen werken vanzelf, zonder eigen geschiedenisbeheer. */
let hertekenen = () => {};
export function zetHertekenaar(f) { hertekenen = f; }
/** Naar een scherm; gelijk scherm = opnieuw tekenen met behoud van scrollpositie */
export function ga(hash) { if (location.hash === hash) hertekenen(true); else location.hash = hash; }
export function ververs() { hertekenen(true); }
export const route = {
  complexen: () => '#/',
  complex: id => '#/c/' + id,
  blok: id => '#/b/' + id,
  object: (id, deel) => '#/o/' + id + (deel && deel !== 'punten' ? '/' + deel : ''),
  tekenen: id => '#/t/' + id,
  verzamel: (niveau, id) => `#/v/${niveau}/${id}`,
  document: id => '#/d/' + id,
  instellingen: () => '#/instellingen'
};
