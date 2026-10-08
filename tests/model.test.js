// Draaien: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { STANDAARD_CONFIG as config, vulConfigAan } from '../js/config.js';
import { sha256, _eigen } from '../js/sha256.js';
import { createHash } from 'node:crypto';

let klok = 0;
const t = () => new Date(Date.UTC(2026, 9, 1, 8, 0, klok++)).toISOString();

function opzet() {
  const c = M.nieuwComplex({ nummer: '960', naam: 'Torckdael' });
  c.standaard = { vertOpdrachtgever: 'Inspecteur', opdrachtnemer: 'Bouwbedrijf', vertOpdrachtnemer: 'Uitvoerder', netElektra: '', netWater: '' };
  const b = M.nieuwBlok(c, 'B');
  const o = M.nieuwObject(c, b, { adres: 'Churchillweg 31-1', type: 'Appartement' });
  o.meter.nvt = true;
  for (const z of config.overigeZaken) o.overig[z.key] = 'ja';
  return { c, b, o };
}

test('puntnummers liggen vast en worden nooit hergebruikt', () => {
  const { o } = opzet();
  const p1 = M.nieuwPunt(o, { omschrijving: 'a' }, t()), p2 = M.nieuwPunt(o, { omschrijving: 'b' }, t());
  p1.verwijderd = true;
  const p3 = M.nieuwPunt(o, { omschrijving: 'c' }, t());
  assert.deepEqual([p1.nr, p2.nr, p3.nr], [1, 2, 3]);
});

test('vooropnamepunt is hetzelfde record in de oplevering en moet worden beoordeeld', () => {
  const { c, o } = opzet();
  const p = M.nieuwPunt(o, { ruimte: 'Keuken', omschrijving: 'Kras', urgentie: 'C' }, t());
  M.startOplevering(o, t());
  assert.equal(M.teBeoordelen(p, o), true);
  let r = M.controles({ config, complex: c, object: o, punten: [p] });
  assert.ok(r.blokkades.some(x => /niet beoordeeld/.test(x.tekst)));
  M.beoordeel(p, o, 'nog open', t());
  assert.equal(M.teBeoordelen(p, o), false);
  r = M.controles({ config, complex: c, object: o, punten: [p] });
  assert.equal(r.blokkades.length, 0, JSON.stringify(r.blokkades));
});

test('open A- en B-punten blokkeren de oplevering, C niet', () => {
  const { c, o } = opzet();
  M.startOplevering(o, t());
  const a = M.nieuwPunt(o, { omschrijving: 'x', urgentie: 'A' }, t());
  const b = M.nieuwPunt(o, { omschrijving: 'y', urgentie: 'B' }, t());
  const cc = M.nieuwPunt(o, { omschrijving: 'z', urgentie: 'C' }, t());
  const r = M.controles({ config, complex: c, object: o, punten: [a, b, cc] });
  assert.equal(r.blokkades.filter(x => /eerst herstellen/.test(x.tekst)).length, 2);
});

test('C-limiet per woning geeft een waarschuwing', () => {
  const { c, o } = opzet();
  M.startOplevering(o, t());
  const ps = [1, 2, 3, 4].map(i => M.nieuwPunt(o, { omschrijving: 'c' + i, urgentie: 'C' }, t()));
  const r = M.controles({ config, complex: c, object: o, punten: ps });
  assert.ok(r.waarschuwingen.some(x => /meer dan 3 per woning/.test(x.tekst)));
  assert.equal(r.blokkades.length, 0);
});

test('partijen uit de complexstandaard; ontbrekende partij blokkeert', () => {
  const { c, o } = opzet();
  c.standaard.opdrachtnemer = '';
  M.startOplevering(o, t());
  const r = M.controles({ config, complex: c, object: o, punten: [] });
  assert.ok(r.blokkades.some(x => /opdrachtnemer/.test(x.tekst) && x.naar === 'gegevens'));
  o.partijen.opdrachtnemer = 'Eigen aannemer';
  assert.equal(M.partijen(o, c).opdrachtnemer, 'Eigen aannemer');
});

test('volledige levenscyclus: oplevering → herstelrondes → gereed', () => {
  const { c, o } = opzet();
  const p1 = M.nieuwPunt(o, { omschrijving: 'Kras', urgentie: 'C' }, t());
  const p2 = M.nieuwPunt(o, { omschrijving: 'Lekkage', urgentie: 'B' }, t());
  M.startOplevering(o, t());
  M.beoordeel(p1, o, 'nog open', t());
  M.beoordeel(p2, o, 'hersteld', t());
  assert.equal(p2.paraaf, null, 'bij de oplevering is hersteld nog geen paraaf');
  M.naOplevering(o, [p1, p2], { id: 'd1', datum: '2026-10-01' }, config, t());
  assert.equal(o.fase, 'herstel');
  assert.equal(o.herstelUiterlijk, '2026-10-15');           // 10 werkdagen na do 1 okt
  assert.equal(M.teBeoordelen(p1, o), true);
  assert.equal(M.teBeoordelen(p2, o), false, 'al hersteld bij de oplevering');
  const p3 = M.nieuwPunt(o, { omschrijving: 'Vergeten', urgentie: 'C' }, t());
  assert.equal(M.isNagekomen(p3), true);
  M.beoordeel(p1, o, 'nog open', t());
  M.naHerstel(o, [p1, p2, p3], { id: 'd2' }, t());
  assert.equal(o.fase, 'herstel'); assert.equal(o.herstelRonde, 1);
  assert.equal(M.teBeoordelen(p1, o), true); assert.equal(M.teBeoordelen(p3, o), true);
  M.beoordeel(p1, o, 'hersteld', t()); M.beoordeel(p3, o, 'hersteld', t());
  assert.ok(p1.paraaf, 'hersteld in de herstelcontrole = paraaf');
  M.naHerstel(o, [p1, p2, p3], { id: 'd3' }, t());
  assert.equal(o.fase, 'gereed');
  assert.equal(M.puntBewerkbaar(p1, o, []), false);
});

