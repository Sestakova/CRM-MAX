const test = require('node:test');
const assert = require('node:assert/strict');
const { baseNueva, carpetaNueva, esperarGuardado } = require('./ayuda');

const it = (telefono, tipo = 'masivo') => ({ telefono, texto: 'hola', tipo });

test('mensajes sin tanda siguen saliendo en orden', async () => {
  const db = await baseNueva();
  db.encolar([it('56911111111'), it('56922222222')]);
  assert.equal(db.siguienteEnCola().telefono, '56911111111');
});

test('una tanda en pausa no frena a otras, ni agendados, ni mensajes sin tanda', async () => {
  const db = await baseNueva();
  const t1 = db.crearTanda({ nombre: 'A', usuario: 'Jesús', tipo: 'masivo', total: 1 });
  const t2 = db.crearTanda({ nombre: 'B', usuario: 'Jesús', tipo: 'masivo', total: 1 });
  db.encolar([it('56911111111')], t1);
  db.encolar([it('56922222222')], t2);
  db.run('UPDATE tandas SET pausada = 1 WHERE id = ?', [t1]);
  assert.equal(db.siguienteEnCola().telefono, '56922222222');
  db.run("UPDATE tandas SET pausada = 1 WHERE id = ?", [t2]);
  db.encolar([it('56944444444')]);
  assert.equal(db.siguienteEnCola().telefono, '56944444444');
  db.encolar([it('56933333333', 'agendado')]);
  assert.equal(db.siguienteEnCola().telefono, '56933333333');
});

test('una tanda cancelada no entrega más mensajes', async () => {
  const db = await baseNueva();
  const t = db.crearTanda({ nombre: 'A', usuario: 'Jesús', tipo: 'masivo', total: 1 });
  db.encolar([it('56911111111')], t);
  db.run("UPDATE tandas SET estado = 'cancelada' WHERE id = ?", [t]);
  assert.equal(db.siguienteEnCola(), undefined);
});

test('marcarEnviando solo funciona una vez y solo sobre pendientes', async () => {
  const db = await baseNueva();
  db.encolar([it('56911111111'), it('56922222222')]);
  const [a, b] = db.all('SELECT id FROM cola ORDER BY id').map((r) => r.id);
  assert.equal(db.marcarEnviando(a), true);
  assert.equal(db.marcarEnviando(a), false);
  db.run("UPDATE cola SET estado = 'sacado' WHERE id = ?", [b]);
  assert.equal(db.marcarEnviando(b), false);
});

test('un mensaje que quedó enviando pasa a error al reabrir la base', async () => {
  const carpeta = carpetaNueva();
  const db = await baseNueva(carpeta);
  db.encolar([it('56911111111')]);
  const id = db.get('SELECT id FROM cola').id;
  db.marcarEnviando(id);
  await esperarGuardado();
  const db2 = await baseNueva(carpeta);
  const fila = db2.get('SELECT estado, detalle FROM cola WHERE id = ?', [id]);
  assert.equal(fila.estado, 'error');
  assert.match(fila.detalle, /^El programa se cerró/);
});
