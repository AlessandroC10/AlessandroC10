// Comprobador del repo del perfil. Sin dependencias: `node scripts/check.mjs`.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (...p) => join(RAIZ, ...p);
const KB = 1024;
const CARDS = ['codigo', 'comunicacion', 'negocio', 'idiomas'].map((id) => `assets/card-${id}.png`);

// Ancho y alto de un PNG leyendo la cabecera IHDR (bytes 16-23), sin dependencias.
const pngSize = (archivo) => {
  const b = readFileSync(archivo);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
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

grupo('readme', () => {
  check('README.md existe', existsSync(ruta('README.md')));
});

// R1 + R2: tarjetas (ancho 1660 = lienzo de 830 px a 2x; hasta 300 KB cada una).
grupo('cards', () => {
  for (const c of CARDS) {
    const f = ruta(c);
    check(`${c} existe`, existsSync(f));
    if (!existsSync(f)) continue;
    const { w } = pngSize(f);
    check(`${c} mide 1660 px de ancho`, w === 1660, `ancho ${w}`);
    check(`${c} pesa como mucho 300 KB`, statSync(f).size <= 300 * KB, `${Math.round(statSync(f).size / KB)} KB`);
  }
});

process.exitCode = fallos ? 1 : 0;
