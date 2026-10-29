const test = require('node:test');
const assert = require('node:assert/strict');
const { baseNueva, carpetaNueva, esperarGuardado } = require('./ayuda');

test('seguimientos en pausa se reactivan una sola vez al actualizar', async () => {
  const carpeta = carpetaNueva();
  const db = await baseNueva(carpeta);
  db.setConfig('secuencia', { ...db.getConfig('secuencia'), pausada: true });
  db.run("DELETE FROM config WHERE clave = 'mig_410_seq'");   // como una base de antes de la 4.1.0
  await esperarGuardado();
  const db2 = await baseNueva(carpeta);
  assert.equal(db2.getConfig('secuencia').pausada, false);
  db2.setConfig('secuencia', { ...db2.getConfig('secuencia'), pausada: true });
  await esperarGuardado();
  const db3 = await baseNueva(carpeta);
  assert.equal(db3.getConfig('secuencia').pausada, true);
});

test('4.3.1: si la cola estaba en pausa, los automáticos también quedan en pausa', async () => {
  const { carpetaNueva, esperarGuardado } = require('./ayuda');
  const dir = carpetaNueva();
  let db = await baseNueva(dir);
  db.setConfig('cola_pausada', true); db.setConfig('mig_431_pausa', false);
  await esperarGuardado();
  db = await baseNueva(dir);
  assert.equal(db.getConfig('auto_pausada', false), true);
});
