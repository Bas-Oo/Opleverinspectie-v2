// @ts-check
/* Opstarten, routering, kop en meldingen */
import * as store from './store.js';
import { laad, S } from './staat.js';
import { h, $, leeg, ICOON, menu, sluitAlleDialogen, sluitMenu, toast } from './ui.js';
import { zetHertekenaar, ga, route } from './nav.js';
import { APP_VERSIE } from './config.js';
import { complexenScherm, complexScherm, blokScherm } from './scherm-overzicht.js';
import { objectScherm } from './scherm-object.js';
import { tekenScherm, verzamelScherm } from './scherm-tekenen.js';
import { instellingenScherm, documentScherm } from './scherm-overig.js';
import { ruimOp, maakBackup } from './backup.js';
import { melding } from './stukjes.js';

const ROUTES = [
  [/^#?\/?$/, () => complexenScherm()],
  [/^#\/c\/(\w+)$/, id => complexScherm(id)],
  [/^#\/b\/(\w+)$/, id => blokScherm(id)],
  [/^#\/o\/(\w+)(?:\/(\w+))?$/, (id, deel) => objectScherm(id, deel || 'punten')],
  [/^#\/t\/(\w+)$/, id => tekenScherm(id)],
  [/^#\/v\/(blok|complex)\/(\w+)$/, (n, id) => verzamelScherm(n, id)],
  [/^#\/d\/(\w+)$/, id => documentScherm(id)],
  [/^#\/instellingen$/, () => instellingenScherm()]
];

let vorigeHash = null;
function teken(zelfdeScherm = false) {
  sluitMenu();
  const hash = location.hash || '#/';
  const scroll = window.scrollY;
  let scherm = null;
  for (const [re, f] of ROUTES) { const m = re.exec(hash); if (m) { scherm = f(...m.slice(1)); break; } }
  if (!scherm) { if (hash !== '#/') { location.replace('#/'); return; } scherm = complexenScherm(); }
  kop(scherm);
  const main = /** @type {HTMLElement} */ ($('#main'));
  leeg(main).appendChild(scherm.inhoud);
  main.appendChild(h('footer.voet', `Opleverinspectie ${APP_VERSIE}`));
  const balk = $('#balk'); leeg(balk); if (scherm.balk) balk.appendChild(scherm.balk);
  document.body.classList.toggle('met-balk', !!scherm.balk);
  if (zelfdeScherm || hash === vorigeHash) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
  vorigeHash = hash;
  meldingen();
}

function kop(scherm) {
  const k = leeg(/** @type {HTMLElement} */ ($('#kop')));
  const kr = scherm.kruimels || [];
  const terug = kr.length > 1 ? kr[kr.length - 2] : null;
  k.appendChild(h('div.kop-binnen',
    terug ? h('a.kop-terug', { href: terug.hash, 'aria-label': 'Terug naar ' + terug.tekst }, ICOON.terug()) : h('img.kop-logo', { src: 'img/logo_beeld.png', alt: '' }),
    terug ? h('nav.kruimels', { 'aria-label': 'Kruimelpad' }, kr.map((x, i) => [i ? h('span.sep', '›') : null, x.hash ? h('a', { href: x.hash }, x.tekst) : h('span.nu', { 'aria-current': 'page' }, x.tekst)]))
      : h('div.kop-titel', h('strong', 'Opleverinspectie'), h('span', S.config.organisatie.naam.replace(/^De /, ''))),
    scherm.menu && scherm.menu.length ? menu(h('button.kop-menu', { type: 'button', 'aria-label': 'Menu' }, ICOON.menu()), scherm.menu) : null));
  document.title = (kr.length ? kr[kr.length - 1].tekst + ' — ' : '') + 'Opleverinspectie';
}

/* ===== Meldingen bovenaan: back-up, beginscherm, tweede tabblad, nieuwe versie ===== */
const vast = { tweedeTab: false, nieuweVersie: null, fout: [] };
async function meldingen() {
  const box = leeg(/** @type {HTMLElement} */ ($('#meldingen')));
  if (vast.tweedeTab) box.appendChild(melding('rood', 'De app is al geopend in een ander tabblad of venster', 'Werk in één tabblad. Sluit dit tabblad, of sluit het andere en herlaad deze pagina.'));
  if (vast.nieuweVersie) box.appendChild(melding('blauw', 'Er is een nieuwe versie van de app', 'Je gegevens blijven staan.', h('button.knop.klein', { type: 'button', onclick: () => { vast.nieuweVersie.postMessage('activeer'); } }, 'Nu bijwerken')));
  for (const f of vast.fout) box.appendChild(melding('rood', 'Er ging iets mis', f + ' Je gegevens staan nog op dit apparaat. Herlaad de app; blijft het terugkomen, maak dan een back-up en meld deze tekst.',
    h('button.knop.licht.klein', { type: 'button', onclick: () => { vast.fout = []; meldingen(); } }, 'Sluiten')));
  if (!(location.hash || '#/').match(/^#\/?$|^#\/c\//)) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !standalone) box.appendChild(melding('geel', 'Zet de app op het beginscherm', 'Deel-knop › "Zet op beginscherm". Dan opent hij schermvullend, en ruimt iOS de gegevens niet op als je de app een tijd niet gebruikt.'));
  const sinds = (await store.metaGet('sindsBackup')) || 0, laatste = await store.metaGet('laatsteBackup');
  const uren = laatste ? (Date.now() - new Date(laatste).getTime()) / 36e5 : Infinity;
  if (sinds > 0 && uren > 20 && S.complexen.size) box.appendChild(melding('geel', laatste ? `Laatste back-up: ${new Date(laatste).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Nog geen back-up gemaakt',
    `${sinds} wijziging(en) staan alleen op dit apparaat. Maak een back-up en bewaar die buiten de tablet (OneDrive, SharePoint of mail).`, h('button.knop.klein', { type: 'button', onclick: () => maakBackup(null) }, 'Back-up maken')));
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
  window.addEventListener('hashchange', () => { sluitAlleDialogen(); teken(false); });
  teken();
  registreerServiceWorker();
  setTimeout(() => ruimOp().then(n => { if (n) console.info('Opgeruimd:', n); }).catch(console.error), 4000);
}
start();
export { ga, route, toast };
