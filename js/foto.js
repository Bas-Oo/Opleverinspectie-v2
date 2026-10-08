// @ts-check
/* Foto's: verkleinen, opslaan (volledig + miniatuur in één transactie), miniaturen tonen en groot bekijken. */
import * as store from './store.js';
import { uid } from './model.js';
import { h, dialoog } from './ui.js';

export const FOTO_PX = 1600, MINI_PX = 320;

/** Verkleint naar maximaal 'max' pixels (langste zijde) als JPEG; doorzichtig wordt wit */
export function verklein(blob, max, kwaliteit = 0.82) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * s)), hh = Math.max(1, Math.round(img.naturalHeight * s));
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const cx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); cx.drawImage(img, 0, 0, w, hh); URL.revokeObjectURL(u);
      c.toBlob(b => { c.width = c.height = 0; b ? res(b) : rej(new Error('foto kon niet worden verwerkt')); }, 'image/jpeg', kwaliteit);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('foto kon niet worden gelezen')); };
    img.src = u;
  });
}

/** Slaat een foto op en geeft het id terug. De aanroeper koppelt het id aan een punt of meter. */
export async function bewaarFoto(bestand) {
  const vol = await verklein(bestand, FOTO_PX);
  const mini = await verklein(vol, MINI_PX, 0.72).catch(() => vol);
  const id = uid('f');
  await store.bewaar([['fotos', { id, blob: vol }], ['minis', { id, blob: mini }]]);
  miniCache.set(id, URL.createObjectURL(mini));
  return id;
}

const miniCache = new Map();
export async function miniURL(id) {
  if (!id) return null;
  if (miniCache.has(id)) return miniCache.get(id);
  let b = await store.blobGet('minis', id);
  if (!b) { const vol = await store.blobGet('fotos', id); if (!vol) return null; b = await verklein(vol, MINI_PX, 0.72).catch(() => vol); }
  const u = URL.createObjectURL(b); miniCache.set(id, u); return u;
}

/** Miniatuur-element dat zichzelf vult; tikken = groot bekijken */
export function miniatuur(id, { klein = false, bijschrift = '', nr = '' } = {}) {
  const el = h('button.mini', { type: 'button', class: klein ? 'klein' : '', 'aria-label': 'Foto bekijken', onclick: e => { e.stopPropagation(); bekijk(id, bijschrift); } }, nr ? h('span.mini-nr', nr) : null);
  miniURL(id).then(u => { if (u) el.style.backgroundImage = `url("${u}")`; else el.classList.add('weg'); });
  return el;
}

export async function bekijk(id, bijschrift = '') {
  const b = await store.blobGet('fotos', id); if (!b) return;
  const u = URL.createObjectURL(b);
  await dialoog({ titel: bijschrift || 'Foto', breed: true, inhoud: h('img.foto-groot', { src: u, alt: bijschrift }), knoppen: [{ tekst: 'Sluiten', waarde: true, soort: 'licht' }] });
  URL.revokeObjectURL(u);
}

/** Camera openen. Moet synchroon vanuit een tik worden aangeroepen (iOS). Geeft het gekozen bestand of null. */
export function camera() {
  return new Promise(res => {
    const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { position: 'fixed', left: '-100px', opacity: '0' } });
    let klaar = false;
    const af = f => { if (klaar) return; klaar = true; inp.remove(); res(f); };
    inp.addEventListener('change', () => af(inp.files && inp.files[0] || null));
    inp.addEventListener('cancel', () => af(null));
    document.body.appendChild(inp); inp.click();
  });
}

export async function blobAlsDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(/** @type {string} */ (r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
