// @ts-check
/* Blok of complex afronden (versie 1.3): opdrachtgever en opdrachtnemer tekenen één keer voor een reeks objecten.
   Volgens versie 2 ontstaat één verzamel-proces-verbaal met per object de volledige lijst, de meterstanden en de overige zaken;
   de handtekeningen gelden voor dat hele document. */
import { h, toast, bevestig, kies, leverBestand } from './ui.js';
import { S, bewaarLater, get, puntenVan, objectenVanBlok, objectenVanComplex, blokkenVan } from './staat.js';
import * as M from './model.js';
import { ga, route } from './nav.js';
import { melding, urgBadges, titelRij, leegStaat } from './stukjes.js';
import { tekenvak } from './handtekening.js';
import { ondertekenVerzamel, pdfVan } from './documenten.js';
import { exportKaart } from './scherm-afronden.js';
import { spoel } from './store.js';

/* Selectie blijft staan zolang je op hetzelfde verzamelscherm blijft */
let sel = { sleutel: '', ids: new Set(), plaats: '', datum: '' };

export function verzamelScherm(niveau, id) {
  const blok = niveau === 'blok' ? get('blokken', id) : null;
  const c = blok ? get('complexen', blok.complexId) : get('complexen', id); if (!c) return null;
  const kr = [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: `${c.nummer} ${c.naam}`.trim(), hash: route.complex(c.id) }]
    .concat(blok ? [{ tekst: `Blok ${blok.naam}`, hash: route.blok(blok.id) }] : [], [{ tekst: blok ? 'Blok afronden' : 'Complex afronden' }]);
  const objecten = blok ? objectenVanBlok(blok.id) : objectenVanComplex(c.id);
  const sleutel = niveau + '|' + id;
  if (sel.sleutel !== sleutel) sel = { sleutel, ids: new Set(), plaats: S.config.organisatie.plaats, datum: M.vandaag(), nieuw: true };

  /** Kan dit object mee? klaar = standaard aangevinkt; aandacht = bewust aanvinken; blok = niet mogelijk; afgerond = al ondertekend */
  const status = o => {
    const b = get('blokken', o.blokId);
    if (o.fase === 'herstel' || o.fase === 'gereed') return { code: 'afgerond', tekst: `Ondertekend op ${M.fmtDatum(o.opleverDatum)}` };
    if (o.fase === 'voor') return { code: 'blok', tekst: 'Oplevering nog niet gestart' };
    const ctl = M.controles({ config: S.config, complex: c, object: o, punten: puntenVan(o.id), blokPunten: objectenVanBlok(b.id).flatMap(x => puntenVan(x.id)), blokObjecten: objectenVanBlok(b.id) });
    const eigen = M.PARTIJ_VELDEN.filter(([k]) => String(o.partijen[k] || '').trim() && o.partijen[k].trim() !== String(c.standaard[k] || '').trim()).map(([, l]) => l.toLowerCase());
    if (eigen.length) return { code: 'blok', ctl, tekst: `Afwijkende ${eigen.join(' en ')} op dit object; rond deze af op het objectscherm` };
    const blokkades = ctl.blokkades.filter(x => x.naar !== 'gegevens');   // ontbrekende partijen vul je hier boven in
    if (blokkades.length) return { code: 'blok', ctl, tekst: blokkades.map(x => x.tekst).join(' · ') };
    if (ctl.waarschuwingen.length) return { code: 'aandacht', ctl, tekst: ctl.waarschuwingen.map(x => x.tekst).join(' · ') };
    return { code: 'klaar', ctl, tekst: '' };
  };
  const rijen = objecten.map(o => ({ o, b: get('blokken', o.blokId), s: status(o) }));
  if (sel.nieuw) { sel.ids = new Set(rijen.filter(r => r.s.code === 'klaar').map(r => r.o.id)); delete sel.nieuw; }

  /* Partijen: dezelfde velden als de standaardgegevens van het complex; één handtekening hoort bij één naam */
  const partijen = h('div.kaart', h('h3', 'Partijen en ondertekening'),
    h('p.hint', 'Dit zijn de standaardgegevens van het complex. Een wijziging hier geldt dus voor alle objecten van het complex die nog niet zijn afgerond. Objecten met een eigen, afwijkende vertegenwoordiger kunnen niet mee in deze ronde.'),
    h('div.velden', { style: { marginTop: '10px' } }, M.PARTIJ_VELDEN.map(([k, l]) => h('div.veld', h('label', l), h('input.invoer', { value: c.standaard[k] || '', autocomplete: 'off',
      oninput: e => { c.standaard[k] = e.target.value.trim(); bewaarLater('complexen', c); }, onchange: () => { rijen.forEach(r => { r.s = status(r.o); }); tekenLijst(); } })))),
    h('div.velden', h('div.veld', h('label', 'Opgemaakt en ondertekend te'), h('input.invoer', { value: sel.plaats, autocomplete: 'off', oninput: e => { sel.plaats = e.target.value.trim(); } })),
      h('div.veld', h('label', 'Datum'), h('input.invoer', { type: 'date', value: sel.datum, max: M.vandaag(), onchange: e => { sel.datum = e.target.value; } }))));

  const lijstBox = h('div');
  const vakG = tekenvak('Opdrachtgever', c.standaard.vertOpdrachtgever), vakN = tekenvak('Opdrachtnemer', c.standaard.vertOpdrachtnemer);
  const okKnop = /** @type {HTMLButtonElement} */ (h('button.knop.groen.breed', { type: 'button' }));
  const gekozen = () => rijen.filter(r => sel.ids.has(r.o.id) && (r.s.code === 'klaar' || r.s.code === 'aandacht'));
  const knopTekst = () => { const n = gekozen().length; okKnop.disabled = !n; okKnop.textContent = n ? `Ondertekenen en ${n} object(en) afronden` : 'Vink eerst objecten aan'; };
  vakG.opWijzig(knopTekst); vakN.opWijzig(knopTekst);

  /* Knop Alles/Niets voor een set objecten; bij aandachtspunten eerst bevestigen */
  function alleKnop(items, aandacht) {
    const allesAan = items.every(r => sel.ids.has(r.o.id));
    return h('button.knop.licht.klein', { type: 'button', style: { flex: 'none' }, onclick: async e => {
      e.stopPropagation();
      if (allesAan) items.forEach(r => sel.ids.delete(r.o.id));
      else {
        const nieuw = items.filter(r => !sel.ids.has(r.o.id));
        if (aandacht && !await bevestig(`${nieuw.length} object(en) met aandachtspunten aanvinken?`, `Deze objecten hebben openstaande aandachtspunten. Vink ze alleen aan als opdrachtgever en opdrachtnemer daarmee akkoord gaan; de aandachtspunten komen in het verzamel-proces-verbaal.\n\n${nieuw.slice(0, 6).map(r => '• ' + r.o.adres + ': ' + r.s.tekst).join('\n')}${nieuw.length > 6 ? `\n… en nog ${nieuw.length - 6}` : ''}`, 'Aanvinken')) return;
        nieuw.forEach(r => sel.ids.add(r.o.id));
      }
      tekenLijst();
    } }, allesAan ? 'Niets' : 'Alles');
  }
  function rijEl(r, kiesbaar) {
    const aan = kiesbaar && sel.ids.has(r.o.id), t = M.tellers(puntenVan(r.o.id), r.o);
    return h(kiesbaar ? 'button.vz-rij' : 'div.vz-rij', { type: kiesbaar ? 'button' : null, class: (kiesbaar ? '' : 'uit ') + (aan ? 'aan' : ''),
      onclick: kiesbaar ? () => { sel.ids.has(r.o.id) ? sel.ids.delete(r.o.id) : sel.ids.add(r.o.id); tekenLijst(); } : null },
      kiesbaar ? h('span.box', aan ? '✓' : '') : null,
      h('div.rij-hoofd', h('div.rij-titel', r.o.adres), h('div.rij-sub', r.o.type), r.s.tekst ? h('div.vz-reden', r.s.tekst) : null), urgBadges(t));
  }
  function groep(titel, hint, items, kiesbaar, aandacht) {
    if (!items.length) return;
    const kop = h('div.vz-groep', h('div', h('h3', `${titel} (${items.length})`), hint ? h('div.hint', hint) : null));
    if (kiesbaar && items.length > 1) kop.appendChild(alleKnop(items, aandacht));
    lijstBox.appendChild(kop);
    /* Op complexniveau: tussenkop per blok met een eigen Alles-knop */
    const blokken = niveau === 'complex' ? blokkenVan(c.id).filter(bl => items.some(r => r.b.id === bl.id)) : [null];
    for (const bl of blokken) {
      const sub = bl ? items.filter(r => r.b.id === bl.id) : items;
      if (bl) { const bk = h('div.vz-blok', h('span', `Blok ${bl.naam} `, h('span.aantal', `(${sub.length})`))); if (kiesbaar && blokken.length > 1) bk.appendChild(alleKnop(sub, aandacht)); lijstBox.appendChild(bk); }
      lijstBox.appendChild(h('div.lijst', sub.map(r => rijEl(r, kiesbaar))));
    }
  }
  function tekenLijst() {
    lijstBox.replaceChildren();
    const g = gekozen();
    const tot = g.reduce((t, r) => { const x = M.tellers(puntenVan(r.o.id), r.o); t.B += x.B; t.C += x.C; t.ne += x.nietErkend; return t; }, { B: 0, C: 0, ne: 0 });
    lijstBox.appendChild(h('div.samenvatting', h('div.tegel', h('div.n', String(g.length)), h('div.l', `aangevinkt van ${rijen.length}`)),
      h('div.tegel', h('div.n', String(tot.B)), h('div.l', 'open B-punten')), h('div.tegel.C', h('div.n', String(tot.C)), h('div.l', 'open C-punten')),
      h('div.tegel', h('div.n', String(tot.ne)), h('div.l', 'niet erkend'))));
    const metPt = g.filter(r => r.s.code === 'aandacht').length;
    if (metPt) lijstBox.appendChild(melding('geel', `⚠️ ${metPt} aangevinkt object(en) met aandachtspunten`, 'Die aandachtspunten komen in het verzamel-proces-verbaal.'));
    const per = code => rijen.filter(r => r.s.code === code);
    groep('Klaar om af te ronden', '', per('klaar'), true, false);
    groep('Met aandachtspunten', 'Staan standaard uit. Vink alleen aan als beide partijen hiermee akkoord gaan.', per('aandacht'), true, true);
    groep('Kan niet mee in deze ronde', '', per('blok'), false, false);
    const af = per('afgerond');
    if (af.length) lijstBox.appendChild(h('details.uitklap', { style: { marginTop: '18px' } }, h('summary', h('h3', `Al afgerond (${af.length})`)),
      h('div.lijst', { style: { marginTop: '8px' } }, af.map(r => h('div.vz-rij.uit', h('div.rij-hoofd', h('div.rij-titel', r.o.adres), h('div.rij-sub', (niveau === 'complex' ? `Blok ${r.b.naam} · ` : '') + r.s.tekst)), h('span.badge.ok', '✓'))))));
    if (!per('klaar').length && !per('aandacht').length) lijstBox.appendChild(leegStaat('Niets om af te ronden', 'Er zijn geen objecten die in deze ronde kunnen worden ondertekend.'));
    vakG.zetNaam(c.standaard.vertOpdrachtgever || ''); vakN.zetNaam(c.standaard.vertOpdrachtnemer || '');
    knopTekst();
  }
  tekenLijst();

  okKnop.onclick = async () => {
    rijen.forEach(r => { r.s = status(r.o); });
    const aantalGetoond = gekozen().length; tekenLijst();
    const g = gekozen();
    if (!g.length) return toast('Vink eerst objecten aan');
    const mist = M.PARTIJ_VELDEN.filter(([k]) => !String(c.standaard[k] || '').trim()).map(([, l]) => l.toLowerCase());
    if (mist.length) return toast('Vul eerst in: ' + mist.join(', '), 3500);
    if (!String(sel.plaats).trim()) return toast('Vul de plaats van ondertekening in', 3500);
    if (!sel.datum) return toast('Vul de datum in');
    if (vakG.leeg() || vakN.leeg()) return toast('Beide partijen moeten tekenen', 3500);
    if (g.length !== aantalGetoond) return toast('De selectie is gewijzigd; controleer de lijst', 4000);
    const metPt = g.filter(r => r.s.code === 'aandacht').length;
    const adressen = g.slice(0, 8).map(r => '• ' + r.o.adres).join('\n') + (g.length > 8 ? `\n… en nog ${g.length - 8}` : '');
    if (!await bevestig(`${g.length} object(en) definitief afronden?`, `Met deze handtekeningen is de oplevering van deze objecten akkoord en definitief afgerond:\n${adressen}\n\n${metPt ? metPt + ' object(en) hebben aandachtspunten; die komen in het verzamel-proces-verbaal.\n\n' : ''}Er ontstaat één proces-verbaal met per object de volledige inhoud. Daarna ligt het vast en begint per object de herstelcontrole.`, 'Akkoord, afronden')) return;
    okKnop.disabled = true; okKnop.textContent = 'Verzamel-proces-verbaal wordt gemaakt…';
    try {
      await spoel();
      const handtekeningen = { Opdrachtgever: await vakG.png(), Opdrachtnemer: await vakN.png() };
      const aandacht = Object.fromEntries(g.map(r => [r.o.id, r.s.ctl ? r.s.ctl.waarschuwingen.map(w => w.tekst) : []]));
      const doc = await ondertekenVerzamel({ complex: c, blok, objecten: g.map(r => r.o), plaats: String(sel.plaats).trim(), datum: sel.datum,
        namen: { opdrachtgever: c.standaard.vertOpdrachtgever, opdrachtnemer: c.standaard.vertOpdrachtnemer }, handtekeningen, aandacht });
      sel = { sleutel: '', ids: new Set(), plaats: '', datum: '' };
      await ga(blok ? route.blok(blok.id) : route.complex(c.id));   // terug naar het overzicht; daar staat de ronde onder Verzamelafrondingen
      const k = await kies('Oplevering afgerond', `${g.length} object(en) zijn ondertekend en afgerond.\n\nHet verzamel-proces-verbaal is vastgelegd: dat is het document met per object de lijst waarvoor is getekend. Je vindt het later ook onder Verzamelafrondingen.`,
        [{ tekst: 'Later', waarde: null, soort: 'licht' }, { tekst: 'Verzamel-PDF', waarde: 'pdf' }]);
      if (k === 'pdf') { const pdf = await pdfVan(doc); if (pdf) await leverBestand(pdf, doc.bestandsnaam, 'PDF gereed', `kenmerk ${doc.inhoudKenmerk.slice(0, 16).toUpperCase()}`); }
    } catch (e) { console.error(e); toast('Afronden mislukt: ' + (e && e.message), 6000); knopTekst(); }
  };

  const inhoud = h('div',
    titelRij(kr),
    melding('blauw', `Eén keer tekenen voor ${blok ? 'het hele blok' : 'meerdere blokken'}`, 'Vink de objecten aan die worden opgeleverd. Opdrachtgever en opdrachtnemer tekenen onderaan één keer. Er ontstaat één verzamel-proces-verbaal met per object de volledige lijst met tekortkomingen, de meterstanden en de overige zaken; daarna zijn die objecten afgerond en begint de herstelcontrole.'),
    partijen, lijstBox,
    h('div.kaart', { style: { marginTop: '14px' } }, h('h2', { style: { marginBottom: '10px' } }, 'Ondertekenen'), h('div.hand-vakken', vakG.el, vakN.el), okKnop),
    exportKaart([[blok ? `Tekortkomingen blok ${blok.naam}` : 'Tekortkomingen heel complex', blok ? { complex: c, blok } : { complex: c }]]));
  return { kruimels: kr, inhoud, menu: [] };
}
