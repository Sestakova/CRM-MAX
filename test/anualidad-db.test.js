// Anualidad en la base: inicio, renovación sola, aviso único 30 días antes y migración desde 4.0.x
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { baseNueva, carpetaNueva, esperarGuardado } = require('./ayuda');
const { textoAviso } = require('../anualidad');

const avisos = (db, tel) => db.all('SELECT fecha, texto, hecho FROM recordatorios WHERE telefono = ? AND anual = 1', [tel]);
const local = (iso) => { const d = new Date(iso); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-'); };

async function cliente(desde = '2026-10-28') {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'María', apellido: 'Pérez', isapre: 'Colmena', etapa: 'Ingresado' });
  db.iniciarAnualidad('56911111111', desde, { tipo: 'ingreso' });
  return db;
}

test('iniciar deja la fecha y el historial', async () => {
  const db = await cliente();
  assert.equal(db.contacto('56911111111').anual_desde, '2026-10-28');
  assert.deepEqual(db.historialAnual('56911111111').map((h) => [h.fecha, h.tipo, h.isapre]), [['2026-10-28', 'ingreso', 'Colmena']]);
});
test('crea un solo aviso un mes antes, aunque corra dos veces', async () => {
  const db = await cliente();
  db.renovarAnualidadesHasta('2026-10-29', textoAviso);
  db.renovarAnualidadesHasta('2026-10-30', textoAviso);
  const a = avisos(db, '56911111111');
  assert.equal(a.length, 1);
  assert.equal(local(a[0].fecha), '2027-9-28');
  assert.equal(a[0].texto, 'Aniversario de María Pérez (Colmena): revisar su plan');
});
test('al pasar el aniversario se renueva sola y el aviso pasa al año siguiente', async () => {
  const db = await cliente();
  db.renovarAnualidadesHasta('2026-10-29', textoAviso);
  db.run('UPDATE recordatorios SET hecho = 1 WHERE anual = 1');
  db.renovarAnualidadesHasta('2027-10-28', textoAviso);
  assert.equal(db.contacto('56911111111').anual_desde, '2027-10-28');
  assert.equal(db.historialAnual('56911111111')[0].tipo, 'automatica');
  const pend = avisos(db, '56911111111').filter((a) => !a.hecho);
  assert.equal(pend.length, 1);
  assert.equal(local(pend[0].fecha), '2028-9-28');
});
test('un aviso marcado como hecho no se vuelve a crear', async () => {
  const db = await cliente();
  db.renovarAnualidadesHasta('2026-10-29', textoAviso);
  db.run('UPDATE recordatorios SET hecho = 1 WHERE anual = 1');
  db.renovarAnualidadesHasta('2027-09-29', textoAviso);
  assert.equal(avisos(db, '56911111111').length, 1);
});
test('renovar a mano cambia la fecha, la Isapre y mueve el aviso', async () => {
  const db = await cliente();
  db.renovarAnualidadesHasta('2026-10-29', textoAviso);
  db.iniciarAnualidad('56911111111', '2027-03-01', { tipo: 'renovada', motivo: 'Apertura de cartera', isapre: 'Banmédica' });
  db.renovarAnualidadesHasta('2026-10-29', textoAviso);
  assert.equal(db.contacto('56911111111').isapre, 'Banmédica');
  const a = avisos(db, '56911111111');
  assert.equal(a.length, 1);
  assert.equal(local(a[0].fecha), '2028-2-1');
  assert.equal(db.historialAnual('56911111111')[0].motivo, 'Apertura de cartera');
});
test('fuera de Ingresado no hay aviso pendiente', async () => {
  const db = await cliente();
  db.renovarAnualidadesHasta('2026-10-29', textoAviso);
  db.actualizarContacto('56911111111', { etapa: 'Perdido' });
  db.renovarAnualidadesHasta('2026-10-30', textoAviso);
  assert.equal(avisos(db, '56911111111').filter((a) => !a.hecho).length, 0);
  assert.equal(db.contacto('56911111111').anual_desde, '2026-10-28');
});
test('aniversarios del mes', async () => {
  const db = await cliente('2025-11-03');
  assert.deepEqual(db.aniversariosDelMes('2026-11-01').map((x) => [x.telefono, x.fecha]), [['56911111111', '2026-11-03']]);
  assert.deepEqual(db.aniversariosDelMes('2026-12-01'), []);
});
test('migración: toma ingreso_fecha de 4.0.x y no etapa_fecha', async () => {
  const dir = carpetaNueva();
  let db = await baseNueva(dir);
  db.guardarContacto({ telefono: '56911111111', nombre: 'Ana', etapa: 'Ingresado' });
  db.guardarContacto({ telefono: '56922222222', nombre: 'Beto', etapa: 'Ingresado' });
  db.run('UPDATE contactos SET ingreso_fecha = ? WHERE telefono = ?', [new Date(2025, 5, 10, 15).toISOString(), '56911111111']);
  db.setConfig('mig_430_anual', false);
  await esperarGuardado();
  db = await baseNueva(dir);
  assert.equal(db.contacto('56911111111').anual_desde, '2025-06-10');
  assert.equal(db.contacto('56922222222').anual_desde, null);
});
