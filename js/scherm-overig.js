// @ts-check
/* Instellingen (configuratie als data) en het documentscherm (bevroren PDF, kenmerken, echtheidscontrole) */
import { h, toast, bevestig, leverBestand, kiesBestand, meld, ICOON } from './ui.js';
import { S, bewaarConfig, get } from './staat.js';
import { STANDAARD_CONFIG, APP_VERSIE } from './config.js';
import * as M from './model.js';
import { route, ververs } from './nav.js';
import { pdfVan, controleerBestand } from './documenten.js';
import { melding } from './stukjes.js';
import { opslagInfo } from './backup.js';

/* ===== Instellingen ===== */
export function instellingenScherm() {
  const c = structuredClone(S.config);
  const lijstVeld = (label, waarden, hint, opslaan) => h('label.veld', h('span.label', label), h('textarea.invoer.mono', { rows: Math.min(14, Math.max(4, waarden.length + 1)), value: waarden.join('\n'), oninput: e => opslaan(e.target.value.split('\n').map(x => x.trim()).filter(Boolean)) }), hint ? h('span.hint', hint) : null);
  const tekstVeld = (label, waarde, opslaan, opt = {}) => h('label.veld', h('span.label', label), opt.lang ? h('textarea.invoer', { rows: opt.lang, value: waarde, oninput: e => opslaan(e.target.value) }) : h('input.invoer', { value: waarde, inputmode: opt.getal ? 'numeric' : null, oninput: e => opslaan(e.target.value) }), opt.hint ? h('span.hint', opt.hint) : null);
  const getal = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; };

  const inhoud = h('div.instellingen',
    h('h1', 'Instellingen'),
    h('p.hint', 'Alles wat per organisatie of project verschilt staat hier, niet in de code. Wijzigingen gelden voor nieuwe documenten; vastgelegde documenten veranderen nooit.'),
    h('section.kaart', h('h2', 'Opdrachtgever'), h('div.velden.twee',
      tekstVeld('Naam', c.organisatie.naam, v => { c.organisatie.naam = v; }), tekstVeld('Adres', c.organisatie.adres, v => { c.organisatie.adres = v; }),
      tekstVeld('Postbus / postcode', c.organisatie.postbus, v => { c.organisatie.postbus = v; }), tekstVeld('Standaard plaats van ondertekening', c.organisatie.plaats, v => { c.organisatie.plaats = v; }))),
    h('section.kaart', h('h2', 'Urgentieklassen'),
      c.urgenties.map(u => h('div.urg-instelling', h('h3', h('span.badge', { class: 'u-' + u.code }, u.code)), h('div.velden.twee',
        tekstVeld('Titel', u.titel, v => { u.titel = v; }), tekstVeld('Uitleg', u.uitleg, v => { u.uitleg = v; }),
        tekstVeld('Maximaal open per woning', u.limietObject ?? '', v => { u.limietObject = getal(v); }, { getal: true, hint: 'Leeg = geen waarschuwing' }),
        tekstVeld('Maximaal open per blok', u.limietBlok ?? '', v => { u.limietBlok = getal(v); }, { getal: true, hint: 'Leeg = geen waarschuwing' })),
        h('button.vink', { type: 'button', class: u.blokkeertOplevering ? 'aan' : '', onclick: e => { u.blokkeertOplevering = !u.blokkeertOplevering; e.currentTarget.classList.toggle('aan', u.blokkeertOplevering); } }, h('span.box', ICOON.vink()), 'Een open punt blokkeert het ondertekenen van de oplevering')))),
    h('section.kaart', h('h2', 'Termijn en teksten'),
      tekstVeld('Hersteltermijn (werkdagen)', String(c.herstelTermijnWerkdagen), v => { c.herstelTermijnWerkdagen = getal(v) ?? 10; }, { getal: true, hint: 'Feestdagen worden niet overgeslagen.' }),
      tekstVeld('Verklaring bij de oplevering', c.teksten.verklaringOplevering, v => { c.teksten.verklaringOplevering = v; }, { lang: 6, hint: '{termijn} wordt vervangen door het aantal werkdagen.' }),
      tekstVeld('Verklaring bij de herstelcontrole', c.teksten.verklaringHerstel, v => { c.teksten.verklaringHerstel = v; }, { lang: 4 })),
    h('section.kaart', h('h2', 'Lijsten'),
      lijstVeld('Ruimtes (looproute, één per regel)', c.ruimtes, 'De volgorde bepaalt de groepering van de punten.', v => { c.ruimtes = v; }),
      lijstVeld('Snelkeuzes omschrijving', c.omschrijvingen, 'Eerder gebruikte omschrijvingen in het complex komen er vanzelf bij.', v => { c.omschrijvingen = v; }),
      lijstVeld('Objecttypen', c.objectTypes, '', v => { c.objectTypes = v.length ? v : STANDAARD_CONFIG.objectTypes; }),
      lijstVeld('Meters (label | optioneel)', c.meters.map(m => m.label + (m.optioneel ? ' | optioneel' : '')), 'Zet "| optioneel" achter een meter die niet overal is (zoals gas).', v => {
        c.meters = v.map(r => { const [label, opt] = r.split('|').map(x => x.trim()); const bestaand = S.config.meters.find(m => m.label.toLowerCase() === label.toLowerCase()); return { key: bestaand ? bestaand.key : 'm_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, optioneel: /^opt/i.test(opt || '') }; });
      }),
      lijstVeld('Overige zaken (label | aantal, jn of jnn)', c.overigeZaken.map(z => `${z.label} | ${z.soort}`), 'jn = ja/nee, jnn = ja/nee/niet van toepassing, aantal = getal.', v => {
        c.overigeZaken = v.map(r => { const [label, soort] = r.split('|').map(x => x.trim()); const bestaand = S.config.overigeZaken.find(z => z.label.toLowerCase() === label.toLowerCase()); return { key: bestaand ? bestaand.key : 'z_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, soort: /** @type {any} */ (['aantal', 'jn', 'jnn'].includes(soort) ? soort : 'jnn') }; });
      })),
    h('div.knoprij',
      h('button.knop.licht', { type: 'button', onclick: async () => { if (await bevestig('Standaard herstellen?', 'Alle instellingen gaan terug naar de standaard van de app.', 'Herstellen', true)) { await bewaarConfig(structuredClone(STANDAARD_CONFIG)); ververs(); } } }, 'Standaard herstellen')),
    h('section.kaart', h('h2', 'Opslag op dit apparaat'), opslagInfo()),
    h('p.hint', `Opleverinspectie ${APP_VERSIE}`));
  const balk = h('div.actiebalk', h('button.knop.volgende', { type: 'button', onclick: async () => { await bewaarConfig(c); toast('Instellingen opgeslagen'); ververs(); } }, ICOON.vink(), 'Instellingen opslaan'));
  return { kruimels: [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: 'Instellingen' }], inhoud, balk };
}

/* ===== Document ===== */
export function documentScherm(id) {
  const d = S.documenten.get(id); if (!d) return null;
  const c = get('complexen', d.complexId) || { nummer: '?', naam: '', id: '' };
  const vervangers = Array.from(S.documenten.values()).filter(x => x.vervangt === d.id);
  const vervangenDoor = d.objectIds.length === 1 ? vervangers[0] : null;
  const deels = d.objectIds.length > 1 && vervangers.length ? vervangers : [];
  const vervangt = d.vervangt ? S.documenten.get(d.vervangt) : null;
  const objecten = d.objectIds.map(oid => get('objecten', oid)).filter(Boolean);
  const rij = (l, v) => h('div.kv', h('dt', l), h('dd', v));
  const inhoud = h('div.document',
    h('h1', d.titel),
    vervangenDoor ? melding('geel', 'Dit document is vervangen', `Door ${vervangenDoor.titel} van ${M.fmtDatum(vervangenDoor.datum)}. Het blijft ongewijzigd bewaard.`, h('a.knop.licht.klein', { href: route.document(vervangenDoor.id) }, 'Openen')) : null,
    deels.length ? melding('geel', `Voor ${deels.length} van de ${d.objectIds.length} objecten vervangen door een herziening`, deels.map(x => `${(get('objecten', x.objectIds[0]) || {}).adres}: ${x.titel} van ${M.fmtDatum(x.datum)}`).join(' · ') + '. Voor de andere objecten blijft dit document geldig; het blijft ongewijzigd bewaard.') : null,
    vervangt ? melding('blauw', 'Herziening', `Vervangt ${vervangt.titel} van ${M.fmtDatum(vervangt.datum)}.`, h('a.knop.licht.klein', { href: route.document(vervangt.id) }, 'Openen')) : null,
    h('div.knoprij', h('button.knop', { type: 'button', onclick: async () => { const b = await pdfVan(d); if (!b) return toast('Bestand niet gevonden in de opslag', 4000); leverBestand(b, d.bestandsnaam, d.titel); } }, ICOON.delen(), 'PDF openen of delen'),
      h('button.knop.licht', { type: 'button', onclick: async () => {
        const f = await kiesBestand('application/pdf,.pdf'); if (!f) return;
        const ok = await controleerBestand(d, f);
        meld(ok ? 'Echt' : 'Niet hetzelfde bestand', ok ? `"${f.name}" is exact het vastgelegde document (SHA-256 gelijk).` : `"${f.name}" wijkt af van het vastgelegde document. Het kan een ander document zijn, of het bestand is na het vastleggen gewijzigd.`);
      } }, 'Controleer een PDF…')),
    h('section.kaart', h('dl.kvs',
      rij('Soort', { vooropname: 'Vooropname (vastgelegd, niet ondertekend)', oplevering: 'Oplevering', herstel: 'Herstelcontrole', verzamel: 'Oplevering — verzamelafronding' }[d.soort]),
      rij('Complex', `${c.nummer} ${c.naam}`.trim()),
      rij('Datum en plaats', `${M.fmtDatum(d.datum)}${d.plaats ? ' · ' + d.plaats : ''}`),
      rij('Ondertekend door', d.ondertekenaars.length ? d.ondertekenaars.map(o => `${o.rol}: ${o.naam || '—'}${o.getekend ? '' : ' (niet getekend)'}`).join('\n') : '—'),
      rij('Vastgelegd op', new Date(d.gemaakt).toLocaleString('nl-NL')),
      rij('Bestand', `${d.bestandsnaam} · ${(d.bestandGrootte / 1048576).toFixed(1).replace('.', ',')} MB`),
      rij('Inhoudskenmerk', h('code', d.inhoudKenmerk)),
      rij('SHA-256 van de PDF', h('code', d.sha256)))),
    h('section.kaart', h('h2', `Objecten (${objecten.length})`), h('div.lijst.compact', objecten.map(o => h('a.rij.klein', { href: route.object(o.id) }, h('div.rij-hoofd', h('div.rij-titel', o.adres), h('div.rij-sub', `Blok ${(get('blokken', o.blokId) || {}).naam}`)), h('span.chev', ICOON.verder()))))),
    h('p.hint', 'Het inhoudskenmerk staat onderaan elke pagina van de PDF. De SHA-256 van het bestand bewijst dat een PDF exact het vastgelegde document is.'));
  return { kruimels: [{ tekst: 'Complexen', hash: route.complexen() }, { tekst: `${c.nummer} ${c.naam}`.trim(), hash: route.complex(c.id) }, { tekst: 'Document' }], inhoud };
}
