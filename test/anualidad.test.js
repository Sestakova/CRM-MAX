// Anualidad del cliente: cuenta desde que entra a Ingresado y se renueva sola cada año
const test = require('node:test');
const assert = require('node:assert/strict');
const { vigente, estado, alCambiarEtapa, textoAviso, fechaLocal } = require('../anualidad');

test('se renueva sola cada año', () => {
  assert.equal(vigente('2025-03-15', '2026-10-28'), '2026-03-15');
  assert.equal(vigente('2026-10-28', '2026-10-28'), '2026-10-28');
  assert.equal(vigente('2026-10-28', '2027-10-27'), '2026-10-28');
  assert.equal(vigente('2026-10-28', '2027-10-28'), '2027-10-28');
  assert.equal(vigente('2020-01-10', '2026-10-28'), '2026-01-10');
});
test('una fecha futura (fijada a mano) no se mueve', () => assert.equal(vigente('2027-03-01', '2026-10-28'), '2027-03-01'));
test('29 de febrero cae en 28 los años no bisiestos', () => {
  assert.equal(vigente('2024-02-29', '2025-03-01'), '2025-02-28');
  assert.equal(vigente('2024-02-29', '2028-03-01'), '2028-02-29');
});
test('estado con aviso un mes antes', () => {
  const e = estado('2026-10-28', '2027-03-28');
  assert.equal(e.desde, '2026-10-28');
  assert.equal(e.aniversario, '2027-10-28');
  assert.equal(e.aviso, '2027-09-28');
  assert.equal(e.mesesFaltan, 7);
  assert.ok(e.progreso > 0.4 && e.progreso < 0.43);
});
test('estado después del aniversario ya viene renovado', () => {
  const e = estado('2025-03-15', '2026-10-28');
  assert.deepEqual([e.desde, e.aniversario, e.aviso, e.mesesFaltan], ['2026-03-15', '2027-03-15', '2027-02-15', 4]);
});
test('celebra solo al entrar a Ingresado sin anualidad', () => {
  assert.equal(alCambiarEtapa({ etapa: 'Firma/documentos' }, { etapa: 'Ingresado' }).iniciar, true);
  assert.equal(alCambiarEtapa({ etapa: 'Perdido', anual_desde: '2026-10-01' }, { etapa: 'Ingresado' }).iniciar, false);
  assert.equal(alCambiarEtapa({ etapa: 'Ingresado' }, { etapa: 'Ingresado' }).iniciar, false);
  assert.equal(alCambiarEtapa(null, { etapa: 'Ingresado' }).iniciar, true);
  assert.equal(alCambiarEtapa({ etapa: 'Nuevo' }, { etapa: 'Respondió' }).iniciar, false);
});
test('texto del aviso', () => {
  assert.equal(textoAviso({ nombre: 'María Pérez', isapre: 'Colmena' }), 'Aniversario de María Pérez (Colmena): revisar su plan');
  assert.equal(textoAviso({ nombre: 'María Pérez' }), 'Aniversario de María Pérez: revisar su plan');
});
test('aviso un mes antes aunque el mes anterior sea más corto', () => assert.equal(estado('2026-03-31', '2026-10-28').aviso, '2027-02-28'));
test('fecha local de un ISO', () => assert.equal(fechaLocal(new Date(2026, 9, 28, 23, 30)), '2026-10-28'));
