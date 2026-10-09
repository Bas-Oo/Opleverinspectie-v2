// @ts-check
/* Tabbladen Afronden en Documenten van het objectscherm.
   Afronden volgt versie 1 (aandachtspunten, plaats en datum, twee handtekeningvakken, PDF's, eerdere versies, exporteren),
   met de regels van versie 2: ondertekenen bevriest het proces-verbaal één keer, met inhoudskenmerk, en de herstelcontrole
   wordt na de oplevering apart getekend. */
import { h, toast, bevestig, formulier, leverBestand } from './ui.js';
import { S, bewaar, objectenVanBlok, puntenVan } from './staat.js';
import * as M from './model.js';
import { ga, route, ververs } from './nav.js';
import { urgBadges, melding, histRij } from './stukjes.js';
import { tekenvak } from './handtekening.js';
import { onderteken, pdfVan } from './documenten.js';
import { exportTekortkomingen } from './excel.js';
import { spoel } from './store.js';
import { pdfKnop } from './scherm-overzicht.js';

/** Welk tabblad hoort bij een controle (model.js noemt de onderdelen van versie 2) */
const tabVoor = (o, naar) => ({ punten: o.fase === 'herstel' ? 'herstel' : 'oplever', gegevens: 'gegevens', meters: 'meter', overig: 'overig', documenten: 'documenten' })[naar] || 'gegevens';

/** Lijst met rode (blokkeert) en gele (waarschuwing) aandachtspunten; elke regel is een link naar het tabblad waar je het oplost */
function aandachtsBanners(o, ctl) {
  const regels = lijst => h('ul', lijst.map(x => h('li', h('a', { href: route.object(o.id, tabVoor(o, x.naar)) }, x.tekst))));
  return [
    ctl.blokkades.length ? h('div.banner.rood', { style: { display: 'block' } }, 'Ondertekenen kan nog niet', h('small', 'Los eerst deze punten op; tik erop om er direct heen te gaan.'), regels(ctl.blokkades)) : null,
    ctl.waarschuwingen.length ? h('div.banner.geel', { style: { display: 'block' } }, '⚠️ Let op vóór het ondertekenen', h('small', 'Deze punten komen in het proces-verbaal.'), regels(ctl.waarschuwingen)) : null
  ];
}

