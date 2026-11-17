// Genera las imágenes del perfil. Uso: node src/build.mjs [frames|cards|button|header|stack] (sin argumento, todas).
// frames y header necesitan FONDO_VIDEO=<ruta al fondo_16-9.mp4 del portfolio>.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ANCHO_TARJETA = 610; // lienzo CSS; salen a 2x (1220 px) y el README las muestra a 830. En un móvil (~358 px) la letra de 24 px queda en ~14 px
const ALTO_TARJETA = 304;
const CARGO = 'AI Developer · Ponente y formador en IA';

const leer = (...p) => readFileSync(join(RAIZ, ...p));
const salida = (...p) => join(RAIZ, 'assets', ...p);
const fuenteB64 = (archivo) => `data:font/woff2;base64,${leer('src', 'fonts', archivo).toString('base64')}`;
const FONTS = `
@font-face{font-family:'Archivo';font-weight:400 700;font-stretch:62% 125%;src:url(${fuenteB64('archivo-latin.woff2')}) format('woff2')}
@font-face{font-family:'Bodoni Moda';font-style:italic;font-weight:500;src:url(${fuenteB64('bodoni-moda-italic-500-latin.woff2')}) format('woff2')}`;
const TOKENS = leer('src', 'tokens.css').toString();
const LOGOS = leer('src', 'logos.svg').toString().replace(/<!--[\s\S]*?-->/g, '').trim(); // <symbol> de Simple Icons (CC0)

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });

// Rellena la plantilla HTML y la captura con Chrome headless a 2x (con fondo transparente si se pide).
function capturar(plantilla, datos, destino, { alto, ancho, transparente = false }) {
  let html = leer('src', plantilla).toString();
  for (const [k, v] of Object.entries({ FONTS, TOKENS, ALTO: alto, ANCHO: ancho, ...datos })) html = html.replaceAll(`{{${k}}}`, () => String(v));
  mkdirSync(join(RAIZ, 'tmp'), { recursive: true });
  const tmp = join(RAIZ, 'tmp', `${plantilla}.tmp.html`);
  writeFileSync(tmp, html);
  execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
      `--window-size=${ancho},${alto}`, '--virtual-time-budget=3000',
      ...(transparente ? ['--default-background-color=00000000'] : []),
      `--screenshot=${destino}`, pathToFileURL(tmp).href],
    { stdio: 'ignore' },
  );
}

const fotoB64 = (id) => `data:image/jpeg;base64,${leer('src', 'frames', `${id}.jpg`).toString('base64')}`;

function buildCards() {
  mkdirSync(salida(), { recursive: true });
  for (const { id, lado, titulo, texto } of JSON.parse(leer('src', 'cards.json'))) {
    const png = join(RAIZ, 'tmp', `card-${id}.png`);
    capturar('card.html', { LADO: lado, FOTO: fotoB64(id), TITULO: esc(titulo), TEXTO: esc(texto) }, png, { alto: ALTO_TARJETA, ancho: ANCHO_TARJETA });
    ffmpeg('-i', png, '-c:v', 'libwebp', '-q:v', '90', '-compression_level', '6', salida(`card-${id}.webp`)); // con foto, el PNG pesa 5 veces más
  }
}

// Un glifo de la colección de logos, para incrustarlo en una página HTML (el botón).
function glifo(id) {
  const m = LOGOS.match(new RegExp(`<symbol id="${id}"([^>]*)>([\\s\\S]*?)</symbol>`));
  const vista = m[1].match(/viewBox="([^"]+)"/)[1];
  return `<svg class="icono" viewBox="${vista}" width="30" height="30" aria-hidden="true">${m[2]}</svg>`;
}

function buildButton() {
  mkdirSync(salida(), { recursive: true });
  capturar('button.html', { ICONO: glifo('linkedin'), TEXTO: 'Conectemos en LinkedIn' }, salida('button-linkedin.png'), { alto: 92, ancho: 420, transparente: true });
}

const FONDO_VIDEO = process.env.FONDO_VIDEO; // ruta al vídeo del túnel (fondo_16-9.mp4 del portfolio)
const CALIDAD_WEBP = process.env.CALIDAD_WEBP ?? '75';
const BUCLE = { inicio: 0.5, segundos: 2.2 }; // tramo del túnel; va y vuelve para cerrar sin salto
const RECORTE = 'crop=1920:480:0:300'; // 4:1 centrado en el túnel (el vídeo es de 1920x1080)

function exigirVideo() {
  if (!FONDO_VIDEO) throw new Error('Falta FONDO_VIDEO: ruta al vídeo del túnel (fondo_16-9.mp4 del portfolio).');
}

// Un fotograma distinto del túnel por tarjeta: se extraen una vez y se versionan en src/frames/.
const MOMENTOS = { codigo: 1.4, comunicacion: 5.6, negocio: 2.0 }; // túnel, hielo arquitectónico, túnel

function buildFrames() {
  exigirVideo();
  mkdirSync(join(RAIZ, 'src', 'frames'), { recursive: true });
  for (const [id, t] of Object.entries(MOMENTOS)) {
    ffmpeg('-ss', String(t), '-i', FONDO_VIDEO, '-vf', 'crop=513:1080:900:0,scale=300:632:flags=lanczos',
      '-frames:v', '1', '-q:v', '3', join(RAIZ, 'src', 'frames', `${id}.jpg`));
  }
}

