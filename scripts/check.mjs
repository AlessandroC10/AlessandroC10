// Comprobador del repo del perfil. Sin dependencias: `node scripts/check.mjs [grupo]`.
// Sin argumento corre todas las reglas; con uno, solo ese grupo (cards, header, svg, button, readme, repo).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (...p) => join(RAIZ, ...p);
const leer = (...p) => readFileSync(ruta(...p), 'utf8');
const KB = 1024;
const MB = 1024 * KB;
// El README principal va en castellano; el inglés vive en README.en.md y se llega con un botón (GitHub no ejecuta JavaScript).
const IDIOMAS = { es: { readme: 'README.md', sufijo: '' }, en: { readme: 'README.en.md', sufijo: '-en' } };
const TARJETAS = JSON.parse(leer('src', 'cards.json'));

// Ancho y alto de un PNG leyendo la cabecera IHDR (bytes 16-23), sin dependencias.
const pngSize = (archivo) => {
  const b = readFileSync(archivo);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
// WebP: extendido (VP8X, el animado) o con pérdida simple (VP8 ).
const webpInfo = (archivo) => {
  const b = readFileSync(archivo);
  const tipo = b.toString('ascii', 12, 16);
  if (tipo === 'VP8X') return { animado: (b[20] & 0x02) !== 0, w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (tipo === 'VP8 ') return { animado: false, w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  return { animado: false, w: 0, h: 0 };
};

const SOLO = process.argv[2];
const grupo = (nombre, reglas) => {
  if (!SOLO || SOLO === nombre) reglas();
};

let fallos = 0;
function check(regla, ok, detalle = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${regla}${ok || !detalle ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

// Cada README es público (sin datos personales), accesible y sin servicios de terceros.
grupo('readme', () => {
  const stack = JSON.parse(leer('src', 'stack.json')).anillos.flatMap((a) => a.items);
  const cargo = { es: /ponente y formador en IA/i, en: /AI speaker and trainer/i };
  for (const [idioma, { readme, sufijo }] of Object.entries(IDIOMAS)) {
    const etiqueta = `[${idioma}]`;
    check(`${etiqueta} ${readme} existe`, existsSync(ruta(readme)));
    if (!existsSync(ruta(readme))) continue;
    const md = leer(readme);
    const imgs = md.match(/<img\b[^>]*>/g) ?? [];
    check(`${etiqueta} sin correos`, !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(md));
    check(`${etiqueta} sin teléfonos`, !/\+?\d[\d ().-]{8,}\d/.test(md));
    // El titular vive en la cabecera: su alt lo lleva (lectores de pantalla) y la bio de GitHub ya es texto. No se repite debajo.
    const altCabecera = md.match(/<img\b[^>]*src="assets\/header[^"]*"[^>]*\balt="([^"]*)"/)?.[1] ?? '';
    check(`${etiqueta} el alt de la cabecera lleva el nombre y el titular`,
      /Alessandro Conte/.test(altCabecera) && /AI Developer/.test(altCabecera) && cargo[idioma].test(altCabecera));
    check(`${etiqueta} el titular no se repite como texto visible`, !cargo[idioma].test(md.replace(/<[^>]*>/g, '')));
    check(`${etiqueta} respeta «reducir movimiento»`, md.includes('prefers-reduced-motion: reduce'));
    check(`${etiqueta} tiene las 7 imágenes (cabecera, 3 tarjetas, stack, LinkedIn e idioma)`, imgs.length === 7, `${imgs.length}`);
    check(`${etiqueta} toda imagen lleva alt no vacío`, imgs.every((i) => /\balt="[^"]+"/.test(i)));
    for (const { id, [idioma]: { texto } } of TARJETAS) {
      check(`${etiqueta} el alt de la tarjeta ${id} lleva su texto`, md.includes(texto));
    }
    check(`${etiqueta} el alt del stack nombra todas las tecnologías`, stack.every((t) => md.includes(t)), stack.filter((t) => !md.includes(t)).join(', '));
    check(`${etiqueta} LinkedIn va como botón (imagen enlazada)`,
      md.includes('<a href="https://www.linkedin.com/in/alessandrocontem"><img') && !/\[LinkedIn\]/.test(md));
    check(`${etiqueta} lleva el botón para cambiar de idioma`, md.includes(`<a href="${idioma === 'es' ? 'README.en.md' : 'README.md'}"><img`));
    const rutas = [...md.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
    for (const r of rutas) check(`${etiqueta} ruta relativa existe: ${r}`, existsSync(ruta(r)));
    const hosts = [...md.matchAll(/https?:\/\/([^/"')\s]+)/g)].map((m) => m[1]);
    check(`${etiqueta} enlaces externos solo a hosts permitidos`, hosts.every((h) => h === 'www.linkedin.com'), hosts.join(', '));
    // La web aún pide contraseña (401): ni enlace ni dominio suelto. Quitar esta regla cuando sea pública.
    check(`${etiqueta} no menciona alessandroconte.dev`, !md.includes('alessandroconte.dev'));
    check(`${etiqueta} usa las imágenes de su idioma`, md.includes(`assets/header${sufijo}.webp`) && md.includes(`assets/card-codigo${sufijo}.webp`));
  }
});

// Tarjetas: ancho 1220 = lienzo de 610 px a 2x (en un móvil de ~358 px la letra de 22 px queda en ~13 px); WebP, hasta 250 KB cada una.
grupo('cards', () => {
  const textos = readFileSync(ruta('src', 'cards.json'), 'utf8');
  check('las tarjetas no incluyen idiomas ni lo retirado', !/idiomas|languages|Meta Ads|Google Ads|Ámsterdam|Amsterdam|assessment|evaluación/i.test(textos));
  check('hay 3 tarjetas', TARJETAS.length === 3, `${TARJETAS.length}`);
  for (const { sufijo } of Object.values(IDIOMAS)) {
    for (const { id } of TARJETAS) {
      const c = `assets/card-${id}${sufijo}.webp`;
      check(`${c} existe`, existsSync(ruta(c)));
      if (!existsSync(ruta(c))) continue;
      const { w } = webpInfo(ruta(c));
      const { size } = statSync(ruta(c));
      check(`${c} mide 1220 px de ancho`, w === 1220, `ancho ${w}`);
      check(`${c} pesa como mucho 250 KB`, size <= 250 * KB, `${Math.round(size / KB)} KB`);
    }
  }
});

// Cabecera (4:1; WebP animado hasta 3 MB y póster estático), una por idioma.
grupo('header', () => {
  for (const { sufijo } of Object.values(IDIOMAS)) {
    const archivos = [`assets/header${sufijo}.webp`, `assets/header${sufijo}-static.png`];
    for (const a of archivos) check(`${a} existe`, existsSync(ruta(a)));
    if (!archivos.every((a) => existsSync(ruta(a)))) continue;
    const w = webpInfo(ruta(archivos[0]));
    const { size } = statSync(ruta(archivos[0]));
    check(`${archivos[0]} es animado`, w.animado);
    check(`${archivos[0]} mide 1200x300`, w.w === 1200 && w.h === 300, `${w.w}x${w.h}`);
    check(`${archivos[0]} pesa como mucho 3 MB`, size <= 3 * MB, `${(size / MB).toFixed(2)} MB`);
    const p = pngSize(ruta(archivos[1]));
    check(`${archivos[1]} mide 1200x300`, p.w === 1200 && p.h === 300, `${p.w}x${p.h}`);
  }
});

// Órbita del stack: SVG animado con CSS (GitHub no ejecuta JavaScript): sin scripts ni recursos externos y con logos.
grupo('svg', () => {
  const f = ruta('assets', 'stack.svg');
  check('assets/stack.svg existe', existsSync(f));
  if (!existsSync(f)) return;
  const svg = readFileSync(f, 'utf8');
  const { size } = statSync(f);
  check('stack.svg pesa como mucho 400 KB', size <= 400 * KB, `${Math.round(size / KB)} KB`);
  check('stack.svg tiene lienzo 610x440', svg.includes('viewBox="0 0 610 440"'));
  check('stack.svg sin scripts ni recursos externos', !/<script|(?:href|src)="https?:|url\(\s*["']?https?:/i.test(svg));
  check('stack.svg respeta «reducir movimiento»', svg.includes('prefers-reduced-motion'));
  const logos = Object.keys(JSON.parse(leer('src', 'stack.json')).logos);
  check('stack.svg lleva el logo de cada herramienta que lo tiene', (svg.match(/<use\b/g) ?? []).length >= logos.length, `${(svg.match(/<use\b/g) ?? []).length} de ${logos.length}`);
});

// Botones (420x92 px de lienzo a 2x, hasta 150 KB): LinkedIn en cada idioma y el cambio de idioma.
grupo('button', () => {
  for (const nombre of ['button-linkedin.png', 'button-linkedin-en.png', 'button-idioma-en.png', 'button-idioma-es.png']) {
    const f = ruta('assets', nombre);
    check(`assets/${nombre} existe`, existsSync(f));
    if (!existsSync(f)) continue;
    const { w } = pngSize(f);
    check(`${nombre} mide 840 px de ancho`, w === 840, `ancho ${w}`);
    check(`${nombre} pesa como mucho 150 KB`, statSync(f).size <= 150 * KB, `${Math.round(statSync(f).size / KB)} KB`);
  }
});

// El repo va a ser público: sin rutas locales del autor, sin el GIF de respaldo y sin el pase ni el semitono (aplazados).
grupo('repo', () => {
  check('build.mjs sin rutas locales del autor', !readFileSync(ruta('src', 'build.mjs'), 'utf8').includes('roadmap_vida_personal'));
  for (const retirado of ['assets/header.gif', 'assets/lanyard.svg', 'src/lanyard.svg', 'src/halftone.html']) {
    check(`${retirado} no está en el repo`, !existsSync(ruta(retirado)));
  }
});

process.exitCode = fallos ? 1 : 0;
