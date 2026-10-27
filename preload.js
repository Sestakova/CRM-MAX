// Puente mínimo: la pantalla del CRM indica dónde se ven WhatsApp Web y el Cotizador
const { contextBridge, ipcRenderer } = require('electron');
const rect = (r) => (r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null);
contextBridge.exposeInMainWorld('crmNativo', {
  waVista: (r) => ipcRenderer.send('wa-vista', rect(r)),
  cotVista: (r) => ipcRenderer.send('cot-vista', rect(r)),
  cotRecargar: () => ipcRenderer.send('cot-recargar')
});
