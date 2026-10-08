// @ts-check
/* Kleine UI-bouwstenen: elementen maken zonder innerHTML (geen escape-fouten), dialogen, toast, menu's en bestanden afleveren. */

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
  menu: () => svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  camera: () => svg('<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>'),
  plus: () => svg('<path d="M12 5v14M5 12h14"/>'),
  terug: () => svg('<path d="M15 18l-6-6 6-6"/>'),
  verder: () => svg('<path d="M9 18l6-6-6-6"/>'),
  vink: () => svg('<path d="M5 12l5 5L20 7"/>'),
  kruis: () => svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  slot: () => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  pen: () => svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  doc: () => svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  waarsch: () => svg('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>'),
  info: () => svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>'),
  schijf: () => svg('<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><rect x="7" y="13" width="10" height="8" rx="1"/>'),
  meter: () => svg('<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M12 5V3"/>'),
  lijst: () => svg('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  gegevens: () => svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  klok: () => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  delen: () => svg('<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
  excel: () => svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>')
};

/* ===== Toast ===== */
let toastTimer;
export function toast(tekst, ms = 2400) {
  let el = $('#toast'); if (!el) { el = h('div#toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
  el.textContent = tekst; el.classList.add('zichtbaar');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('zichtbaar'), ms);
}

/* ===== Dialogen =====
   Alle dialogen sluiten bij 'terug' (hashchange) en bij Escape. */
const openDialogen = new Set();
export function sluitAlleDialogen() { for (const f of Array.from(openDialogen)) f(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openDialogen.size) Array.from(openDialogen).pop()(); });

/** Basisdialoog. inhoud: Node; knoppen: [{tekst, waarde, soort}] → resolve(waarde); sluiten → resolve(null) */
export function dialoog({ titel, tekst = '', inhoud = null, knoppen = [{ tekst: 'OK', waarde: true }], breed = false, controle = null }) {
  return new Promise(res => {
    const sluit = (w = null) => { openDialogen.delete(annuleer); achter.remove(); res(w); };
    const annuleer = () => sluit(null);
    const kaart = h('div.dlg-kaart', { class: breed ? 'breed' : '', role: 'dialog', 'aria-modal': 'true', 'aria-label': titel },
      h('h2', titel), tekst ? h('p.dlg-tekst', tekst) : null, inhoud,
      h('div.knoprij.dlg-knoppen', knoppen.map(k => h('button.knop', {
        class: k.soort || '', type: 'button',
        onclick: async () => { if (k.waarde !== null && controle) { const fout = await controle(k.waarde); if (fout) return toast(fout, 3500); } sluit(k.waarde); }
      }, k.tekst))));
    const achter = h('div.dlg-achter', { onclick: e => { if (e.target === achter) annuleer(); } }, kaart);
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

/** Formulierdialoog. velden: [{key, label, waarde, soort:'tekst'|'getal'|'keuze'|'lang'|'datum', opties, hint, verplicht}] → object of null */
export async function formulier({ titel, tekst = '', velden, ok = 'Opslaan', extra = [] }) {
  const inputs = {};
  const inhoud = h('div.velden', velden.map(v => {
    let inp;
    if (v.soort === 'keuze') inp = h('select.invoer', v.opties.map(o => h('option', { value: o, selected: o === v.waarde }, o)));
    else if (v.soort === 'lang') inp = h('textarea.invoer', { rows: v.rijen || 4, value: v.waarde || '' });
    else inp = h('input.invoer', { type: v.soort === 'datum' ? 'date' : 'text', inputmode: v.soort === 'getal' ? 'numeric' : null, value: v.waarde ?? '', placeholder: v.placeholder || '', autocomplete: 'off' });
    inputs[v.key] = inp;
    return h('label.veld', h('span.label', v.label), inp, v.hint ? h('span.hint', v.hint) : null);
  }));
  inhoud.addEventListener('keydown', e => { if (e.key === 'Enter' && /** @type {HTMLElement} */ (e.target).tagName === 'INPUT') { e.preventDefault(); /** @type {HTMLElement} */ ($('.dlg-knoppen .knop:last-child', inhoud.parentElement)).click(); } });
  const w = await dialoog({ titel, tekst, inhoud, knoppen: [...extra, { tekst: 'Annuleren', waarde: null, soort: 'licht' }, { tekst: ok, waarde: 'ok' }],
    controle: waarde => { if (waarde !== 'ok') return null; const mist = velden.find(v => v.verplicht && !String(inputs[v.key].value).trim()); return mist ? `Vul in: ${mist.label.toLowerCase()}` : null; } });
  if (w === null) return null;
  if (w !== 'ok') return { _actie: w };
  return Object.fromEntries(velden.map(v => [v.key, String(inputs[v.key].value).trim()]));
}

/* ===== Uitklapmenu ===== */
let openMenu = null;
export function sluitMenu() { if (openMenu) { openMenu.hidden = true; openMenu.previousSibling.setAttribute('aria-expanded', 'false'); openMenu = null; } }
document.addEventListener('pointerdown', e => { if (openMenu && !openMenu.parentElement.contains(/** @type {Node} */ (e.target))) sluitMenu(); }, true);
/** items: [{tekst, fn, gevaar, uit}] of null (scheidingslijn) */
export function menu(knop, items) {
  const lijst = h('div.menu', { role: 'menu', hidden: true }, items.map(i => i === null ? h('hr') :
    h('button', { type: 'button', role: 'menuitem', class: i.gevaar ? 'gevaar' : '', disabled: !!i.uit, onclick: () => { sluitMenu(); i.fn(); } }, i.icoon ? i.icoon() : null, h('span', i.tekst))));
  knop.setAttribute('aria-haspopup', 'menu'); knop.setAttribute('aria-expanded', 'false');
  knop.addEventListener('click', () => { const was = openMenu === lijst; sluitMenu(); if (was) return; lijst.hidden = false; knop.setAttribute('aria-expanded', 'true'); openMenu = lijst; });
  return h('div.menu-wrap', knop, lijst);
}

/* ===== Keuzeknoppen (segmenten) ===== */
export function keuze(opties, waarde, opWijzig, { uitzetbaar = true, uit = false, klasse = '' } = {}) {
  const wrap = h('div.keuze', { class: klasse, role: 'radiogroup' });
  const teken = () => { for (const b of wrap.children) { const aan = /** @type {HTMLElement} */ (b).dataset.w === waarde; b.classList.toggle('aan', aan); b.setAttribute('aria-checked', String(aan)); } };
  for (const o of opties) {
    const [w, label, sub] = Array.isArray(o) ? o : [o, o];
    wrap.appendChild(h('button', { type: 'button', role: 'radio', dataset: { w }, disabled: uit, onclick: () => { waarde = waarde === w && uitzetbaar ? '' : w; teken(); opWijzig(waarde); } }, h('span', label), sub ? h('small', sub) : null));
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
  const inhoud = h('div', h('p.bestandsnaam', naam), h('p.hint', grootte + (onderschrift ? ' · ' + onderschrift : '')),
    h('div.knoprij',
      kanDelen ? h('button.knop', { type: 'button', onclick: async () => { try { await navigator.share({ files: [/** @type {File} */ (file)], title: naam }); opGeleverd(); } catch (e) { if (e && e.name !== 'AbortError') toast('Delen lukt niet; gebruik Downloaden', 3500); } } }, ICOON.delen(), 'Delen / bewaren…') : null,
      h('button.knop', { type: 'button', class: kanDelen ? 'licht' : '', onclick: download }, 'Downloaden')));
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
