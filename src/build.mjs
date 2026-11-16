// Genera las imágenes del perfil. Uso: node src/build.mjs [cards]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ANCHO = 830; // lienzo CSS; las capturas salen a 2x (1660 px)
const ALTO_TARJETA = 280;

const leer = (...p) => readFileSync(join(RAIZ, ...p));
const fuenteB64 = (archivo) => `data:font/woff2;base64,${leer('src', 'fonts', archivo).toString('base64')}`;
const FONTS = `
@font-face{font-family:'Archivo';font-weight:400 700;font-stretch:62% 125%;src:url(${fuenteB64('archivo-latin.woff2')}) format('woff2')}
@font-face{font-family:'Bodoni Moda';font-style:italic;font-weight:500;src:url(${fuenteB64('bodoni-moda-italic-500-latin.woff2')}) format('woff2')}
@font-face{font-family:'IBM Plex Mono';font-weight:500;src:url(${fuenteB64('ibm-plex-mono-500-latin.woff2')}) format('woff2')}`;
const TOKENS = leer('src', 'tokens.css').toString();

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

// Rellena la plantilla HTML y la captura con Chrome headless a 2x.
function capturar(plantilla, datos, salida, alto) {
  let html = leer('src', plantilla).toString();
  for (const [k, v] of Object.entries({ FONTS, TOKENS, ALTO: alto, ...datos })) html = html.replaceAll(`{{${k}}}`, () => String(v));
  mkdirSync(join(RAIZ, 'tmp'), { recursive: true });
  const tmp = join(RAIZ, 'tmp', `${plantilla}.tmp.html`);
  writeFileSync(tmp, html);
  execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
      `--window-size=${ANCHO},${alto}`, '--virtual-time-budget=3000', `--screenshot=${salida}`, pathToFileURL(tmp).href],
    { stdio: 'ignore' },
  );
}

async function buildCards() {
  mkdirSync(join(RAIZ, 'assets'), { recursive: true });
  const tarjetas = JSON.parse(leer('src', 'cards.json'));
  for (const { id, etiqueta, titulo, en, es } of tarjetas) {
    capturar('card.html', { ETIQUETA: esc(etiqueta), TITULO: esc(titulo), EN: esc(en), ES: esc(es) },
      join(RAIZ, 'assets', `card-${id}.png`), ALTO_TARJETA);
  }
}

const tareas = { cards: buildCards };
for (const t of process.argv[2] ? [process.argv[2]] : Object.keys(tareas)) await tareas[t]();
