// Actualizaciones livianas: un paquete chico con las pantallas y los .js del programa (sin Electron ni dependencias).
// Se guarda en userData/liviana/<versión> y arranque.js lo usa si es más nuevo que lo instalado y tiene la misma «huella».
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// Huella de la base: si cambia Electron, una dependencia o un parche, la liviana no sirve y se baja el instalador completo
function huella({ electron, dependencies = {}, parches = [] }) {
  const h = crypto.createHash('sha256');
  h.update('electron ' + electron + '\n');
  for (const k of Object.keys(dependencies).sort()) h.update(`dep ${k} ${dependencies[k]}\n`);
  for (const p of [...parches].sort((a, b) => a.nombre.localeCompare(b.nombre))) h.update(`parche ${p.nombre}\n`).update(p.contenido);
  return h.digest('hex');
}

const rutaSegura = (r) => typeof r === 'string' && r && !path.isAbsolute(r) && !/^[a-z]:/i.test(r) && !r.split(/[\\/]/).some((x) => x === '..' || x === '');
function empaquetar(archivos) {
  return zlib.gzipSync(Buffer.from(JSON.stringify({ v: 1, archivos: archivos.map((f) => ({ ruta: f.ruta.replace(/\\/g, '/'), b64: f.datos.toString('base64') })) })));
}
function desempaquetar(buf) {
  const j = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  if (!j || j.v !== 1 || !Array.isArray(j.archivos)) throw new Error('Paquete liviano inválido');
  return j.archivos.map((f) => { if (!rutaSegura(f.ruta)) throw new Error('Ruta no permitida en el paquete: ' + f.ruta); return { ruta: f.ruta, datos: Buffer.from(f.b64, 'base64') }; });
}
const sha512 = (buf) => crypto.createHash('sha512').update(buf).digest('base64');
const verificar = (buf, sha) => !!sha && sha512(buf) === sha;

function compararVersiones(a, b) {
  const x = String(a).split('.').map((n) => parseInt(n, 10) || 0), y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}

// Qué versión abrir: la liviana solo si es más nueva, compatible, está completa y no falló antes
function elegirArranque({ instalada, huellaInstalada, puntero, marcador, existe }) {
  if (!puntero || !puntero.version || !puntero.dir) return { usar: 'instalada' };
  if (puntero.fallida === puntero.version) return { usar: 'instalada' };
  if (puntero.huella !== huellaInstalada || compararVersiones(puntero.version, instalada) <= 0 || !existe(path.join(puntero.dir, 'main.js'))) return { usar: 'instalada' };
  if (marcador && marcador.version === puntero.version) return { usar: 'instalada', marcarFallida: puntero.version };
  return { usar: 'liviana', dir: puntero.dir, version: puntero.version };
}
// Qué bajar al revisar actualizaciones
// (una liviana que ya falló en este PC no se vuelve a bajar)
function elegirDescarga({ efectiva, huella: h, liviana, completa, fallida = null }) {
  if (liviana && liviana.version !== fallida && liviana.huella === h && compararVersiones(liviana.version, efectiva) > 0 && (!completa || compararVersiones(liviana.version, completa.version) >= 0)) return 'liviana';
  if (completa && compararVersiones(completa.version, efectiva) > 0) return 'completa';
  return null;
}

const escribirAtomico = (archivo, texto) => { const tmp = archivo + '.tmp'; fs.writeFileSync(tmp, texto); fs.renameSync(tmp, archivo); };
// Deja la versión lista para el próximo arranque: primero todos los archivos, al final el puntero
// (conservar: la versión liviana que está corriendo ahora, que no se puede borrar hasta reiniciar)
function aplicar(userData, { version, huella: h }, archivos, { conservar = null } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version))) throw new Error('Versión inválida: ' + version);
  const base = path.join(userData, 'liviana'), dir = path.join(base, version), tmp = dir + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const f of archivos) { if (!rutaSegura(f.ruta)) throw new Error('Ruta no permitida: ' + f.ruta); const p = path.join(tmp, f.ruta); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.datos); }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  escribirAtomico(path.join(userData, 'liviana.json'), JSON.stringify({ version, huella: h, dir }, null, 2));
  limpiar(base, [version, conservar]);
  return dir;
}
// Borra versiones viejas guardadas (si alguna está en uso, queda para la próxima vez)
function limpiar(base, mantener) {
  try { for (const x of fs.readdirSync(base)) if (!mantener.includes(x)) { try { fs.rmSync(path.join(base, x), { recursive: true, force: true }); } catch {} } } catch {}
}
// La versión liviana abrió bien: se borra la marca del intento
const marcarOk = (userData) => { try { fs.unlinkSync(path.join(userData, 'liviana-intento.json')); } catch {} };

module.exports = { limpiar, huella, empaquetar, desempaquetar, sha512, verificar, compararVersiones, elegirArranque, elegirDescarga, aplicar, marcarOk, escribirAtomico };