// Grafo de ffmpeg: recorte, escala, bucle de ida y vuelta (sin repetir fotogramas en las costuras) y rótulo encima.
function grafo(ancho, alto, fps) {
  const n = Math.round(BUCLE.segundos * fps);
  return `[0:v]fps=${fps},${RECORTE},scale=${ancho}:${alto}:flags=lanczos,setsar=1,split[a][b];`
    + `[b]reverse,trim=start_frame=1:end_frame=${n - 1},setpts=PTS-STARTPTS[r];`
    + `[a][r]concat=n=2:v=1:a=0,setpts=N/(${fps}*TB)[bucle];`
    + `[1:v]scale=${ancho}:${alto}[rotulo];[bucle][rotulo]overlay=0:0:format=auto`;
}

function buildHeader() {
  exigirVideo();
  mkdirSync(salida(), { recursive: true });
  const rotulo = join(RAIZ, 'tmp', 'rotulo.png');
  capturar('header-overlay.html', { CARGO }, rotulo, { alto: 150, ancho: 600, transparente: true });
  const entrada = ['-ss', String(BUCLE.inicio), '-t', String(BUCLE.segundos), '-i', FONDO_VIDEO, '-i', rotulo];
  ffmpeg(...entrada, '-filter_complex', `${grafo(1200, 300, 15)},format=yuva420p[out]`, '-map', '[out]',
    '-c:v', 'libwebp_anim', '-q:v', CALIDAD_WEBP, '-compression_level', '6', '-loop', '0', salida('header.webp'));
  ffmpeg('-ss', '1.6', '-i', FONDO_VIDEO, '-i', rotulo, '-filter_complex',
    `[0:v]${RECORTE},scale=1200:300:flags=lanczos,setsar=1[v];[1:v]scale=1200:300[o];[v][o]overlay=0:0:format=auto`,
    '-frames:v', '1', salida('header-static.png'));
}

// Órbita del stack: pastillas fijas y legibles (con logo de color cuando lo hay) sobre aros punteados que giran con un satélite luminoso.
function buildStack() {
  const [cx, cy] = [305, 220];
  const { logos, anillos } = JSON.parse(leer('src', 'stack.json')); // logos: nombre -> [id del símbolo, color]
  const anchoPastilla = (nombre) => Math.round(nombre.length * 11.4 + 36 + (logos[nombre] ? 26 : 0));
  const centros = (fases) => anillos.flatMap(({ radio, items }, i) => items.map((nombre, k) => {
    const ang = (2 * Math.PI * k) / items.length + fases[i];
    return { x: cx + radio * Math.cos(ang), y: cy + radio * Math.sin(ang), w: anchoPastilla(nombre) };
  }));
  const choques = (fases) => centros(fases).reduce((n, a, i, c) => n + c.slice(i + 1)
    .filter((b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 8 && Math.abs(a.y - b.y) < 42).length, 0);
  // Posición de las pastillas sin que ninguna se monte sobre otra.
  let fases = [0, 0, 0];
  let menos = Infinity;
  for (let f1 = 0; f1 < 6.28; f1 += 0.12) {
    for (let f2 = 0; f2 < 6.28; f2 += 0.12) {
      const n = choques([0, f1, f2]);
      if (n < menos) { menos = n; fases = [0, f1, f2]; }
    }
  }
  // Giran los aros punteados con su satélite; las pastillas quedan fijas (si giraran, al ser anchas y rectas se pisarían).
  const css = anillos.map(({ vuelta, sentido }, i) => `.r${i}{animation-duration:${vuelta}s;animation-direction:${sentido > 0 ? 'normal' : 'reverse'}}`).join('\n');
  const aros = anillos.map(({ radio }, i) => `<g class="giro r${i}"><circle class="anillo" cx="${cx}" cy="${cy}" r="${radio}"/>`
    + `<circle class="sat" cx="${cx + radio}" cy="${cy}" r="4.5"/></g>`).join('\n');
  const pastillas = anillos.flatMap(({ radio, items }, i) => items.map((nombre, k) => {
    const ang = (2 * Math.PI * k) / items.length + fases[i];
    const w = anchoPastilla(nombre);
    const logo = logos[nombre]
      ? `<use class="logo" href="#${logos[nombre][0]}" fill="${logos[nombre][1]}" x="${-w / 2 + 16}" y="-9" width="18" height="18"/>` : '';
    return `<g class="pastilla" transform="translate(${(cx + radio * Math.cos(ang)).toFixed(1)} ${(cy + radio * Math.sin(ang)).toFixed(1)})">`
      + `<rect x="${-w / 2}" y="-17" width="${w}" height="34" rx="17"/>${logo}<text x="${logos[nombre] ? 13 : 0}">${esc(nombre)}</text></g>`;
  })).join('\n');
  const svg = leer('src', 'stack.svg').toString()
    .replaceAll('{{FONTS}}', () => FONTS).replaceAll('{{SIMBOLOS}}', () => LOGOS)
    .replaceAll('{{CSS}}', () => css).replaceAll('{{ANILLOS}}', () => `${aros}\n${pastillas}`);
  writeFileSync(salida('stack.svg'), svg);
}

const tareas = { frames: buildFrames, cards: buildCards, button: buildButton, header: buildHeader, stack: buildStack };
for (const t of process.argv[2] ? [process.argv[2]] : Object.keys(tareas)) tareas[t]();