/** Ondertekenen van de oplevering of de herstelcontrole van één object */
function tekenDeel(ctx, soort) {
  const { o, c, b, punten } = ctx;
  const herstel = soort === 'herstel';
  const ctl = M.controles({ config: S.config, complex: c, object: o, punten, blokPunten: objectenVanBlok(b.id).flatMap(x => puntenVan(x.id)), blokObjecten: objectenVanBlok(b.id) });
  const pj = M.partijen(o, c);
  const st = { plaats: S.config.organisatie.plaats, datum: M.vandaag() };
  const vakG = tekenvak('Opdrachtgever', pj.vertOpdrachtgever), vakN = tekenvak('Opdrachtnemer', pj.vertOpdrachtnemer);
  const knop = /** @type {HTMLButtonElement} */ (h('button.knop.groen.breed', { type: 'button' }));
  const bijwerken = () => {
    const mist = vakG.leeg() || (!herstel && vakN.leeg());
    knop.disabled = !!ctl.blokkades.length || mist;
    knop.textContent = ctl.blokkades.length ? 'Los eerst de rode punten op' : mist ? (herstel ? 'Opdrachtgever tekent eerst' : 'Beide partijen tekenen eerst')
      : herstel ? 'Herstelcontrole ondertekenen en vastleggen' : 'Ondertekenen en oplevering afronden';
  };
  vakG.opWijzig(bijwerken); vakN.opWijzig(bijwerken); bijwerken();
  const termijn = h('p.hint', { style: { margin: '0 0 12px' } });
  const zetTermijn = () => { termijn.textContent = herstel || !st.datum ? '' : `De opdrachtnemer herstelt de open punten uiterlijk ${M.fmtDatum(M.telWerkdagen(st.datum, S.config.herstelTermijnWerkdagen))} (${S.config.herstelTermijnWerkdagen} werkdagen na ondertekening).`; };
  zetTermijn();

  knop.onclick = async () => {
    if (ctl.blokkades.length) return;
    if (!st.plaats.trim()) return toast('Vul de plaats van ondertekening in', 3500);
    if (!st.datum) return toast('Vul de datum in');
    const blijftOpen = punten.filter(p => M.levend(p) && p.status === 'open').length;
    const tekst = herstel
      ? `Het proces-verbaal van de herstelcontrole wordt gemaakt en vastgelegd. ${blijftOpen ? `${blijftOpen} punt(en) blijven open; die gaan naar een volgende herstelronde.` : 'Alle punten zijn hersteld: het object is daarna gereed.'}`
      : 'Met deze handtekeningen is de oplevering akkoord en definitief afgerond. Het proces-verbaal wordt één keer gemaakt en vastgelegd; het verandert daarna nooit meer. Wordt later toch iets gevonden, dan leg je het vast als nagekomen punt in de herstelcontrole, of heropen je de afronding (de herziening vervangt dan dit document zonder het te wijzigen).';
    if (!await bevestig(herstel ? 'Herstelcontrole vastleggen?' : 'Oplevering definitief afronden?', tekst, herstel ? 'Vastleggen' : 'Akkoord, afronden')) return;
    knop.disabled = true; knop.textContent = 'Proces-verbaal wordt gemaakt…';
    try {
      await spoel();   // eerst alles wat nog in de wachtrij staat (bijv. meterstanden) wegschrijven
      const handtekeningen = { Opdrachtgever: await vakG.png() };
      if (!vakN.leeg()) handtekeningen.Opdrachtnemer = await vakN.png();
      const doc = await onderteken({ soort: herstel ? 'herstel' : 'oplevering', object: o, plaats: st.plaats.trim(), datum: st.datum, namen: { opdrachtgever: pj.vertOpdrachtgever, opdrachtnemer: pj.vertOpdrachtnemer }, handtekeningen });
      toast(herstel ? 'Herstelcontrole vastgelegd' : o.herziening ? `Herziening ${o.herziening} afgerond` : 'Oplevering afgerond', 2500);
      ververs();
      const pdf = await pdfVan(doc);
      if (pdf) await leverBestand(pdf, doc.bestandsnaam, 'Ondertekend en vastgelegd', `kenmerk ${doc.inhoudKenmerk.slice(0, 16).toUpperCase()}`);
    } catch (e) { console.error(e); toast('Vastleggen mislukt: ' + (e && e.message), 6000); knop.disabled = false; bijwerken(); }
  };

  return h('div',
    h('p', { style: { margin: '0 0 12px', color: 'var(--grijs)', fontSize: '.9rem' } }, herstel
      ? 'Onderteken als opdrachtgever met vinger of Apple Pencil. De handtekening van de opdrachtnemer is bij de herstelcontrole niet verplicht.'
      : 'Onderteken met vinger of Apple Pencil. Na ondertekening is de oplevering definitief afgerond en ligt het proces-verbaal vast.'),
    h('div.velden',
      h('label.veld', h('span.label', 'Opgemaakt en ondertekend te'), h('input.invoer', { value: st.plaats, autocomplete: 'off', oninput: e => { st.plaats = e.target.value; } })),
      h('label.veld', h('span.label', 'Datum'), h('input.invoer', { type: 'date', value: st.datum, max: M.vandaag(), onchange: e => { st.datum = e.target.value; zetTermijn(); } }))),
    aandachtsBanners(o, ctl),
    termijn,
    h('div.hand-vakken', vakG.el, vakN.el),
    knop,
    h('p.verklaring', herstel ? S.config.teksten.verklaringHerstel : S.config.teksten.verklaringOplevering.replace('{termijn}', String(S.config.herstelTermijnWerkdagen))));
}

/** Afronding heropenen (versie 1.7) = herziening van de oplevering (versie 2) */
async function heropen(o, punten) {
  const r = await formulier({ titel: 'Afronding heropenen?', tekst: 'Het ondertekende proces-verbaal blijft ongewijzigd bewaard; je vindt het terug onder Eerdere versies.\n\nDaarna is de oplevering weer te wijzigen. Opdrachtgever en opdrachtnemer tekenen de herziening opnieuw; die vervangt het eerdere proces-verbaal.',
    ok: 'Heropenen', velden: [{ key: 'reden', label: 'Reden van heropenen', soort: 'lang', rijen: 3, verplicht: true, placeholder: 'bijv. punt in de badkamer vergeten' }] });
  if (!r) return;
  try { M.startHerziening(o, punten, r.reden); } catch (e) { return toast(String(e && e.message), 5000); }
  await bewaar([['objecten', o]]);
  toast(`Heropend: herziening ${o.herziening}. Het eerdere proces-verbaal is bewaard.`, 3500);
  ga(route.object(o.id, 'oplever'), { vervang: true });
}

