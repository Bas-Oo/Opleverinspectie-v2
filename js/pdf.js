// @ts-check
/* PDF's. Eén renderer voor alle soorten proces-verbaal; de inhoud komt als vaste momentopname ('inhoud') binnen.
   Tabellen via AutoTable (geen handmatige coördinaten per regel). Foto's worden één voor één geladen en verkleind,
   zodat ook een verzamel-PV met veel foto's op een iPad past. */
import { laadPDF, base64 } from './lader.js';
import { verklein, blobAlsDataURL } from './foto.js';
import { fmtDatum } from './model.js';
import { kortKenmerk } from './sha256.js';

const KLEUR = { blauw: [29, 44, 53], lichtblauw: [140, 186, 226], rood: [181, 44, 68], geel: [240, 180, 0], groen: [142, 165, 84], achtergrond: [240, 251, 255], grijs: [91, 106, 115], lijn: [207, 220, 228], zebra: [246, 250, 252] };
const URG_KLEUR = { A: KLEUR.rood, B: [70, 130, 180], C: [170, 125, 0] };
const W = 210, HPAG = 297, M = 15, BR = W - 2 * M;

/* Het ingebouwde lettertype kent geen emoji en geen Grieks/Cyrillisch: weglaten of vervangen door '?' in plaats van rommel in de PDF */
const TOEGESTAAN = /[\t\n\r -~ -ɏḀ-ỿ -⁯€™←-↓−]/;
export function pdfTekst(s) {
  return Array.from(String(s ?? '')).map(ch => {
    if (TOEGESTAAN.test(ch)) return ch;
    if (/\p{Extended_Pictographic}|️|‍/u.test(ch)) return '';
    const kaal = ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); return TOEGESTAAN.test(kaal) ? kaal : '?';
  }).join('');
}

async function nieuwDoc(titel, org) {
  const jsPDF = await laadPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('RedditSans-Regular.ttf', await base64('fonts/RedditSans-Regular.ttf'));
  doc.addFileToVFS('RedditSans-Bold.ttf', await base64('fonts/RedditSans-Bold.ttf'));
  doc.addFont('RedditSans-Regular.ttf', 'RS', 'normal'); doc.addFont('RedditSans-Bold.ttf', 'RS', 'bold');
  doc.setFont('RS', 'normal'); doc.setTextColor(...KLEUR.blauw);
  doc.setProperties({ title: pdfTekst(titel), author: pdfTekst(org.naam), creator: 'Opleverinspectie' });
  return doc;
}

/** Schrijfhulp rond jsPDF met een cursor (y) */
function schrijver(doc, logo) {
  const s = {
    doc, y: M,
    font(stijl = 'normal', grootte = 9.5, kleur = KLEUR.blauw) { doc.setFont('RS', stijl); doc.setFontSize(grootte); doc.setTextColor(...kleur); },
    tekst(t, x, y, opt) { doc.text(Array.isArray(t) ? t.map(pdfTekst) : pdfTekst(t), x, y, opt || {}); },
    regels(t, breedte) { return doc.splitTextToSize(pdfTekst(t), breedte); },
    nieuwePagina() { doc.addPage(); s.y = M; },
    ruimte(mm) { if (s.y + mm > HPAG - 18) s.nieuwePagina(); },
    kop(titel, regel1, regel2) {
      doc.addImage(logo, 'PNG', M, s.y - 2, 40, 40 * 371 / 800);
      s.font('bold', 15); s.tekst(titel, W - M, s.y + 5, { align: 'right' });
      s.font('normal', 9.5, KLEUR.grijs); if (regel1) s.tekst(regel1, W - M, s.y + 11, { align: 'right' });
      s.font('bold', 12); if (regel2) s.tekst(regel2, W - M, s.y + 17.5, { align: 'right' });
      s.y += 24; doc.setDrawColor(...KLEUR.lichtblauw); doc.setLineWidth(0.6); doc.line(M, s.y, W - M, s.y); s.y += 7; s.font();
    },
    sectie(titel) { s.ruimte(16); s.font('bold', 11, KLEUR.rood); s.tekst(titel, M, s.y); s.y += 5.5; s.font(); },
    alinea(t, grootte = 9.5, kleur = KLEUR.blauw) { s.font('normal', grootte, kleur); const r = s.regels(t, BR); s.ruimte(r.length * grootte * 0.42 + 2); s.tekst(r, M, s.y); s.y += r.length * grootte * 0.42 + 3; s.font(); },
    /** Twee kolommen met label/waarde-paren */
    paren(links, rechts) {
      const kol = (paren, x) => { let yy = s.y; for (const [l, v] of paren) { s.font('bold', 8.5, KLEUR.grijs); s.tekst(l, x, yy); s.font('normal', 9.5); const r = s.regels(v || '—', BR / 2 - 6); s.tekst(r, x, yy + 4.2); yy += 4.2 + r.length * 4.2 + 2.2; } return yy; };
      s.ruimte(30); const y1 = kol(links, M), y2 = kol(rechts, M + BR / 2 + 4); s.y = Math.max(y1, y2) + 2;
    },
    tabel(kop, rijen, opt = {}) {
      s.ruimte(18);
      doc.autoTable(Object.assign({
        head: [kop.map(pdfTekst)], body: rijen.map(r => r.map(c => pdfTekst(c))), startY: s.y, margin: { left: M, right: M, bottom: 18, top: M },
        styles: { font: 'RS', fontSize: 8.6, cellPadding: 1.6, textColor: KLEUR.blauw, lineColor: KLEUR.lijn, lineWidth: 0.2, valign: 'top', overflow: 'linebreak' },
        headStyles: { font: 'RS', fontStyle: 'bold', fillColor: KLEUR.blauw, textColor: 255 },
        alternateRowStyles: { fillColor: KLEUR.zebra }, theme: 'grid'
      }, opt));
      s.y = doc.lastAutoTable.finalY + 6;
    }
  };
  return s;
}

