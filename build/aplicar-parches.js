// Se ejecuta solo después de "npm install". Repone los arreglos locales que necesita el programa.
// 1) whatsapp-web.js 1.34.7: copia Client.js y Utils.js arreglados (conexión a la vista de WhatsApp
//    dentro de Electron: elegirPagina, saltarCarga, desconectar en vez de cerrar; y el arreglo de "$1" → "_serialized").
// 2) Solo al compilar desde Linux/Mac: arreglo de electron-builder para armar el instalador NSIS.
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const origen = path.join(__dirname, 'parches', 'whatsapp-web.js');
const destino = path.join(raiz, 'node_modules', 'whatsapp-web.js');
for (const rel of ['src/Client.js', 'src/util/Injected/Utils.js']) {
  if (fs.existsSync(destino)) { fs.copyFileSync(path.join(origen, rel), path.join(destino, rel)); console.log('Parche aplicado:', 'whatsapp-web.js/' + rel); }
}
if (process.platform !== 'win32') {
  const nsis = path.join(raiz, 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
  if (fs.existsSync(nsis)) {
    const s = fs.readFileSync(nsis, 'utf8');
    const a = 'if ((0, macosVersion_1.isMacOsCatalina)()) {';
    if (s.includes(a)) { fs.writeFileSync(nsis, s.replace(a, 'if (true || (0, macosVersion_1.isMacOsCatalina)()) {')); console.log('Parche aplicado: NsisTarget.js'); }
  }
}
