// Comprobador del repo del perfil. Sin dependencias: `node scripts/check.mjs`.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (...p) => join(RAIZ, ...p);

let fallos = 0;
function check(regla, ok, detalle = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${regla}${ok || !detalle ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

check('README.md existe', existsSync(ruta('README.md')));
check('assets/ existe', existsSync(ruta('assets')));

process.exitCode = fallos ? 1 : 0;