const URG_KOL = (kolom) => ({ didParseCell: d => { if (d.section === 'body' && d.column.index === kolom) { const u = String(d.cell.raw || '').trim(); if (URG_KLEUR[u]) { d.cell.styles.textColor = URG_KLEUR[u]; d.cell.styles.fontStyle = 'bold'; } } } });

/** Punten-tabel voor één object. soort bepaalt de kolommen. */
function puntenTabel(s, o, soort) {
  if (!o.punten.length) { s.alinea('Er zijn geen tekortkomingen vastgelegd.', 9.5, KLEUR.grijs); return; }
  if (soort === 'herstel') {
    s.tabel(['Nr', 'Ruimte', 'Omschrijving tekortkoming', 'Urg.', 'Uitkomst', 'Paraaf'],
      o.punten.map(p => [p.nr, p.ruimte, p.omschrijving + (p.nietErkend ? `\nNiet erkend: ${p.nietErkend}` : '') + (p.foto ? `\nFoto ${p.nr}` : ''), p.urgentie, p.uitkomst, p.paraaf ? fmtDatum(p.paraaf) : '']),
      Object.assign({ columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 28 }, 3: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 30 }, 5: { cellWidth: 20 } } }, URG_KOL(3)));
    return;
  }
  s.tabel(['Nr', 'Ruimte', 'Omschrijving tekortkoming', 'Urg.', 'Status', 'Niet erkend', 'Foto'],
    o.punten.map(p => [p.nr, p.ruimte, p.omschrijving, p.urgentie, p.statusTekst, p.nietErkend ? 'Ja: ' + p.nietErkend : '', p.foto ? String(p.nr) : '']),
    Object.assign({ columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 26 }, 3: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 28 }, 5: { cellWidth: 26 }, 6: { cellWidth: 11, halign: 'center' } } }, URG_KOL(3)));
}

function partijenBlok(s, inhoud, o) {
  const org = inhoud.organisatie;
  s.paren(
    [['Opdrachtgever', `${org.naam}\n${org.adres}\n${org.postbus}`], ['Vertegenwoordigd door', o.partijen.vertOpdrachtgever]],
    [['Opdrachtnemer', o.partijen.opdrachtnemer], ['Vertegenwoordigd door', o.partijen.vertOpdrachtnemer], ['Object', `${o.type} · blok ${o.blok}`]]);
}

