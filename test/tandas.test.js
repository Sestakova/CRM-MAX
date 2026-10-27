const test = require('node:test');
const assert = require('node:assert/strict');
const { baseNueva, normPhone } = require('./ayuda');
const { unirDestinatarios, avisosDe, nombrePorDefecto, escribioHace, estadoTanda, puedeManejar } = require('../tandas');

test('el mismo teléfono escrito distinto cuenta una vez y se excluye igual', () => {
  const r = unirDestinatarios(
    { destinatarios: [{ telefono: '+56 9 8123 4567', nombre: 'Camila' }], segmento: {}, excluir: ['981234567'] },
    { normPhone, buscarContactos: () => [{ telefono: '56981234567', nombre: 'Camila R' }, { telefono: '56922222222', nombre: 'Pedro' }] });
  assert.deepEqual(r.lista.map((c) => c.telefono), ['56922222222']);
});

test('gana el contacto escrito a mano y el segmento pide sin bajas', () => {
  let filtros;
  const r = unirDestinatarios(
    { destinatarios: [{ telefono: '+56 9 8123 4567', nombre: 'Camila' }], segmento: { etapa: 'Nuevo' } },
    { normPhone, buscarContactos: (f) => { filtros = f; return [{ telefono: '56981234567', nombre: 'Camila R' }]; } });
  assert.deepEqual(r.lista, [{ telefono: '56981234567', nombre: 'Camila' }]);
  assert.deepEqual(filtros, { etapa: 'Nuevo', sinBajas: true });
});

test('números inválidos se cuentan aparte y sin segmento no se busca', () => {
  const r = unirDestinatarios({ destinatarios: [{ telefono: '123' }, { telefono: '56922222222' }] }, { normPhone, buscarContactos: () => { throw new Error('no debía buscar'); } });
  assert.equal(r.invalidos, 1);
  assert.equal(r.lista.length, 1);
});

test('cliente y escribió hoy vienen desmarcados; masivo, seguimiento y perdido no', () => {
  const ahora = new Date('2026-10-26T15:00:00');
  assert.deepEqual(avisosDe({ etapa: 'Ingresado' }, ahora).map((a) => [a.clave, a.desmarcar]), [['cliente', true]]);
  assert.deepEqual(avisosDe({ etapa: 'Perdido' }, ahora).map((a) => [a.clave, a.desmarcar]), [['perdido', false]]);
  assert.deepEqual(avisosDe({ seq_estado: 'activa' }, ahora).map((a) => [a.clave, a.texto, a.desmarcar]), [['seguimiento', 'En seguimiento automático', false]]);
  assert.equal(avisosDe({ ultimo_entrante: new Date('2026-10-26T09:00:00').toISOString() }, ahora)[0].desmarcar, true);
  assert.equal(avisosDe({ ultimo_entrante: new Date('2026-10-26T09:00:00').toISOString() }, ahora)[0].texto, 'Escribió hoy');
  assert.equal(avisosDe({ ultimo_entrante: new Date('2026-10-25T23:00:00').toISOString() }, ahora).length, 0);
  assert.deepEqual(avisosDe({ ultimoMasivo: new Date('2026-10-23T10:00:00').toISOString() }, ahora)[0], { clave: 'masivo', texto: 'Recibió un masivo hace 3 días', desmarcar: false });
  assert.equal(avisosDe({ ultimoMasivo: new Date('2026-10-26T10:00:00').toISOString() }, ahora)[0].texto, 'Recibió un masivo hoy');
  assert.equal(avisosDe({ ultimoMasivo: new Date('2026-10-18T10:00:00').toISOString() }, ahora).length, 0);
  assert.equal(avisosDe(undefined, ahora).length, 0);
});

