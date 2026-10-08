// @ts-check
/* Ondertekenen: per object (oplevering of herstelcontrole) en gezamenlijk per blok of complex (verzamel-PV) */
import { h, toast, ICOON, bevestig, leverBestand } from './ui.js';
import { S, get, puntenVan, objectenVanBlok, objectenVanComplex, blokkenVan } from './staat.js';
import * as M from './model.js';
import { ga, route } from './nav.js';
import { melding, urgBadges } from './stukjes.js';
import { tekenvak } from './handtekening.js';
import { onderteken, ondertekenVerzamel, pdfVan } from './documenten.js';

const NAAR = { punten: 'punten', gegevens: 'gegevens', meters: 'meters', overig: 'overig', documenten: 'documenten' };
function controleLijst(o, ctl) {
  return h('div.controle',
    ctl.blokkades.map(b => h('a.ctl.rood', { href: route.object(o.id, NAAR[b.naar]) }, ICOON.kruis(), h('span', b.tekst), ICOON.verder())),
    ctl.waarschuwingen.map(b => h('a.ctl.geel', { href: route.object(o.id, NAAR[b.naar]) }, ICOON.waarsch(), h('span', b.tekst), ICOON.verder())),
    !ctl.blokkades.length && !ctl.waarschuwingen.length ? h('div.ctl.groen', ICOON.vink(), h('span', 'Alles is ingevuld')) : null);
}
const plaatsDatum = (st, naWijzig = () => {}) => h('div.velden.twee',
  h('label.veld', h('span.label', 'Opgemaakt en ondertekend te'), h('input.invoer', { value: st.plaats, oninput: e => { st.plaats = e.target.value; } })),
  h('label.veld', h('span.label', 'Datum'), h('input.invoer', { type: 'date', value: st.datum, max: M.vandaag(), onchange: e => { st.datum = e.target.value; naWijzig(); } })));

async function afleveren(doc) {
  const pdf = await pdfVan(doc);
  if (pdf) await leverBestand(pdf, doc.bestandsnaam, 'Ondertekend en vastgelegd', `kenmerk ${doc.inhoudKenmerk.slice(0, 16).toUpperCase()}`);
}