function metersEnOverig(s, o) {
  if (o.meters && !o.meters.nvt) {
    s.sectie('Bijlage 1b — Meterstanden');
    s.alinea(`Datum meteropname: ${fmtDatum(o.meters.datum) || '—'} · Netbeheerder elektra: ${o.meters.netElektra || '—'} · Netbeheerder water: ${o.meters.netWater || '—'} · Opgenomen door: ${o.meters.door || '—'}`, 8.6);
    s.tabel(['Meter', 'Stand', 'Foto'], o.meters.standen.map(m => [m.label, m.waarde || '—', m.foto ? m.fotoNr : '']), { columnStyles: { 1: { cellWidth: 40, halign: 'right' }, 2: { cellWidth: 14, halign: 'center' } } });
  } else if (o.meters) s.alinea('Meterstanden: niet van toepassing bij dit object.', 8.6, KLEUR.grijs);
  if (o.overig && o.overig.length) {
    s.sectie('Overige zaken');
    s.tabel(['Onderdeel', 'Waarde'], o.overig.map(z => [z.label, z.waarde || '—']).concat(o.vrij ? [['Overig', o.vrij]] : []), { columnStyles: { 1: { cellWidth: 60 } } });
  }
}

async function handtekeningen(s, inhoud, blobs) {
  const doc = s.doc;
  s.ruimte(30 + 40);
  s.alinea(inhoud.verklaring);
  s.font('normal', 9.5); s.tekst(`Opgemaakt en ondertekend te ${inhoud.plaats || '…'}`, M, s.y); s.tekst(`Datum ${fmtDatum(inhoud.datum)}`, M + BR / 2 + 4, s.y); s.y += 7;
  const bw = BR / 2 - 4, bh = 30;
  for (let i = 0; i < inhoud.ondertekenaars.length; i++) {
    const o = inhoud.ondertekenaars[i], x = M + (i % 2) * (bw + 8);
    if (i % 2 === 0 && i) s.y += bh + 14;
    s.font('bold', 9.5); s.tekst(o.rol, x, s.y);
    doc.setDrawColor(...KLEUR.lijn); doc.setLineWidth(0.3); doc.rect(x, s.y + 2, bw, bh);
    const b = blobs[o.rol];
    if (b) { const d = await blobAlsDataURL(b), im = await afm(d); const k = Math.min((bw - 4) / im.w, (bh - 4) / im.h); doc.addImage(d, 'PNG', x + (bw - im.w * k) / 2, s.y + 2 + (bh - im.h * k) / 2, im.w * k, im.h * k); }
    else { s.font('normal', 8.5, KLEUR.grijs); s.tekst('Niet ondertekend', x + bw / 2, s.y + 2 + bh / 2, { align: 'center' }); }
    s.font('normal', 8.5, KLEUR.grijs); s.tekst(o.naam || '', x, s.y + bh + 6);
  }
  s.y += bh + 12; s.font();
}
const afm = d => new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 3, h: 1 }); im.src = d; });

/** Fotobijlage: [{nr, titel, sub, urg, id}] — 2 per rij, 6 per pagina */
async function fotobijlage(s, kop, fotos, laadFoto) {
  if (!fotos.length) return;
  const doc = s.doc;
  s.nieuwePagina(); s.font('bold', 13); s.tekst(kop, M, s.y + 4); s.y += 11; s.font();
  const kw = (BR - 6) / 2, ih = kw * 0.72, kh = ih + 17;
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i], kol = i % 2;
    if (kol === 0 && s.y + kh > HPAG - 16) s.nieuwePagina();
    const x = M + kol * (kw + 6);
    doc.setFillColor(...KLEUR.achtergrond); doc.rect(x, s.y, kw, ih, 'F');
    const blob = await laadFoto(f.id);
    if (blob) {
      const klein = await verklein(blob, 1100, 0.72).catch(() => blob);
      const d = await blobAlsDataURL(klein), im = await afm(d), k = Math.min(kw / im.w, ih / im.h);
      doc.addImage(d, 'JPEG', x + (kw - im.w * k) / 2, s.y + (ih - im.h * k) / 2, im.w * k, im.h * k, undefined, 'FAST');
    }
    doc.setFillColor(...KLEUR.blauw); doc.rect(x, s.y, 13, 7, 'F'); s.font('bold', 9, [255, 255, 255]); s.tekst(String(f.nr), x + 6.5, s.y + 5, { align: 'center' });
    if (f.urg && URG_KLEUR[f.urg]) { doc.setFillColor(...URG_KLEUR[f.urg]); doc.rect(x + kw - 9, s.y, 9, 7, 'F'); s.tekst(f.urg, x + kw - 4.5, s.y + 5, { align: 'center' }); }
    s.font('bold', 9); s.tekst(s.regels(f.titel, kw)[0] || '', x, s.y + ih + 5);
    s.font('normal', 8.2, KLEUR.grijs); s.tekst(s.regels(f.sub, kw).slice(0, 2), x, s.y + ih + 9.2); s.font();
    if (kol === 1 || i === fotos.length - 1) s.y += kh;
  }
}

