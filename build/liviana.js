// Paquete de actualización liviana. Se corre solo dentro de «npm run build»:
//   node build/liviana.js huella   → escribe huella.json (Electron + dependencias + parches) antes de armar el instalador
//   node build/liviana.js paquete  → escribe dist/CRM-HERMES-liviana.gz y dist/liviana.json para subir a la release
const fs = require('fs');
const path = require('path');
const L = require('../liviana');

const RAIZ = path.join(__dirname, '..');
const PKG = require('../package.json');
const ARCHIVO = 'CRM-HERMES-liviana.gz';

function parches(dir = path.join(__dirname, 'parches'), base = '') {
  const out = [];
  for (const x of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base ? base + '/' + x.name : x.name;
    if (x.isDirectory()) out.push(...parches(path.join(dir, x.name), rel));
    else out.push({ nombre: rel, contenido: fs.readFileSync(path.join(dir, x.name)) });
  }
  return out;
}
const huellaActual = () => L.huella({ electron: String(PKG.devDependencies.electron).replace(/^[^\d]*/, ''), dependencies: PKG.dependencies, parches: parches() });

// Lo mismo que lleva el instalador, menos node_modules y build/ (salvo los íconos)
function archivosDelPaquete() {
  const lista = [];
  const agregar = (rel) => lista.push({ ruta: rel.replace(/\\/g, '/'), datos: fs.readFileSync(path.join(RAIZ, rel)) });
  const recorrer = (rel) => { for (const x of fs.readdirSync(path.join(RAIZ, rel), { withFileTypes: true })) { const r = rel + '/' + x.name; if (x.isDirectory()) recorrer(r); else agregar(r); } };
  for (const f of PKG.build.files) {
    if (f === 'node_modules/**') continue;
    if (f.endsWith('/**')) recorrer(f.slice(0, -3)); else agregar(f);
  }
  return lista;
}

const modo = process.argv[2];
if (modo === 'huella') {
  fs.writeFileSync(path.join(RAIZ, 'huella.json'), JSON.stringify({ huella: huellaActual() }, null, 2) + '\n');
  console.log('huella.json listo');
} else if (modo === 'paquete') {
  const archivos = archivosDelPaquete();
  if (!archivos.some((f) => f.ruta === 'main.js') || !archivos.some((f) => f.ruta === 'huella.json')) throw new Error('Faltan archivos en el paquete liviano');
  const buf = L.empaquetar(archivos);
  const dist = path.join(RAIZ, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, ARCHIVO), buf);
  const datos = { version: PKG.version, huella: require('../huella.json').huella, sha512: L.sha512(buf), tam: buf.length, archivo: ARCHIVO };
  fs.writeFileSync(path.join(dist, 'liviana.json'), JSON.stringify(datos, null, 2) + '\n');
  console.log(`dist/${ARCHIVO} listo (${(buf.length / 1048576).toFixed(1)} MB, ${archivos.length} archivos)`);
} else {
  console.log('Uso: node build/liviana.js huella | paquete');
  process.exit(1);
}
