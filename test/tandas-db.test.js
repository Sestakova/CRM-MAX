const test = require('node:test');
const assert = require('node:assert/strict');
const { baseNueva } = require('./ayuda');

const it = (telefono) => ({ telefono, texto: 'hola', tipo: 'masivo' });
async function conTanda(tels, nombre = 'A') {
  const db = await baseNueva();
  const t = db.crearTanda({ nombre, usuario: 'Jesús', tipo: 'masivo', total: tels.length });
  db.encolar(tels.map(it), t);
  const ids = db.all('SELECT id FROM cola WHERE tanda = ? ORDER BY id', [t]).map((r) => r.id);
  return { db, t, ids };
}
// Simula la cola: va sacando y cerrando como enviado, y devuelve el orden de salida
function vaciar(db) {
  const orden = [];
  for (let x = db.siguienteEnCola(); x; x = db.siguienteEnCola()) { orden.push(x.telefono); db.cerrarItem(x.id, 'enviado'); }
  return orden;
}

test('sacar a un pendiente: no sale y queda contado como omitido', async () => {
  const { db, ids } = await conTanda(['56911111111', '56922222222', '56933333333']);
  assert.equal(db.sacarDeTanda(ids[1], 'Jesús'), 'sacado');
  assert.deepEqual(vaciar(db), ['56911111111', '56933333333']);
  assert.equal(db.tandas({ desde: '2000-01-01' })[0].omitidos, 1);
  assert.equal(db.itemsDeTanda(db.tandas({ desde: '2000-01-01' })[0].id).find((x) => x.id === ids[1]).detalle, 'Sacado por Jesús');
});

test('sacar a alguien que ya se está enviando responde ya_salio', async () => {
  const { db, ids } = await conTanda(['56911111111', '56922222222']);
  db.marcarEnviando(ids[0]);
  assert.equal(db.sacarDeTanda(ids[0], 'Jesús'), 'ya_salio');
});

test('primero mueve dentro de su tanda sin saltarse una tanda anterior', async () => {
  const db = await baseNueva();
  const a = db.crearTanda({ nombre: 'A', usuario: 'Jesús', tipo: 'masivo', total: 2 });
  db.encolar([it('56900000001'), it('56900000002')], a);
  const b = db.crearTanda({ nombre: 'B', usuario: 'Jesús', tipo: 'masivo', total: 2 });
  db.encolar([it('56900000003'), it('56900000004')], b);
  const b2 = db.get('SELECT id FROM cola WHERE telefono = ?', ['56900000004']).id;
  db.primeroEnTanda(b2);
  assert.deepEqual(vaciar(db), ['56900000001', '56900000002', '56900000004', '56900000003']);
});

test('cancelar lo que falta deja intactos los enviados', async () => {
  const { db, t, ids } = await conTanda(['56911111111', '56922222222', '56933333333']);
  db.cerrarItem(ids[0], 'enviado');
  assert.equal(db.cancelarTanda(t), 2);
  const r = db.tandas({ desde: '2000-01-01' })[0];
  assert.equal(r.enviados, 1);
  assert.equal(r.pendientes, 0);
  assert.equal(r.estado, 'cancelada');
});

test('pausar y reanudar una tanda', async () => {
  const { db, t } = await conTanda(['56911111111', '56922222222']);
  db.pausarTanda(t, true);
  assert.equal(db.siguienteEnCola(), undefined);
  assert.equal(db.tanda(t).pausada, 1);
  db.pausarTanda(t, false);
  assert.equal(db.siguienteEnCola().telefono, '56911111111');
});

test('tandas() oculta las de una persona y las terminadas viejas', async () => {
  const db = await baseNueva();
  const sola = db.crearTanda({ nombre: 'Sola', usuario: 'Jesús', tipo: 'masivo', total: 1 });
  db.encolar([it('56911111111')], sola);
  const vieja = db.crearTanda({ nombre: 'Vieja', usuario: 'Jesús', tipo: 'masivo', total: 2 });
  db.encolar([it('56922222222'), it('56933333333')], vieja);
  db.run("UPDATE cola SET estado = 'enviado' WHERE tanda = ?", [vieja]);
  db.run('UPDATE tandas SET creada = ? WHERE id = ?', [new Date(Date.now() - 40 * 86400000).toISOString(), vieja]);
  const viva = db.crearTanda({ nombre: 'Viva', usuario: 'Jesús', tipo: 'masivo', total: 2 });
  db.encolar([it('56944444444'), it('56955555555')], viva);
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  assert.deepEqual(db.tandas({ desde }).map((x) => x.nombre), ['Viva']);
});

test('una tanda con pendientes se ve aunque sea antigua', async () => {
  const { db, t } = await conTanda(['56911111111', '56922222222']);
  db.run('UPDATE tandas SET creada = ? WHERE id = ?', [new Date(Date.now() - 40 * 86400000).toISOString(), t]);
  assert.equal(db.tandas({ desde: new Date(Date.now() - 30 * 86400000).toISOString() }).length, 1);
});

test('quitarDeProgramado saca solo a esa persona', async () => {
  const db = await baseNueva();
  const id = db.crearProgramado({ nombre: 'P', texto: 'hola', destinatarios: [{ telefono: '56911111111' }, { telefono: '56922222222' }, { telefono: '56933333333' }], fecha: new Date(Date.now() + 86400000).toISOString(), secuencia: false });
  assert.equal(db.quitarDeProgramado(id, '56922222222'), 2);
  const fila = db.get('SELECT destinatarios FROM programados WHERE id = ?', [id]);
  assert.deepEqual(JSON.parse(fila.destinatarios).map((c) => c.telefono), ['56911111111', '56933333333']);
});

test('apretar Primero muchas veces nunca adelanta a una tanda anterior ni a mensajes antiguos', async () => {
  const db = await baseNueva();
  db.encolar([it('56900000000')]);   // mensaje antiguo, sin tanda
  const a = db.crearTanda({ nombre: 'A', usuario: 'Jesús', tipo: 'masivo', total: 3 });
  db.encolar([it('56900000001'), it('56900000002'), it('56900000003')], a);
  const b = db.crearTanda({ nombre: 'B', usuario: 'Jesús', tipo: 'masivo', total: 2 });
  db.encolar([it('56900000004'), it('56900000005')], b);
  const id = (t) => db.get('SELECT id FROM cola WHERE telefono = ?', [t]).id;
  for (let i = 0; i < 5; i++) db.primeroEnTanda(id(i % 2 ? '56900000004' : '56900000005'));
  const orden = vaciar(db);
  assert.deepEqual(orden.slice(0, 4), ['56900000000', '56900000001', '56900000002', '56900000003']);
});

test('pedir que no siga con seguimientos queda anotado aunque el mensaje ya esté saliendo', async () => {
  const { db, ids } = await conTanda(['56911111111', '56922222222']);
  db.marcarEnviando(ids[0]);
  db.marcarSinSeguimiento(ids[0]);
  assert.equal(db.sinSeguimiento(ids[0]), true);
  assert.equal(db.sinSeguimiento(ids[1]), false);
});
