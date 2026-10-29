// Errores encontrados en la revisión de la 4.3.0
const test = require('node:test');
const assert = require('node:assert/strict');
const { baseNueva } = require('./ayuda');
const { estado, fechaValida } = require('../anualidad');
const { topeValido } = require('../uf');

test('buscar no depende de tildes ni mayúsculas', async () => {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'Matías', apellido: 'Ñúñez' });
  assert.equal(db.buscarContactos({ q: 'matias' }).length, 1);
  assert.equal(db.buscarContactos({ q: 'NUNEZ' }).length, 1);
  assert.equal(db.buscarContactos({ q: 'ñúñez' }).length, 1);
});
test('datos para avisos cuentan si la persona ya espera en la cola de envíos', async () => {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'Ana' });
  const t = db.crearTanda({ nombre: 'A', usuario: 'x', tipo: 'masivo', total: 1 });
  db.encolar([{ telefono: '56911111111', texto: 'hola', tipo: 'masivo' }], t);
  assert.equal(db.datosParaAvisos(['56911111111']).get('56911111111').enCola, 1);
});
test('una etapa que no existe no se guarda', async () => {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'Ana' });
  assert.throws(() => db.actualizarContacto('56911111111', { etapa: 'Inventada' }), /Etapa/);
  assert.equal(db.contacto('56911111111').etapa, 'Nuevo');
});
test('edad fuera de rango queda vacía', async () => {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'Ana' });
  assert.equal(db.actualizarContacto('56911111111', { edad: '-5' }).edad, null);
  assert.equal(db.actualizarContacto('56911111111', { edad: '200' }).edad, null);
  assert.equal(db.actualizarContacto('56911111111', { edad: '41' }).edad, 41);
});
test('usuario «CRM MAX» pasa a «Administrador»', async () => {
  const db = await baseNueva();
  const AUTH = require('../auth');
  AUTH({ db, log: () => {} });
  db.run("INSERT INTO usuarios (nombre, rol, pin, creado) VALUES ('CRM MAX', 'admin', 'x', 'y')");
  AUTH({ db, log: () => {} });   // al volver a abrir el programa
  assert.equal(db.get("SELECT nombre FROM usuarios WHERE rol = 'admin'").nombre, 'Administrador');
});
test('anualidad: a menos de un mes dice los días que faltan', () => {
  const e = estado('2025-11-05', '2026-10-29');
  assert.equal(e.mesesFaltan, 0);
  assert.equal(e.diasFaltan, 7);
});
test('fecha válida: no acepta 30 de febrero ni formatos raros', () => {
  assert.equal(fechaValida('2026-02-28'), true);
  assert.equal(fechaValida('2026-02-30'), false);
  assert.equal(fechaValida('28-02-2026'), false);
});
test('tope imponible: solo valores entre 1 y 500 UF', () => {
  assert.equal(topeValido(90), 90);
  assert.equal(topeValido(-3), 90);
  assert.equal(topeValido('abc'), 90);
  assert.equal(topeValido(1000), 500);
});
