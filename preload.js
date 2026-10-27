// Puente mínimo: la pantalla del CRM indica dónde se ve WhatsApp Web
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('crmNativo', {
  waVista: (r) => ipcRenderer.send('wa-vista', r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null)
});
