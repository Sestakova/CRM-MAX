// UF fija del día 5 de cada mes y el 7% de salud con tope imponible
const test = require('node:test');
const assert = require('node:assert/strict');
const { fechaUFVigente, urlUF, necesitaUF, siete } = require('../uf');

test('del 5 en adelante rige el 5 del mes; del 1 al 4, el del mes anterior', () => {
  assert.equal(fechaUFVigente(new Date(2026, 9, 5, 0, 1)), '2026-10-05');
  assert.equal(fechaUFVigente(new Date(2026, 9, 28)), '2026-10-05');
  assert.equal(fechaUFVigente(new Date(2026, 10, 4, 23, 59)), '2026-10-05');
  assert.equal(fechaUFVigente(new Date(2027, 0, 3)), '2026-12-05');
});
test('url de mindicador por día', () => assert.equal(urlUF('2026-10-05'), 'https://mindicador.cl/api/uf/05-10-2026'));
test('pide UF solo si la guardada no es la vigente', () => {
  assert.equal(necesitaUF(null, new Date(2026, 9, 28)), true);
  assert.equal(necesitaUF({ fecha: '2026-10-05' }, new Date(2026, 9, 28)), false);
  assert.equal(necesitaUF({ fecha: '2026-10-05' }, new Date(2026, 10, 5, 9)), true);
  assert.equal(necesitaUF({ fecha: '2026-10-05' }, new Date(2026, 10, 4, 9)), false);
});
test('7% sin tope', () => assert.deepEqual(siete(1500000, 39500), { pesos: 105000, uf: 2.66, conTope: false }));
test('7% con tope de 90 UF', () => assert.deepEqual(siete(5000000, 39500, 90), { pesos: 248850, uf: 6.3, conTope: true }));
test('renta como texto con puntos', () => assert.deepEqual(siete('1.500.000', 39500), { pesos: 105000, uf: 2.66, conTope: false }));
test('renta vacía, cero o sin UF no da 7%', () => {
  assert.equal(siete('', 39500), null);
  assert.equal(siete(0, 39500), null);
  assert.equal(siete(1500000, null), null);
});