/* ===== Eén object ===== */
export function tekenScherm(id) {
  const o = get('objecten', id); if (!o) return null;
  const c = get('complexen', o.complexId), b = get('blokken', o.blokId);
  const kruimels = [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: `${c.nummer} ${c.naam}`.trim(), hash: route.complex(c.id) }, { tekst: `Blok ${b.naam}`, hash: route.blok(b.id) }, { tekst: o.adres, hash: route.object(o.id) }, { tekst: 'Ondertekenen' }];
  if (o.fase !== 'oplever' && o.fase !== 'herstel') return { kruimels, inhoud: h('div', h('h1', 'Ondertekenen'), melding('blauw', o.fase === 'voor' ? 'Start eerst de oplevering' : 'Dit object is gereed', ''), h('a.knop', { href: route.object(o.id) }, 'Terug naar het object')) };
  const herstel = o.fase === 'herstel';
  const punten = puntenVan(o.id);
  const ctl = M.controles({ config: S.config, complex: c, object: o, punten, blokPunten: objectenVanBlok(b.id).flatMap(x => puntenVan(x.id)), blokObjecten: objectenVanBlok(b.id) });
  const pj = M.partijen(o, c);
  const st = { plaats: S.config.organisatie.plaats, datum: M.vandaag() };
  const vakG = tekenvak('Opdrachtgever', pj.vertOpdrachtgever), vakN = tekenvak('Opdrachtnemer', pj.vertOpdrachtnemer);
  const knop = /** @type {HTMLButtonElement} */ (h('button.knop.groot', { type: 'button' }, ICOON.pen(), herstel ? 'Herstelcontrole ondertekenen en vastleggen' : 'Ondertekenen en vastleggen'));
  const bijwerken = () => { knop.disabled = !!ctl.blokkades.length || vakG.leeg() || (!herstel && vakN.leeg()); };
  vakG.opWijzig(bijwerken); vakN.opWijzig(bijwerken); bijwerken();

  const levend = punten.filter(p => M.levend(p) && p.status !== 'vervallen');
  const inDoc = herstel ? levend.filter(p => M.moetBeoordeeld(p, o) || p.geconstateerd.t >= o.faseStart.herstel) : levend;
  const verklaring = herstel ? S.config.teksten.verklaringHerstel : S.config.teksten.verklaringOplevering.replace('{termijn}', String(S.config.herstelTermijnWerkdagen));

  knop.onclick = async () => {
    if (ctl.blokkades.length) return;
    if (!st.plaats.trim() || !st.datum) return toast('Vul plaats en datum in');
    const tekst = herstel
      ? `Het proces-verbaal herstelcontrole wordt gemaakt en vastgelegd. ${levend.filter(p => p.status === 'open').length ? 'Open punten gaan naar een volgende herstelronde.' : 'Alle punten zijn hersteld: het object is daarna gereed.'}`
      : 'Het proces-verbaal wordt gemaakt en vastgelegd met beide handtekeningen. Daarna verandert het nooit meer. Is er later toch iets vergeten, dan maak je een herziening; die vervangt dit document zonder het te wijzigen.';
    if (!await bevestig(herstel ? 'Herstelcontrole vastleggen?' : 'Oplevering ondertekenen?', tekst, 'Vastleggen')) return;
    knop.disabled = true; knop.textContent = 'Proces-verbaal wordt gemaakt…';
    try {
      const handtekeningen = { Opdrachtgever: await vakG.png() };
      if (!vakN.leeg()) handtekeningen.Opdrachtnemer = await vakN.png();
      const doc = await onderteken({ soort: herstel ? 'herstel' : 'oplevering', object: o, plaats: st.plaats.trim(), datum: st.datum, namen: { opdrachtgever: pj.vertOpdrachtgever, opdrachtnemer: pj.vertOpdrachtnemer }, handtekeningen });
      ga(route.object(o.id, 'documenten'));
      await afleveren(doc);
    } catch (e) { console.error(e); toast('Vastleggen mislukt: ' + (e && e.message), 6000); knop.textContent = 'Opnieuw proberen'; knop.disabled = false; }
  };

  const t = ctl.tellers;
  const termijnHint = herstel ? null : h('p.hint');
  const zetTermijn = () => { if (termijnHint) termijnHint.textContent = st.datum ? `Herstel uiterlijk ${M.fmtDatum(M.telWerkdagen(st.datum, S.config.herstelTermijnWerkdagen))} (${S.config.herstelTermijnWerkdagen} werkdagen na ondertekening).` : ''; };
  zetTermijn();
  const inhoud = h('div.tekenen',
    h('h1', herstel ? `Herstelcontrole${o.herstelRonde ? ' ronde ' + (o.herstelRonde + 1) : ''} — ${o.adres}` : `Oplevering${o.herziening ? ' (herziening ' + o.herziening + ')' : ''} — ${o.adres}`),
    h('section.kaart', h('h2', '1. Controle'), controleLijst(o, ctl),
      ctl.blokkades.length ? h('p.hint', 'Los eerst de rode punten op; tik erop om er direct heen te gaan.') : null),
    h('section.kaart', { class: ctl.blokkades.length ? 'gedimd' : '' }, h('h2', '2. Dit wordt vastgelegd'),
      h('div.samenvatting', urgBadges(t, false), h('span', `${inDoc.length} punt(en) in het document`), t.nietErkend ? h('span.chip.krap', `${t.nietErkend} niet erkend`) : null),
      h('table.mini-tabel', h('thead', h('tr', h('th', 'Nr'), h('th', 'Ruimte'), h('th', 'Omschrijving'), h('th', 'Urg.'), h('th', herstel ? 'Uitkomst' : 'Status'))),
        h('tbody', inDoc.map(p => { const bo = M.beoordeling(p, o); return h('tr', { class: p.status === 'hersteld' ? 'hersteld' : '' }, h('td', String(p.nr)), h('td', p.ruimte), h('td', p.omschrijving), h('td', h('span.badge', { class: 'u-' + p.urgentie }, p.urgentie)),
          h('td', herstel ? (bo === 'hersteld' ? 'Hersteld (paraaf)' : M.isNagekomen(p) && p.geconstateerd.t >= o.faseStart.herstel ? 'Nagekomen' : 'Nog open') : p.status === 'hersteld' ? 'Hersteld' : 'Open')); }))),
      termijnHint,
      h('p.verklaring', verklaring)),
    h('section.kaart', { class: ctl.blokkades.length ? 'gedimd' : '' }, h('h2', '3. Ondertekenen'), plaatsDatum(st, zetTermijn),
      h('div.tekenvakken', vakG.el, vakN.el),
      herstel ? h('p.hint', 'De handtekening van de opdrachtnemer is bij de herstelcontrole niet verplicht.') : null,
      knop));
  return { kruimels, inhoud };
}

