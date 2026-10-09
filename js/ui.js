// @ts-check
/* Kleine UI-bouwstenen: elementen maken zonder innerHTML (geen escape-fouten), dialogen, toast, menu's en bestanden afleveren.
   De markup volgt versie 1 (.dialoog > .kaart, .uitklap > .uitklap-menu, .keuze, .toast), zodat de app er hetzelfde uitziet. */

/** h('div.kaart#id', {onclick, class, ...}, kinderen...)  — kinderen: Node | string | number | null | array */
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { kids.unshift(attrs); attrs = {}; }
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) part[0] === '.' ? el.classList.add(part.slice(1)) : (el.id = part.slice(1));
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (['value', 'checked', 'disabled', 'hidden', 'selected', 'textContent'].includes(k)) /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  voegToe(el, kids);
  return el;
}
function voegToe(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) voegToe(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, el) => (el || document).querySelector(sel);
export const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
export const leeg = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/* ===== Iconen (lijnen, erven de tekstkleur) ===== */
const svg = (d, extra = '') => {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  return /** @type {Element} */ (t.content.firstChild);
};
export const ICOON = {
  menu: () => svg('<path d="M4 6h16M4 12h16M4 18h16"/>', 'stroke-width="2.2"'),
  camera: () => svg('<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>'),
  plus: () => svg('<path d="M12 5v14M5 12h14"/>'),
  verder: () => svg('<path d="M9 18l6-6-6-6"/>'),
  vink: () => svg('<path d="M5 12l5 5L20 7"/>'),
  doc: () => svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  schijf: () => svg('<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><rect x="7" y="13" width="10" height="8" rx="1"/>'),
  delen: () => svg('<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
  excel: () => svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
  instellingen: () => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
};

/* ===== Toast ===== */
let toastTimer;
export function toast(tekst, ms = 2200) {
  let el = $('#toast'); if (!el) { el = h('div.toast#toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
  el.textContent = tekst; el.classList.add('zichtbaar');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('zichtbaar'), ms);
}

/* ===== Dialogen =====
   Alle dialogen sluiten bij 'terug' (hashchange) en bij Escape. */
const openDialogen = new Set();
export function sluitAlleDialogen() { for (const f of Array.from(openDialogen)) f(); }
export const heeftDialoog = () => openDialogen.size > 0;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openDialogen.size) Array.from(openDialogen).pop()(); });

/** Basisdialoog. inhoud: Node; knoppen: [{tekst, waarde, soort}] → resolve(waarde); sluiten → resolve(null).
 *  onder: knoppen in een aparte rij onderaan (bijv. verwijderen), gescheiden door een lijn. */
export function dialoog({ titel, tekst = '', inhoud = null, knoppen = [{ tekst: 'OK', waarde: true }], onder = [], breed = false, controle = null }) {
  return new Promise(res => {
    const sluit = (w = null) => { openDialogen.delete(annuleer); achter.remove(); res(w); };
    const annuleer = () => sluit(null);
    const knop = k => h('button.knop', {
      class: k.soort || '', type: 'button', dataset: { a: k.waarde === null ? 'nee' : String(k.waarde) },
      onclick: async () => { if (k.waarde !== null && controle) { const fout = await controle(k.waarde); if (fout) return toast(fout, 3500); } sluit(k.waarde); }
    }, k.tekst);
    const kaart = h('div.kaart', { class: breed ? 'breed' : '', role: 'dialog', 'aria-modal': 'true', 'aria-label': titel },
      h('h2', titel), tekst ? h('p', tekst) : null, inhoud,
      h('div.knoprij.dlg-knoppen', knoppen.map(knop)),
      onder.length ? h('div.knoprij', { style: { marginTop: '18px', borderTop: '1px solid var(--lijn)', paddingTop: '12px' } }, onder.map(knop)) : null);
    const achter = h('div.dialoog', { onclick: e => { if (e.target === achter) annuleer(); } }, kaart);
    openDialogen.add(annuleer);
    document.body.appendChild(achter);
    /* Eerste veld focussen, maar niet als de gebruiker intussen zelf al een veld heeft gekozen */
    const f = $('input:not([type=file]),textarea,select', kaart);
    if (f && !breed) setTimeout(() => { if (!kaart.contains(document.activeElement)) /** @type {HTMLElement} */ (f).focus(); }, 60);
  });
}
export const bevestig = (titel, tekst, ok = 'OK', gevaar = false) =>
  dialoog({ titel, tekst, knoppen: [{ tekst: 'Annuleren', waarde: null, soort: 'licht' }, { tekst: ok, waarde: true, soort: gevaar ? 'rood' : '' }] }).then(Boolean);