/** Voettekst: links de omschrijving (zo nodig ingekort), rechts het kenmerk en het paginanummer — die worden nooit afgekapt */
function voettekst(s, links, kenmerk = '', vanaf = 1) {
  const doc = s.doc, n = doc.getNumberOfPages();
  for (let i = vanaf; i <= n; i++) {
    doc.setPage(i); s.font('normal', 7.5, KLEUR.grijs);
    const rechts = `${kenmerk ? 'Kenmerk ' + kenmerk + '   ' : ''}Pagina ${i - vanaf + 1} van ${n - vanaf + 1}`;
    const ruimte = BR - doc.getTextWidth(rechts) - 6;
    let t = pdfTekst(links); while (t.length > 4 && doc.getTextWidth(t) > ruimte) t = t.slice(0, -2);
    s.tekst(t === pdfTekst(links) ? t : t.trimEnd() + '…', M, HPAG - 8); s.tekst(rechts, W - M, HPAG - 8, { align: 'right' });
  }
}

const fotoLijst = (o) => [
  ...o.punten.filter(p => p.foto).map(p => ({ nr: p.nr, id: p.foto, titel: `${p.nr}. ${p.ruimte || ''}`, sub: p.omschrijving, urg: p.urgentie })),
  ...((o.meters && !o.meters.nvt) ? o.meters.standen.filter(m => m.foto).map(m => ({ nr: m.fotoNr, id: m.foto, titel: `${m.fotoNr}. Meterstand`, sub: `${m.label}: ${m.waarde || '—'}`, urg: '' })) : [])
];

/**
 * Maakt het proces-verbaal uit een vaste inhoud.
 * @param {any} inhoud  momentopname (zie documenten.js)
 * @param {{kenmerk:string, handtekeningen?:Record<string,Blob>, fotos?:boolean, laadFoto:(id:string)=>Promise<Blob|null>}} opt
 */
export async function maakDocumentPDF(inhoud, opt) {
  const doc = await nieuwDoc(inhoud.titel, inhoud.organisatie);
  const logo = 'data:image/png;base64,' + await base64('img/logo_vol.png');
  const s = schrijver(doc, logo);
  const cx = `Complex ${inhoud.complex.nummer}${inhoud.complex.naam ? ' ' + inhoud.complex.naam : ''}`;
  const enkel = inhoud.objecten.length === 1 && inhoud.soort !== 'verzamel';

  if (enkel) {
    const o = inhoud.objecten[0];
    s.kop(inhoud.titel, `${cx} · Blok ${o.blok}`, o.adres);
    algemeen(s, inhoud);
    partijenBlok(s, inhoud, o);
    s.sectie(inhoud.soort === 'herstel' ? 'Afhandeling tekortkomingen' : 'Geconstateerde tekortkomingen');
    puntenTabel(s, o, inhoud.soort);
    if (inhoud.soort === 'oplevering') metersEnOverig(s, o);
  } else {
    s.kop(inhoud.titel, cx, inhoud.blok ? `Blok ${inhoud.blok}` : 'Alle blokken');
    algemeen(s, inhoud);
    s.sectie(`Objecten in deze afronding (${inhoud.objecten.length})`);
    s.tabel(['Blok', 'Adres', 'Type', 'A', 'B', 'C', 'Niet erkend', 'Aandachtspunten'],
      inhoud.objecten.map(o => [o.blok, o.adres, o.type, o.telling.A, o.telling.B, o.telling.C, o.telling.nietErkend, (o.aandacht || []).join('; ')]),
      { columnStyles: { 0: { cellWidth: 11 }, 3: { cellWidth: 8, halign: 'center' }, 4: { cellWidth: 8, halign: 'center' }, 5: { cellWidth: 8, halign: 'center' }, 6: { cellWidth: 15, halign: 'center' } } });
    const o0 = inhoud.objecten[0];
    s.paren([['Opdrachtgever', inhoud.organisatie.naam], ['Vertegenwoordigd door', o0.partijen.vertOpdrachtgever]], [['Opdrachtnemer', o0.partijen.opdrachtnemer], ['Vertegenwoordigd door', o0.partijen.vertOpdrachtnemer]]);
    s.alinea('Per object volgen hierna de tekortkomingen, de meterstanden en de overige zaken. De handtekeningen aan het eind gelden voor alle objecten in dit document.', 8.6, KLEUR.grijs);
    for (const o of inhoud.objecten) {
      s.nieuwePagina();
      s.font('bold', 13); s.tekst(o.adres, M, s.y + 3); s.font('normal', 9, KLEUR.grijs); s.tekst(`Blok ${o.blok} · ${o.type}`, W - M, s.y + 3, { align: 'right' }); s.y += 10; s.font();
      puntenTabel(s, o, 'oplevering');
      metersEnOverig(s, o);
    }
    s.y += 2;
  }
  if (inhoud.ondertekenaars.length) { s.sectie(inhoud.soort === 'herstel' ? 'Verklaring' : 'Verklaring en ondertekening'); await handtekeningen(s, inhoud, opt.handtekeningen || {}); }
  else if (inhoud.verklaring) s.alinea(inhoud.verklaring, 8.6, KLEUR.grijs);

  if (opt.fotos !== false) {
    for (const o of inhoud.objecten) await fotobijlage(s, enkel ? `Fotobijlage — ${o.adres}` : `Fotobijlage — ${o.adres} (blok ${o.blok})`, fotoLijst(o), opt.laadFoto);
  }
  voettekst(s, `${inhoud.organisatie.naam} · ${inhoud.titel}${enkel ? ' · ' + inhoud.objecten[0].adres : ''}`, kortKenmerk(opt.kenmerk));
  return doc.output('blob');
}

