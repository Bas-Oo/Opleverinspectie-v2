// @ts-check
/* Bibliotheken (jsPDF, AutoTable, SheetJS) pas laden als ze nodig zijn: de app start sneller.
   De service worker heeft ze vooraf in de cache gezet, dus dit werkt ook offline. */
const geladen = new Map();
function script(src) {
  if (!geladen.has(src)) geladen.set(src, new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = () => res(true);
    s.onerror = () => { geladen.delete(src); rej(new Error('Kon ' + src + ' niet laden')); };
    document.head.appendChild(s);
  }));
  return geladen.get(src);
}
export async function laadPDF() {
  await script('vendor/jspdf.umd.min.js');
  await script('vendor/jspdf.plugin.autotable.min.js');
  return /** @type {any} */ (window).jspdf.jsPDF;
}
export async function laadXLSX() { await script('vendor/xlsx.full.min.js'); return /** @type {any} */ (window).XLSX; }

const cache = new Map();
/** Bestand uit de app (lettertype, logo) als base64 */
export async function base64(pad) {
  if (!cache.has(pad)) cache.set(pad, fetch(pad).then(r => { if (!r.ok) throw new Error(pad + ' niet gevonden'); return r.arrayBuffer(); }).then(buf => {
    let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000)));
    return btoa(s);
  }));
  return cache.get(pad);
}