export const meld = (titel, tekst) => dialoog({ titel, tekst });
/** Keuzedialoog: knoppen = [{waarde, tekst, soort}] → gekozen waarde of null */
export const kies = (titel, tekst, knoppen) => dialoog({ titel, tekst, knoppen });

/** Formulierdialoog. velden: [{key, label, waarde, soort:'tekst'|'getal'|'keuze'|'lang'|'datum', opties, hint, verplicht, sectie}] → object of null.
 *  sectie: tussenkop boven het veld (zoals in Complex instellingen van versie 1). extra: knoppen onderaan, bijv. {tekst:'Verwijderen…', waarde:'weg', soort:'gevaar'} */
export async function formulier({ titel, tekst = '', velden, ok = 'Opslaan', extra = [], breed = false }) {
  const inputs = {};
  const inhoud = h('div', velden.map(v => {
    let inp;
    if (v.soort === 'keuze') inp = h('select.invoer', v.opties.map(o => h('option', { value: o, selected: o === v.waarde }, o)));
    else if (v.soort === 'lang') inp = h('textarea.invoer', { rows: v.rijen || 3, value: v.waarde || '', placeholder: v.placeholder || '' });
    else inp = h('input.invoer', { type: v.soort === 'datum' ? 'date' : 'text', inputmode: v.soort === 'getal' ? 'numeric' : null, value: v.waarde ?? '', placeholder: v.placeholder || '', autocomplete: 'off' });
    if (v.soort === 'getal') inp.addEventListener('input', () => { /** @type {HTMLInputElement} */ (inp).value = /** @type {HTMLInputElement} */ (inp).value.replace(/[^0-9]/g, ''); });
    inputs[v.key] = inp;
    return [v.sectie ? h('h3.dlg-sectie', v.sectie) : null, v.sectieHint ? h('p.dlg-hint', v.sectieHint) : null,
      h('label.veld', h('span.label', v.label), inp, v.hint ? h('span.hint', v.hint) : null)];
  }));
  inhoud.addEventListener('keydown', e => { if (e.key === 'Enter' && /** @type {HTMLElement} */ (e.target).tagName === 'INPUT') { e.preventDefault(); /** @type {HTMLElement} */ ($('.dlg-knoppen .knop:last-child', inhoud.parentElement)).click(); } });
  const w = await dialoog({ titel, tekst, inhoud, breed, knoppen: [{ tekst: 'Annuleren', waarde: null, soort: 'licht' }, { tekst: ok, waarde: 'ok' }], onder: extra,
    controle: waarde => { if (waarde !== 'ok') return null; const mist = velden.find(v => v.verplicht && !String(inputs[v.key].value).trim()); return mist ? `Vul in: ${mist.label.toLowerCase()}` : null; } });
  if (w === null) return null;
  if (w !== 'ok') return { _actie: w };
  return Object.fromEntries(velden.map(v => [v.key, String(inputs[v.key].value).trim()]));
}

