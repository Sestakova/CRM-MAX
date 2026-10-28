// Etiquetas propias por contacto
const test = require('node:test');
const assert = require('node:assert/strict');
const { baseNueva } = require('./ayuda');

test('crear, poner y filtrar por etiqueta', async () => {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'Ana' });
  db.guardarContacto({ telefono: '56922222222', nombre: 'Beto' });
  const id = db.crearEtiqueta('2 cargas', 'et1');
  assert.equal(db.crearEtiqueta('2 CARGAS', 'et2'), id);
  db.ponerEtiqueta('56911111111', id);
  db.ponerEtiqueta('56911111111', id);
  assert.deepEqual(db.buscarContactos({ etiqueta: id }).map((c) => c.telefono), ['56911111111']);
  assert.deepEqual(db.etiquetasDe('56911111111').map((e) => e.nombre), ['2 cargas']);
  assert.equal(db.etiquetas().find((e) => e.id === id).usos, 1);
});
test('quitar y borrar etiqueta', async () => {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'Ana' });
  const a = db.crearEtiqueta('embarazo', 'et2'), b = db.crearEtiqueta('Fonasa → Isapre', 'et3');
  db.ponerEtiqueta('56911111111', a); db.ponerEtiqueta('56911111111', b);
  db.quitarEtiqueta('56911111111', a);
  assert.deepEqual(db.etiquetasDe('56911111111').map((e) => e.nombre), ['Fonasa → Isapre']);
  db.borrarEtiqueta(b);
  assert.deepEqual(db.etiquetasDe('56911111111'), []);
  assert.equal(db.etiquetas().length, 1);
});
test('nombre vacío no crea etiqueta y el color raro cae en et1', async () => {
  const db = await baseNueva();
  assert.equal(db.crearEtiqueta('   ', 'et1'), null);
  const id = db.crearEtiqueta('VIP', '#f00');
  assert.equal(db.etiquetas().find((e) => e.id === id).color, 'et1');
});
test('al pasar etiquetas de un contacto a otro no se duplican', async () => {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'Ana' });
  db.guardarContacto({ telefono: '56922222222', nombre: 'Ana' });
  const a = db.crearEtiqueta('a', 'et1'), b = db.crearEtiqueta('b', 'et2');
  db.ponerEtiqueta('56911111111', a); db.ponerEtiqueta('56922222222', a); db.ponerEtiqueta('56922222222', b);
  db.pasarEtiquetas('56922222222', '56911111111');
  assert.deepEqual(db.etiquetasDe('56911111111').map((e) => e.nombre).sort(), ['a', 'b']);
  assert.deepEqual(db.etiquetasDe('56922222222'), []);
});
