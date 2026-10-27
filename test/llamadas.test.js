const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../llamadas');
const { DEFAULTS } = require('../db');

const hora = (base, dias, h, m = 0) => { const d = new Date(base); d.setDate(d.getDate() + dias); d.setHours(h, m, 0, 0); return d; };
const hoy = hora(new Date(), 0, 9);   // hoy a las 9:00
const todo = { confirmacion: true, recordatorio: true, minutos: 60, aviso: true, avisoMin: 10 };

test('plan con todo activo', () => {
  const f = hora(hoy, 1, 16);
  const p = L.plan(f, todo, hoy);
  assert.equal(p.confirmacion, true);
  assert.equal(p.recordatorio.getTime(), hora(hoy, 1, 15).getTime());
  assert.equal(p.aviso.getTime(), hora(hoy, 1, 15, 50).getTime());
});

test('el día anterior es a las 18:00', () => {
  const f = hora(hoy, 3, 10);
  const p = L.plan(f, { ...todo, minutos: 'dia_antes' }, hoy);
  assert.equal(p.recordatorio.getTime(), hora(hoy, 2, 18).getTime());
});

test('día anterior que ya pasó no se envía', () => {
  const f = hora(hoy, 1, 10);
  const p = L.plan(f, { ...todo, minutos: 'dia_antes' }, hora(hoy, 0, 19));
  assert.equal(p.recordatorio, null);
});

test('un recordatorio a menos de 5 minutos no se envía', () => {
  const f = hora(hoy, 0, 10);
  assert.equal(L.plan(f, { ...todo, minutos: 15 }, hora(hoy, 0, 9, 50)).recordatorio, null);
});

test('todo apagado', () => {
  const p = L.plan(hora(hoy, 1, 16), { confirmacion: false, recordatorio: false, minutos: 60, aviso: false, avisoMin: 10 }, hoy);
  assert.deepEqual(p, { confirmacion: false, recordatorio: null, aviso: null });
});

test('una llamada antigua sin opciones usa la configuración', () => {
  assert.deepEqual(L.desdeConfig(DEFAULTS.llamadas), { confirmacion: true, recordatorio: true, minutos: 60, aviso: true, avisoMin: 10 });
});

test('opciones que vienen de la pantalla se limpian', () => {
  assert.deepEqual(L.limpiar({ confirmacion: 1, recordatorio: 'si', minutos: '120', aviso: 0, avisoMin: '-4' }), { confirmacion: true, recordatorio: true, minutos: 120, aviso: false, avisoMin: 0 });
  assert.equal(L.limpiar({ minutos: 'dia_antes' }).minutos, 'dia_antes');
  assert.equal(L.limpiar({ minutos: 'cualquiera' }).minutos, 60);
});
