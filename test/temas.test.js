// Temas de color: Claro, Invertido, Oscuro y Automático (por horario)
const test = require('node:test');
const assert = require('node:assert');
const { temaEfectivo, BARRA, ICONO, TEMAS } = require('../temas');

test('auto es oscuro a las 21:00 y a las 06:59', () => {
  assert.equal(temaEfectivo('auto', new Date(2026, 9, 28, 21, 0)), 'oscuro');
  assert.equal(temaEfectivo('auto', new Date(2026, 9, 28, 6, 59)), 'oscuro');
});
test('auto es claro a las 07:00 y a las 19:59', () => {
  assert.equal(temaEfectivo('auto', new Date(2026, 9, 28, 7, 0)), 'claro');
  assert.equal(temaEfectivo('auto', new Date(2026, 9, 28, 19, 59)), 'claro');
});
test('auto respeta horas propias, incluso si no cruzan medianoche', () => {
  assert.equal(temaEfectivo('auto', new Date(2026, 9, 28, 13, 0), { oscuro: '12:00', claro: '14:00' }), 'oscuro');
  assert.equal(temaEfectivo('auto', new Date(2026, 9, 28, 15, 0), { oscuro: '12:00', claro: '14:00' }), 'claro');
});
test('temas fijos no dependen de la hora; valor raro cae en claro', () => {
  assert.equal(temaEfectivo('invertido', new Date(2026, 9, 28, 23, 0)), 'invertido');
  assert.equal(temaEfectivo('oscuro', new Date(2026, 9, 28, 12, 0)), 'oscuro');
  assert.equal(temaEfectivo('xx', new Date()), 'claro');
});
test('barra de título por tema', () => {
  assert.deepEqual(BARRA.claro, { color: '#2F4A3C', symbolColor: '#F6ECDA' });
  assert.deepEqual(BARRA.invertido, { color: '#B4472C', symbolColor: '#FBEDE7' });
  assert.deepEqual(BARRA.oscuro, { color: '#221E1A', symbolColor: '#ECE2D2' });
});
test('cada tema elegible tiene nombre e ícono', () => {
  assert.deepEqual(TEMAS.map((t) => t.id), ['claro', 'invertido', 'oscuro', 'auto']);
  for (const t of TEMAS) assert.match(ICONO[t.id], /^<svg/);
});
