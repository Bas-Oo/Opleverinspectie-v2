// @ts-check
/* Tekenvak voor een handtekening (vinger of Apple Pencil). Geeft een PNG; schaalt mee bij draaien van de iPad. */
import { h } from './ui.js';

export function tekenvak(label, naam = '') {
  const cv = /** @type {HTMLCanvasElement} */ (h('canvas', { 'aria-label': 'Tekenvak handtekening ' + label }));
  const naamEl = h('span.tv-naam', naam);
  const el = h('div.tekenvak', h('div.tv-kop', h('strong', label), naamEl, h('button.knop.licht.klein', { type: 'button', onclick: () => { lijnen = []; teken(); } }, 'Wissen')), cv, h('div.tv-lijn'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  /** @type {Array<Array<[number, number]>>} lijnen in genormaliseerde coördinaten (0..1), zodat draaien niets kapotmaakt */
  let lijnen = [], huidig = null, b = 1, hh = 1;
  const wijzigers = new Set();
  function maat() {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = window.devicePixelRatio || 1; b = r.width; hh = r.height;
    cv.width = Math.round(b * dpr); cv.height = Math.round(hh * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); teken();
  }
  function teken() {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, b, hh);
    ctx.strokeStyle = '#1D2C35'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const l of lijnen) { ctx.beginPath(); l.forEach(([x, y], i) => i ? ctx.lineTo(x * b, y * hh) : ctx.moveTo(x * b, y * hh)); if (l.length === 1) ctx.lineTo(l[0][0] * b + 0.1, l[0][1] * hh); ctx.stroke(); }
    el.classList.toggle('gezet', lijnen.length > 0); wijzigers.forEach(f => f());
  }
  const pos = e => { const r = cv.getBoundingClientRect(); return /** @type {[number, number]} */ ([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]); };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); huidig = [pos(e)]; lijnen.push(huidig); teken(); });
  cv.addEventListener('pointermove', e => { if (!huidig) return; e.preventDefault(); huidig.push(pos(e)); const n = huidig.length; ctx.beginPath(); ctx.moveTo(huidig[n - 2][0] * b, huidig[n - 2][1] * hh); ctx.lineTo(huidig[n - 1][0] * b, huidig[n - 1][1] * hh); ctx.stroke(); });
  const stop = () => { if (huidig) { huidig = null; teken(); } };
  cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
  const ro = new ResizeObserver(() => maat()); ro.observe(cv);
  return {
    el,
    leeg: () => lijnen.length === 0,
    zetNaam: n => { naamEl.textContent = n; },
    opWijzig: f => wijzigers.add(f),
    /** PNG op vaste breedte, los van de schermmaat */
    png: () => new Promise((res, rej) => {
      const W = 900, H = Math.round(900 * (hh / b || 0.35)), c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#1D2C35'; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
      for (const l of lijnen) { x.beginPath(); l.forEach(([px, py], i) => i ? x.lineTo(px * W, py * H) : x.moveTo(px * W, py * H)); if (l.length === 1) x.lineTo(l[0][0] * W + 0.5, l[0][1] * H); x.stroke(); }
      c.toBlob(bl => bl ? res(bl) : rej(new Error('de browser gaf geen afbeelding terug')), 'image/png');
    })
  };
}
