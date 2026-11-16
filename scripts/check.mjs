// Comprobador del repo del perfil. Sin dependencias: `node scripts/check.mjs`.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (...p) => join(RAIZ, ...p);
const KB = 1024;
const MB = 1024 * KB;
const CARDS = ['codigo', 'comunicacion', 'negocio', 'idiomas'].map((id) => `assets/card-${id}.png`);

// Ancho y alto de un PNG leyendo la cabecera IHDR (bytes 16-23), sin dependencias.
const pngSize = (archivo) => {
  const b = readFileSync(archivo);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
// WebP extendido (VP8X): lienzo en los bytes 24-29 (menos uno) y bit de animación en el byte 20.
const webpInfo = (archivo) => {
  const b = readFileSync(archivo);
  return { vp8x: b.toString('ascii', 12, 16) === 'VP8X', animado: (b[20] & 0x02) !== 0, w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
};
const gifSize = (archivo) => {
  const b = readFileSync(archivo);
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
};

// `node scripts/check.mjs [grupo]`: sin argumento corre todas las reglas; con uno, solo ese grupo (cards, header, readme).
const SOLO = process.argv[2];
const grupo = (nombre, reglas) => {
  if (!SOLO || SOLO === nombre) reglas();
};

let fallos = 0;
function check(regla, ok, detalle = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${regla}${ok || !detalle ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

// R3 + R4 + R5: el README es público (sin datos personales), accesible y sin servicios de terceros.
grupo('readme', () => {
  const f = ruta('README.md');
  check('README.md existe', existsSync(f));
  if (!existsSync(f)) return;
  const md = readFileSync(f, 'utf8');
  check('README sin correos', !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(md));
  check('README sin teléfonos', !/\+?\d[\d ().-]{8,}\d/.test(md));
  check('README tiene el titular en texto real', md.includes('AI Developer · Ponente y formador en IA'));
  check('README respeta «reducir movimiento»', md.includes('prefers-reduced-motion: reduce'));
  const imgs = md.match(/<img\b[^>]*>/g) ?? [];
  check('README tiene las 5 imágenes (cabecera y 4 tarjetas)', imgs.length === 5, `${imgs.length}`);
  check('toda imagen lleva alt no vacío', imgs.every((i) => /\balt="[^"]+"/.test(i)));
  const rutas = [...md.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  for (const r of rutas) check(`ruta relativa existe: ${r}`, existsSync(ruta(r)));
  const hosts = [...md.matchAll(/https?:\/\/([^/"')\s]+)/g)].map((m) => m[1]);
  const permitidos = ['www.linkedin.com']; // alessandroconte.dev se añade cuando la web sea pública
  check('enlaces externos solo a hosts permitidos', hosts.every((h) => permitidos.includes(h)), hosts.join(', '));
  // La web aún pide contraseña (401): ni enlace ni dominio suelto. Quitar esta regla cuando sea pública.
  check('README no menciona alessandroconte.dev', !md.includes('alessandroconte.dev'));
});

// R1 + R2: tarjetas (ancho 1220 = lienzo de 610 px a 2x: al encogerse a ~358 px en un móvil, la letra de 22 px queda en ~13 px; hasta 300 KB cada una).
grupo('cards', () => {
  for (const c of CARDS) {
    const f = ruta(c);
    check(`${c} existe`, existsSync(f));
    if (!existsSync(f)) continue;
    const { w } = pngSize(f);
    const { size } = statSync(f);
    check(`${c} mide 1220 px de ancho`, w === 1220, `ancho ${w}`);
    check(`${c} pesa como mucho 300 KB`, size <= 300 * KB, `${Math.round(size / KB)} KB`);
  }
});

// R1 + R2: cabecera (4:1; WebP animado hasta 3 MB, GIF de respaldo hasta 4 MB, póster estático).
grupo('header', () => {
  const archivos = ['header.webp', 'header.gif', 'header-static.png'].map((n) => `assets/${n}`);
  for (const a of archivos) check(`${a} existe`, existsSync(ruta(a)));
  if (!archivos.every((a) => existsSync(ruta(a)))) return;
  const [webp, gif, png] = archivos.map((a) => ruta(a));
  const w = webpInfo(webp);
  check('header.webp es animado', w.vp8x && w.animado);
  check('header.webp mide 1200x300', w.w === 1200 && w.h === 300, `${w.w}x${w.h}`);
  const webpSize = statSync(webp).size;
  check('header.webp pesa como mucho 3 MB', webpSize <= 3 * MB, `${(webpSize / MB).toFixed(2)} MB`);
  const g = gifSize(gif);
  const gifBytes = statSync(gif).size;
  check('header.gif es 4:1', g.w === 4 * g.h, `${g.w}x${g.h}`);
  check('header.gif pesa como mucho 4 MB', gifBytes <= 4 * MB, `${(gifBytes / MB).toFixed(2)} MB`);
  const p = pngSize(png);
  check('header-static.png mide 1200x300', p.w === 1200 && p.h === 300, `${p.w}x${p.h}`);
});

process.exitCode = fallos ? 1 : 0;