test('nombre por defecto corta a 40 y agrega la fecha', () => {
  assert.equal(nombrePorDefecto('Hola {nombre}, te escribo por tu plan de Isapre actual', new Date('2026-10-26T10:00:00')), 'Hola {nombre}, te escribo por tu plan de… · 26 oct');
  assert.equal(nombrePorDefecto('Hola', new Date('2026-10-26T10:00:00')), 'Hola · 26 oct');
});

test('escribioHace', () => {
  const creada = '2026-10-26T10:00:00.000Z', ahora = new Date('2026-10-26T12:30:00.000Z');
  assert.equal(escribioHace('2026-10-26T12:25:00.000Z', creada, ahora), 'Escribió hace 5 min');
  assert.equal(escribioHace('2026-10-26T10:20:00.000Z', creada, ahora), 'Escribió hace 2 h');
  assert.equal(escribioHace('2026-10-26T09:00:00.000Z', creada, ahora), null);
  assert.equal(escribioHace(null, creada, ahora), null);
});

test('estadoTanda', () => {
  assert.equal(estadoTanda({ estado: 'cancelada', pausada: 1, pendientes: 3 }), 'Cancelada');
  assert.equal(estadoTanda({ estado: 'activa', pausada: 1, pendientes: 3 }), 'En pausa');
  assert.equal(estadoTanda({ estado: 'activa', pausada: 0, pendientes: 3 }), 'Enviando');
  assert.equal(estadoTanda({ estado: 'activa', pausada: 1, pendientes: 0 }), 'Terminada');
});

test('estadoTanda con turno y bloqueo general', () => {
  assert.equal(estadoTanda({ estado: 'activa', pausada: 0, pendientes: 3, puedeEnviar: false }), 'Espera su turno');
  assert.equal(estadoTanda({ estado: 'activa', pausada: 0, pendientes: 3, puedeEnviar: true, bloqueoGlobal: true }), 'En espera');
  assert.equal(estadoTanda({ estado: 'activa', pausada: 1, pendientes: 3, puedeEnviar: false }), 'En pausa');
});

test('datosParaAvisos trae etapa, seguimiento y último masivo', async () => {
  const db = await baseNueva();
  db.guardarContacto({ telefono: '56911111111', nombre: 'Camila', etapa: 'Ingresado' });
  db.registrarEnvio('56911111111', 'x', 'masivo');
  db.registrarEnvio('56911111111', 'y', 'manual');
  const m = db.datosParaAvisos(['56911111111', '56922222222']);
  assert.equal(m.get('56911111111').etapa, 'Ingresado');
  assert.ok(m.get('56911111111').ultimoMasivo);
  assert.equal(m.get('56922222222'), undefined);
});

test('puedeManejar', () => {
  const t = { usuario: 'Ana' };
  assert.equal(puedeManejar(t, { esAdmin: true, nombre: 'Jesús' }), true);
  assert.equal(puedeManejar(t, { esAdmin: false, nombre: 'Ana', masivos: true }), true);
  assert.equal(puedeManejar(t, { esAdmin: false, nombre: 'Luis', masivos: true }), false);
  assert.equal(puedeManejar(t, { esAdmin: false, nombre: 'Ana', masivos: false }), false);
});

test('un contacto con código interno de WhatsApp (sin número) también se puede excluir', () => {
  const lid = '123456789012345';
  const r = unirDestinatarios({ segmento: {}, excluir: [lid] }, { normPhone, buscarContactos: () => [{ telefono: lid, nombre: 'Oculto' }, { telefono: '56922222222', nombre: 'Pedro' }] });
  assert.deepEqual(r.lista.map((c) => c.telefono), ['56922222222']);
});

test('con incluir, solo salen los que se vieron marcados en la confirmación', () => {
  const r = unirDestinatarios({ segmento: {}, incluir: ['56922222222'] }, { normPhone, buscarContactos: () => [{ telefono: '56922222222', nombre: 'Pedro' }, { telefono: '56933333333', nombre: 'Llegó recién' }] });
  assert.deepEqual(r.lista.map((c) => c.telefono), ['56922222222']);
});
