const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../carriles');

const reglas = { esperaMin: 45, esperaMax: 120, descansoCada: 2, descansoMin: 10 };
const rand = (a) => a;

test('elegir: dos grupos corriendo se alternan por nextAt', () => {
  const carriles = { t1: { nextAt: 1000 }, t2: { nextAt: 500 } };
  const r = C.elegir({ auto: null, tandas: [{ id: 1, item: { id: 10 } }, { id: 2, item: { id: 20 } }], carriles, ahora: 2000, puedeMasivo: true });
  assert.equal(r.clave, 't2');
  assert.equal(r.item.id, 20);
});

test('elegir: un carril con nextAt futuro no sale', () => {
  const r = C.elegir({ auto: null, tandas: [{ id: 1, item: { id: 10 } }], carriles: { t1: { nextAt: 5000 } }, ahora: 2000, puedeMasivo: true });
  assert.equal(r, null);
});

test('elegir: con el máximo diario solo salen agendados', () => {
  const tandas = [{ id: 1, item: { id: 10, tipo: 'masivo' } }];
  assert.equal(C.elegir({ auto: { id: 5, tipo: 'agendado' }, tandas, carriles: {}, ahora: 2000, puedeMasivo: false }).clave, 'auto');
  assert.equal(C.elegir({ auto: { id: 5, tipo: 'meta' }, tandas, carriles: {}, ahora: 2000, puedeMasivo: false }), null);
});

test('elegir: un agendado sale aunque su carril esté en pausa', () => {
  const r = C.elegir({ auto: { id: 5, tipo: 'agendado' }, tandas: [], carriles: { auto: { nextAt: 99999 } }, ahora: 2000, puedeMasivo: true });
  assert.equal(r.clave, 'auto');
});

test('elegir: en empate gana auto y luego el grupo más antiguo', () => {
  const tandas = [{ id: 3, item: { id: 30 } }, { id: 2, item: { id: 20 } }];
  assert.equal(C.elegir({ auto: { id: 5, tipo: 'meta' }, tandas, carriles: {}, ahora: 1, puedeMasivo: true }).clave, 'auto');
  assert.equal(C.elegir({ auto: null, tandas, carriles: {}, ahora: 1, puedeMasivo: true }).clave, 't2');
});

test('elegir: grupos sin pendiente no cuentan', () => {
  assert.equal(C.elegir({ auto: null, tandas: [{ id: 1, item: null }], carriles: {}, ahora: 1, puedeMasivo: true }), null);
});

test('despuesDeEnviar: descanso cada N', () => {
  const c = {};
  C.despuesDeEnviar(c, { reglas, agendado: false, ahora: 1000, rand });
  assert.equal(c.nextAt, 1000 + 45000);
  C.despuesDeEnviar(c, { reglas, agendado: false, ahora: 1000, rand });
  assert.equal(c.nextAt, 1000 + 600000);
});

test('despuesDeEnviar: un agendado no acorta la pausa', () => {
  const c = { nextAt: 1000 + 90000, enviadosSesion: 3 };
  C.despuesDeEnviar(c, { reglas, agendado: true, ahora: 1000, rand });
  assert.equal(c.nextAt, 1000 + 90000);
  assert.equal(c.enviadosSesion, 3);
  const d = {};
  C.despuesDeEnviar(d, { reglas, agendado: true, ahora: 1000, rand });
  assert.equal(d.nextAt, 1000 + 8000);
});

test('trasError espera 15 s', () => {
  const c = {};
  C.trasError(c, 1000);
  assert.equal(c.nextAt, 16000);
});
