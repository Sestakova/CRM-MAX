// Actualizaciones livianas: paquete chico, arranque seguro y vuelta a la versión instalada si algo falla
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { carpetaNueva } = require('./ayuda');
const L = require('../liviana');

test('empaquetar y desempaquetar devuelve lo mismo', () => {
  const a = [{ ruta: 'public/app.js', datos: Buffer.from('x') }, { ruta: 'main.js', datos: Buffer.from('y') }];
  assert.deepEqual(L.desempaquetar(L.empaquetar(a)).map((f) => [f.ruta, f.datos.toString()]), [['public/app.js', 'x'], ['main.js', 'y']]);
});
test('rechaza rutas peligrosas', () => {
  assert.throws(() => L.desempaquetar(L.empaquetar([{ ruta: '../x.js', datos: Buffer.from('') }])));
  assert.throws(() => L.desempaquetar(L.empaquetar([{ ruta: 'C:/Windows/x.js', datos: Buffer.from('') }])));
  assert.throws(() => L.desempaquetar(L.empaquetar([{ ruta: 'public/../../x.js', datos: Buffer.from('') }])));
});
test('compara versiones', () => {
  assert.equal(L.compararVersiones('4.3.10', '4.3.9'), 1);
  assert.equal(L.compararVersiones('4.3.0', '4.3.0'), 0);
  assert.equal(L.compararVersiones('4.2.9', '4.3.0'), -1);
});
test('huella cambia si cambia Electron, una dependencia o un parche', () => {
  const b = { electron: '38.8.6', dependencies: { a: '1' }, parches: [{ nombre: 'p.js', contenido: 'x' }] };
  const h = L.huella(b);
  assert.equal(L.huella({ ...b }), h);
  assert.notEqual(L.huella({ ...b, electron: '39.0.0' }), h);
  assert.notEqual(L.huella({ ...b, dependencies: { a: '2' } }), h);
  assert.notEqual(L.huella({ ...b, parches: [{ nombre: 'p.js', contenido: 'y' }] }), h);
});
const base = { instalada: '4.3.0', huellaInstalada: 'h1', existe: () => true, marcador: null };
test('usa la liviana más nueva con la misma huella', () => assert.deepEqual(L.elegirArranque({ ...base, puntero: { version: '4.3.1', huella: 'h1', dir: 'D' } }), { usar: 'liviana', dir: 'D', version: '4.3.1' }));
test('huella distinta → instalada', () => assert.equal(L.elegirArranque({ ...base, puntero: { version: '4.3.1', huella: 'h2', dir: 'D' } }).usar, 'instalada'));
test('instalador completo más nuevo manda', () => assert.equal(L.elegirArranque({ ...base, instalada: '4.4.0', puntero: { version: '4.3.2', huella: 'h1', dir: 'D' } }).usar, 'instalada'));
test('carpeta borrada → instalada', () => assert.equal(L.elegirArranque({ ...base, existe: () => false, puntero: { version: '4.3.1', huella: 'h1', dir: 'D' } }).usar, 'instalada'));
test('intento anterior fallido → instalada y la marca', () => {
  const r = L.elegirArranque({ ...base, puntero: { version: '4.3.1', huella: 'h1', dir: 'D' }, marcador: { version: '4.3.1' } });
  assert.deepEqual([r.usar, r.marcarFallida], ['instalada', '4.3.1']);
});
test('puntero marcado fallido no se vuelve a usar', () => assert.equal(L.elegirArranque({ ...base, puntero: { version: '4.3.1', huella: 'h1', dir: 'D', fallida: '4.3.1' } }).usar, 'instalada'));
test('aplicar deja el puntero solo cuando todo está escrito y borra versiones viejas', () => {
  const ud = carpetaNueva();
  fs.mkdirSync(path.join(ud, 'liviana', '4.3.0'), { recursive: true });
  L.aplicar(ud, { version: '4.3.1', huella: 'h1' }, [{ ruta: 'main.js', datos: Buffer.from('m') }, { ruta: 'public/app.js', datos: Buffer.from('a') }]);
  const p = JSON.parse(fs.readFileSync(path.join(ud, 'liviana.json'), 'utf8'));
  assert.equal(p.version, '4.3.1'); assert.equal(p.huella, 'h1');
  assert.equal(fs.readFileSync(path.join(p.dir, 'public', 'app.js'), 'utf8'), 'a');
  assert.deepEqual(fs.readdirSync(path.join(ud, 'liviana')), ['4.3.1']);
});
test('verificar rechaza un paquete alterado', () => {
  const buf = L.empaquetar([{ ruta: 'main.js', datos: Buffer.from('m') }]);
  const sha = L.sha512(buf);
  assert.equal(L.verificar(buf, sha), true);
  assert.equal(L.verificar(Buffer.concat([buf, Buffer.from('x')]), sha), false);
});
test('elige qué bajar: liviana compatible, completa, o nada', () => {
  assert.equal(L.elegirDescarga({ efectiva: '4.3.0', huella: 'h1', liviana: { version: '4.3.1', huella: 'h1' }, completa: { version: '4.3.1' } }), 'liviana');
  assert.equal(L.elegirDescarga({ efectiva: '4.3.0', huella: 'h1', liviana: { version: '4.3.1', huella: 'h2' }, completa: { version: '4.3.1' } }), 'completa');
  assert.equal(L.elegirDescarga({ efectiva: '4.3.0', huella: 'h1', liviana: null, completa: { version: '4.4.0' } }), 'completa');
  assert.equal(L.elegirDescarga({ efectiva: '4.3.1', huella: 'h1', liviana: { version: '4.3.1', huella: 'h1' }, completa: { version: '4.3.1' } }), null);
  assert.equal(L.elegirDescarga({ efectiva: '4.3.1', huella: 'h1', liviana: null, completa: null }), null);
});