function algemeen(s, inhoud) {
  const r = [`Datum: ${fmtDatum(inhoud.datum)}`];
  if (inhoud.termijn) r.push(`Herstel uiterlijk: ${fmtDatum(inhoud.termijn.uiterlijk)} (${inhoud.termijn.werkdagen} werkdagen)`);
  if (inhoud.referentie) r.push(inhoud.referentie);
  s.alinea(r.join(' · '), 9.5);
  if (inhoud.herziening) {
    s.ruimte(16); const doc = s.doc, tekst = s.regels(`Herziening ${inhoud.herziening.nr}: dit proces-verbaal vervangt het proces-verbaal van ${fmtDatum(inhoud.herziening.vervangtDatum)} (kenmerk ${inhoud.herziening.vervangtKenmerk}). Reden: ${inhoud.herziening.reden}`, BR - 6);
    doc.setFillColor(255, 243, 196); doc.rect(M, s.y - 3.5, BR, tekst.length * 4.2 + 3, 'F'); s.font('normal', 9); s.tekst(tekst, M + 3, s.y); s.y += tekst.length * 4.2 + 4; s.font();
  }
  if (inhoud.urgenties) s.alinea('Urgentie: ' + inhoud.urgenties.map(u => `${u.code} ${u.titel} — ${u.uitleg}`).join('  '), 7.8, KLEUR.grijs);
}

/** Rapport zonder handtekening: tekortkomingenlijst voor een woning, blok of complex (geen ondertekend document) */
export async function maakLijstPDF({ titel, regel1, regel2, organisatie, samenvatting, punten, voet }) {
  const doc = await nieuwDoc(titel, organisatie);
  const logo = 'data:image/png;base64,' + await base64('img/logo_vol.png');
  const s = schrijver(doc, logo);
  s.kop(titel, regel1, regel2);
  s.alinea('Rapport uit de opleverinspectie. Dit is geen ondertekend proces-verbaal; de ondertekende documenten staan per object onder Documenten.', 8.6, KLEUR.grijs);
  if (samenvatting) { s.sectie('Per object'); s.tabel(samenvatting.kop, samenvatting.rijen, { styles: { font: 'RS', fontSize: 8 } }); }
  s.sectie('Tekortkomingen');
  if (!punten.rijen.length) s.alinea('Geen tekortkomingen.', 9.5, KLEUR.grijs);
  else s.tabel(punten.kop, punten.rijen, Object.assign({ styles: { font: 'RS', fontSize: 7.8, cellPadding: 1.3, textColor: KLEUR.blauw, lineColor: KLEUR.lijn, lineWidth: 0.2 } }, URG_KOL(punten.urgKolom)));
  voettekst(s, voet);
  return doc.output('blob');
}