const docSub = d => `${M.fmtDatum(d.datum)}${d.plaats ? ' · ' + d.plaats : ''} · ${d.soort === 'vooropname' ? 'vastgelegd, niet ondertekend' : 'ondertekend door ' + (d.ondertekenaars.filter(x => x.getekend).map(x => x.naam || x.rol).join(' en ') || '—')} · kenmerk ${d.inhoudKenmerk.slice(0, 8).toUpperCase()}`;
const vervangersVan = d => Array.from(S.documenten.values()).filter(x => x.vervangt === d.id);
const docRegel = (d, opm = null) => histRij(d.titel, docSub(d), opm, pdfKnop(d), h('a.knop.licht.klein', { href: route.document(d.id), style: { textDecoration: 'none' } }, 'Details'));

/* ===== Tab: afronden ===== */
export function tabAfronden(ctx) {
  const { o, c, b, punten, docs } = ctx;
  const box = h('div');
  const t = M.tellers(punten, o);
  const opl = S.documenten.get(o.opleverDocId);

  /* Proces-verbaal oplevering */
  const kaart = h('div.kaart', h('div.afr-kop', h('h2', 'Proces-verbaal oplevering' + (o.herziening ? ` — herziening ${o.herziening}` : '')), urgBadges(t)));
  if (o.fase === 'voor') kaart.appendChild(melding('blauw', 'Ondertekenen gebeurt bij de oplevering', 'Een vooropname wordt niet ondertekend of geparafeerd. Start de oplevering op het tabblad Oplevering; daarna onderteken je hier.'));
  else if (o.fase === 'oplever') {
    if (o.herziening) { const hz = o.herzieningen[o.herzieningen.length - 1]; kaart.appendChild(melding('geel', `Herziening ${o.herziening}`, `Reden: ${hz ? hz.reden : ''}. Het eerder ondertekende proces-verbaal staat onder Eerdere versies. Beide partijen tekenen opnieuw.`)); }
    kaart.appendChild(tekenDeel(ctx, 'oplevering'));
  } else {
    kaart.appendChild(h('p', { style: { margin: '0 0 6px', color: 'var(--grijs)', fontSize: '.9rem' } }, 'Door beide partijen ondertekend. Het proces-verbaal ligt vast: downloaden levert altijd exact hetzelfde bestand.'));
    if (opl) kaart.appendChild(docRegel(opl));
    const hz = M.herzieningMogelijk(o, punten);
    kaart.appendChild(h('div', { style: { marginTop: '18px', borderTop: '1px solid var(--lijn)', paddingTop: '12px' } },
      h('p', { style: { margin: '0 0 6px', color: 'var(--grijs)', fontSize: '.9rem' } }, hz.kan
        ? 'Toch een punt vergeten? Heropen de afronding. Dit proces-verbaal blijft ongewijzigd bewaard; daarna tekenen beide partijen de herziening opnieuw.'
        : 'Toch een punt vergeten? ' + hz.reden.replace('Leg het vergeten punt', 'Leg het').replace('daar vast', 'vast op het tabblad Herstel') ),
      hz.kan ? h('div.knoprij', h('button.knop.licht', { type: 'button', onclick: () => heropen(o, punten) }, 'Afronding heropenen…')) : null));
  }
  box.appendChild(kaart);

  /* Herstelcontrole */
  const herstelDocs = docs.filter(d => d.soort === 'herstel');
  if (o.fase === 'herstel') box.appendChild(h('div.kaart', h('div.afr-kop', h('h2', `Herstelcontrole${o.herstelRonde ? ' ronde ' + (o.herstelRonde + 1) : ''}`)),
    herstelDocs.length ? h('div', { style: { marginBottom: '10px' } }, herstelDocs.map(d => docRegel(d))) : null,
    tekenDeel(ctx, 'herstel')));
  else if (o.fase === 'gereed') box.appendChild(h('div.kaart', h('h2', 'Herstelcontrole'), h('p', { style: { margin: '0 0 6px', color: 'var(--grijs)', fontSize: '.9rem' } }, 'Alle punten zijn hersteld; het object is gereed.'), herstelDocs.map(d => docRegel(d))));

  /* Proces-verbaal vooropname */
  const voorDoc = docs.find(d => d.soort === 'vooropname');
  const kv = h('div.kaart', h('div.afr-kop', h('h2', 'Proces-verbaal vooropname')));
  if (voorDoc) kv.append(h('p', { style: { margin: '0 0 6px', color: 'var(--grijs)', fontSize: '.9rem' } }, 'Vastgelegd bij het starten van de oplevering. Wordt niet ondertekend.'), docRegel(voorDoc));
  else {
    kv.appendChild(h('p', { style: { margin: '0 0 10px', color: 'var(--grijs)', fontSize: '.9rem' } }, o.fase === 'voor' ? 'Wordt niet ondertekend. Het proces-verbaal wordt vastgelegd zodra je de oplevering start; een tussentijdse lijst maak je hieronder bij Tekortkomingen exporteren.' : 'De oplevering is gestart zonder vooropnamepunten.'));
    if (o.fase === 'voor') for (const w of M.controles({ config: S.config, complex: c, object: o, punten }).waarschuwingen) kv.appendChild(h('div.banner.geel', { style: { marginBottom: '10px' } }, `⚠️ ${w.tekst}.`));
  }
  box.appendChild(kv);

  /* Eerdere versies: processen-verbaal van oplevering die door een herziening zijn vervangen */
  const vervangen = docs.filter(d => (d.soort === 'oplevering' || d.soort === 'verzamel') && vervangersVan(d).some(x => x.objectIds.includes(o.id)));
  if (vervangen.length) box.appendChild(h('div.kaart', h('h2', 'Eerdere versies'),
    h('p', { style: { margin: '0 0 6px', color: 'var(--grijs)', fontSize: '.9rem' } }, 'Ondertekende processen-verbaal van vóór een heropening. Ze zijn bevroren en kunnen niet worden gewijzigd.'),
    vervangen.slice().reverse().map(d => { const v = vervangersVan(d).find(x => x.objectIds.includes(o.id)); const hz = (o.herzieningen || []).find(x => x.vervangt === d.id);
      return docRegel(d, h('div.vz-reden', `Vervangen door ${v ? v.titel.replace('Proces-verbaal van oplevering — ', '') : 'een herziening'}${hz ? '. Reden: ' + hz.reden : ''}`)); })));

  box.appendChild(exportKaart([['Deze woning', { complex: c, blok: b, object: o }], [`Blok ${b.naam}`, { complex: c, blok: b }], [`Heel complex ${c.nummer}`, { complex: c }]]));
  return box;
}

