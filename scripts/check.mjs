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

// El README es público (sin datos personales), accesible y sin servicios de terceros. Todo en castellano.
grupo('readme', () => {
  check('README.md existe', existsSync(ruta('README.md')));
  if (!existsSync(ruta('README.md'))) return;
  const md = leer('README.md');
  const imgs = md.match(/<img\b[^>]*>/g) ?? [];
  const stack = JSON.parse(leer('src', 'stack.json')).anillos.flatMap((a) => a.items);
  check('sin correos', !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(md));
  check('sin teléfonos', !/\+?\d[\d ().-]{8,}\d/.test(md));
  // El titular vive en la cabecera: su alt lo lleva (lectores de pantalla) y la bio de GitHub ya es texto. No se repite debajo.
  const altCabecera = md.match(/<img\b[^>]*src="assets\/header[^"]*"[^>]*\balt="([^"]*)"/)?.[1] ?? '';
  check('el alt de la cabecera lleva el nombre y el titular', /Alessandro Conte/.test(altCabecera) && /AI Developer/.test(altCabecera) && /ponente y formador en IA/i.test(altCabecera));
  check('el titular no se repite como texto visible', !/ponente y formador en IA/i.test(md.replace(/<[^>]*>/g, '')));
  check('respeta «reducir movimiento»', md.includes('prefers-reduced-motion: reduce'));
  check('tiene las 6 imágenes (cabecera, 3 tarjetas, stack y LinkedIn)', imgs.length === 6, `${imgs.length}`);
  check('toda imagen lleva alt no vacío', imgs.every((i) => /\balt="[^"]+"/.test(i)));
  for (const { id, texto } of TARJETAS) check(`el alt de la tarjeta ${id} lleva su texto`, md.includes(texto));
  check('el alt del stack nombra todas las tecnologías', stack.every((t) => md.includes(t)), stack.filter((t) => !md.includes(t)).join(', '));
  check('LinkedIn va como botón (imagen enlazada)', md.includes('<a href="https://www.linkedin.com/in/alessandrocontem"><img') && !/\[LinkedIn\]/.test(md));
  check('sin botón ni enlace a una versión en inglés', !/README\.en\.md|English/i.test(md));
  for (const r of [...md.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u))) {
    check(`ruta relativa existe: ${r}`, existsSync(ruta(r)));
  }
  const hosts = [...md.matchAll(/https?:\/\/([^/"')\s]+)/g)].map((m) => m[1]);
  check('enlaces externos solo a hosts permitidos', hosts.every((h) => h === 'www.linkedin.com'), hosts.join(', '));
  // La web aún pide contraseña (401): ni enlace ni dominio suelto. Quitar esta regla cuando sea pública.
  check('no menciona alessandroconte.dev', !md.includes('alessandroconte.dev'));
});

// Tarjetas: ancho 1220 = lienzo de 610 px a 2x (en un móvil de ~358 px la letra de 24 px queda en ~14 px); WebP, hasta 250 KB cada una.
grupo('cards', () => {
  const textos = leer('src', 'cards.json');
  check('las tarjetas no incluyen idiomas ni lo retirado', !/idiomas|languages|Meta Ads|Google Ads|Ámsterdam|Amsterdam|assessment|evaluación/i.test(textos));
  check('las tarjetas solo están en castellano', !/"en"\s*:/.test(textos));
  check('hay 3 tarjetas', TARJETAS.length === 3, `${TARJETAS.length}`);
  for (const { id } of TARJETAS) {
    const c = `assets/card-${id}.webp`;
    check(`${c} existe`, existsSync(ruta(c)));
    if (!existsSync(ruta(c))) continue;
    const { w } = webpInfo(ruta(c));
    const { size } = statSync(ruta(c));
    check(`${c} mide 1220 px de ancho`, w === 1220, `ancho ${w}`);
    check(`${c} pesa como mucho 250 KB`, size <= 250 * KB, `${Math.round(size / KB)} KB`);
  }
});

// Cabecera (4:1; WebP animado hasta 3 MB y póster estático).
grupo('header', () => {
  const archivos = ['assets/header.webp', 'assets/header-static.png'];
  for (const a of archivos) check(`${a} existe`, existsSync(ruta(a)));
  if (!archivos.every((a) => existsSync(ruta(a)))) return;
  const w = webpInfo(ruta(archivos[0]));
  const { size } = statSync(ruta(archivos[0]));
  check(`${archivos[0]} es animado`, w.animado);
  check(`${archivos[0]} mide 1200x300`, w.w === 1200 && w.h === 300, `${w.w}x${w.h}`);
  check(`${archivos[0]} pesa como mucho 3 MB`, size <= 3 * MB, `${(size / MB).toFixed(2)} MB`);
  const p = pngSize(ruta(archivos[1]));
  check(`${archivos[1]} mide 1200x300`, p.w === 1200 && p.h === 300, `${p.w}x${p.h}`);
});

// Órbita del stack: SVG animado con CSS (GitHub no ejecuta JavaScript): sin scripts ni recursos externos y con logos de color.
grupo('svg', () => {
  const f = ruta('assets', 'stack.svg');
  check('assets/stack.svg existe', existsSync(f));
  if (!existsSync(f)) return;
  const svg = readFileSync(f, 'utf8');
  const { size } = statSync(f);
  check('stack.svg pesa como mucho 400 KB', size <= 400 * KB, `${Math.round(size / KB)} KB`);
  check('stack.svg tiene lienzo 610x480', svg.includes('viewBox="0 0 610 480"'));
  check('stack.svg sin scripts ni recursos externos', !/<script|(?:href|src)="https?:|url\(\s*["']?https?:/i.test(svg));
  check('stack.svg respeta «reducir movimiento»', svg.includes('prefers-reduced-motion'));
  // Pastillas anchas y rectas que giran se pisan según la dirección que une a dos de ellas: quedan fijas y giran los aros.
  check('stack.svg: las pastillas no giran (se mueven los aros y los satélites)', !svg.includes('class="contra') && /class="giro r0"><circle class="anillo"/.test(svg));
  const logos = Object.keys(JSON.parse(leer('src', 'stack.json')).logos);
  const usos = svg.match(/<use\b/g) ?? [];
  check('stack.svg lleva el logo de cada herramienta que lo tiene', usos.length >= logos.length, `${usos.length} de ${logos.length}`);
  const { logos: marcas, anillos } = JSON.parse(leer('src', 'stack.json'));
  check('Make ya no está en el stack y Coolify lleva logo', !anillos.flatMap((a) => a.items).includes('Make') && 'Coolify' in marcas);
  const colores = new Set([...svg.matchAll(/<use class="logo"[^>]*\bfill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toLowerCase()));
  check('los logos van en color (al menos 8 colores distintos)', colores.size >= 8, `${colores.size}`);
  // Se lee el SVG final: la posición de cada pastilla (translate) y su ancho, y se cuentan las que se montan.
  const pastillas = [...svg.matchAll(/<g class="pastilla" transform="translate\(([-\d.]+) ([-\d.]+)\)"><rect x="[-\d.]+" y="-17" width="(\d+)" height="34"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], w: +m[3] }));
  const montadas = pastillas.reduce((n, a, i) => n + pastillas.slice(i + 1)
    .filter((b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 && Math.abs(a.y - b.y) < 38).length, 0);
  check('stack.svg: ninguna pastilla se monta sobre otra', pastillas.length === anillos.flatMap((a) => a.items).length && montadas === 0,
    `${montadas} choques entre ${pastillas.length} pastillas`);
});

// Botón de LinkedIn (420x92 px de lienzo a 2x, hasta 150 KB).
grupo('button', () => {
  const f = ruta('assets', 'button-linkedin.png');
  check('assets/button-linkedin.png existe', existsSync(f));
  if (!existsSync(f)) return;
  const { w } = pngSize(f);
  check('button-linkedin.png mide 840 px de ancho', w === 840, `ancho ${w}`);
  check('button-linkedin.png pesa como mucho 150 KB', statSync(f).size <= 150 * KB, `${Math.round(statSync(f).size / KB)} KB`);
});

// El repo va a ser público: sin rutas locales del autor y sin lo retirado (GIF, pase, semitono y versión en inglés).
grupo('repo', () => {
  check('build.mjs sin rutas locales del autor', !readFileSync(ruta('src', 'build.mjs'), 'utf8').includes('roadmap_vida_personal'));
  const retirados = ['assets/header.gif', 'assets/lanyard.svg', 'src/lanyard.svg', 'src/halftone.html', 'README.en.md',
    'assets/header-en.webp', 'assets/header-en-static.png', 'assets/button-linkedin-en.png', 'assets/button-idioma-en.png', 'assets/button-idioma-es.png',
    ...['codigo', 'comunicacion', 'negocio'].map((id) => `assets/card-${id}-en.webp`)];
  for (const retirado of retirados) check(`${retirado} no está en el repo`, !existsSync(ruta(retirado)));
});

process.exitCode = fallos ? 1 : 0;
