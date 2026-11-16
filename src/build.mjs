// Genera las imágenes del perfil. Uso: node src/build.mjs [cards|header] (sin argumento, ambas)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ANCHO_TARJETA = 610; // lienzo CSS; salen a 2x (1220 px) y el README las muestra a 830. En un móvil (~358 px) la letra de 22 px queda en ~13 px
const ALTO_TARJETA = 384;

const leer = (...p) => readFileSync(join(RAIZ, ...p));
const fuenteB64 = (archivo) => `data:font/woff2;base64,${leer('src', 'fonts', archivo).toString('base64')}`;
const FONTS = `
@font-face{font-family:'Archivo';font-weight:400 700;font-stretch:62% 125%;src:url(${fuenteB64('archivo-latin.woff2')}) format('woff2')}
@font-face{font-family:'Bodoni Moda';font-style:italic;font-weight:500;src:url(${fuenteB64('bodoni-moda-italic-500-latin.woff2')}) format('woff2')}
@font-face{font-family:'IBM Plex Mono';font-weight:500;src:url(${fuenteB64('ibm-plex-mono-500-latin.woff2')}) format('woff2')}`;
const TOKENS = leer('src', 'tokens.css').toString();

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

// Rellena la plantilla HTML y la captura con Chrome headless a 2x (con fondo transparente si se pide).
function capturar(plantilla, datos, salida, { alto, ancho, transparente = false }) {
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
      `--screenshot=${salida}`, pathToFileURL(tmp).href],
    { stdio: 'ignore' },
  );
}

function buildCards() {
  mkdirSync(join(RAIZ, 'assets'), { recursive: true });
  const tarjetas = JSON.parse(leer('src', 'cards.json'));
  for (const { id, etiqueta, titulo, en, es } of tarjetas) {
    capturar('card.html', { ETIQUETA: esc(etiqueta), TITULO: esc(titulo), EN: esc(en), ES: esc(es) },
      join(RAIZ, 'assets', `card-${id}.png`), { alto: ALTO_TARJETA, ancho: ANCHO_TARJETA });
  }
}

const FONDO_VIDEO = process.env.FONDO_VIDEO
  ?? join(RAIZ, '..', 'roadmap_vida_personal', 'portfolio_alessandro', 'media', 'scroll', 'fondo_16-9.mp4');
const CALIDAD_WEBP = process.env.CALIDAD_WEBP ?? '75';
const BUCLE = { inicio: 0.5, segundos: 2.2 }; // tramo del túnel; va y vuelve para cerrar sin salto
const RECORTE = 'crop=1920:480:0:300'; // 4:1 centrado en el túnel (el vídeo es de 1920x1080)

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });

// Grafo de ffmpeg: recorte, escala, bucle de ida y vuelta (sin repetir fotogramas en las costuras) y rótulo encima.
function grafo(ancho, alto, fps) {
  const n = Math.round(BUCLE.segundos * fps);
  return `[0:v]fps=${fps},${RECORTE},scale=${ancho}:${alto}:flags=lanczos,setsar=1,split[a][b];`
    + `[b]reverse,trim=start_frame=1:end_frame=${n - 1},setpts=PTS-STARTPTS[r];`
    + `[a][r]concat=n=2:v=1:a=0,setpts=N/(${fps}*TB)[bucle];`
    + `[1:v]scale=${ancho}:${alto}[rotulo];[bucle][rotulo]overlay=0:0:format=auto`;
}

function buildHeader() {
  mkdirSync(join(RAIZ, 'assets'), { recursive: true });
  const rotulo = join(RAIZ, 'tmp', 'rotulo.png');
  capturar('header-overlay.html', {}, rotulo, { alto: 150, ancho: 600, transparente: true });
  const entrada = ['-ss', String(BUCLE.inicio), '-t', String(BUCLE.segundos), '-i', FONDO_VIDEO, '-i', rotulo];
  const salida = (nombre) => join(RAIZ, 'assets', nombre);
  ffmpeg(...entrada, '-filter_complex', `${grafo(1200, 300, 15)},format=yuva420p[out]`, '-map', '[out]',
    '-c:v', 'libwebp_anim', '-q:v', CALIDAD_WEBP, '-compression_level', '6', '-loop', '0', salida('header.webp'));
  ffmpeg(...entrada, '-filter_complex',
    `${grafo(800, 200, 10)},split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];`
    + '[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[out]',
    '-map', '[out]', '-loop', '0', salida('header.gif'));
  ffmpeg('-ss', '1.6', '-i', FONDO_VIDEO, '-i', rotulo, '-filter_complex',
    `[0:v]${RECORTE},scale=1200:300:flags=lanczos,setsar=1[v];[1:v]scale=1200:300[o];[v][o]overlay=0:0:format=auto`,
    '-frames:v', '1', salida('header-static.png'));
}

const tareas = { cards: buildCards, header: buildHeader };
for (const t of process.argv[2] ? [process.argv[2]] : Object.keys(tareas)) tareas[t]();