/* ===== Gezamenlijk (verzamel-PV) ===== */
const selectie = { sleutel: '', ids: new Set() };
export function verzamelScherm(niveau, id) {
  const blok = niveau === 'blok' ? get('blokken', id) : null;
  const c = blok ? get('complexen', blok.complexId) : get('complexen', id); if (!c) return null;
  const kruimels = [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: `${c.nummer} ${c.naam}`.trim(), hash: route.complex(c.id) }].concat(blok ? [{ tekst: `Blok ${blok.naam}`, hash: route.blok(blok.id) }] : [], [{ tekst: 'Gezamenlijk ondertekenen' }]);
  const objecten = blok ? objectenVanBlok(blok.id) : objectenVanComplex(c.id);
  const sleutel = niveau + id;
  const rijen = objecten.filter(o => o.fase === 'oplever').map(o => {
    const b = get('blokken', o.blokId), ctl = M.controles({ config: S.config, complex: c, object: o, punten: puntenVan(o.id), blokPunten: objectenVanBlok(b.id).flatMap(x => puntenVan(x.id)), blokObjecten: objectenVanBlok(b.id) });
    const eigen = M.PARTIJ_VELDEN.filter(([k]) => String(o.partijen[k] || '').trim() && o.partijen[k].trim() !== String(c.standaard[k] || '').trim()).map(([, l]) => l.toLowerCase());
    const reden = ctl.blokkades.map(x => x.tekst).concat(eigen.length ? [`Eigen ${eigen.join(' en ')} op dit object: onderteken het los`] : []);
    return { o, b, ctl, reden, code: reden.length ? 'kan-niet' : ctl.waarschuwingen.length ? 'aandacht' : 'klaar' };
  });
  if (selectie.sleutel !== sleutel) { selectie.sleutel = sleutel; selectie.ids = new Set(rijen.filter(r => r.code === 'klaar').map(r => r.o.id)); }
  for (const id of Array.from(selectie.ids)) if (!rijen.some(r => r.o.id === id && r.code !== 'kan-niet')) selectie.ids.delete(id);
  const overig = objecten.length - rijen.length;
  const mist = M.PARTIJ_VELDEN.filter(([k]) => !String(c.standaard[k] || '').trim()).map(([, l]) => l.toLowerCase());
  const st = { plaats: S.config.organisatie.plaats, datum: M.vandaag() };
  const vakG = tekenvak('Opdrachtgever', c.standaard.vertOpdrachtgever), vakN = tekenvak('Opdrachtnemer', c.standaard.vertOpdrachtnemer);
  const knop = /** @type {HTMLButtonElement} */ (h('button.knop.groot', { type: 'button' }));
  const teller = h('span');
  const bijwerken = () => {
    const n = selectie.ids.size;
    knop.disabled = !n || !!mist.length || vakG.leeg() || vakN.leeg();
    knop.textContent = n ? `Ondertekenen en ${n} object(en) vastleggen` : 'Vink eerst objecten aan';
    teller.textContent = `${n} van ${rijen.filter(r => r.code !== 'kan-niet').length} aangevinkt`;
  };
  vakG.opWijzig(bijwerken); vakN.opWijzig(bijwerken);

  const rij = r => {
    const kan = r.code !== 'kan-niet';
    const el = h('button.vz-rij', { type: 'button', class: r.code + (selectie.ids.has(r.o.id) ? ' aan' : ''), disabled: !kan, onclick: () => { selectie.ids.has(r.o.id) ? selectie.ids.delete(r.o.id) : selectie.ids.add(r.o.id); el.classList.toggle('aan', selectie.ids.has(r.o.id)); bijwerken(); } },
      h('span.box', ICOON.vink()),
      h('div.rij-hoofd', h('div.rij-titel', r.o.adres), h('div.rij-sub', (niveau === 'complex' ? `Blok ${r.b.naam} · ` : '') + r.o.type),
        r.reden.length ? h('div.vz-reden.rood', r.reden.join(' · ')) : r.ctl.waarschuwingen.length ? h('div.vz-reden', r.ctl.waarschuwingen.map(w => w.tekst).join(' · ')) : null),
      urgBadges(r.ctl.tellers));
    return el;
  };
  const groep = (titel, hint, lijst) => lijst.length ? h('section.vz-groep', h('h3', `${titel} (${lijst.length})`), hint ? h('p.hint', hint) : null,
    h('div.lijst', lijst.map(rij))) : null;

  knop.onclick = async () => {
    const gekozen = rijen.filter(r => selectie.ids.has(r.o.id));
    if (!gekozen.length) return;
    const lijst = gekozen.slice(0, 8).map(r => '• ' + r.o.adres).join('\n') + (gekozen.length > 8 ? `\n… en nog ${gekozen.length - 8}` : '');
    if (!await bevestig(`${gekozen.length} object(en) ondertekenen?`, `Eén proces-verbaal met de volledige inhoud per object, getekend door beide partijen:\n${lijst}`, 'Ondertekenen')) return;
    knop.disabled = true; knop.textContent = 'Verzamel-proces-verbaal wordt gemaakt…';
    try {
      const handtekeningen = { Opdrachtgever: await vakG.png(), Opdrachtnemer: await vakN.png() };
      const aandacht = Object.fromEntries(gekozen.map(r => [r.o.id, r.ctl.waarschuwingen.map(w => w.tekst)]));
      const doc = await ondertekenVerzamel({ complex: c, blok, objecten: gekozen.map(r => r.o), plaats: st.plaats.trim(), datum: st.datum,
        namen: { opdrachtgever: c.standaard.vertOpdrachtgever, opdrachtnemer: c.standaard.vertOpdrachtnemer }, handtekeningen, aandacht });
      selectie.sleutel = '';
      ga(route.document(doc.id));
      await afleveren(doc);
    } catch (e) { console.error(e); toast('Vastleggen mislukt: ' + (e && e.message), 6000); bijwerken(); }
  };
  bijwerken();

  const inhoud = h('div.tekenen',
    h('h1', 'Gezamenlijk ondertekenen — ' + (blok ? `blok ${blok.naam}` : `complex ${c.nummer}`)),
    h('p.hint', 'Beide partijen tekenen één keer. Er ontstaat één proces-verbaal waarin per object de volledige lijst met tekortkomingen, de meterstanden en de overige zaken staan; de handtekeningen gelden voor dat hele document.'),
    mist.length ? melding('rood', `Vul bij Complex instellingen in: ${mist.join(', ')}`, 'Bij gezamenlijk ondertekenen gelden de standaardpartijen van het complex.', h('a.knop.licht.klein', { href: route.complex(c.id) }, 'Naar het complex')) : null,
    h('section.kaart', h('div.titelrij', h('h2', '1. Objecten'), teller),
      groep('Klaar om te ondertekenen', '', rijen.filter(r => r.code === 'klaar')),
      groep('Met aandachtspunten', 'Staan standaard uit. Vink alleen aan als beide partijen ermee akkoord zijn; de aandachtspunten komen in het proces-verbaal.', rijen.filter(r => r.code === 'aandacht')),
      groep('Kan niet mee', '', rijen.filter(r => r.code === 'kan-niet')),
      !rijen.length ? h('p.hint', 'Er zijn geen objecten waarvan de oplevering is gestart.') : null,
      overig ? h('p.hint', `${overig} object(en) in een andere fase (niet gestart, vooropname, herstel of gereed) tellen hier niet mee.`) : null),
    h('section.kaart', h('h2', '2. Ondertekenen'), plaatsDatum(st), h('div.tekenvakken', vakG.el, vakN.el), knop));
  return { kruimels, inhoud };
}
export { blokkenVan };
