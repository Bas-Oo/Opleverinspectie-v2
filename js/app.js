// @ts-check
/* Opstarten, routering, kop, meldingen en de schermovergangen van versie 1 */
import * as store from './store.js';
import { laad, S } from './staat.js';
import { h, $, ICOON, menu, sluitAlleDialogen, sluitMenu, heeftDialoog } from './ui.js';
import { zetHertekenaar, route, TAB_STANDAARD, getekend } from './nav.js';
import { APP_VERSIE } from './config.js';
import { complexenScherm, complexScherm, blokScherm } from './scherm-overzicht.js';
import { objectScherm, TABS } from './scherm-object.js';
import { verzamelScherm } from './scherm-tekenen.js';
import { instellingenScherm, documentScherm } from './scherm-overig.js';
import { ruimOp, maakBackup } from './backup.js';
import { melding } from './stukjes.js';

/* ===== Routes ===== */
const ROUTES = [
  [/^#?\/?$/, () => ({ soort: 'complexen', diepte: 0, maak: () => complexenScherm() })],
  [/^#\/instellingen$/, () => ({ soort: 'instellingen', diepte: 1, maak: () => instellingenScherm() })],
  [/^#\/c\/(\w+)$/, id => ({ soort: 'complex', id, diepte: 1, maak: () => complexScherm(id) })],
  [/^#\/b\/(\w+)$/, id => ({ soort: 'blok', id, diepte: 2, maak: () => blokScherm(id) })],
  [/^#\/v\/(blok|complex)\/(\w+)$/, (n, id) => ({ soort: 'verzamel', id, diepte: n === 'complex' ? 2 : 3, maak: () => verzamelScherm(n, id) })],
  [/^#\/o\/(\w+)(?:\/(\w+))?$/, (id, tab) => ({ soort: 'object', id, tab: tab || TAB_STANDAARD, diepte: 3, maak: () => objectScherm(id, tab || TAB_STANDAARD) })],
  [/^#\/t\/(\w+)$/, id => ({ soort: 'oud', diepte: 3, maak: () => { location.replace(route.object(id, 'afronden')); return null; } })],   // link uit versie 2.0
  [/^#\/d\/(\w+)$/, id => ({ soort: 'document', id, diepte: 4, maak: () => documentScherm(id) })]
];
function plekVan(hash) {
  for (const [re, f] of ROUTES) { const m = re.exec(hash); if (m) return f(...m.slice(1)); }
  return null;
}

/* ===== Schermovergang (versie 1.4.1): korte schuif-fade =====
   Dieper (complex → blok → object) of een tabblad rechts ervan: de inhoud gaat naar links; terug of een tabblad links ervan: naar rechts.
   Bij wisselen van tabblad beweegt alleen de inhoud onder de tabbalk; kop en tabbalk blijven staan. */
const OVERGANG = { uit: 110, in: 170, afstand: 28 };
let overgang = null, vorigePlek = null, vorigeHash = null;
function bepaalOvergang(oud, nu) {
  if (!oud) return null;
  if (oud.soort === 'object' && nu.soort === 'object' && oud.id === nu.id) {
    if (oud.tab === nu.tab) return null;
    const i = k => TABS.findIndex(([t]) => t === k);
    return { soort: 'tab', richting: i(nu.tab) > i(oud.tab) ? 'links' : 'rechts' };
  }
  return { soort: 'scherm', richting: nu.diepte > oud.diepte ? 'links' : nu.diepte < oud.diepte ? 'rechts' : '' };
}
function overgangDoelen(main, soort) {
  if (soort === 'tab') { const el = $('#objInhoud', main); return el ? [el] : []; }
  return Array.from(main.children);
}
const stilleBeweging = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function teken(zelfdeScherm = false) {
  sluitMenu();
  const hash = location.hash || '#/';
  const plek = plekVan(hash);
  if (!plek) { location.replace('#/'); return; }
  const main = /** @type {HTMLElement} */ ($('#main'));
  if (overgang) { clearTimeout(overgang.timer); overgang.anims.forEach(a => { try { a.cancel(); } catch (e) { /* al klaar */ } }); overgang = null; main.style.pointerEvents = ''; }
  const ov = !zelfdeScherm && hash !== vorigeHash ? bepaalOvergang(vorigePlek, plek) : null;
  const oudeDoelen = !ov || !main.animate || stilleBeweging() ? [] : overgangDoelen(main, ov.soort);
  if (!oudeDoelen.length) return tekenNu(main, plek, hash, zelfdeScherm, null);
  const dx = ov.richting === 'links' ? -OVERGANG.afstand : ov.richting === 'rechts' ? OVERGANG.afstand : 0;
  main.style.pointerEvents = 'none';   // tikken tijdens de overgang doet niets
  const anims = oudeDoelen.map(el => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${dx}px)` }], { duration: OVERGANG.uit, easing: 'ease-in', fill: 'forwards' }));
  overgang = { anims, timer: setTimeout(() => { overgang = null; tekenNu(main, plek, hash, false, { soort: ov.soort, dx: -dx }); }, OVERGANG.uit) };
}

function tekenNu(main, plek, hash, zelfdeScherm, inkomend) {
  main.style.pointerEvents = '';
  const scroll = window.scrollY;
  let scherm = null;
  try { scherm = plek.maak(); }
  catch (e) { console.error(e); toonFout('Scherm kon niet worden opgebouwd: ' + (e && e.message)); return; }
  if (!scherm) { if (plek.soort !== 'oud' && hash !== '#/') location.replace('#/'); return; }
  kop(scherm.menu);
  main.replaceChildren(scherm.inhoud, h('div.status-lijn', h('span#status', statusTekst), h('br'), `Opleverinspectie ${APP_VERSIE}`));
  /* Alleen naar boven bij een ander scherm of tabblad, niet bij hertekenen (bijv. na het bewaren van een punt) */
  if (zelfdeScherm || hash === vorigeHash) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
  vorigeHash = hash; vorigePlek = plek;
  volgPlakHoogte(/** @type {HTMLElement|null} */ ($('.obj-plak', main)));
  if (scherm.naTekenen) scherm.naTekenen();
  if (inkomend) overgangDoelen(main, inkomend.soort).forEach(el => {
    const a = el.animate([{ opacity: 0, transform: `translateX(${inkomend.dx}px)` }, { opacity: 1, transform: 'none' }], { duration: OVERGANG.in, easing: 'ease-out' });
    a.onfinish = a.oncancel = () => { el.style.transform = ''; };   // geen blijvende transform: die breekt position: sticky
  });
  meldingen(plek);
  getekend();
}

/* ===== Kop (versie 1): logo, naam en één menu-icoon met alle acties ===== */
function kop(acties) {
  const k = /** @type {HTMLElement} */ ($('#kop'));
  const org = (S.config.organisatie.naam || '').replace(/^De /, '');
  k.replaceChildren(h('div.kop-binnen',
    h('img.kop-logo', { src: 'img/logo_beeld.png', alt: '' }),
    h('div.kop-titel', h('div.app', 'Opleverinspectie'), h('div.org', org)),
    h('div.kop-acties', acties && acties.length ? menu(h('button.icoon', { type: 'button', title: 'Menu', 'aria-label': 'Menu' }, ICOON.menu()), acties) : null)));
  zetKopHoogte();
}
/* Hoogte van de kop als CSS-variabele, zodat kruimelpad en tabs van een object er direct onder blijven plakken */
function zetKopHoogte() { const k = $('#kop'); if (k) document.documentElement.style.setProperty('--kop-h', /** @type {HTMLElement} */ (k).offsetHeight + 'px'); }
let plakObs = null;
function volgPlakHoogte(el) {
  if (plakObs) { plakObs.disconnect(); plakObs = null; }
  const zet = () => document.documentElement.style.setProperty('--plak-h', (el && el.isConnected ? el.offsetHeight : 0) + 'px');
  zet(); if (el && window.ResizeObserver) { plakObs = new ResizeObserver(zet); plakObs.observe(el); }
}
if (window.ResizeObserver) new ResizeObserver(zetKopHoogte).observe(/** @type {Element} */ (document.getElementById('kop')));
window.addEventListener('resize', zetKopHoogte);

/* ===== Statusregel onderaan: wanneer voor het laatst opgeslagen ===== */
let statusTekst = '';
store.naOpslaan.add(() => {
  statusTekst = 'Opgeslagen ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const el = $('#status'); if (el) el.textContent = statusTekst;
});

/* ===== Meldingen bovenaan: fouten, tweede tabblad, nieuwe versie, beginscherm en back-up ===== */
const vast = { tweedeTab: false, nieuweVersie: null, fout: [] };
async function meldingen(plek = vorigePlek) {
  const box = /** @type {HTMLElement} */ ($('#meldingen'));
  const lijst = [];
  if (vast.tweedeTab) lijst.push(melding('geel', '⚠️ De app is ook in een ander tabblad of venster geopend', 'Werk in één tabblad. Sluit het andere tabblad en herlaad deze pagina.'));
  if (vast.nieuweVersie) lijst.push(melding('blauw', 'Er is een nieuwe versie van de app', 'Je gegevens blijven staan.', h('button.knop.klein', { type: 'button', style: { flex: '0 1 auto' }, onclick: () => { vast.nieuweVersie.postMessage('activeer'); } }, 'Nu bijwerken')));
  for (const f of vast.fout) lijst.push(melding('rood', 'Er ging iets mis', f + ' Je gegevens staan nog op de tablet. Herlaad de app; blijft dit terugkomen, maak dan een back-up en meld deze tekst.',
    h('button.knop.licht.klein', { type: 'button', style: { flex: '0 1 auto' }, onclick: () => { store.spoel().finally(() => location.reload()); } }, 'Herladen'),
    h('button.knop.licht.klein', { type: 'button', style: { flex: '0 1 auto' }, onclick: () => { vast.fout = []; meldingen(); } }, 'Sluiten')));
  if (plek && (plek.soort === 'complexen' || plek.soort === 'complex')) {
    const standalone = matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !standalone) lijst.push(melding('geel', 'Zet de app op het beginscherm', 'Deel-knop › "Zet op beginscherm". Dan opent hij schermvullend, en ruimt iOS de gegevens niet op als je de app een tijd niet gebruikt.'));
    const sinds = (await store.metaGet('sindsBackup')) || 0, laatste = await store.metaGet('laatsteBackup');
    const uren = laatste ? (Date.now() - new Date(laatste).getTime()) / 36e5 : Infinity;
    if (sinds > 0 && uren > 20 && S.complexen.size) lijst.push(melding('geel', laatste ? `Laatste back-up: ${new Date(laatste).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Nog geen back-up gemaakt',
      `${sinds} wijziging(en) staan alleen op deze tablet. Maak een back-up en bewaar die buiten de tablet (OneDrive, SharePoint of mail).`, h('button.knop.klein', { type: 'button', style: { flex: '0 1 auto' }, onclick: () => maakBackup(null) }, 'Back-up maken')));
  }
  box.replaceChildren(...lijst);
}

/* ===== Eén tabblad tegelijk (Web Locks); anders overschrijven twee tabbladen elkaars geheugen ===== */
function claimTabblad() {
  return new Promise(res => {
    const locks = /** @type {any} */ (navigator).locks;
    if (!locks) { // terugval: alleen waarschuwen
      if ('BroadcastChannel' in window) { const k = new BroadcastChannel('oi2'); k.onmessage = e => { if (e.data === 'hallo') k.postMessage('hier'); vast.tweedeTab = true; meldingen(); }; k.postMessage('hallo'); }
      return res(true);
    }
    locks.request('opleverinspectie-v2', { ifAvailable: true }, lock => {
      if (!lock) { res(false); return; }
      res(true); return new Promise(() => {});   // vasthouden zolang de pagina open is
    });
  });
}

function registreerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const wacht = w => { vast.nieuweVersie = w; meldingen(); };
    if (reg.waiting && navigator.serviceWorker.controller) wacht(reg.waiting);
    reg.addEventListener('updatefound', () => { const n = reg.installing; n && n.addEventListener('statechange', () => { if (n.state === 'installed' && navigator.serviceWorker.controller) wacht(n); }); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(e => console.warn('Service worker niet geregistreerd', e));
  let herladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (herladen) return; herladen = true; store.spoel().finally(() => location.reload()); });
}

function toonFout(t) { const s = String(t || 'Onbekende fout'); if (/ResizeObserver/.test(s) || vast.fout.includes(s) || vast.fout.length >= 3) return; vast.fout.push(s); meldingen(); }
window.addEventListener('error', e => toonFout(e.message));
window.addEventListener('unhandledrejection', e => toonFout(e.reason && (e.reason.message || e.reason)));

/* Bij verlaten (iOS sluit de tab soms tijdens cameragebruik): wachtrij direct wegschrijven */
const spoel = () => { if (store.heeftWachtrij()) store.spoel().catch(e => toonFout('Opslaan mislukt: ' + e.message)); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') spoel(); });
window.addEventListener('pagehide', spoel);

async function start() {
  const main = /** @type {HTMLElement} */ ($('#main'));
  if (!await claimTabblad()) {
    main.replaceChildren(h('div.leeg-staat', h('strong', 'De app is al geopend in een ander tabblad of venster'), h('p', 'Er kan maar één tabblad tegelijk met de gegevens werken. Sluit dit tabblad en ga verder in het andere.'), h('button.knop', { type: 'button', onclick: () => location.reload() }, 'Opnieuw proberen')));
    return;
  }
  try { await store.open(); await laad(); }
  catch (e) { main.replaceChildren(h('div.leeg-staat', h('strong', 'De opslag van de browser is niet beschikbaar'), h('p', String(e && e.message || e)), h('p', 'Open de app in Safari of Chrome, niet in een privévenster.'))); return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  zetHertekenaar(teken);
  /* Terug met een open dialoog of foto: eerst die sluiten (zoals de terugknop op een telefoon) */
  window.addEventListener('hashchange', () => {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
    if (heeftDialoog()) sluitAlleDialogen();
    teken(false);
  });
  teken();
  registreerServiceWorker();
  setTimeout(() => ruimOp().then(n => { if (n) console.info('Opgeruimd:', n); }).catch(console.error), 4000);
}
start();
