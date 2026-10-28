// 4.3.0: lo que se sacó no debe volver (campanita, línea de la barra, respuestas rápidas sin pantalla)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const leer = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DEFAULTS ya no trae respuestasRapidas', () => {
  const { DEFAULTS } = require('../db');
  assert.equal('respuestasRapidas' in DEFAULTS, false);
});
test('index.html ya no tiene campanita', () => {
  assert.equal(/id="bCampana"|id="campPop"/.test(leer('public/index.html')), false);
});
test('app.css ya no dibuja la línea de la barra', () => {
  assert.equal(/\.stage::after/.test(leer('public/app.css')), false);
});
test('server.js ya no tiene la ruta de la campanita ni nombres de lo quitado', () => {
  const s = leer('server.js');
  assert.equal(/\/api\/campana|respuestasRapidas|resumen: 'el resumen diario'/.test(s), false);
});