test('beoordeling terugdraaien', () => {
  const { o } = opzet();
  const p = M.nieuwPunt(o, { omschrijving: 'x', urgentie: 'C' }, t());
  M.startOplevering(o, t());
  M.beoordeel(p, o, 'hersteld', t());
  assert.equal(p.status, 'hersteld');
  M.wisBeoordeling(p, o);
  assert.equal(p.status, 'open'); assert.equal(M.teBeoordelen(p, o), true);
});

test('herziening alleen zolang er geen herstel is vastgelegd', () => {
  const { o } = opzet();
  M.startOplevering(o, t());
  const p = M.nieuwPunt(o, { omschrijving: 'x', urgentie: 'C' }, t());
  M.naOplevering(o, [p], { id: 'd1', datum: '2026-10-01' }, config, t());
  assert.equal(M.herzieningMogelijk(o, [p]).kan, true);
  M.startHerziening(o, [p], 'badkamer vergeten', t());
  assert.equal(o.fase, 'oplever'); assert.equal(o.herziening, 1);
  const n = M.nieuwPunt(o, { omschrijving: 'vergeten', urgentie: 'C' }, t());
  assert.equal(n.geconstateerd.herziening, 1);
  M.naOplevering(o, [p, n], { id: 'd2', datum: '2026-10-02' }, config, t());
  M.beoordeel(p, o, 'hersteld', t());
  assert.equal(M.herzieningMogelijk(o, [p, n]).kan, false);
});

test('vastgelegde punten: verwijderen kan niet meer, vervallen wel met reden', () => {
  const { o } = opzet();
  const p = M.nieuwPunt(o, { omschrijving: 'x', urgentie: 'C' }, t());
  const doc = { puntIds: [p.id] };
  assert.equal(M.magVerwijderen(p, o, []), true);
  assert.equal(M.magVerwijderen(p, o, [doc]), false);
  assert.throws(() => M.laatVervallen(p, o, ''));
  M.laatVervallen(p, o, 'dubbel', t());
  assert.equal(M.tellers([p], o).open, 0);
});

test('wijzigingen na de vooropname worden in de historie gelogd', () => {
  const { o } = opzet();
  const p = M.nieuwPunt(o, { omschrijving: 'Krs', urgentie: 'C' }, t());
  M.wijzigPunt(p, { omschrijving: 'Kras' }, o, t());
  assert.equal(p.historie.length, 1, 'tikfout direct na vastleggen: geen logregel');
  M.startOplevering(o, t());
  M.wijzigPunt(p, { urgentie: 'B' }, o, t());
  assert.equal(p.historie.at(-1).actie, 'gewijzigd');
  assert.deepEqual(p.historie.at(-1).van, { urgentie: 'C' });
});

test('werkdagen', () => {
  assert.equal(M.telWerkdagen('2026-10-09', 1), '2026-10-12');   // vr → ma
  assert.equal(M.werkdagenTot('2026-10-15', '2026-10-08'), 5);
  assert.equal(M.werkdagenTot('2026-10-08', '2026-10-12'), -2);
});

test('canoniek is onafhankelijk van sleutelvolgorde', () => {
  assert.equal(M.canoniek({ b: 1, a: [2, { d: 1, c: 2 }] }), M.canoniek({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

test('sha256: eigen implementatie gelijk aan node', async () => {
  for (const s of ['', 'abc', 'x'.repeat(1000), 'é€😀']) {
    const verwacht = createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(_eigen(new TextEncoder().encode(s)), verwacht);
    assert.equal(await sha256(s), verwacht);
  }
});

test('adres en type uit Excel', () => {
  assert.equal(M.bouwAdres('Churchillweg', 31, 1), 'Churchillweg 31-1');
  assert.equal(M.bouwAdres('Harnjesweg', 40, 'a'), 'Harnjesweg 40A');
  assert.equal(M.bouwAdres('Harnjesweg', 40, 'Algemene ruimte'), 'Harnjesweg 40 — Algemene ruimte');
  assert.equal(M.normType('appartement', 'Woning', config.objectTypes), 'Appartement');
  assert.equal(M.normType('', 'Woning', config.objectTypes), 'Woning');
});

test('perRuimte volgt de looproute', () => {
  const { o } = opzet();
  const ps = ['Badkamer', 'Hal', 'Zolder', 'Keuken'].map(r => M.nieuwPunt(o, { ruimte: r }, t()));
  assert.deepEqual(M.perRuimte(ps, config).map(g => g.ruimte), ['Hal', 'Keuken', 'Badkamer', 'Zolder']);
});

test('config aanvullen behoudt eigen waarden', () => {
  const c = vulConfigAan({ herstelTermijnWerkdagen: 15, organisatie: { naam: 'X' } });
  assert.equal(c.herstelTermijnWerkdagen, 15);
  assert.equal(c.organisatie.naam, 'X');
  assert.equal(c.organisatie.plaats, 'Wageningen');
  assert.ok(c.meters.length);
});