/* ===== Uitklapmenu (versie 1: één menu-icoon in de kop, en knoppen met een ▾) ===== */
let openMenu = null;
export function sluitMenu() { if (openMenu) { openMenu.menu.hidden = true; openMenu.knop.setAttribute('aria-expanded', 'false'); openMenu = null; } }
document.addEventListener('pointerdown', e => { if (openMenu && !openMenu.wrap.contains(/** @type {Node} */ (e.target))) sluitMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openMenu) { const k = openMenu.knop; sluitMenu(); k.focus(); } });
/** items: [{tekst, fn, gevaar, uit, icoon, titel}] of null (scheidingslijn) */
export function menu(knop, items) {
  const metIcoon = items.some(i => i && i.icoon);
  const lijst = h('div.uitklap-menu', { role: 'menu', hidden: true }, items.map(i => i === null ? h('hr') :
    h('button', { type: 'button', role: 'menuitem', class: i.gevaar ? 'gevaar' : '', disabled: !!i.uit, title: i.titel || null, onclick: () => { if (i.uit) return; sluitMenu(); i.fn(); } },
      i.icoon ? i.icoon() : metIcoon ? h('span.ui-leeg') : null, h('span', i.tekst))));
  const wrap = h('div.uitklap', knop, lijst);
  knop.setAttribute('aria-haspopup', 'menu'); knop.setAttribute('aria-expanded', 'false');
  knop.addEventListener('click', () => { const was = openMenu && openMenu.menu === lijst; sluitMenu(); if (was) return; lijst.hidden = false; knop.setAttribute('aria-expanded', 'true'); openMenu = { menu: lijst, knop, wrap }; });
  return wrap;
}

/* ===== Keuzeknoppen (segmenten) ===== */
export function keuze(opties, waarde, opWijzig, { uitzetbaar = true, uit = false, klasse = '' } = {}) {
  const wrap = h('div.keuze', { class: klasse, role: 'radiogroup' });
  const teken = () => { for (const b of wrap.children) { const aan = /** @type {HTMLElement} */ (b).dataset.w === waarde; b.classList.toggle('aan', aan); b.setAttribute('aria-checked', String(aan)); } };
  for (const o of opties) {
    const [w, label] = Array.isArray(o) ? o : [o, o];
    wrap.appendChild(h('button', { type: 'button', role: 'radio', dataset: { w }, disabled: uit, onclick: () => { waarde = waarde === w && uitzetbaar ? '' : w; teken(); opWijzig(waarde); } }, label));
  }
  teken();
  return wrap;
}

/* ===== Bestanden afleveren =====
   iOS staat delen/downloaden alleen toe direct vanuit een tik. Na asynchroon werk (PDF maken) is die tik verlopen,
   daarom altijd eerst een dialoog met een verse knop. */
export function leverBestand(blob, naam, titel = 'Bestand gereed', onderschrift = '', opGeleverd = () => {}) {
  const tl = $('#toast'); if (tl) tl.classList.remove('zichtbaar');
  let file = null; try { file = new File([blob], naam, { type: blob.type }); } catch (e) { /* oudere browser */ }
  const kanDelen = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const mb = blob.size / 1048576;
  const grootte = mb < 0.1 ? Math.max(1, Math.round(blob.size / 1024)) + ' kB' : mb.toFixed(1).replace('.', ',') + ' MB';
  const download = () => { const a = h('a', { href: URL.createObjectURL(blob), download: naam }); document.body.appendChild(a); a.click(); opGeleverd(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); };
  const inhoud = h('div', h('p.bestandsnaam', naam, h('br'), h('span', { style: { color: 'var(--grijs)' } }, grootte + (onderschrift ? ' · ' + onderschrift : ''))),
    h('div.knoprij',
      kanDelen ? h('button.knop', { type: 'button', onclick: async () => { try { await navigator.share({ files: [/** @type {File} */ (file)], title: naam }); opGeleverd(); } catch (e) { if (e && e.name !== 'AbortError') toast('Delen lukt niet op dit apparaat; gebruik Downloaden.', 4000); } } }, 'Delen / bewaren…') : null,
      h('button.knop', { type: 'button', class: kanDelen ? 'licht' : '', onclick: download }, 'Downloaden')),
    kanDelen ? h('p.hint', { style: { margin: '12px 0 0' } }, 'Via “Delen / bewaren” kun je het bestand opslaan in Bestanden, mailen of naar OneDrive sturen.') : null);
  return dialoog({ titel, inhoud, knoppen: [{ tekst: 'Sluiten', waarde: true, soort: 'licht' }] });
}

/** Bestand kiezen via een verborgen input (moet vanuit een tik worden aangeroepen) */
export function kiesBestand(accept) {
  return new Promise(res => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { res(inp.files && inp.files[0] || null); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  });
}
