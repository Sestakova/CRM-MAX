const test = require('node:test');
const assert = require('node:assert/strict');
const { baseNueva, carpetaNueva, esperarGuardado } = require('./ayuda');

const it = (telefono, tipo = 'masivo') => ({ telefono, texto: 'hola', tipo });
const grupo = (db, nombre, modo) => db.crearTanda({ nombre, usuario: 'Jesús', tipo: 'masivo', total: 2, modo });
const ids = (db, t) => db.all('SELECT id FROM cola WHERE tanda = ? ORDER BY id', [t]).map((r) => r.id);

test('siguienteAuto no entrega mensajes de grupos y respeta la prioridad', async () => {
  const db = await baseNueva();
  const t = grupo(db, 'A', 'corriendo');
  db.encolar([it('56911111111')], t);
  db.encolar([it('56922222222', 'meta'), it('56933333333', 'agendado')]);
  assert.equal(db.siguienteAuto().telefono, '56933333333');
  db.cerrarItem(db.siguienteAuto().id, 'enviado');
  assert.equal(db.siguienteAuto().telefono, '56922222222');
  db.cerrarItem(db.siguienteAuto().id, 'enviado');
  assert.equal(db.siguienteAuto(), undefined);
});

test('un grupo Después espera al anterior, aunque esté en pausa', async () => {
  const db = await baseNueva();
  const a = grupo(db, 'A', 'corriendo'), b = grupo(db, 'B', 'despues');
  db.encolar([it('56911111111')], a);
  db.encolar([it('56922222222')], b);
  assert.deepEqual(db.tandasQuePuedenEnviar().map((t) => t.id), [a]);
  db.pausarTanda(a, true);
  assert.deepEqual(db.tandasQuePuedenEnviar().map((t) => t.id), []);
  db.cancelarTanda(a);
  assert.deepEqual(db.tandasQuePuedenEnviar().map((t) => t.id), [b]);
});

test('un grupo Después parte cuando el anterior termina', async () => {
  const db = await baseNueva();
  const a = grupo(db, 'A', 'despues'), b = grupo(db, 'B', 'despues');
  db.encolar([it('56911111111')], a);
  db.encolar([it('56922222222')], b);
  db.cerrarItem(ids(db, a)[0], 'enviado');
  assert.deepEqual(db.tandasQuePuedenEnviar().map((t) => t.id), [b]);
});

test('un grupo Corriendo sale aunque haya otro antes', async () => {
  const db = await baseNueva();
  const a = grupo(db, 'A', 'despues'), b = grupo(db, 'B', 'corriendo');
  db.encolar([it('56911111111')], a);
  db.encolar([it('56922222222')], b);
  assert.deepEqual(db.tandasQuePuedenEnviar().map((t) => t.id), [a, b]);
});

test('un grupo cuyo anterior está enviando su último mensaje sigue esperando', async () => {
  const db = await baseNueva();
  const a = grupo(db, 'A', 'despues'), b = grupo(db, 'B', 'despues');
  db.encolar([it('56911111111')], a);
  db.encolar([it('56922222222')], b);
  db.marcarEnviando(ids(db, a)[0]);
  assert.deepEqual(db.tandasQuePuedenEnviar().map((t) => t.id), []);
});

test('bloqueadaPor devuelve el primer grupo que la frena', async () => {
  const db = await baseNueva();
  const a = grupo(db, 'A', 'despues'), b = grupo(db, 'B', 'corriendo'), c = grupo(db, 'C', 'despues');
  for (const [t, tel] of [[a, '56911111111'], [b, '56922222222'], [c, '56933333333']]) db.encolar([it(tel)], t);
  assert.equal(db.bloqueadaPor(c).nombre, 'A');
  assert.equal(db.bloqueadaPor(a), null);
});

test('una tanda en pausa o cancelada no entrega mensajes', async () => {
  const db = await baseNueva();
  const a = grupo(db, 'A', 'corriendo'), b = grupo(db, 'B', 'corriendo');
  db.encolar([it('56911111111')], a);
  db.encolar([it('56922222222')], b);
  db.pausarTanda(a, true);
  db.cancelarTanda(b);
  assert.deepEqual(db.tandasQuePuedenEnviar(), []);
});

test('ordenarTanda respeta el nuevo orden y deja al final los no mencionados', async () => {
  const db = await baseNueva();
  const t = grupo(db, 'A', 'despues');
  db.encolar(['56911111111', '56922222222', '56933333333', '56944444444'].map((x) => it(x)), t);
  const [a, b, c, d] = ids(db, t);
  db.ordenarTanda(t, [c, a]);
  const orden = [];
  for (let n = 0; n < 4; n++) { const x = db.siguienteDeTanda(t); orden.push(x.id); db.cerrarItem(x.id, 'enviado'); }
  assert.deepEqual(orden, [c, a, b, d]);
});

test('ordenarTanda ignora ids de otro grupo y los que ya están enviando', async () => {
  const db = await baseNueva();
  const t = grupo(db, 'A', 'despues'), otro = grupo(db, 'B', 'despues');
  db.encolar(['56911111111', '56922222222'].map((x) => it(x)), t);
  db.encolar([it('56933333333')], otro);
  const [a, b] = ids(db, t), [o] = ids(db, otro);
  const ordenOtro = db.get('SELECT orden FROM cola WHERE id = ?', [o]).orden;
  db.marcarEnviando(a);
  db.ordenarTanda(t, [a, o, b]);
  assert.equal(db.get('SELECT estado FROM cola WHERE id = ?', [a]).estado, 'enviando');
  assert.equal(db.get('SELECT orden FROM cola WHERE id = ?', [o]).orden, ordenOtro);
  assert.equal(db.siguienteDeTanda(t).id, b);
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

test('marcarEnviando queda guardado al tiro: un corte de luz justo después no reenvía', async () => {
  const carpeta = carpetaNueva();
  const db = await baseNueva(carpeta);
  db.encolar([it('56911111111')]);
  await esperarGuardado();
  const id = db.get('SELECT id FROM cola').id;
  db.marcarEnviando(id);
  const db2 = await baseNueva(carpeta);
  assert.equal(db2.get('SELECT estado FROM cola WHERE id = ?', [id]).estado, 'error');
});
