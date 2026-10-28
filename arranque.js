// Arranque del programa: abre la versión liviana más nueva (pantallas y .js bajados aparte) si es compatible
// con lo instalado; si no, o si la última vez no logró abrir, abre la versión instalada.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const L = require('./liviana');

const ud = path.join(app.getPath('appData'), 'Enviador WhatsApp');   // la misma carpeta que fija main.js
const leer = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ud, f), 'utf8')); } catch { return null; } };

let eleccion = { usar: 'instalada' };
try {
  const huella = (() => { try { return require('./huella.json').huella; } catch { return null; } })();
  const puntero = leer('liviana.json');
  if (huella && puntero) {
    eleccion = L.elegirArranque({ instalada: require('./package.json').version, huellaInstalada: huella, puntero, marcador: leer('liviana-intento.json'), existe: fs.existsSync });
    if (eleccion.marcarFallida) {
      L.escribirAtomico(path.join(ud, 'liviana.json'), JSON.stringify({ ...puntero, fallida: eleccion.marcarFallida }, null, 2));
      try { fs.unlinkSync(path.join(ud, 'liviana-intento.json')); } catch {}
    }
  }
} catch { eleccion = { usar: 'instalada' }; }

if (eleccion.usar === 'liviana') {
  // Se marca el intento: si la versión liviana no llega a abrir la ventana, la próxima vez se usa la instalada
  try { fs.mkdirSync(ud, { recursive: true }); fs.writeFileSync(path.join(ud, 'liviana-intento.json'), JSON.stringify({ version: eleccion.version, fecha: new Date().toISOString() })); } catch {}
  // Los módulos (Electron, WhatsApp, etc.) siguen viniendo de la instalación
  process.env.NODE_PATH = [path.join(__dirname, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  require('module').Module._initPaths();
  global.CRM_VERSION = eleccion.version;
  try { require(path.join(eleccion.dir, 'main.js')); }
  catch (e) {
    console.error('La versión liviana no abrió:', e);
    try { const p = leer('liviana.json'); L.escribirAtomico(path.join(ud, 'liviana.json'), JSON.stringify({ ...p, fallida: eleccion.version }, null, 2)); } catch {}
    app.relaunch(); app.exit(0);
  }
} else {
  require('./main.js');
}
