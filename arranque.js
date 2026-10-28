// Arranque del programa: abre la versión liviana más nueva (pantallas y .js bajados aparte) si es compatible
// con lo instalado; si no, o si la última vez no logró abrir, abre la versión instalada.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const L = require('./liviana');

const ud = path.join(app.getPath('appData'), 'Enviador WhatsApp');   // la misma carpeta que fija main.js
app.setPath('userData', ud);   // antes de pedir el bloqueo: así una segunda apertura choca con la primera
const leer = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ud, f), 'utf8')); } catch { return null; } };
const marcarFallida = (version) => { try { const p = leer('liviana.json'); if (p) L.escribirAtomico(path.join(ud, 'liviana.json'), JSON.stringify({ ...p, fallida: version }, null, 2)); } catch {} try { fs.unlinkSync(path.join(ud, 'liviana-intento.json')); } catch {} };
// Vuelve a abrir con la versión instalada (sin «--oculto» no cambia: se abre igual que se abrió esta vez)
const volverAInstalada = (version, motivo) => { console.error('La versión liviana ' + version + ' no abrió:', motivo); marcarFallida(version); app.relaunch(); app.exit(0); };

let eleccion = { usar: 'instalada' };
// En desarrollo (npm start) siempre se usa el código de la carpeta, salvo para probar esto mismo
const probar = app.isPackaged || process.env.CRM_PROBAR_LIVIANA === '1';
// Si el programa ya está abierto, esta segunda apertura solo lo trae al frente (main.js) y no marca intentos
const unica = app.requestSingleInstanceLock();
global.CRM_UNICA = unica;   // main.js usa esto en vez de pedir el bloqueo otra vez
if (probar && unica) {
  try {
    const huella = (() => { try { return require('./huella.json').huella; } catch { return null; } })();
    const puntero = leer('liviana.json');
    if (huella && puntero) {
      eleccion = L.elegirArranque({ instalada: require('./package.json').version, huellaInstalada: huella, puntero, marcador: leer('liviana-intento.json'), existe: fs.existsSync });
      if (eleccion.marcarFallida) marcarFallida(eleccion.marcarFallida);
      L.limpiar(path.join(ud, 'liviana'), [puntero.version]);   // versiones viejas que quedaron de antes
    }
  } catch { eleccion = { usar: 'instalada' }; }
}

if (eleccion.usar === 'liviana') {
  // Se marca el intento: si la versión liviana no llega a confirmar que la pantalla abrió, se vuelve a la instalada
  try { fs.mkdirSync(ud, { recursive: true }); fs.writeFileSync(path.join(ud, 'liviana-intento.json'), JSON.stringify({ version: eleccion.version, fecha: new Date().toISOString() })); } catch {}
  // Los módulos (Electron, WhatsApp, etc.) siguen viniendo de la instalación
  process.env.NODE_PATH = [path.join(__dirname, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  require('module').Module._initPaths();
  global.CRM_VERSION = eleccion.version;
  global.CRM_SANO = false;   // main.js lo pone en true cuando la pantalla avisa que abrió bien
  const fallo = (e) => { if (!global.CRM_SANO) volverAInstalada(eleccion.version, e); else console.error(e); };
  process.on('uncaughtException', fallo);
  process.on('unhandledRejection', fallo);
  setTimeout(() => { if (!global.CRM_SANO) volverAInstalada(eleccion.version, 'no confirmó en 2 minutos'); }, 120000).unref();
  try { require(path.join(eleccion.dir, 'main.js')); }
  catch (e) { volverAInstalada(eleccion.version, e); }
} else {
  require('./main.js');
}
