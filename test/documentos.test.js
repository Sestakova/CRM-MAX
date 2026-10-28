// Carpeta «Clientes CRM HERMES» en el escritorio: una subcarpeta por cliente
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const d = require('../documentos');

const unix = (p) => p.replace(/\\/g, '/');

test('nombre de carpeta con nombre y teléfono', () => assert.equal(d.nombreCarpeta({ nombre: 'María', apellido: 'Pérez' }, '56912345678'), 'María Pérez (+56 9 1234 5678)'));
test('contacto sin nombre usa solo el teléfono', () => assert.equal(d.nombreCarpeta({ nombre: '' }, '56912345678'), '+56 9 1234 5678'));
test('sin contacto va a Sin asignar', () => {
  assert.equal(d.nombreCarpeta(null, null), 'Sin asignar');
  assert.equal(d.nombreCarpeta(null, '56912345678'), 'Sin asignar');
});
test('caracteres prohibidos fuera', () => assert.equal(d.nombreCarpeta({ nombre: 'Ana: "la" <jefa>?.' }, '56912345678'), 'Ana la jefa (+56 9 1234 5678)'));
test('reusa la carpeta del mismo teléfono aunque cambió el nombre', () => {
  assert.equal(d.carpetaDe('56912345678', { nombre: 'María José' }, ['Otra (+56 9 0000 0000)', 'María Pérez (+56 9 1234 5678)']), 'María Pérez (+56 9 1234 5678)');
  assert.equal(d.carpetaDe('56912345678', { nombre: 'María José' }, []), 'María José (+56 9 1234 5678)');
  assert.equal(d.carpetaDe(null, null, ['Sin asignar']), 'Sin asignar');
});
test('nombre libre agrega (2) y (3)', () => {
  const hay = new Set(['C:/x/liq.pdf', 'C:/x/liq (2).pdf']);
  assert.equal(unix(d.rutaLibre('C:/x', 'liq.pdf', (p) => hay.has(unix(p)))), 'C:/x/liq (3).pdf');
  assert.equal(unix(d.rutaLibre('C:/x', 'nuevo.pdf', () => false)), 'C:/x/nuevo.pdf');
});
test('nombre de archivo sin rutas ni caracteres raros', () => {
  assert.equal(unix(d.rutaLibre('C:/x', '..\\..\\malo.pdf', () => false)), 'C:/x/malo.pdf');
  assert.equal(unix(d.rutaLibre('C:/x', '', () => false)), 'C:/x/documento');
});
test('desktop.ini apunta al ícono de la carpeta', () => assert.match(d.desktopIni(), /\[\.ShellClassInfo\]\r\nIconResource=carpeta\.ico,0\r\n/));
test('dentroDe acepta solo rutas bajo la raíz', () => {
  const raiz = path.join('C:', 'Users', 'j', 'Desktop', d.RAIZ_NOMBRE);
  assert.equal(d.dentroDe(raiz, path.join(raiz, 'María Pérez (+56 9 1234 5678)', 'a.pdf')), true);
  assert.equal(d.dentroDe(raiz, path.join(raiz, '..', 'otra', 'a.pdf')), false);
  assert.equal(d.dentroDe(raiz, raiz + ' falsa\\a.pdf'), false);
});