/* ===== Tekortkomingen exporteren (versie 1.5): eerst PDF of Excel kiezen, dan het bereik ===== */
let exportFormaat = 'pdf';   // keuze blijft staan zolang de app open is
export function exportKaart(bereiken, titel = 'Tekortkomingen exporteren') {
  const kies = h('div.keuze', { style: { marginTop: '10px', maxWidth: '320px' } },
    [['pdf', 'PDF'], ['excel', 'Excel']].map(([f, l]) => h('button', { type: 'button', class: exportFormaat === f ? 'aan' : '', dataset: { f }, onclick: () => { exportFormaat = f; for (const x of kies.children) x.classList.toggle('aan', /** @type {HTMLElement} */ (x).dataset.f === f); } }, l)));
  return h('div.kaart', h('h3', titel), kies,
    h('div.knoprij', bereiken.map(([label, sel]) => h('button.knop.licht.klein', { type: 'button', style: { flex: '0 1 auto' }, onclick: async e => {
      const bt = /** @type {HTMLButtonElement} */ (e.currentTarget); bt.disabled = true; bt.textContent = exportFormaat === 'pdf' ? 'PDF wordt gemaakt…' : 'Excel wordt gemaakt…';
      try { await exportTekortkomingen(exportFormaat, sel); } finally { bt.disabled = false; bt.textContent = label; }
    } }, label))));
}

/* ===== Tab: documenten ===== */
export function tabDocumenten(ctx) {
  const { docs, o } = ctx;
  if (!docs.length) return h('div', h('div.kaart', h('div.leeg', h('strong', 'Nog geen documenten'), 'Bij "Oplevering starten" wordt de vooropname vastgelegd; bij ondertekenen ontstaat het proces-verbaal. Een vastgelegd document verandert nooit meer.')));
  return h('div', h('div.kaart', h('h2', `Vastgelegde documenten (${docs.length})`), h('div', { style: { marginTop: '6px' } },
    docs.slice().reverse().map(d => { const v = vervangersVan(d).filter(x => x.objectIds.includes(o.id)); return docRegel(d, v.length ? h('div.vz-reden', `Vervangen door ${v.map(x => x.titel.replace('Proces-verbaal van oplevering — ', '')).join(', ')}`) : null); }))),
    h('p.hint', 'Elk document is één keer gemaakt en opgeslagen, met een SHA-256-kenmerk. Downloaden levert altijd exact hetzelfde bestand. Onder Details kun je controleren of een PDF echt is.'));
}
